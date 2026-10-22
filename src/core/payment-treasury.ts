/**
 * Dominio "Control de Pagos y Tesorería" (spec 004).
 *
 * Reglas de producto:
 * - La única cuota que se cobra es la CUOTA ACTUAL: mismo cálculo de la
 *   boleta (`splitCost`): techo al múltiplo de $100 entre titulares vigentes
 *   («Voy» dentro del cupo; el organizador es titular n.º 0). La cuota
 *   histórica jamás se congela como objetivo: se compara el pagado acumulado
 *   de cada persona contra la cuota vigente de hoy.
 * - Cada confirmación «Pagado» es una TRANSACCIÓN con monto entero > 0
 *   (predeterminado = cuota vigente, editable por el creador) y sello local.
 *   Revertir REVOCAR el sello (el monto sale del acumulado) sin borrar la
 *   fila: el historial queda auditable.
 * - Flujo por titular: Pendiente → En revisión («Ya transferí», marca
 *   propia y retractable) → Pagado. Si la cuota sube tras un pago, la fila
 *   muestra el ADEUDO de la diferencia (el estado «Pagado» no se degrada).
 * - Devoluciones (Caso A): si una persona con pagado acumulado deja de ser
 *   titular, se debe devolver el 100% de su acumulado (deriva de los datos,
 *   no se persiste «abierta»); si vuelve a ser titular, la devolución
 *   pendiente desaparece sola. Caso B: titular con acumulado > cuota
 *   vigente muestra «Saldo a favor» hasta que su monto se devuelva.
 * - «Reembolsada» es el único registro persistido de tesorería: monto
 *   completo de la devolución (sin parcialidades) y sello; reversible.
 * - El bloque de datos de transferencia es texto libre opcional (≤ 500)
 *   y la puerta del módulo es: costo > $0 Y bloque definido — SOSTENIDA
 *   mientras queden pagos vigentes o reembolsos resueltos.
 *
 * El «ahora» entra SIEMPRE como parámetro (`now`, texto local
 * 'YYYY-MM-DDTHH:mm'); este módulo es puro: sin React, sin DOM, sin red.
 */

import { isValidCLPAmount, splitCost } from "./currency-clp";
import type { TeamPlayer } from "./team-organizer";

/**
 * Referencia de la persona que paga: `creator` (organizador virtual) o el
 * id del participante, igual que las referencias de la 002 y la 003.
 */
export type PlayerRef = string;

/** Largo máximo del bloque de datos de transferencia (decisión v0.2). */
export const MAX_TRANSFER_INFO_LENGTH = 500;

/** Estado de flujo de pago de un titular. */
export type PaymentFlowState = "pending" | "in_review" | "paid";

/** Situación monetaria contra la cuota vigente. */
export type PaymentSituation = "even" | "owing" | "credit";

/** Motivo de una devolución: baja del titular o cuota que bajó. */
export type RefundKind = "exit" | "overpay";

/** Transacción de pago registrada (el historial completo, revocadas incluidas). */
export interface PaymentTransaction {
  /** Identificador estable dentro del panorama (para revertir una en particular). */
  id: string;
  playerRef: PlayerRef;
  /** Monto transferido en CLP enteros. */
  amountCLP: number;
  /** Fecha/hora local del registro ('YYYY-MM-DDTHH:mm'). */
  recordedAt: string;
  /** Sello local de la reversión (null = transacción vigente). */
  revokedAt: string | null;
}

/** Marca propia «Ya transferí» (estado «En revisión»). Máx. una por persona. */
export interface PaymentClaim {
  playerRef: PlayerRef;
  /** Sello local de la marca. */
  claimedAt: string;
}

/** Devolución ya reembolsada (el cierre que sí se registra). */
export interface ResolvedRefund {
  playerRef: PlayerRef;
  kind: RefundKind;
  /** Monto devuelto en CLP enteros (el completo de la devolución). */
  amountCLP: number;
  /** Sello local del reembolso. */
  resolvedAt: string;
}

