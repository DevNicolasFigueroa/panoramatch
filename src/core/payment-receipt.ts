/**
 * Dominio "Comprobantes de pago" (spec 005).
 *
 * Reglas de producto:
 * - Un invitado marca «Ya transferí» SOLO con imagen de comprobante válida
 *   (JPG/PNG/WEBP, ≤ 5 MB); la marca y su comprobante nacen juntos — nunca
 *   existe «En revisión» sin imagen (RF-3). La validación aquí es pura:
 *   recibe tipo MIME y peso ya leídos por la interfaz.
 * - Hay un único comprobante vigente por persona: el reemplazo actualiza la
 *   fila y la versión anterior SE ELIMINA (el repositorio borra su objeto);
 *   rechazada también se elimina (RF-6).
 * - Al confirmarse «Pagado», el comprobante queda BLOQUEADO como respaldo
 *   (ni invitado ni organizador lo reemplazan); la excepción es el respaldo
 *   post-cierre (D4): si la fila quedó «Pagado» a mano sin comprobante, el
 *   dueño puede adjuntar su imagen después como archivo informativo, sin
 *   cambiar estados y sin más reemplazos.
 * - El rechazo del organizador devuelve la fila a «Pendiente», elimina la
 *   imagen y persiste una nota opcional de motivo (editable mientras la
 *   fila siga «Pendiente», D3; desaparece al volver a marcar, RF-5).
 * - La marca heredada de la era 004 sin comprobante (D2) se respeta: no hay
 *   salto de exigencia retroactivo; solo las marcas nuevas exigen imagen.
 * - La baja de un confirmado con marca «En revisión» NO elimina su
 *   comprobante (RF-8): queda visible al organizador (confirmable ex post,
 *   rechazable) mientras el invitado pierde las acciones.
 * - Privacidad 2A: las reglas de visibilidad por actor son puras y son la
 *   fuente de verdad que la interfaz y el servidor reproducen; el tablero
 *   completo es solo del organizador y el invitado ve métricas anónimas
 *   (barra + % + «N de M pagados» netos) más SU tarjeta.
 *
 * El «ahora» entra SIEMPRE como parámetro (`now`, texto local
 * 'YYYY-MM-DDTHH:mm'); este módulo es puro: sin React, sin DOM, sin red.
 */

import { splitCost } from "./currency-clp";
import {
  getCurrentQuotaCLP,
  getNetPaidTotalCLP,
  getPaymentFlowState,
  getPendingRefundAmountCLP,
  getPaymentTreasuryView,
  getVigentePaidTotalCLP,
  type PaymentsState,
  type PaymentFlowState,
  type PlayerRef,
  type RefundKind,
} from "./payment-treasury";
import type { TeamPlayer } from "./team-organizer";
import { CREATOR_ATTENDEE_ID } from "./creator-attendee";

/* ─────────────── Reglas fijas del comprobante (RF-3 y RF-6) ─────────────── */

/** Peso máximo del adjunto: 5 MB en bytes. */
export const MAX_RECEIPT_SIZE_BYTES = 5 * 1024 * 1024;

/** Formatos de imagen permitidos. */
export const RECEIPT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Largo máximo de la nota de rechazo (misma tónica del bloque bancario). */
export const MAX_REJECTION_NOTE_LENGTH = 500;

export type ReceiptMimeType = (typeof RECEIPT_MIME_TYPES)[number];

/** Datos de la imagen ya leídos por la interfaz (el archivo real no toca el núcleo). */
export interface ReceiptUploadPayload {
  storagePath: string;
  mimeType: string;
  byteSize: number;
}

/** Comprobante atado a la fila de una persona. Máx. uno vigente por persona. */
export interface PaymentReceipt {
  playerRef: PlayerRef;
  /** Ruta del objeto en el almacenamiento privado (para firmar y borrar). */
  storagePath: string;
  mimeType: ReceiptMimeType;
  byteSize: number;
  /** Sello local de la subida ('YYYY-MM-DDTHH:mm'). */
  uploadedAt: string;
  /** Sello cuando el comprobante quedó bloqueado como respaldo del «Pagado». */
  confirmedAt: string | null;
}

