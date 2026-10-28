/**
 * Tests del Control de Pagos y Tesorería (spec 004):
 * puerta del módulo, cuota actual contra el pagado acumulado, flujo
 * Pendiente/«Ya transferí»/Pagado con marca propia y retracto, montos
 * registrados y reversibles (historial auditable), devolución 100% por
 * baja (Caso A), saldo a favor por cuota menor (Caso B), cierres
 * «Reembolsada» y totales de tesorería.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  confirmPayment,
  createEmptyPaymentsState,
  dropPlayerClaims,
  getCurrentQuotaCLP,
  getPaymentFlowState,
  getPaymentTreasuryErrorMessage,
  getPaymentTreasuryView,
  getVigentePaidTotalCLP,
  isPaymentModuleActive,
  listPendingRefunds,
  markSelfTransferred,
  reopenRefund,
  resolveRefund,
  retractSelfTransferred,
  revokePayment,
  setTransferInfo,
  type PaymentsState,
} from "../payment-treasury";
import { buildTitularPlayers, type TeamPlayer } from "../team-organizer";
import { buildCreatorAttendee, CREATOR_ATTENDEE_ID } from "../creator-attendee";
import type { Attendee } from "../types";

/** Fábrica de asistente invitado de prueba. */
function attendee(
  id: string,
  name: string,
  status: Attendee["status"],
  confirmedOrder: number | null,
): Attendee {
  return { id, name, status, confirmedOrder };
}

/** Lista compuesta base: organizador + 4 invitados (Ana, Beto, Caro, Diego). */
function buildBook(): Attendee[] {
  return [
    buildCreatorAttendee("Nico"),
    attendee("p1", "Ana", "going", 1),
    attendee("p2", "Beto", "going", 2),
    attendee("p3", "Caro", "going", 3),
    attendee("p4", "Diego", "maybe", null),
  ];
}

/** Resto de la lista compuesta: personas NO titulares (para nombres). */
function restPlayers(
  attendees: readonly Attendee[],
  titularPlayers: readonly TeamPlayer[],
): TeamPlayer[] {
  const titularRefs = new Set(titularPlayers.map((player) => player.ref));
  const names = new Map(attendees.map((item) => [item.id, item.name]));
  return attendees
    .filter((item) => !titularRefs.has(item.id))
    .map((item) => ({ ref: item.id, name: names.get(item.id) ?? item.name }));
}

const CREATOR = CREATOR_ATTENDEE_ID;
const NOW = "2026-10-22T10:00";

/** Estado con bloque bancario definido (puerta abierta). */
function bookedState(): PaymentsState {
  const { ok, payments } = setTransferInfo(createEmptyPaymentsState(), "RUT 1-9\nBanco Estado");
  assert.equal(ok, true);
  return payments;
}

describe("Puerta del módulo (RF-1, ajustada 28-oct: visible sin bloque bancario)", () => {
  test("costo $0 sin registros → oculto", () => {
    const state = bookedState();
    assert.equal(isPaymentModuleActive(0, state), false);
  });

  test("sin bloque bancario → visible (el módulo lo lleva a cabo; RF-2)", () => {
    assert.equal(isPaymentModuleActive(30000, createEmptyPaymentsState()), true);
  });

  test("costo > 0 + bloque definido → visible", () => {
    assert.equal(isPaymentModuleActive(30000, bookedState()), true);
  });

  test("costo en $0 con pagos vigentes → sigue visible (cierres pendientes)", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    let state = bookedState();
    const confirmed = confirmPayment(state, "p1", {}, titulars, 30000, NOW);
    assert.equal(confirmed.ok, true);
    state = confirmed.payments;
    assert.equal(isPaymentModuleActive(0, state), true);
  });

  test("bloque borrado con costo > 0 → SIGUE visible (el módulo es su encendido)", () => {
    const cleared = setTransferInfo(bookedState(), "   ");
    assert.equal(cleared.ok, true);
    assert.equal(isPaymentModuleActive(30000, cleared.payments), true);
  });

  test("solo transacciones revocadas → visible (revertir en el módulo)", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    let state = bookedState();
    state = confirmPayment(state, "p1", {}, titulars, 30000, NOW).payments;
    state = revokePayment(state, "p1", undefined, NOW).payments;
    state = setTransferInfo(state, " ").payments;
    assert.equal(isPaymentModuleActive(30000, state), true);
  });
});