/** Estado completo de tesorería de un panorama. */
export interface PaymentsState {
  /** Bloque de datos de transferencia; null = no definido (módulo oculto). */
  transferInfo: string | null;
  /** Historial de transacciones (vigentes y revocadas). */
  transactions: PaymentTransaction[];
  /** Marcas «Ya transferí» vigentes. */
  claims: PaymentClaim[];
  /** Cierres «Reembolsada» registrados. */
  resolvedRefunds: ResolvedRefund[];
}

export type PaymentTreasuryError =
  | "transfer_too_long"
  | "not_titular"
  | "already_in_review"
  | "nothing_to_transfer"
  | "claim_not_found"
  | "not_payable"
  | "invalid_amount"
  | "payment_not_found"
  | "no_pending_refund"
  | "no_resolved_refund";

/** Textos de error en español para la interfaz. */
export function getPaymentTreasuryErrorMessage(error: PaymentTreasuryError): string {
  switch (error) {
    case "transfer_too_long":
      return `El bloque de datos de transferencia es demasiado largo (máx. ${MAX_TRANSFER_INFO_LENGTH} caracteres).`;
    case "not_titular":
      return "Solo los titulares dentro del cupo pueden marcar su transferencia.";
    case "already_in_review":
      return "Tu transferencia ya está en revisión.";
    case "nothing_to_transfer":
      return "Ya estás al día: no hay cuota pendiente que transferir.";
    case "claim_not_found":
      return "No hay una marca «Ya transferí» que retractar.";
    case "not_payable":
      return "Esa persona ya no es titular y no dejó marca de transferencia.";
    case "invalid_amount":
      return "El monto debe ser un entero en CLP mayor a cero.";
    case "payment_not_found":
      return "No hay un pago vigente para revertir.";
    case "no_pending_refund":
      return "No hay una devolución pendiente para ese caso.";
    case "no_resolved_refund":
      return "No hay un reembolso registrado para reabrir.";
  }
}

/** Resultado uniforme de las operaciones con estado (`TeamsOpResult` style). */
export type PaymentsOpResult =
  | { ok: true; payments: PaymentsState }
  | { ok: false; reason: PaymentTreasuryError; payments: PaymentsState };

/** Estado inicial: sin bloque bancario, sin transacciones ni cierres. */
export function createEmptyPaymentsState(): PaymentsState {
  return { transferInfo: null, transactions: [], claims: [], resolvedRefunds: [] };
}

/* ─────────────── Puerta del módulo (RF-1) ─────────────── */

/**
 * Activo si y solo si hay cuota que cobrar (costo > $0) y bloque bancario
 * definido — o quedan pagos vigentes / reembolsos resueltos que obligan a
 * mantener el módulo (enismatch para cerrar devoluciones y revertir).
 */
export function isPaymentModuleActive(
  totalCostCLP: number,
  state: PaymentsState,
): boolean {
  const hasMoney =
    state.transactions.some((txn) => txn.revokedAt === null) ||
    state.resolvedRefunds.length > 0;
  if (hasMoney) {
    return true;
  }
  return totalCostCLP > 0 && (state.transferInfo ?? "").trim().length > 0;
}

/* ─────────────── Cuota actual y acumulados (RF-4) ─────────────── */

/** La cuota actual: mismo cálculo de la boleta (0 si no hay titulares). */
export function getCurrentQuotaCLP(
  totalCostCLP: number,
  titularCount: number,
): number {
  return splitCost(totalCostCLP, titularCount).perHeadCLP;
}

/** Pagado acumulado VIGENTE de una persona (las revocadas no cuentan). */
export function getVigentePaidTotalCLP(
  state: PaymentsState,
  playerRef: PlayerRef,
): number {
  return state.transactions
    .filter((txn) => txn.playerRef === playerRef && txn.revokedAt === null)
    .reduce((total, txn) => total + txn.amountCLP, 0);
}