/** Estado de comprobantes de un panorama. */
export interface ReceiptsState {
  receipts: PaymentReceipt[];
}

/** Estado inicial: sin comprobantes. */
export function createEmptyReceiptsState(): ReceiptsState {
  return { receipts: [] };
}

export type ReceiptError =
  | "unsupported_mime"
  | "receipt_too_large"
  | "empty_file"
  | "note_too_long"
  | "not_titular"
  | "already_in_review"
  | "nothing_to_transfer"
  | "claim_not_found"
  | "receipt_not_found"
  | "receipt_locked"
  | "has_active_claim"
  | "not_payable";

/** Textos de error en español para la interfaz. */
export function getReceiptErrorMessage(error: ReceiptError): string {
  switch (error) {
    case "unsupported_mime":
      return "Ese formato no está permitido: sube una imagen JPG, PNG o WEBP.";
    case "receipt_too_large":
      return "La imagen pesa más de 5 MB: sube una versión más liviana.";
    case "empty_file":
      return "La imagen está vacía: elige el archivo correcto.";
    case "note_too_long":
      return `La nota de rechazo es demasiado larga (máx. ${MAX_REJECTION_NOTE_LENGTH} caracteres).`;
    case "not_titular":
      return "Solo los confirmados dentro del cupo pueden marcar su transferencia.";
    case "already_in_review":
      return "Tu transferencia ya está en revisión.";
    case "nothing_to_transfer":
      return "Ya estás al día: no hay cuota pendiente que transferir.";
    case "claim_not_found":
      return "No hay una marca «Ya transferí» vigente para esa acción.";
    case "receipt_not_found":
      return "No hay un comprobante vigente para reemplazar.";
    case "receipt_locked":
      return "El comprobante quedó bloqueado al confirmarse el pago y ya no se puede reemplazar.";
    case "has_active_claim":
      return "Esa transferencia está en revisión: reemplázala desde su comprobante.";
    case "not_payable":
      return "Solo se puede adjuntar el respaldo sobre un pago ya confirmado.";
  }
}

/** Resultado de las operaciones que tocan pagos Y comprobantes a la vez. */
export type ReceiptOpResult =
  | {
      ok: true;
      payments: PaymentsState;
      receipts: ReceiptsState;
      /** Rutas de objetos que quedaron sin fila (borrar del storage). */
      removedStoragePaths: string[];
    }
  | {
      ok: false;
      reason: ReceiptError;
      payments: PaymentsState;
      receipts: ReceiptsState;
    };

/** Resultado de operaciones que solo tocan comprobantes. */
export type ReceiptOnlyOpResult =
  | { ok: true; receipts: ReceiptsState }
  | { ok: false; reason: ReceiptError; receipts: ReceiptsState };

/* ─────────────── Validación de la imagen (RF-3 y RF-6) ─────────────── */

/**
 * Regla pura de elegibilidad de la imagen: peso y formato. Devuelve null
 * cuando es válida y el motivo del rechazo cuando no.
 */
export function validateReceiptPayload(
  payload: Pick<ReceiptUploadPayload, "mimeType" | "byteSize">,
): Extract<ReceiptError, "unsupported_mime" | "receipt_too_large" | "empty_file"> | null {
  if (!Number.isInteger(payload.byteSize) || payload.byteSize <= 0) {
    return "empty_file";
  }
  if (payload.byteSize > MAX_RECEIPT_SIZE_BYTES) {
    return "receipt_too_large";
  }
  if (!RECEIPT_MIME_TYPES.includes(payload.mimeType as ReceiptMimeType)) {
    return "unsupported_mime";
  }
  return null;
}