describe("Cuota actual y vista (RF-4 y RF-6)", () => {
  test("cuota exacta: $10.000 con 3 titulares y costo $30.000", () => {
    assert.equal(getCurrentQuotaCLP(30000, 3), 10000);
  });

  test("cuota con redondeo: $70.000 con 6 → $11.700 y pozo $200", () => {
    // Lista compuesta de 6: organizador + 5 invitados confirmados.
    const sixBook: Attendee[] = [
      buildCreatorAttendee("Nico"),
      attendee("q1", "Ana", "going", 1),
      attendee("q2", "Beto", "going", 2),
      attendee("q3", "Caro", "going", 3),
      attendee("q4", "Diego", "going", 4),
      attendee("q5", "Elena", "going", 5),
    ];
    const titulars = buildTitularPlayers(sixBook, 6);
    assert.equal(titulars.length, 6);
    assert.equal(getCurrentQuotaCLP(70000, 6), 11700);
    const view = getPaymentTreasuryView(createEmptyPaymentsState(), titulars, [], 70000);
    assert.equal(view.currentQuotaCLP, 11700);
    assert.equal(view.surplusCLP, 200);
  });

  test("filas iniciales: todos pendientes y con la cuota por cobrar", () => {
    const view = getPaymentTreasuryView(
      createEmptyPaymentsState(),
      buildTitularPlayers(buildBook(), 3),
      [],
      30000,
    );
    assert.equal(view.titulars.length, 3);
    assert.equal(view.titulars[0].playerRef, CREATOR);
    assert.equal(view.titulars[0].isOrganizer, true);
    for (const row of view.titulars) {
      assert.equal(row.flowState, "pending");
      if (row.isOrganizer) {
        // El organizador recibe las transferencias: nunca adeuda.
        assert.equal(row.owingCLP, 0);
        assert.equal(row.situation, "even");
      } else {
        assert.equal(row.situation, "owing");
        assert.equal(row.owingCLP, 10000);
      }
      assert.equal(row.creditCLP, 0);
      assert.equal(row.currentQuotaCLP, 10000);
    }
  });

  test("costo a $0 con pagos: fila pasa a saldo a favor y módulo vive", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    let state = bookedState();
    state = confirmPayment(state, "p1", {}, titulars, 30000, NOW).payments;
    const view = getPaymentTreasuryView(state, titulars, [], 0);
    const row = view.titulars.find((item) => item.playerRef === "p1");
    assert.ok(row);
    assert.equal(row.situation, "credit");
    assert.equal(row.creditCLP, 10000);
    assert.equal(row.flowState, "paid");
  });
});

describe("Bloque de datos de transferencia (RF-2)", () => {
  test("guarda el texto recortado de bordes y no cambia el interior", () => {
    const result = setTransferInfo(createEmptyPaymentsState(), "  RUT 1-9\n Banco  \nEstado  ");
    assert.equal(result.ok, true);
    assert.equal(result.payments.transferInfo, "RUT 1-9\n Banco  \nEstado");
  });

  test("501 caracteres → rechazo con aviso en español", () => {
    const result = setTransferInfo(createEmptyPaymentsState(), "x".repeat(501));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "transfer_too_long");
      assert.match(getPaymentTreasuryErrorMessage(result.reason), /demasiado largo/);
    }
  });
});