/** Estado de flujo derivado: la marca manda, luego el pago confirmado. */
export function getPaymentFlowState(
  state: PaymentsState,
  playerRef: PlayerRef,
): PaymentFlowState {
  if (state.claims.some((claim) => claim.playerRef === playerRef)) {
    return "in_review";
  }
  return getVigentePaidTotalCLP(state, playerRef) > 0 ? "paid" : "pending";
}

/* ─────────────── Devoluciones derivadas (RF-7 y RF-8) ─────────────── */

/**
 * Monto PENDIENTE de devolución para (ref, motivo): lo que corresponde por
 * la regla menos lo ya reembolsado en resguardos de ese mismo motivo.
 * Salida 0 cuando todo está reembolsado o la regla ya no aplica.
 */
export function getPendingRefundAmountCLP(
  state: PaymentsState,
  playerRef: PlayerRef,
  kind: RefundKind,
  titularPlayers: readonly TeamPlayer[],
  totalCostCLP: number,
): number {
  const isTitular = titularPlayers.some((player) => player.ref === playerRef);
  const quota = getCurrentQuotaCLP(totalCostCLP, titularPlayers.length);
  const paidTotal = getVigentePaidTotalCLP(state, playerRef);
  const owedByRule =
    kind === "exit"
      ? isTitular
        ? 0
        : paidTotal
      : isTitular
        ? Math.max(0, paidTotal - quota)
        : 0;
  const resolvedTotal = state.resolvedRefunds
    .filter((refund) => refund.playerRef === playerRef && refund.kind === kind)
    .reduce((total, refund) => total + refund.amountCLP, 0);
  return Math.max(0, owedByRule - resolvedTotal);
}

/** Una devolución pendiente visible en el tablero. */
export interface PendingRefundView {
  playerRef: PlayerRef;
  /** Nombre si es reconocible en la lista compuesta (null si ref desconocida). */
  name: string | null;
  kind: RefundKind;
  /** Monto pendiente (regla − ya reembolsado). */
  amountCLP: number;
}

/** Lista de devoluciones pendientes derivadas del estado actual. */
export function listPendingRefunds(
  state: PaymentsState,
  titularPlayers: readonly TeamPlayer[],
  restPlayers: readonly TeamPlayer[],
  totalCostCLP: number,
): PendingRefundView[] {
  const names = new Map(
    [...titularPlayers, ...restPlayers].map((player) => [player.ref, player.name]),
  );
  const pending: PendingRefundView[] = [];
  const refs = new Set<string>();
  for (const txn of state.transactions) {
    if (txn.revokedAt === null) {
      refs.add(txn.playerRef);
    }
  }
  for (const kind of ["exit", "overpay"] as const) {
    for (const playerRef of refs) {
      const amount = getPendingRefundAmountCLP(
        state,
        playerRef,
        kind,
        titularPlayers,
        totalCostCLP,
      );
      if (amount > 0) {
        pending.push({
          playerRef,
          name: names.get(playerRef) ?? null,
          kind,
          amountCLP: amount,
        });
      }
    }
  }
  return pending;
}

/* ─────────────── Vista completa del tablero (RF-11 y RF-10) ─────────────── */

/** Fila de un titular vigente en el tablero de pagos. */
export interface TitularPaymentView {
  playerRef: PlayerRef;
  name: string;
  flowState: PaymentFlowState;
  /** Pagado acumulado vigente. */
  paidTotalCLP: number;
  /** Cuota actual (la de HOY, nunca la histórica). */
  currentQuotaCLP: number;
  situation: PaymentSituation;
  /** Adeudo de la diferencia (cuota subió). > 0 solo en «owing». */
  owingCLP: number;
  /** Saldo a favor (cuota bajó). > 0 solo en «credit». */
  creditCLP: number;
  /** true si este titular tiene marca «Ya transferí» vigente. */
  hasClaim: boolean;
}

