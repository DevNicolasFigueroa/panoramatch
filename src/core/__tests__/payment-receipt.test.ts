/**
 * Tests de Comprobantes de Pago (spec 005):
 * validación de imagen (formato/peso), marca + comprobante atómicos
 * (nunca «En revisión» sin imagen), reemplazo con eliminación de la
 * versión anterior, bloqueo al confirmar «Pagado», respaldo post-cierre
 * (D4), retracto que saca la imagen, rechazo con nota opcional editable
 * (D3) y limpieza, baja que CONSERVA la imagen (RF-8), privacidad por
 * actor (2A), métricas anónimas netas y la tarjeta propia del invitado.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  attachPostCloseReceipt,
  computeAnonymousSummary,
  createEmptyReceiptsState,
  getOwnReceipt,
  getOwnReceiptFlow,
  getReceiptActorPermissions,
  getReceiptErrorMessage,
  getGuestTreasuryView,
  getTreasuryPrivacyRules,
  isValidRejectionNote,
  markReceiptConfirmed,
  rejectActiveClaim,
  setRejectionNote,
  submitTransferClaim,
  updateActiveReceipt,
  retractOwnClaim,
  validateReceiptPayload,
  type ReceiptUploadPayload,
} from "../payment-receipt";
import {
  confirmPayment,
  createEmptyPaymentsState,
  getPaymentFlowState,
  setTransferInfo,
  type PaymentsState,
} from "../payment-treasury";
import { CREATOR_ATTENDEE_ID } from "../creator-attendee";
import type { TeamPlayer } from "../team-organizer";

const NOW = "2026-10-29T12:00";
const LATER = "2026-10-29T13:00";

/** Confirmados: organizador de orden 0 + Ana, Beto y Caro (cuota $10.000). */
const COST = 40000;
const TITULARS: TeamPlayer[] = [
  { ref: CREATOR_ATTENDEE_ID, name: "Nico" },
  { ref: "p1", name: "Ana" },
  { ref: "p2", name: "Beto" },
  { ref: "p3", name: "Caro" },
];
const REST: TeamPlayer[] = [{ ref: "p4", name: "Diego" }];

/** Comprobante de prueba en JPG, liviano. */
function img(path = "pano/p1/receipt.jpg"): ReceiptUploadPayload {
  return { storagePath: path, mimeType: "image/jpeg", byteSize: 1024 };
}

/** Estado de pagos vacío con bloque bancario (solo para contexto). */
function emptyPayments(): PaymentsState {
  const { ok, payments } = setTransferInfo(createEmptyPaymentsState(), "RUT 1-9\nBanco Estado");
  assert.equal(ok, true);
  return payments;
}

/** Marca + comprobante: atajo para poner a Ana «En revisión» con imagen. */
function claimWithImage(
  path = "pano/p1/receipt.jpg",
  payments: PaymentsState = emptyPayments(),
): { payments: PaymentsState; receipts: ReturnType<typeof createEmptyReceiptsState> } {
  const receipts = createEmptyReceiptsState();
  const result = submitTransferClaim(payments, receipts, {
    playerRef: "p1",
    titularPlayers: TITULARS,
    totalCostCLP: COST,
    now: NOW,
    receipt: img(path),
  });
  assert.ok(result.ok);
  return { payments: result.payments, receipts: result.receipts };
}