function makeReceipt(
  playerRef: PlayerRef,
  payload: ReceiptUploadPayload,
  uploadedAt: string,
  confirmedAt: string | null = null,
): PaymentReceipt {
  return {
    playerRef,
    storagePath: payload.storagePath,
    mimeType: payload.mimeType as ReceiptMimeType,
    byteSize: payload.byteSize,
    uploadedAt,
    confirmedAt,
  };
}

/* ─────────────── Lecturas puras del estado ─────────────── */

/** El comprobante vigente de una persona (la nota de rechazo vive en payments). */
export function getOwnReceipt(
  receipts: ReceiptsState,
  playerRef: PlayerRef,
): PaymentReceipt | undefined {
  return receipts.receipts.find((receipt) => receipt.playerRef === playerRef);
}

/** Resumen de la fila propia para habilitar/deshabilitar acciones en la interfaz. */
export interface OwnReceiptFlow {
  hasClaim: boolean;
  hasReceipt: boolean;
  /** El comprobante está bloqueado (pago confirmado o respaldo post-cierre). */
  isLocked: boolean;
  /** Puede reemplazar (o adjuntar a una marca legacy sin imagen): marca vigente sin cierre. */
  canUpdateActiveReceipt: boolean;
  /** Puede adjuntar respaldo post-cierre (D4): «Pagado» sin comprobante, sin marca. */
  canAttachPostClose: boolean;
  /** Nota de rechazo vigente (hasta su próxima marca). */
  rejectionNote: string | null;
}

export function getOwnReceiptFlow(
  payments: PaymentsState,
  receipts: ReceiptsState,
  playerRef: PlayerRef,
): OwnReceiptFlow {
  const hasClaim = payments.claims.some((claim) => claim.playerRef === playerRef);
  const receipt = getOwnReceipt(receipts, playerRef);
  const paid = getVigentePaidTotalCLP(payments, playerRef) > 0;
  return {
    hasClaim,
    hasReceipt: receipt !== undefined,
    isLocked: receipt !== undefined && receipt.confirmedAt !== null,
    canUpdateActiveReceipt: hasClaim && (receipt === undefined || receipt.confirmedAt === null),
    canAttachPostClose: !hasClaim && receipt === undefined && paid,
    rejectionNote: payments.rejectionNotes?.[playerRef] ?? null,
  };
}

/* ─────── submit_transfer_claim (RF-3): marca + comprobante juntos ─────── */

/**
 * El invitado marca «Ya transferí» CON su comprobante en el mismo gesto.
 * La marca solo se registra si la imagen es elegible; si falla la subida
 * (el repositorio no tendría objeto), el cliente no llama aquí — el estado
 * «En revisión» y el comprobante nacen y mueren juntos.
 * De paso limpia la nota de rechazo anterior (RF-5: la nueva marca la cierra).
 */
export function submitTransferClaim(
  payments: PaymentsState,
  receipts: ReceiptsState,
  input: {
    playerRef: PlayerRef;
    titularPlayers: readonly TeamPlayer[];
    totalCostCLP: number;
    now: string;
    receipt: ReceiptUploadPayload;
  },
): ReceiptOpResult {
  const fail = (reason: ReceiptError): ReceiptOpResult => ({
    ok: false,
    reason,
    payments,
    receipts,
  });
  if (!input.titularPlayers.some((player) => player.ref === input.playerRef)) {
    return fail("not_titular");
  }
  if (payments.claims.some((claim) => claim.playerRef === input.playerRef)) {
    return fail("already_in_review");
  }
  const quota = getCurrentQuotaCLP(input.totalCostCLP, input.titularPlayers.length);
  if (getVigentePaidTotalCLP(payments, input.playerRef) >= quota) {
    return fail("nothing_to_transfer");
  }
  const payloadError = validateReceiptPayload(input.receipt);
  if (payloadError !== null) {
    return fail(payloadError);
  }
  return {
    ok: true,
    payments: {
      ...payments,
      claims: [...payments.claims, { playerRef: input.playerRef, claimedAt: input.now }],
      rejectionNotes: dropRejectionNote(payments.rejectionNotes, input.playerRef),
    },
    receipts: {
      receipts: [...receipts.receipts, makeReceipt(input.playerRef, input.receipt, input.now)],
    },
    removedStoragePaths: [],
  };
}