describe("Marca propia «Ya transferí» (RF-5)", () => {
  test("pendiente → marca propia en revisión", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    const result = markSelfTransferred(bookedState(), "p2", titulars, 30000, NOW);
    assert.equal(result.ok, true);
    assert.equal(result.payments.claims.length, 1);
    assert.equal(result.payments.claims[0].claimedAt, NOW);
    assert.equal(getPaymentFlowState(result.payments, "p2"), "in_review");
  });

  test("toque doble → ya está en revisión", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    let state = markSelfTransferred(bookedState(), "p2", titulars, 30000, NOW).payments;
    const retry = markSelfTransferred(state, "p2", titulars, 30000, NOW);
    assert.equal(retry.ok, false);
    if (!retry.ok) {
      assert.equal(retry.reason, "already_in_review");
    }
  });

  test("suplente (Caro fuera del cupo 3) → no puede marcar", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    const rest = restPlayers(buildBook(), titulars);
    assert.deepEqual(rest.map((player) => player.ref), ["p3", "p4"]);
    const result = markSelfTransferred(bookedState(), "p3", titulars, 30000, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "not_titular");
      assert.match(getPaymentTreasuryErrorMessage(result.reason), /Solo los titulares/);
    }
  });

  test("al día (cuota $0) → nada que transferir", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    const result = markSelfTransferred(bookedState(), "p2", titulars, 0, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "nothing_to_transfer");
    }
  });

  test("retracto doble → no hay marca que retractar", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    let state = bookedState();
    state = markSelfTransferred(state, "p2", titulars, 30000, NOW).payments;
    const first = retractSelfTransferred(state, "p2", titulars);
    assert.equal(first.ok, true);
    const second = retractSelfTransferred(first.payments, "p2", titulars);
    assert.equal(second.ok, false);
    if (!second.ok) {
      assert.equal(second.reason, "claim_not_found");
    }
  });

  test("la baja limpia la marca (encadenado); ex-titular sin confirmación no paga nada", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    let state = markSelfTransferred(bookedState(), "p2", titulars, 30000, NOW).payments;
    state = dropPlayerClaims(state, "p2");
    assert.equal(state.claims.length, 0);
    assert.equal(getVigentePaidTotalCLP(state, "p2"), 0);
  });
});