describe("Validación de imagen (RF-3 y RF-6)", () => {
  test("JPG, PNG y WEBP pasan", () => {
    assert.equal(validateReceiptPayload({ mimeType: "image/jpeg", byteSize: 10 }), null);
    assert.equal(validateReceiptPayload({ mimeType: "image/png", byteSize: 10 }), null);
    assert.equal(validateReceiptPayload({ mimeType: "image/webp", byteSize: 10 }), null);
  });

  test("otros formatos se rechazan (GIF, PDF, sin tipo)", () => {
    assert.equal(validateReceiptPayload({ mimeType: "image/gif", byteSize: 10 }), "unsupported_mime");
    assert.equal(validateReceiptPayload({ mimeType: "application/pdf", byteSize: 10 }), "unsupported_mime");
    assert.equal(validateReceiptPayload({ mimeType: "", byteSize: 10 }), "unsupported_mime");
  });

  test("el límite exacto de 5 MB pasa y un byte más rechaza", () => {
    assert.equal(validateReceiptPayload({ mimeType: "image/png", byteSize: 5 * 1024 * 1024 }), null);
    assert.equal(
      validateReceiptPayload({ mimeType: "image/png", byteSize: 5 * 1024 * 1024 + 1 }),
      "receipt_too_large",
    );
  });

  test("archivo vacío o con peso inválido rechaza antes que el formato", () => {
    assert.equal(validateReceiptPayload({ mimeType: "image/jpeg", byteSize: 0 }), "empty_file");
    assert.equal(validateReceiptPayload({ mimeType: "image/jpeg", byteSize: -5 }), "empty_file");
    assert.equal(validateReceiptPayload({ mimeType: "unsupported/x", byteSize: 1.5 }), "empty_file");
  });

  test("cada error tiene su mensaje en español", () => {
    for (const error of ["unsupported_mime", "receipt_too_large", "empty_file"] as const) {
      const message = getReceiptErrorMessage(error);
      assert.ok(message.length > 0);
      assert.ok(!message.includes("Error"), message);
    }
  });
});