/* ─────────────── Reemplazo / adjunto a marca vigente (RF-4) ─────────────── */

/**
 * Con marca «En revisión» vigente: reemplaza el comprobante (la versión
 * anterior sale del estado y su objeto queda listo para borrar) o, si la
 * marca es legacy sin imagen (D2), adjunta el primero. Bloqueado por
 * completo una vez confirmado el pago.
 */
export function updateActiveReceipt(
  payments: PaymentsState,
  receipts: ReceiptsState,
  input: {
    playerRef: PlayerRef;
    now: string;
    receipt: ReceiptUploadPayload;
  },
): ReceiptOpResult {
  const fail = (reason: ReceiptError): ReceiptOpResult => ({
    ok: false,
    reason,
    payments,
    receipts,
  });
  const hasClaim = payments.claims.some((claim) => claim.playerRef === input.playerRef);
  if (!hasClaim) {
    return fail("claim_not_found");
  }
  const payloadError = validateReceiptPayload(input.receipt);
  if (payloadError !== null) {
    return fail(payloadError);
  }
  const existing = getOwnReceipt(receipts, input.playerRef);
  if (existing !== undefined && existing.confirmedAt !== null) {
    return fail("receipt_locked");
  }
  const next = makeReceipt(input.playerRef, input.receipt, input.now);
  return {
    ok: true,
    payments,
    receipts: {
      receipts: [
        ...receipts.receipts.filter((receipt) => receipt.playerRef !== input.playerRef),
        next,
      ],
    },
    removedStoragePaths: existing !== undefined ? [existing.storagePath] : [],
  };
}

/* ─────────────── Respaldo post-cierre (D4) ─────────────── */

/**
 * La fila quedó «Pagado» a mano sin comprobante y el dueño trae su imagen
 * después: se adjunta como respaldo informativo (sin cambiar estados y sin
 * más reemplazos). El sello se fija al registro del pago confirmado, no al
 * «ahora». Con marca vigente o comprobante existente se niega.
 */
export function attachPostCloseReceipt(
  payments: PaymentsState,
  receipts: ReceiptsState,
  input: {
    playerRef: PlayerRef;
    receipt: ReceiptUploadPayload;
  },
): ReceiptOpResult {
  const fail = (reason: ReceiptError): ReceiptOpResult => ({
    ok: false,
    reason,
    payments,
    receipts,
  });
  const hasClaim = payments.claims.some((claim) => claim.playerRef === input.playerRef);
  if (hasClaim) {
    return fail("has_active_claim");
  }
  if (getOwnReceipt(receipts, input.playerRef) !== undefined) {
    return fail("receipt_locked");
  }
  const payloadError = validateReceiptPayload(input.receipt);
  if (payloadError !== null) {
    return fail(payloadError);
  }
  const vigentes = payments.transactions.filter((txn) => txn.revokedAt === null);
  const lastOwn = vigentes
    .filter((txn) => txn.playerRef === input.playerRef)
    .pop();
  if (lastOwn === undefined) {
    return fail("not_payable");
  }
  return {
    ok: true,
    payments,
    receipts: {
      receipts: [
        ...receipts.receipts,
        makeReceipt(input.playerRef, input.receipt, lastOwn.recordedAt, lastOwn.recordedAt),
      ],
    },
    removedStoragePaths: [],
  };
}

/* ─────── Retracto propio: la marca y SU comprobante salen juntos ─────── */

/**
 * El invitado retracta su marca (toque errado): la marca sale y, con ella,
 * el comprobante (la imagen vigente se elimina — solo sobrevive la que el
 * organizador confirma). La baja de titularidad NO pasa por aquí: esa deja
 * la imagen conservada para el organizador (RF-8).
 */