describe("Confirmación y reversión de pagos (RF-5)", () => {
  test("monto predeterminado = cuota vigente", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    const result = confirmPayment(bookedState(), "p1", {}, titulars, 30000, NOW);
    assert.equal(result.ok, true);
    assert.equal(result.payments.transactions[0].amountCLP, 10000);
    assert.equal(result.payments.transactions[0].recordedAt, NOW);
  });

  test("monto editable por el creador (transferencia exacta)", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    const result = confirmPayment(bookedState(), "p1", { amountCLP: 9950 }, titulars, 30000, NOW);
    assert.equal(result.ok, true);
    assert.equal(getVigentePaidTotalCLP(result.payments, "p1"), 9950);
    const view = getPaymentTreasuryView(result.payments, titulars, [], 30000);
    const row = view.titulars.find((item) => item.playerRef === "p1");
    assert.ok(row);
    assert.equal(row.owingCLP, 50);
  });

  test("montos inválidos (0, negativo, con decimales) → rechazo", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    for (const amount of [0, -5, 1000.5]) {
      const result = confirmPayment(bookedState(), "p1", { amountCLP: amount }, titulars, 30000, NOW);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.reason, "invalid_amount");
      }
    }
  });

  test("confirmación directa desde Pendiente (sin paso intermedio) → Pagado", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    const state = confirmPayment(bookedState(), "p2", {}, titulars, 30000, NOW).payments;
    assert.equal(getPaymentFlowState(state, "p2"), "paid");
  });

  test("confirmación ex post de un ex-titular con marca existente", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    let state = bookedState();
    state = markSelfTransferred(state, "p2", titulars, 30000, NOW).payments;
    // Beto deja de ir: queda fuera del cupo, pero su marca sobrevive.
    const attendees = buildBook().map((item) =>
      item.id === "p2" ? { ...item, status: "maybe" as const, confirmedOrder: null } : item,
    );
    const newTitulars = buildTitularPlayers(attendees, 3);
    assert.equal(newTitulars.some((player) => player.ref === "p2"), false);
    const confirmed = confirmPayment(state, "p2", {}, newTitulars, 30000, NOW);
    assert.equal(confirmed.ok, true);
    // Con su pago vigente, nace la devolución por el 100% (Caso A ex post).
    const pending = listPendingRefunds(confirmed.payments, newTitulars, restPlayers(attendees, newTitulars), 30000);
    assert.deepEqual(
      pending.map((refund) => [refund.playerRef, refund.kind, refund.amountCLP]),
      [["p2", "exit", 10000]],
    );
  });

  test("confirmación a una persona sin cupo ni marca → rechazo", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    const result = confirmPayment(bookedState(), "p3", {}, titulars, 30000, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "not_payable");
    }
  });

  test("confirmar consume la marca; revertir deja Pendiente y conserva el historial", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    let state = bookedState();
    state = markSelfTransferred(state, "p2", titulars, 30000, NOW).payments;
    state = confirmPayment(state, "p2", {}, titulars, 30000, NOW).payments;
    // La confirmación «Pagado» consume la marca «Ya transferí».
    assert.equal(state.claims.length, 0);
    assert.equal(getPaymentFlowState(state, "p2"), "paid");
    const revoked = revokePayment(state, "p2", undefined, NOW);
    assert.equal(revoked.ok, true);
    state = revoked.payments;
    assert.equal(getVigentePaidTotalCLP(state, "p2"), 0);
    assert.equal(state.transactions.length, 1);
    assert.equal(state.transactions[0].revokedAt, NOW);
    // Sin marca vigente, la fila vuelve a «Pendiente».
    assert.equal(getPaymentFlowState(state, "p2"), "pending");
  });

  test("reversión sin marca deja la fila en Pendiente", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    let state = confirmPayment(bookedState(), "p2", {}, titulars, 30000, NOW).payments;
    state = revokePayment(state, "p2", undefined, NOW).payments;
    assert.equal(getPaymentFlowState(state, "p2"), "pending");
  });

  test("reversión de una transacción ajena o ya revocada → sin coincidencia", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    let state = bookedState();
    state = confirmPayment(state, "p1", {}, titulars, 30000, NOW).payments;
    state = confirmPayment(state, "p2", {}, titulars, 30000, NOW).payments;
    const foreign = revokePayment(state, "p2", "tx-1", NOW);
    assert.equal(foreign.ok, false);
    if (!foreign.ok) {
      assert.equal(foreign.reason, "payment_not_found");
    }
    const missing = revokePayment(state, "p1", "tx-99", NOW);
    assert.equal(missing.ok, false);
  });

  test("ids de transacción únicos y crecientes", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    let state = bookedState();
    state = confirmPayment(state, "p1", {}, titulars, 30000, NOW).payments;
    state = confirmPayment(state, "p2", {}, titulars, 30000, NOW).payments;
    assert.deepEqual(state.transactions.map((txn) => txn.id), ["tx-1", "tx-2"]);
  });

  test("el organizador se confirma su propia cuota (doble poder)", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    const result = confirmPayment(bookedState(), CREATOR, { amountCLP: 3400 }, titulars, 30000, NOW);
    assert.equal(result.ok, true);
    assert.equal(getVigentePaidTotalCLP(result.payments, CREATOR), 3400);
  });
});

describe("Caso A: devolución por baja (RF-7)", () => {
  test("titular pagado que se baja → devolución del 100% y sale del tablero de titulares", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    let state = confirmPayment(bookedState(), "p1", {}, titulars, 30000, NOW).payments;
    const attendees = buildBook().map((item) =>
      item.id === "p1" ? { ...item, status: "not_going" as const } : item,
    );
    const newTitulars = buildTitularPlayers(attendees, 3);
    const rest = restPlayers(attendees, newTitulars);
    const pending = listPendingRefunds(state, newTitulars, rest, 30000);
    assert.deepEqual(
      pending.map((refund) => [refund.playerRef, refund.kind, refund.amountCLP]),
      [["p1", "exit", 10000]],
    );
    assert.deepEqual(
      pending.map((refund) => refund.name),
      ["Ana"],
    );
    // En el tablero de titulares ya no está; Caro subió en su lugar.
    assert.equal(newTitulars.some((player) => player.ref === "p1"), false);
    assert.equal(newTitulars.some((player) => player.ref === "p3"), true);
  });

  test("pagó de más (cuota subió) y se baja → devolución por TODO su acumulado", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    let state = confirmPayment(bookedState(), "p1", { amountCLP: 12000 }, titulars, 30000, NOW).payments;
    const attendees = buildBook().map((item) =>
      item.id === "p1" ? { ...item, status: "not_going" as const } : item,
    );
    const newTitulars = buildTitularPlayers(attendees, 3);
    const pending = listPendingRefunds(state, newTitulars, restPlayers(attendees, newTitulars), 30000);
    assert.deepEqual(
      pending.filter((refund) => refund.playerRef === "p1").map((refund) => refund.amountCLP),
      [12000],
    );
  });

  test("regresa y hereda titularidad → la devolución pendiente desaparece sola", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    let state = confirmPayment(bookedState(), "p1", {}, titulars, 30000, NOW).payments;
    const away = buildBook().map((item) =>
      item.id === "p1" ? { ...item, status: "not_going" as const } : item,
    );
    const titularsAway = buildTitularPlayers(away, 3);
    assert.equal(listPendingRefunds(state, titularsAway, restPlayers(away, titularsAway), 30000).length, 1);
    const back = buildBook();
    const titularsBack = buildTitularPlayers(back, 3);
    assert.equal(listPendingRefunds(state, titularsBack, restPlayers(back, titularsBack), 30000).length, 0);
  });

  test("titular Pendiente que se baja no genera nada", () => {
    const attendees = buildBook().map((item) =>
      item.id === "p1" ? { ...item, status: "not_going" as const } : item,
    );
    const titulars = buildTitularPlayers(attendees, 3);
    assert.equal(
      listPendingRefunds(bookedState(), titulars, restPlayers(attendees, titulars), 30000).length,
      0,
    );
  });
});