/** Totales de tesorería (solo creador, RF-10). */
export interface TreasuryTotals {
  /** Suma de pagos vigentes (la plata que ya entró, cualquiera sea su dueño). */
  collectedCLP: number;
  /** Suma de adeudos vigentes de los titulares (cuota de hoy − pagado). */
  toCollectCLP: number;
  /** Suma de devoluciones pendientes (Caso A + saldo a favor Caso B). */
  toRefundCLP: number;
}

/** Vista completa del módulo para la interfaz. */
export interface PaymentTreasuryView {
  currentQuotaCLP: number;
  /** Pozo común de la división inexacta (texto heredado de la boleta). */
  surplusCLP: number;
  /** Filas de titulares vigentes, en orden de confirmación (entrada). */
  titulars: TitularPaymentView[];
  /** Devoluciones pendientes (bajas + saldos a favor). */
  pendingRefunds: PendingRefundView[];
  /** Cierres «Reembolsada» registrados, con nombre si reconocible. */
  resolvedRefunds: Array<ResolvedRefund & { name: string | null }>;
  totals: TreasuryTotals;
}

/**
 * Arma la vista pidiendo SOLO datos vigentes: titulares reales, resto de
 * la lista compuesta (para nombres de ex-titulares) y costo total.
 */
export function getPaymentTreasuryView(
  state: PaymentsState,
  titularPlayers: readonly TeamPlayer[],
  restPlayers: readonly TeamPlayer[],
  totalCostCLP: number,
): PaymentTreasuryView {
  const quota = getCurrentQuotaCLP(totalCostCLP, titularPlayers.length);
  const allPlayers = [...titularPlayers, ...restPlayers];
  const names = new Map(allPlayers.map((player) => [player.ref, player.name]));

  const titulars = titularPlayers.map<TitularPaymentView>((player) => {
    const paidTotal = getVigentePaidTotalCLP(state, player.ref);
    const hasClaim = state.claims.some((claim) => claim.playerRef === player.ref);
    const owing = Math.max(0, quota - paidTotal);
    const credit = paidTotal > quota ? paidTotal - quota : 0;
    const flowState: PaymentFlowState = hasClaim
      ? "in_review"
      : paidTotal > 0
        ? "paid"
        : "pending";
    return {
      playerRef: player.ref,
      name: player.name,
      flowState,
      paidTotalCLP: paidTotal,
      currentQuotaCLP: quota,
      situation: owing > 0 ? "owing" : credit > 0 ? "credit" : "even",
      owingCLP: owing,
      creditCLP: credit,
      hasClaim,
    };
  });

  const pending = listPendingRefunds(state, titularPlayers, restPlayers, totalCostCLP);
  const collected = state.transactions
    .filter((txn) => txn.revokedAt === null)
    .reduce((total, txn) => total + txn.amountCLP, 0);
  const toCollect = titulars.reduce((total, row) => total + row.owingCLP, 0);
  const toRefund = pending.reduce((total, refund) => total + refund.amountCLP, 0);

  return {
    currentQuotaCLP: quota,
    surplusCLP: splitCost(totalCostCLP, titularPlayers.length).surplusCLP,
    titulars,
    pendingRefunds: pending,
    resolvedRefunds: state.resolvedRefunds.map((refund) => ({
      ...refund,
      name: names.get(refund.playerRef) ?? null,
    })),
    totals: { collectedCLP: collected, toCollectCLP: toCollect, toRefundCLP: toRefund },
  };
}

/* ─────────────── Bloque de datos de transferencia (RF-2) ─────────────── */

/**
 * Guarda el bloque bancario del creador. Texto vacío (= solo espacios) lo
 * borra (null); más de 500 caracteres tras recortar bordes rechaza.
 */