export function retractOwnClaim(
  payments: PaymentsState,
  receipts: ReceiptsState,
  playerRef: PlayerRef,
  titularPlayers: readonly TeamPlayer[],
): ReceiptOpResult {
  const fail = (reason: ReceiptError): ReceiptOpResult => ({
    ok: false,
    reason,
    payments,
    receipts,
  });
  if (!titularPlayers.some((player) => player.ref === playerRef)) {
    return fail("not_titular");
  }
  if (!payments.claims.some((claim) => claim.playerRef === playerRef)) {
    return fail("claim_not_found");
  }
  const existing = getOwnReceipt(receipts, playerRef);
  return {
    ok: true,
    payments: {
      ...payments,
      claims: payments.claims.filter((claim) => claim.playerRef !== playerRef),
    },
    receipts: {
      receipts: receipts.receipts.filter((receipt) => receipt.playerRef !== playerRef),
    },
    removedStoragePaths: existing !== undefined ? [existing.storagePath] : [],
  };
}

/* ─────────────── Rechazo del organizador (RF-5) y nota de motivo (D3) ─────────────── */

/**
 * El organizador rechaza el comprobante: la fila vuelve a «Pendiente», la
 * imagen se ELIMINA y queda (opcional) la nota de motivo que el invitado
 * verá en su tarjeta. La nota vacía no bloquea el rechazo.
 */
export function rejectActiveClaim(
  payments: PaymentsState,
  receipts: ReceiptsState,
  input: {
    playerRef: PlayerRef;
    note: string | null;
  },
): ReceiptOpResult {
  const fail = (reason: ReceiptError): ReceiptOpResult => ({
    ok: false,
    reason,
    payments,
    receipts,
  });
  if (!payments.claims.some((claim) => claim.playerRef === input.playerRef)) {
    return fail("claim_not_found");
  }
  const trimmed = input.note?.trim() ?? "";
  if (trimmed.length > MAX_REJECTION_NOTE_LENGTH) {
    return fail("note_too_long");
  }
  const existing = getOwnReceipt(receipts, input.playerRef);
  const nextNotes =
    trimmed.length > 0
      ? { ...(payments.rejectionNotes ?? {}), [input.playerRef]: trimmed }
      : dropRejectionNote(payments.rejectionNotes, input.playerRef);
  return {
    ok: true,
    payments: {
      ...payments,
      claims: payments.claims.filter((claim) => claim.playerRef !== input.playerRef),
      rejectionNotes: nextNotes,
    },
    receipts: {
      receipts: receipts.receipts.filter((receipt) => receipt.playerRef !== input.playerRef),
    },
    removedStoragePaths: existing !== undefined ? [existing.storagePath] : [],
  };
}

/**
 * El organizador edita la nota de motivo mientras la fila siga «Pendiente»
 * (D3). El borrado (texto vacío) también es edición.
 */
export function setRejectionNote(
  payments: PaymentsState,
  playerRef: PlayerRef,
  rawNote: string | null,
): PaymentsState {
  const trimmed = rawNote?.trim() ?? "";
  const nextNotes =
    trimmed.length > 0
      ? { ...(payments.rejectionNotes ?? {}), [playerRef]: trimmed }
      : dropRejectionNote(payments.rejectionNotes, playerRef);
  return { ...payments, rejectionNotes: nextNotes };
}

/** True si la nota cabe (la interfaz la valida antes de enviarla). */
export function isValidRejectionNote(rawNote: string | null): boolean {
  return (rawNote?.trim().length ?? 0) <= MAX_REJECTION_NOTE_LENGTH;
}

/** Quita la nota de una persona (nueva marca / rechazo sin nota). */
function dropRejectionNote(
  notes: PaymentsState["rejectionNotes"],
  playerRef: PlayerRef,
): PaymentsState["rejectionNotes"] {
  if (notes === undefined || notes[playerRef] === undefined) {
    return notes;
  }
  const next = { ...notes };
  delete next[playerRef];
  return next;
}