describe("Caso B: saldo a favor por cuota menor (RF-8)", () => {
  /** Escenario: Ana pagó $10.000 y entrenan titulares que bajan la cuota. */
  function paidThenGrow(): { payments: PaymentsState; titulars: TeamPlayer[]; attendees: Attendee[] } {
    const titulars = buildTitularPlayers(buildBook(), 3);
    const payments = confirmPayment(bookedState(), "p1", {}, titulars, 30000, NOW).payments;
    const attendees = [
      ...buildBook().filter((item) => item.id === "p4").map((item) =>
        item.id === "p4" ? { ...item, status: "going" as const, confirmedOrder: 4 } : item,
      ),
      ...buildBook().filter((item) => item.id !== "p4"),
    ];
    const grown = buildTitularPlayers(attendees, 4);
    return { payments, titulars: grown, attendees };
  }

  test("entran titulares → la cuota baja → saldo a favor de la diferencia", () => {
    const scenario = paidThenGrow();
    // Con 4 titulares: 30000/4 = 7500; Ana pagó 10000 → saldo 2500.
    assert.equal(getCurrentQuotaCLP(30000, 4), 7500);
    const pending = listPendingRefunds(scenario.payments, scenario.titulars, restPlayers(scenario.attendees, scenario.titulars), 30000);
    assert.deepEqual(
      pending.map((refund) => [refund.playerRef, refund.kind, refund.amountCLP]),
      [["p1", "overpay", 2500]],
    );
    const view = getPaymentTreasuryView(scenario.payments, scenario.titulars, [], 30000);
    const row = view.titulars.find((item) => item.playerRef === "p1");
    assert.ok(row);
    assert.equal(row.flowState, "paid");
    assert.equal(row.situation, "credit");
  });

  test("la cuota vuelve a subir → el saldo pendiente se desactiva solo", () => {
    const scenario = paidThenGrow();
    const smaller = buildBook(); // 3 titulares otra vez → cuota 10000
    const titularsSmall = buildTitularPlayers(smaller, 3);
    assert.equal(
      listPendingRefunds(scenario.payments, titularsSmall, restPlayers(smaller, titularsSmall), 30000).length,
      0,
    );
  });
});