export function setTransferInfo(
  state: PaymentsState,
  rawTransferInfo: string,
): PaymentsOpResult {
  const trimmed = rawTransferInfo.trim();
  if (trimmed.length > MAX_TRANSFER_INFO_LENGTH) {
    return { ok: false, reason: "transfer_too_long", payments: state };
  }
  return {
    ok: true,
    payments: { ...state, transferInfo: trimmed.length > 0 ? trimmed : null },
  };
}

/* ─────────────── Marca propia «Ya transferí» (RF-5) ─────────────── */

/**
 * El titular vigente marca la transferencia él mismo. Solo si NO tiene
 * marca ya y hay algo por pagar (del día queda «al día»). Si ya pagó y
 * la cuota subió, puede marcar de nuevo por la diferencia (RF-6).
 */
export function markSelfTransferred(
  state: PaymentsState,
  playerRef: PlayerRef,
  titularPlayers: readonly TeamPlayer[],
  totalCostCLP: number,
  now: string,
): PaymentsOpResult {
  if (!titularPlayers.some((player) => player.ref === playerRef)) {
    return { ok: false, reason: "not_titular", payments: state };
  }
  if (state.claims.some((claim) => claim.playerRef === playerRef)) {
    return { ok: false, reason: "already_in_review", payments: state };
  }
  const quota = getCurrentQuotaCLP(totalCostCLP, titularPlayers.length);
  if (getVigentePaidTotalCLP(state, playerRef) >= quota) {
    return { ok: false, reason: "nothing_to_transfer", payments: state };
  }
  return {
    ok: true,
    payments: {
      ...state,
      claims: [...state.claims, { playerRef, claimedAt: now }],
    },
  };
}

/** El titular vigente retracta su propia marca (toque errado). */
export function retractSelfTransferred(
  state: PaymentsState,
  playerRef: PlayerRef,
  titularPlayers: readonly TeamPlayer[],
): PaymentsOpResult {
  if (!titularPlayers.some((player) => player.ref === playerRef)) {
    return { ok: false, reason: "not_titular", payments: state };
  }
  if (!state.claims.some((claim) => claim.playerRef === playerRef)) {
    return { ok: false, reason: "claim_not_found", payments: state };
  }
  return {
    ok: true,
    payments: {
      ...state,
      claims: state.claims.filter((claim) => claim.playerRef !== playerRef),
    },
  };
}

/** Limpia la marca cuando la persona deja de ser titular (encadenado). */
export function dropPlayerClaims(
  state: PaymentsState,
  playerRef: PlayerRef,
): PaymentsState {
  if (!state.claims.some((claim) => claim.playerRef === playerRef)) {
    return state;
  }
  return {
    ...state,
    claims: state.claims.filter((claim) => claim.playerRef !== playerRef),
  };
}

/* ─────────────── Confirmación y reversión de pagos (RF-5) ─────────────── */

function nextTransactionId(transactions: readonly PaymentTransaction[]): string {
  let max = 0;
  for (const txn of transactions) {
    const parsed = Number.parseInt(txn.id.slice("tx-".length), 10);
    if (Number.isSafeInteger(parsed) && parsed > max) {
      max = parsed;
    }
  }
  return `tx-${max + 1}`;
}

/**
 * El creador confirma «Pagado»: registra el monto transferido (CLP entero)
 * con la fecha/hora local `now` y CONSUME la marca «Ya transferí» de la
 * persona (de confirma, nada queda en revisión). Acepta titulares
 * vigentes —incluido el organizador mismo— y, ex post, a un ex-titular que
 * dejó marca «Ya transferí» (su confirmación, ya de baja, nace como
 * devolución).
 */