/* ─────── Confirmación que bloquea el comprobante (RF-4) ─────── */

/**
 * Al confirmarse «Pagado», el comprobante vigente queda bloqueado como
 * respaldo del cierre (`confirmedAt`). Sin comprobante no hay nada que
 * bloquear (confirmación a mano); ya bloqueado, es idempotente.
 */
export function markReceiptConfirmed(
  receipts: ReceiptsState,
  playerRef: PlayerRef,
  now: string,
): ReceiptOnlyOpResult {
  const existing = getOwnReceipt(receipts, playerRef);
  if (existing === undefined) {
    return { ok: false, reason: "receipt_not_found", receipts };
  }
  if (existing.confirmedAt !== null) {
    return { ok: true, receipts };
  }
  return {
    ok: true,
    receipts: {
      receipts: receipts.receipts.map((receipt) =>
        receipt.playerRef === playerRef
          ? { ...receipt, confirmedAt: now }
          : receipt,
      ),
    },
  };
}

/* ─────────────── Privacidad por actor (RF-2 / Decisión 2A) ─────────────── */

/** Rol del actor en la vista de tesorería de un panorama. */
export type TreasuryActorRole =
  | "organizer"
  | "payment_row_owner"
  | "other_guest"
  | "anonymous";

/** Qué puede ver cada actor (el servidor lo repite, la pantalla lo obedece). */
export interface TreasuryPrivacyRules {
  /** El tablero completo de pagos: SOLO el organizador. */
  canSeeFullBoard: boolean;
  /** Bloque bancario con «Copiar»: organizador e invitados (herencia 004 para anónimos). */
  canSeeBankBlock: boolean;
  /** Las filas de pago de terceros: SOLO el organizador (2A). */
  canSeeOthersPayments: boolean;
  /** Su propia tarjeta con estado/comprobante: el dueño de la fila. */
  canSeeOwnCard: boolean;
}

export function getTreasuryPrivacyRules(role: TreasuryActorRole): TreasuryPrivacyRules {
  switch (role) {
    case "organizer":
      return {
        canSeeFullBoard: true,
        canSeeBankBlock: true,
        canSeeOthersPayments: true,
        canSeeOwnCard: true,
      };
    case "payment_row_owner":
    case "other_guest":
      return {
        canSeeFullBoard: false,
        canSeeBankBlock: true,
        canSeeOthersPayments: false,
        canSeeOwnCard: role === "payment_row_owner",
      };
    case "anonymous":
      return {
        canSeeFullBoard: false,
        canSeeBankBlock: true,
        canSeeOthersPayments: false,
        canSeeOwnCard: false,
      };
  }
}

/** Qué puede HACER cada actor sobre marcas y comprobantes. */
export interface ReceiptActorPermissions {
  /** Marca nueva «Ya transferí» (siempre con imagen; el núcleo valida cupidáz). */
  canSubmitClaim: boolean;
  /** Reemplazo (o adjunto a marca legacy sin imagen). */
  canUpdateActiveReceipt: boolean;
  /** Respaldo post-cierre (D4). */
  canAttachPostClose: boolean;
  /** Poderes del organizador (confirmar/revertir/rechazar el estado de cualquiera). */
  canManagePayments: boolean;
  canSeeAllReceipts: boolean;
}

export function getReceiptActorPermissions(
  role: TreasuryActorRole,
  own: { hasClaim: boolean; flowState: PaymentFlowState; hasReceipt: boolean },
): ReceiptActorPermissions {
  if (role === "organizer") {
    return {
      canSubmitClaim: false,
      canUpdateActiveReceipt: false,
      canAttachPostClose: false,
      canManagePayments: true,
      canSeeAllReceipts: true,
    };
  }
  if (role !== "payment_row_owner") {
    return {
      canSubmitClaim: false,
      canUpdateActiveReceipt: false,
      canAttachPostClose: false,
      canManagePayments: false,
      canSeeAllReceipts: false,
    };
  }
  return {
    canSubmitClaim: !own.hasClaim,
    canUpdateActiveReceipt: own.hasClaim,
    canAttachPostClose:
      !own.hasClaim && !own.hasReceipt && own.flowState === "paid",
    canManagePayments: false,
    canSeeAllReceipts: false,
  };
}