describe("Cierres «Reembolsada» (RF-9)", () => {
  test("reembolsa el monto completo, apaga la pendiente y queda registrada", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    let state = confirmPayment(bookedState(), "p1", {}, titulars, 30000, NOW).payments;
    const attendees = buildBook().map((item) =>
      item.id === "p1" ? { ...item, status: "not_going" as const } : item,
    );
    const titularsAway = buildTitularPlayers(attendees, 3);
    const rest = restPlayers(attendees, titularsAway);
    const resolved = resolveRefund(state, "p1", "exit", titularsAway, rest, 30000, NOW);
    assert.equal(resolved.ok, true);
    state = resolved.payments;
    assert.equal(state.resolvedRefunds.length, 1);
    assert.equal(state.resolvedRefunds[0].amountCLP, 10000);
    assert.equal(state.resolvedRefunds[0].resolvedAt, NOW);
    const view = getPaymentTreasuryView(state, titularsAway, rest, 30000);
    assert.equal(view.pendingRefunds.length, 0);
    assert.deepEqual(
      view.resolvedRefunds.map((refund) => [refund.name, refund.amountCLP]),
      [["Ana", 10000]],
    );
    // Recaudado NETO: 10000 entrados − 10000 ya devueltos a Ana = 0;
    // por devolver 0 (el cierre apaga la pendiente).
    assert.equal(view.totals.collectedCLP, 0);
    assert.equal(view.totals.toRefundCLP, 0);
  });

  test("confirmado con reembolso cerrado: fila vuelve a «Pago al día» y recaudado baja", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    let state = confirmPayment(bookedState(), "p2", {}, titulars, 30000, NOW).payments;
    // p2 pagó de más: entra el excedente como reembolso pendiente… lo cerramos.
    state = confirmPayment(state, "p2", { amountCLP: 10000 }, titulars, 30000, NOW).payments;
    state = resolveRefund(state, "p2", "overpay", titulars, [], 30000, NOW).payments;
    const view = getPaymentTreasuryView(state, titulars, [], 30000);
    const row = view.titulars.find((item) => item.playerRef === "p2");
    assert.ok(row);
    assert.equal(row.situation, "even"); // «Pago al día» en la interfaz
    assert.equal(row.creditCLP, 0);
    assert.equal(row.paidTotalCLP, 10000);
    assert.equal(view.totals.collectedCLP, 10000);
  });

  test("sin devolución pendiente → no hay nada que marcar", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    const result = resolveRefund(bookedState(), "p2", "exit", titulars, [], 30000, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "no_pending_refund");
      assert.match(getPaymentTreasuryErrorMessage(result.reason), /No hay una devolución/);
    }
  });

  test("reabrir un cierre vuelve la devolución a pendiente; sin cierres → rechazo", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    let state = confirmPayment(bookedState(), "p1", {}, titulars, 30000, NOW).payments;
    const attendees = buildBook().map((item) =>
      item.id === "p1" ? { ...item, status: "not_going" as const } : item,
    );
    const titularsAway = buildTitularPlayers(attendees, 3);
    const rest = restPlayers(attendees, titularsAway);
    state = resolveRefund(state, "p1", "exit", titularsAway, rest, 30000, NOW).payments;
    const reopened = reopenRefund(state, "p1", "exit");
    assert.equal(reopened.ok, true);
    assert.equal(reopened.payments.resolvedRefunds.length, 0);
    assert.equal(
      listPendingRefunds(reopened.payments, titularsAway, rest, 30000).length,
      1,
    );
    const missing = reopenRefund(reopened.payments, "p1", "exit");
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.reason, "no_resolved_refund");
    }
  });
});

describe("Totales de tesorería (RF-10)", () => {
  test("recaudado, por cobrar y por devolver recalculados al vuelo", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    let state = bookedState();
    state = confirmPayment(state, "p1", {}, titulars, 30000, NOW).payments;
    // Ana entró $10.000; al salir sube Caro: Nico, Beto y Caro adeudan $10.000 c/u.
    const attendees = buildBook().map((item) =>
      item.id === "p1" ? { ...item, status: "not_going" as const } : item,
    );
    const titularsAway = buildTitularPlayers(attendees, 3);
    const rest = restPlayers(attendees, titularsAway);
    const view = getPaymentTreasuryView(state, titularsAway, rest, 30000);
    assert.equal(view.totals.collectedCLP, 10000);
    assert.equal(view.totals.toCollectCLP, 20000);
    assert.equal(view.totals.toRefundCLP, 10000);
  });

  test("la fila del organizador NO suma al por cobrar (recibe las transferencias)", () => {
    const titulars = buildTitularPlayers(buildBook(), 3);
    const view = getPaymentTreasuryView(bookedState(), titulars, [], 30000);
    assert.equal(view.totals.toCollectCLP, 20000);
  });
});