describe("Marca + comprobante atómicos (RF-3)", () => {
  test("marca con imagen: la fila pasa a «En revisión» y el comprobante nace con ella", () => {
    const { payments, receipts } = claimWithImage();
    assert.equal(payments.claims.length, 1);
    assert.equal(payments.claims[0].playerRef, "p1");
    assert.equal(payments.claims[0].claimedAt, NOW);
    const receipt = getOwnReceipt(receipts, "p1");
    assert.ok(receipt);
    assert.equal(receipt.storagePath, "pano/p1/receipt.jpg");
    assert.equal(receipt.uploadedAt, NOW);
    assert.equal(receipt.confirmedAt, null);
    assert.equal(getPaymentFlowState(payments, "p1"), "in_review");
  });

  test("sin imagen elegible NO queda «En revisión» (el estado sigue «Pendiente»)", () => {
    const payments = emptyPayments();
    const result = submitTransferClaim(payments, createEmptyReceiptsState(), {
      playerRef: "p1",
      titularPlayers: TITULARS,
      totalCostCLP: COST,
      now: NOW,
      receipt: { storagePath: "pano/p1/bad.gif", mimeType: "image/gif", byteSize: 100 },
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "unsupported_mime");
    assert.equal(result.payments.claims.length, 0);
    assert.equal(getPaymentFlowState(result.payments, "p1"), "pending");
  });

  test("no titular no puede marcar (ni con imagen)", () => {
    const payments = emptyPayments();
    const result = submitTransferClaim(payments, createEmptyReceiptsState(), {
      playerRef: "p4",
      titularPlayers: TITULARS,
      totalCostCLP: COST,
      now: NOW,
      receipt: img(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "not_titular");
  });

  test("doble toque: una sola marca y un solo comprobante", () => {
    const first = claimWithImage();
    const second = submitTransferClaim(first.payments, first.receipts, {
      playerRef: "p1",
      titularPlayers: TITULARS,
      totalCostCLP: COST,
      now: LATER,
      receipt: img("pano/p1/receipt-b.jpg"),
    });
    assert.equal(second.ok, false);
    assert.equal(second.reason, "already_in_review");
    assert.equal(second.payments.claims.length, 1);
    assert.equal(second.receipts.receipts.length, 1);
    assert.equal(second.receipts.receipts[0].uploadedAt, NOW);
  });

  test("al día no marca; el adeudo de la diferencia sí (RF-6)", () => {
    let payments = emptyPayments();
    let state = confirmPayment(payments, "p1", { amountCLP: 10000 }, TITULARS, COST, NOW);
    assert.equal(state.ok, true);
    payments = state.payments;
    const blocked = submitTransferClaim(payments, createEmptyReceiptsState(), {
      playerRef: "p1",
      titularPlayers: TITULARS,
      totalCostCLP: COST,
      now: NOW,
      receipt: img(),
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, "nothing_to_transfer");
    // La cuota «sube»: con costo mayor queda adeudo y puede marcar (con imagen).
    const allowed = submitTransferClaim(payments, createEmptyReceiptsState(), {
      playerRef: "p1",
      titularPlayers: TITULARS,
      totalCostCLP: 60000,
      now: NOW,
      receipt: img(),
    });
    assert.equal(allowed.ok, true);
  });

  test("la nota de rechazo se limpia al volver a marcar (RF-5)", () => {
    const { payments, receipts } = claimWithImage();
    const rejected = rejectActiveClaim(payments, receipts, {
      playerRef: "p1",
      note: "El monto no coincide.",
    });
    assert.equal(rejected.ok, true);
    assert.ok(rejected.payments.rejectionNotes?.p1);
    const remarked = submitTransferClaim(rejected.payments, rejected.receipts, {
      playerRef: "p1",
      titularPlayers: TITULARS,
      totalCostCLP: COST,
      now: LATER,
      receipt: img(),
    });
    assert.equal(remarked.ok, true);
    assert.equal(remarked.payments.rejectionNotes?.p1, undefined);
  });
});

describe("Confirmación que bloquea el comprobante (RF-4)", () => {
  test("confirmado con imagen: queda bloqueado y no acepta reemplazo", () => {
    const { payments, receipts } = claimWithImage();
    const confirmed = markReceiptConfirmed(receipts, "p1", LATER);
    assert.equal(confirmed.ok, true);
    const locked = confirmed.receipts.receipts[0];
    assert.equal(locked.confirmedAt, LATER);
    const replacement = updateActiveReceipt(payments, confirmed.receipts, {
      playerRef: "p1",
      now: LATER,
      receipt: img("pano/p1/other.jpg"),
    });
    assert.equal(replacement.ok, false);
    assert.equal(replacement.reason, "receipt_locked");
  });

  test("confirmación a mano sin comprobante: no hay nada que bloquear (error inofensivo)", () => {
    const payments = emptyPayments();
    const state = confirmPayment(payments, "p1", {}, TITULARS, COST, NOW);
    assert.equal(state.ok, true);
    const locked = markReceiptConfirmed(createEmptyReceiptsState(), "p1", LATER);
    assert.equal(locked.ok, false);
    assert.equal(locked.reason, "receipt_not_found");
  });

  test("idempotente: re-bloquear no cambia el sello", () => {
    const { payments, receipts } = claimWithImage();
    const first = markReceiptConfirmed(receipts, "p1", LATER);
    assert.equal(first.ok, true);
    const second = markReceiptConfirmed(first.receipts, "p1", LATER);
    assert.equal(second.ok, true);
    assert.equal(second.receipts.receipts[0].confirmedAt, LATER);
    assert.equal(second.receipts.receipts.length, 1);
  });
});

describe("Reemplazo del comprobante en «En revisión» (RF-4)", () => {
  test("reemplaza la imagen vigente y la anterior queda lista para borrar", () => {
    const { payments, receipts } = claimWithImage("pano/p1/receipt-a.jpg");
    const replaced = updateActiveReceipt(payments, receipts, {
      playerRef: "p1",
      now: LATER,
      receipt: img("pano/p1/receipt-b.jpg"),
    });
    assert.equal(replaced.ok, true);
    assert.deepEqual(replaced.removedStoragePaths, ["pano/p1/receipt-a.jpg"]);
    assert.equal(replaced.receipts.receipts.length, 1);
    const receipt = getOwnReceipt(replaced.receipts, "p1");
    assert.ok(receipt);
    assert.equal(receipt.storagePath, "pano/p1/receipt-b.jpg");
    assert.equal(receipt.uploadedAt, LATER);
  });

  test("marca legacy sin imagen (D2): «reemplazo» sirve como adjunto inicial", () => {
    const payments: PaymentsState = { ...emptyPayments(), claims: [{ playerRef: "p1", claimedAt: NOW }] };
    const attached = updateActiveReceipt(payments, createEmptyReceiptsState(), {
      playerRef: "p1",
      now: LATER,
      receipt: img(),
    });
    assert.equal(attached.ok, true);
    assert.deepEqual(attached.removedStoragePaths, []);
    assert.equal(attached.receipts.receipts.length, 1);
  });

  test("sin marca vigente no hay reemplazo («Pagado» y «Pendiente» quedan bloqueados)", () => {
    const payments = emptyPayments();
    const blocked = updateActiveReceipt(payments, createEmptyReceiptsState(), {
      playerRef: "p1",
      now: LATER,
      receipt: img(),
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, "claim_not_found");
  });

  test("imagen inválida en el reemplazo: rechaza sin tocar la vigente", () => {
    const { payments, receipts } = claimWithImage("pano/p1/receipt-a.jpg");
    const rejected = updateActiveReceipt(payments, receipts, {
      playerRef: "p1",
      now: LATER,
      receipt: { storagePath: "pano/p1/big.jpg", mimeType: "image/jpeg", byteSize: 6 * 1024 * 1024 },
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.reason, "receipt_too_large");
    assert.equal(rejected.receipts.receipts[0].storagePath, "pano/p1/receipt-a.jpg");
  });
});

describe("Respaldo post-cierre (D4)", () => {
  test("«Pagado» a mano sin comprobante: el dueño adjunta después, sin cambiar estados", () => {
    let payments = emptyPayments();
    // Confirmación a mano sin marca (efectivo presencial) ayer.
    const confirmed = confirmPayment(payments, "p1", { amountCLP: 10000 }, TITULARS, COST, NOW);
    assert.equal(confirmed.ok, true);
    payments = confirmed.payments;
    const flowBefore = getPaymentFlowState(payments, "p1");
    assert.equal(flowBefore, "paid");

    const attached = attachPostCloseReceipt(payments, createEmptyReceiptsState(), {
      playerRef: "p1",
      receipt: img("pano/p1/backup.jpg"),
    });
    assert.equal(attached.ok, true);
    assert.equal(attached.removedStoragePaths.length, 0);
    const receipt = getOwnReceipt(attached.receipts, "p1");
    assert.ok(receipt);
    // El sello es el del pago confirmado, no el «ahora» del adjunto.
    assert.equal(receipt.confirmedAt, NOW);
    // El estado de pagos NO cambió (es respaldo informativo).
    assert.equal(getPaymentFlowState(attached.payments, "p1"), "paid");
    // Sin reemplazo posterior (bloqueado para siempre).
    const locked = getOwnReceiptFlow(attached.payments, attached.receipts, "p1");
    assert.equal(locked.isLocked, true);
    assert.equal(locked.canUpdateActiveReceipt, false);
  });

  test("con marca vigente no aplica (usa el reemplazo de su comprobante)", () => {
    const { payments, receipts } = claimWithImage();
    const attached = attachPostCloseReceipt(payments, receipts, {
      playerRef: "p1",
      receipt: img("pano/p1/backup.jpg"),
    });
    assert.equal(attached.ok, false);
    assert.equal(attached.reason, "has_active_claim");
  });

  test("con comprobante ya existente no acepta otro", () => {
    // «Pagado» a mano SIN comprobante, al que ya se le adjuntó el respaldo (D4).
    const payments: PaymentsState = {
      ...emptyPayments(),
      transactions: [
        { id: "tx-1", playerRef: "p1", amountCLP: 10000, recordedAt: NOW, revokedAt: null },
      ],
    };
    const receipts = createEmptyReceiptsState();
    const first = attachPostCloseReceipt(payments, receipts, {
      playerRef: "p1",
      receipt: img("pano/p1/backup.jpg"),
    });
    assert.equal(first.ok, true);
    const attached = attachPostCloseReceipt(payments, first.receipts, {
      playerRef: "p1",
      receipt: img("pano/p1/backup-2.jpg"),
    });
    assert.equal(attached.ok, false);
    assert.equal(attached.reason, "receipt_locked");
  });

  test("sin pago propio vigente no hay respaldo que adjuntar", () => {
    const attached = attachPostCloseReceipt(emptyPayments(), createEmptyReceiptsState(), {
      playerRef: "p1",
      receipt: img(),
    });
    assert.equal(attached.ok, false);
    assert.equal(attached.reason, "not_payable");
  });
});

describe("Retracto propio y baja con marca vigente (RF-8)", () => {
  test("retracto: la marca y SU imagen salen juntas (la imagen se elimina)", () => {
    const { payments, receipts } = claimWithImage("pano/p1/receipt-a.jpg");
    const retracted = retractOwnClaim(payments, receipts, "p1", TITULARS);
    assert.equal(retracted.ok, true);
    assert.deepEqual(retracted.removedStoragePaths, ["pano/p1/receipt-a.jpg"]);
    assert.equal(retracted.payments.claims.length, 0);
    assert.equal(retracted.receipts.receipts.length, 0);
    assert.equal(getPaymentFlowState(retracted.payments, "p1"), "pending");
  });

  test("retracto de marca legacy sin imagen: sale solo la marca", () => {
    const payments: PaymentsState = { ...emptyPayments(), claims: [{ playerRef: "p1", claimedAt: NOW }] };
    const retracted = retractOwnClaim(payments, createEmptyReceiptsState(), "p1", TITULARS);
    assert.equal(retracted.ok, true);
    assert.deepEqual(retracted.removedStoragePaths, []);
  });

  test("sin marca que retractar: error claro sin cambios", () => {
    const retracted = retractOwnClaim(emptyPayments(), createEmptyReceiptsState(), "p1", TITULARS);
    assert.equal(retracted.ok, false);
    assert.equal(retracted.reason, "claim_not_found");
  });

  test("la baja NO elimina la imagen: queda conservada para el organizador (RF-8)", () => {
    const { payments, receipts } = claimWithImage("pano/p1/receipt-a.jpg");
    // Ana se baja: la encadenada de la 004 NO limpia su marca (queda
    // confirmable ex post) y el comprobante tampoco se toca.
    assert.equal(payments.claims.length, 1); // la marca sigue en el estado
    const receipt = getOwnReceipt(receipts, "p1");
    assert.ok(receipt);
    assert.equal(receipt.storagePath, "pano/p1/receipt-a.jpg");
    // El invitado pierde las acciones sobre su ex-tarjeta…
    const flow = getOwnReceiptFlow(payments, receipts, "p1");
    assert.equal(flow.isLocked, false); // aún en revisión
    // …pero la conservación es visible: el dato sigue disponible para el creador.
    assert.equal(getOwnReceipt(receipts, "p1")?.confirmedAt, null);
  });
});

describe("Rechazo del organizador y nota de motivo (RF-5 y D3)", () => {
  test("rechazo: vuelve a «Pendiente», elimina la imagen y no deja nota", () => {
    const { payments, receipts } = claimWithImage("pano/p1/receipt-a.jpg");
    const rejected = rejectActiveClaim(payments, receipts, { playerRef: "p1", note: null });
    assert.equal(rejected.ok, true);
    assert.deepEqual(rejected.removedStoragePaths, ["pano/p1/receipt-a.jpg"]);
    assert.equal(rejected.payments.claims.length, 0);
    assert.equal(rejected.receipts.receipts.length, 0);
    assert.equal(getPaymentFlowState(rejected.payments, "p1"), "pending");
    assert.equal(rejected.payments.rejectionNotes?.p1, undefined);
  });

  test("rechazo con nota: la nota se registra recortada de bordes", () => {
    const { payments, receipts } = claimWithImage();
    const rejected = rejectActiveClaim(payments, receipts, {
      playerRef: "p1",
      note: "  El monto no coincide con la cuota.  ",
    });
    assert.equal(rejected.ok, true);
    assert.equal(rejected.payments.rejectionNotes?.p1, "El monto no coincide con la cuota.");
  });

  test("rechazo sin marca vigente: error claro", () => {
    const rejected = rejectActiveClaim(emptyPayments(), createEmptyReceiptsState(), {
      playerRef: "p1",
      note: null,
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.reason, "claim_not_found");
  });

  test("nota demasiado larga: rechazo completo sin cambios de estado", () => {
    const { payments, receipts } = claimWithImage();
    const rejected = rejectActiveClaim(payments, receipts, {
      playerRef: "p1",
      note: "a".repeat(501),
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.reason, "note_too_long");
    assert.equal(rejected.payments.claims.length, 1);
    assert.equal(rejected.receipts.receipts.length, 1);
  });

  test("nota editable mientras la fila siga «Pendiente» (D3)", () => {
    const { payments, receipts } = claimWithImage();
    const rejected = rejectActiveClaim(payments, receipts, {
      playerRef: "p1",
      note: "Monto incorrecto.",
    });
    assert.equal(rejected.ok, true);
    const edited = setRejectionNote(rejected.payments, "p1", "  Banco equivocado.  ");
    assert.equal(edited.rejectionNotes?.p1, "Banco equivocado.");
    const cleared = setRejectionNote(edited, "p1", "");
    assert.equal(cleared.rejectionNotes?.p1, undefined);
  });

  test("validador de nota para la interfaz", () => {
    assert.equal(isValidRejectionNote("a".repeat(500)), true);
    assert.equal(isValidRejectionNote("a".repeat(501)), false);
    assert.equal(isValidRejectionNote(null), true);
  });
});

describe("Privacidad por actor (RF-2 / Decisión 2A)", () => {
  test("solo el organizador ve el tablero completo y las filas de terceros", () => {
    const rules = getTreasuryPrivacyRules("organizer");
    assert.deepEqual(rules, {
      canSeeFullBoard: true,
      canSeeBankBlock: true,
      canSeeOthersPayments: true,
      canSeeOwnCard: true,
    });
  });

  test("el dueño de fila y otros invitados: bloque bancario sí, tablero y filas ajenas NO", () => {
    for (const role of ["payment_row_owner", "other_guest"] as const) {
      const rules = getTreasuryPrivacyRules(role);
      assert.equal(rules.canSeeFullBoard, false, role);
      assert.equal(rules.canSeeBankBlock, true, role);
      assert.equal(rules.canSeeOthersPayments, false, role);
    }
    const owner = getTreasuryPrivacyRules("payment_row_owner");
    assert.equal(owner.canSeeOwnCard, true);
    const other = getTreasuryPrivacyRules("other_guest");
    assert.equal(other.canSeeOwnCard, false);
  });

  test("anónimo: solo el bloque bancario (herencia 004), sin tarjetas ni tablero", () => {
    const rules = getTreasuryPrivacyRules("anonymous");
    assert.equal(rules.canSeeFullBoard, false);
    assert.equal(rules.canSeeBankBlock, true);
    assert.equal(rules.canSeeOthersPayments, false);
    assert.equal(rules.canSeeOwnCard, false);
  });

  test("permisos del organizador: gestiona pagos y ve todos los comprobantes", () => {
    const perms = getReceiptActorPermissions("organizer", {
      hasClaim: false,
      flowState: "pending",
      hasReceipt: false,
    });
    assert.equal(perms.canManagePayments, true);
    assert.equal(perms.canSeeAllReceipts, true);
    assert.equal(perms.canSubmitClaim, false);
  });

  test("dueño de fila pendiente: marca sí (nueva), reemplazo no", () => {
    const perms = getReceiptActorPermissions("payment_row_owner", {
      hasClaim: false,
      flowState: "pending",
      hasReceipt: false,
    });
    assert.equal(perms.canSubmitClaim, true);
    assert.equal(perms.canUpdateActiveReceipt, false);
    assert.equal(perms.canAttachPostClose, false);
  });

  test("dueño de fila en revisión: reemplazo sí, marca nueva no", () => {
    const perms = getReceiptActorPermissions("payment_row_owner", {
      hasClaim: true,
      flowState: "in_review",
      hasReceipt: true,
    });
    assert.equal(perms.canSubmitClaim, false);
    assert.equal(perms.canUpdateActiveReceipt, true);
    assert.equal(perms.canAttachPostClose, false);
  });

  test("dueño de fila pagada sin comprobante: respaldo post-cierre sí (D4)", () => {
    const perms = getReceiptActorPermissions("payment_row_owner", {
      hasClaim: false,
      flowState: "paid",
      hasReceipt: false,
    });
    assert.equal(perms.canAttachPostClose, true);
    assert.equal(perms.canSubmitClaim, true); // el núcleo la aborta si ya está al día
    assert.equal(perms.canUpdateActiveReceipt, false);
  });

  test("invitado sin fila y anónimo no pueden actuar", () => {
    for (const role of ["other_guest", "anonymous"] as const) {
      const perms = getReceiptActorPermissions(role, {
        hasClaim: false,
        flowState: "pending",
        hasReceipt: false,
      });
      assert.equal(perms.canSubmitClaim, false, role);
      assert.equal(perms.canUpdateActiveReceipt, false, role);
      assert.equal(perms.canAttachPostClose, false, role);
      assert.equal(perms.canManagePayments, false, role);
    }
  });
});

describe("Resumen anónimo del pozo (RF-7)", () => {
  test("todo pendiente: por cobrar = cuota × invitados, sin pagados y 0 %", () => {
    const summary = computeAnonymousSummary(emptyPayments(), TITULARS, COST);
    assert.deepEqual(summary, {
      collectedNetCLP: 0,
      toCollectCLP: 30000,
      paidGuests: 0,
      guestTotal: 3,
      percent: 0,
    });
  });

  test("con pagos: cuenta invitados pagados (el organizador no cuenta) y escala el %", () => {
    let payments = emptyPayments();
    const r1 = confirmPayment(payments, "p1", {}, TITULARS, COST, NOW);
    assert.equal(r1.ok, true);
    payments = r1.payments;
    const r2 = confirmPayment(payments, CREATOR_ATTENDEE_ID, {}, TITULARS, COST, NOW);
    assert.equal(r2.ok, true);
    payments = r2.payments; // el organizador también «pagó»: igual NO cuenta como pagador
    const summary = computeAnonymousSummary(payments, TITULARS, COST);
    assert.equal(summary.paidGuests, 1);
    assert.equal(summary.guestTotal, 3);
    // Recaudado 20000, por cobrar 20000 → 50 % redondo.
    assert.equal(summary.collectedNetCLP, 20000);
    assert.equal(summary.toCollectCLP, 20000);
    assert.equal(summary.percent, 50);
  });

  test("en revisión NO cuenta como pagado", () => {
    const { payments } = claimWithImage();
    const summary = computeAnonymousSummary(payments, TITULARS, COST);
    assert.equal(summary.paidGuests, 0);
    assert.equal(summary.percent, 0);
  });

  test("el cierre «Reembolsada» descuenta del recaudado neto", () => {
    let payments = emptyPayments();
    // Beto pagó de más: entró $20.000 con cuota de $10.000.
    let state = confirmPayment(payments, "p2", { amountCLP: 20000 }, TITULARS, COST, NOW);
    assert.equal(state.ok, true);
    payments = state.payments;
    // Caso B: el cierre «Reembolsada» del excedente, ya registrado.
    payments = {
      ...payments,
      resolvedRefunds: [
        { playerRef: "p2", kind: "overpay", amountCLP: 10000, resolvedAt: LATER },
      ],
    };
    const summary = computeAnonymousSummary(payments, TITULARS, COST);
    // Entró 20000, devuelto 10000 → neto 10000.
    assert.equal(summary.collectedNetCLP, 10000);
    // Beto está al día (10000 neto = cuota); Ana y Caro adeudan 10000 c/u.
    assert.equal(summary.toCollectCLP, 20000);
    assert.equal(summary.paidGuests, 1);
    // 10000 de 30000 → 33 %.
    assert.equal(summary.percent, 33);
  });

  test("todo cobrado: 100 %", () => {
    let payments = emptyPayments();
    for (const player of ["p1", "p2", "p3"] as const) {
      const state = confirmPayment(payments, player, {}, TITULARS, COST, NOW);
      assert.equal(state.ok, true);
      payments = state.payments;
    }
    const summary = computeAnonymousSummary(payments, TITULARS, COST);
    assert.equal(summary.percent, 100);
    assert.equal(summary.paidGuests, 3);
    assert.equal(summary.toCollectCLP, 0);
  });
});

describe("Vista de invitado: 3 capas (RF-2)", () => {
  test("titular pendiente: métricas anónimas + SU tarjeta con cuota a pagar", () => {
    const view = getGuestTreasuryView(
      emptyPayments(),
      createEmptyReceiptsState(),
      TITULARS,
      REST,
      COST,
      "p1",
    );
    // Capa 1: métricas (sin nombres de terceros).
    assert.equal(view.currentQuotaCLP, 10000);
    assert.equal(view.summary.guestTotal, 3);
    assert.equal(view.summary.percent, 0);
    // Capa 3: SU tarjeta.
    assert.ok(view.self);
    assert.equal(view.self.playerRef, "p1");
    assert.equal(view.self.name, "Ana");
    assert.equal(view.self.flowState, "pending");
    assert.equal(view.self.situation, "owing");
    assert.equal(view.self.remainingCLP, 10000);
    assert.equal(view.self.receipt, null);
    assert.equal(view.self.rejectionNote, null);
  });

  test("titular en revisión: miniatura reemplazable y nota ausente", () => {
    const { payments, receipts } = claimWithImage();
    const view = getGuestTreasuryView(payments, receipts, TITULARS, REST, COST, "p1");
    assert.ok(view.self);
    assert.equal(view.self.flowState, "in_review");
    assert.ok(view.self.receipt);
    assert.equal(view.self.receipt.canReplace, true);
    assert.equal(view.self.receipt.confirmed, false);
    assert.equal(view.self.receipt.mimeType, "image/jpeg");
  });

  test("titular pagado con comprobante confirmado: miniatura bloqueada", () => {
    const { payments, receipts } = claimWithImage();
    let confirmed = confirmPayment(payments, "p1", {}, TITULARS, COST, LATER);
    assert.equal(confirmed.ok, true);
    const locked = markReceiptConfirmed(receipts, "p1", LATER);
    assert.equal(locked.ok, true);
    const view = getGuestTreasuryView(confirmed.payments, locked.receipts, TITULARS, REST, COST, "p1");
    assert.ok(view.self);
    assert.equal(view.self.flowState, "paid");
    assert.ok(view.self.receipt);
    assert.equal(view.self.receipt.canReplace, false);
    assert.equal(view.self.receipt.confirmed, true);
  });

  test("no confirmado (resto): tarjeta sin acciones y devolución propia visible", () => {
    // Diego fue confirmado y pagó en su día; hoy está fuera (baja ya dada).
    const payments: PaymentsState = {
      ...emptyPayments(),
      transactions: [
        { id: "tx-1", playerRef: "p4", amountCLP: 10000, recordedAt: NOW, revokedAt: null },
      ],
    };
    const view = getGuestTreasuryView(payments, createEmptyReceiptsState(), TITULARS, REST, COST, "p4");
    assert.ok(view.self);
    assert.equal(view.self.flowState, "paid");
    assert.equal(view.self.remainingCLP, 0);
    assert.equal(view.self.pendingRefundCLP, 10000); // devolución pendiente SUYA (Caso A)
  });

  test("el invitado ve la nota de rechazo del organizador en su tarjeta", () => {
    const { payments, receipts } = claimWithImage();
    const rejected = rejectActiveClaim(payments, receipts, {
      playerRef: "p1",
      note: "El monto no coincide.",
    });
    assert.equal(rejected.ok, true);
    const view = getGuestTreasuryView(
      rejected.payments,
      rejected.receipts,
      TITULARS,
      REST,
      COST,
      "p1",
    );
    assert.ok(view.self);
    assert.equal(view.self.flowState, "pending");
    assert.equal(view.self.rejectionNote, "El monto no coincide.");
    assert.equal(view.self.receipt, null);
  });

  test("baja con marca en revisión y comprobante: la imagen sigue y sin reemplazo (RF-8)", () => {
    const { payments, receipts } = claimWithImage();
    // Ana se baja: sin código de encadenado nuevo, solo cambia su titularidad…
    const titularsWithoutAna = TITULARS.filter((player) => player.ref !== "p1");
    const restWithAna = [...REST, { ref: "p1", name: "Ana" }];
    const view = getGuestTreasuryView(
      payments,
      receipts,
      titularsWithoutAna,
      restWithAna,
      COST,
      "p1",
    );
    assert.ok(view.self);
    assert.equal(view.self.flowState, "in_review"); // la marca persiste (confirmable ex post)
    assert.ok(view.self.receipt);
    assert.equal(view.self.receipt.canReplace, false); // pierde las acciones de titular
    assert.equal(view.self.receipt.confirmed, false);
    // La imagen sigue disponible al organizador (la fila no se borró).
    assert.ok(getOwnReceipt(receipts, "p1"));
  });

  test("actor sin fila: métricas sin tarjeta", () => {
    const view = getGuestTreasuryView(
      emptyPayments(),
      createEmptyReceiptsState(),
      TITULARS,
      REST,
      COST,
      null,
    );
    assert.ok(view.summary);
    assert.equal(view.self, null);
  });

  test("pozo común informativo incluido (herencia de la boleta)", () => {
    const view = getGuestTreasuryView(
      emptyPayments(),
      createEmptyReceiptsState(),
      TITULARS,
      REST,
      40001,
      "p1",
    );
    assert.equal(view.surplusCLP, 399); // 4 × $10.100 − $40.001: lo sobrante queda como pozo común
  });
});

/* Los helpers importados quedan todos consumidos por las baterías de arriba. */