/* ─────────────── Métricas anónimas del pozo (RF-7) ─────────────── */

export interface TreasurySummaryMetrics {
  /** Recaudado neto: lo entrado menos lo ya devuelto. */
  collectedNetCLP: number;
  /** Por cobrar a los invitados (la fila del organizador no suma). */
  toCollectCLP: number;
  /** «N» de invitados con flujo «Pagado» (el organizador no cuenta). */
  paidGuests: number;
  /** «M» de invitados confirmados (el organizador no cuenta). */
  guestTotal: number;
  /** Porcentaje del pozo recaudado, redondeado al entero. */
  percent: number;
}

/**
 * Cantidades agregadas y anónimas: SIN nombres ni estados individuales.
 * Es la única fuente numérica del resumen del invitado (y el organizador
 * usa los mismos totales netos de la vista 004).
 */
export function computeAnonymousSummary(
  state: PaymentsState,
  titularPlayers: readonly TeamPlayer[],
  totalCostCLP: number,
): TreasurySummaryMetrics {
  const quota = getCurrentQuotaCLP(totalCostCLP, titularPlayers.length);
  const resolvedAll = state.resolvedRefunds.reduce(
    (total, refund) => total + refund.amountCLP,
    0,
  );
  const collectedNet = Math.max(
    0,
    state.transactions
      .filter((txn) => txn.revokedAt === null)
      .reduce((total, txn) => total + txn.amountCLP, 0) - resolvedAll,
  );
  let toCollect = 0;
  let paidGuests = 0;
  let guestTotal = 0;
  for (const player of titularPlayers) {
    if (player.ref === CREATOR_ATTENDEE_ID) {
      continue;
    }
    guestTotal += 1;
    const hasClaim = state.claims.some((claim) => claim.playerRef === player.ref);
    const paidTotal = getNetPaidTotalCLP(state, player.ref);
    toCollect += Math.max(0, quota - paidTotal);
    if (!hasClaim && paidTotal > 0) {
      paidGuests += 1;
    }
  }
  const base = collectedNet + toCollect;
  const percent = base > 0 ? Math.min(100, Math.round((collectedNet / base) * 100)) : 0;
  return {
    collectedNetCLP: collectedNet,
    toCollectCLP: toCollect,
    paidGuests,
    guestTotal,
    percent,
  };
}

/* ─────────────── Vista del invitado: 3 capas (RF-2) ─────────────── */

/** Miniatura/visor del comprobante propio que ve el dueño de la fila. */
export interface GuestReceiptSnapshot {
  mimeType: ReceiptMimeType;
  byteSize: number;
  uploadedAt: string;
  /** Bloqueado como respaldo («Pagado» confirmado o respaldo post-cierre). */
  confirmed: boolean;
  /** Puede reemplazarlo (marca vigente, aún sin confirmar). */
  canReplace: boolean;
}

/** La tarjeta personal de pago del invitado (única fila visible). */
export interface GuestSelfPaymentView {
  playerRef: PlayerRef;
  name: string;
  flowState: PaymentFlowState;
  situation: "even" | "owing" | "credit";
  /** Cuota que le falta pagar (0 si está al día). */
  remainingCLP: number;
  /** Saldo a favor propio (cuota bajó). */
  creditCLP: number;
  /** Devolución(es) pendiente(s) propias sumadas (Caso A + Caso B). */
  pendingRefundCLP: number;
  /** Cierres de devoluciones propias ya registrados (herencia 004). */
  ownResolvedRefunds: Array<{
    kind: RefundKind;
    amountCLP: number;
    resolvedAt: string;
  }>;
  receipt: GuestReceiptSnapshot | null;
  /** Nota de rechazo vigente (hasta su próxima marca). */
  rejectionNote: string | null;
}