export function confirmPayment(
  state: PaymentsState,
  playerRef: PlayerRef,
  options: { amountCLP?: number },
  titularPlayers: readonly TeamPlayer[],
  totalCostCLP: number,
  now: string,
): PaymentsOpResult {
  const isTitular = titularPlayers.some((player) => player.ref === playerRef);
  const hasClaim = state.claims.some((claim) => claim.playerRef === playerRef);
  if (!isTitular && !hasClaim) {
    return { ok: false, reason: "not_payable", payments: state };
  }
  const amount =
    options.amountCLP === undefined
      ? getCurrentQuotaCLP(totalCostCLP, titularPlayers.length)
      : options.amountCLP;
  if (!isValidCLPAmount(amount) || amount <= 0) {
    return { ok: false, reason: "invalid_amount", payments: state };
  }
  const txn: PaymentTransaction = {
    id: nextTransactionId(state.transactions),
    playerRef,
    amountCLP: amount,
    recordedAt: now,
    revokedAt: null,
  };
  return {
    ok: true,
    payments: {
      ...state,
      transactions: [...state.transactions, txn],
      claims: state.claims.filter((claim) => claim.playerRef !== playerRef),
    },
  };
}

/**
 * El creador revierte un pago por error: la transacción se REVOCAN (sale
 * del acumulado vigente, queda en el historial). Sin `transactionId`,
 * revoca la última transacción vigente de esa persona. La marca «Ya
 * transferí» sobrevive: si hay, la fila vuelve a «En revisión».
 */
export function revokePayment(
  state: PaymentsState,
  playerRef: PlayerRef,
  transactionId: string | undefined,
  now: string,
): PaymentsOpResult {
  const index = (() => {
    if (transactionId !== undefined) {
      return state.transactions.findIndex(
        (txn) => txn.id === transactionId && txn.revokedAt === null,
      );
    }
    for (let i = state.transactions.length - 1; i >= 0; i -= 1) {
      const txn = state.transactions[i];
      if (txn.playerRef === playerRef && txn.revokedAt === null) {
        return i;
      }
    }
    return -1;
  })();
  const target = index >= 0 ? state.transactions[index] : undefined;
  if (index < 0 || target === undefined || target.playerRef !== playerRef) {
    return { ok: false, reason: "payment_not_found", payments: state };
  }
  const transactions = state.transactions.map((txn, i) =>
    i === index ? { ...txn, revokedAt: now } : txn,
  );
  return { ok: true, payments: { ...state, transactions } };
}

/* ─────────────── Cierres «Reembolsada» (RF-9) ─────────────── */

/**
 * El creador marca una devolución como reembolsada: monto completo de la
 * devolución pendiente (sin parcialidades) y sello local `now`.
 */
export function resolveRefund(
  state: PaymentsState,
  playerRef: PlayerRef,
  kind: RefundKind,
  titularPlayers: readonly TeamPlayer[],
  restPlayers: readonly TeamPlayer[],
  totalCostCLP: number,
  now: string,
): PaymentsOpResult {
  const pendingAmount = getPendingRefundAmountCLP(
    state,
    playerRef,
    kind,
    titularPlayers,
    totalCostCLP,
  );
  if (pendingAmount <= 0) {
    return { ok: false, reason: "no_pending_refund", payments: state };
  }
  const resolved: ResolvedRefund = {
    playerRef,
    kind,
    amountCLP: pendingAmount,
    resolvedAt: now,
  };
  return {
    ok: true,
    payments: { ...state, resolvedRefunds: [...state.resolvedRefunds, resolved] },
  };
}

/**
 * El creador reabre un cierre por error: el registro «Reembolsada» sale de
 * la lista y la devolución vuelve a ser pendiente si la regla aún aplica.
 */
export function reopenRefund(
  state: PaymentsState,
  playerRef: PlayerRef,
  kind: RefundKind,
): PaymentsOpResult {
  const exists = state.resolvedRefunds.some(
    (refund) => refund.playerRef === playerRef && refund.kind === kind,
  );
  if (!exists) {
    return { ok: false, reason: "no_resolved_refund", payments: state };
  }
  return {
    ok: true,
    payments: {
      ...state,
      resolvedRefunds: state.resolvedRefunds.filter(
        (refund) => !(refund.playerRef === playerRef && refund.kind === kind),
      ),
    },
  };
}