/**
 * Vista de 3 capas en el enlace: métricas anónimas del pozo + SU tarjeta.
 * El bloque bancario NO vive aquí (sale del estado de pagos tal como hoy).
 */
export interface GuestTreasuryView {
  totalCostCLP: number;
  currentQuotaCLP: number;
  /** Pozo común informativo de la división inexacta. */
  surplusCLP: number;
  summary: TreasurySummaryMetrics;
  /** null mientras el actor no tenga fila en el panorama. */
  self: GuestSelfPaymentView | null;
}

export function getGuestTreasuryView(
  payments: PaymentsState,
  receipts: ReceiptsState,
  titularPlayers: readonly TeamPlayer[],
  restPlayers: readonly TeamPlayer[],
  totalCostCLP: number,
  selfRef: PlayerRef | null,
): GuestTreasuryView {
  const quota = getCurrentQuotaCLP(totalCostCLP, titularPlayers.length);
  const summary = computeAnonymousSummary(payments, titularPlayers, totalCostCLP);
  const { surplusCLP } = splitCost(totalCostCLP, titularPlayers.length);

  let self: GuestSelfPaymentView | null = null;
  if (selfRef !== null) {
    const allPlayers = [...titularPlayers, ...restPlayers];
    const own = allPlayers.find((player) => player.ref === selfRef);
    if (own !== undefined) {
      const isTitular = titularPlayers.some((player) => player.ref === selfRef);
      const receipt = getOwnReceipt(receipts, selfRef);
      const rejectionNote = payments.rejectionNotes?.[selfRef] ?? null;
      const ownResolvedRefunds = payments.resolvedRefunds
        .filter((refund) => refund.playerRef === selfRef)
        .map((refund) => ({
          kind: refund.kind,
          amountCLP: refund.amountCLP,
          resolvedAt: refund.resolvedAt,
        }));
      const pendingRefundCLP = (["exit", "overpay"] as const).reduce(
        (total, kind) =>
          total +
          getPendingRefundAmountCLP(payments, selfRef, kind, titularPlayers, totalCostCLP),
        0,
      );
      if (isTitular) {
        const row = getPaymentTreasuryView(
          payments,
          titularPlayers,
          restPlayers,
          totalCostCLP,
        ).titulars.find((item) => item.playerRef === selfRef);
        if (row !== undefined) {
          self = {
            playerRef: row.playerRef,
            name: row.name,
            flowState: row.flowState,
            situation: row.situation,
            remainingCLP: row.owingCLP,
            creditCLP: row.creditCLP,
            pendingRefundCLP,
            ownResolvedRefunds,
            receipt:
              receipt === undefined
                ? null
                : toReceiptSnapshot(receipt, row.hasClaim && receipt.confirmedAt === null),
            rejectionNote,
          };
        }
      } else {
        // Ex-confirmado, lista de espera, «En duda» o «No puedo」: tarjeta sin acciones.
        const flowState = getPaymentFlowState(payments, selfRef);
        self = {
          playerRef: own.ref,
          name: own.name,
          flowState,
          // Fuera del cupo no se le cobra; su plataforma es la devolución propia.
          situation: "even",
          remainingCLP: 0,
          creditCLP: 0,
          pendingRefundCLP,
          ownResolvedRefunds,
          receipt: receipt === undefined ? null : toReceiptSnapshot(receipt, false),
          rejectionNote,
        };
      }
    }
  }

  return {
    totalCostCLP,
    currentQuotaCLP: quota,
    surplusCLP,
    summary,
    self,
  };
}

function toReceiptSnapshot(
  receipt: PaymentReceipt,
  canReplace: boolean,
): GuestReceiptSnapshot {
  return {
    mimeType: receipt.mimeType,
    byteSize: receipt.byteSize,
    uploadedAt: receipt.uploadedAt,
    confirmed: receipt.confirmedAt !== null,
    canReplace,
  };
}
