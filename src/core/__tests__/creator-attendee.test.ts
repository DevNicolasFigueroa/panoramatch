/**
 * Tests del asistente creador implícito.
 * Reglas: «Voy» fijo, primero de la fila, ocupa cupo, la boleta lo cuenta
 * (n+1), el quórum NO lo mide y su nombre está reservado.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  CREATOR_FALLBACK_LABEL,
  buildCreatorAttendee,
  withCreatorAttendee,
} from "../creator-attendee";
import { splitCost } from "../currency-clp";
import {
  classifyAttendees,
  getQuorumStatus,
  getMissingToQuorum,
  getGuestQuorumTarget,
  isDuplicateAttendeeName,
} from "../quota-manager";
import type { Attendee } from "../types";

/** Fábrica de asistente de prueba sin depender de la generación de ids. */
function makeAttendee(input: {
  id: string;
  name: string;
  status: Attendee["status"];
  confirmedOrder: number | null;
}): Attendee {
  return { ...input };
}

describe("buildCreatorAttendee", () => {
  test("es «Voy» fijo con orden 0 y marca isCreator", () => {
    const creator = buildCreatorAttendee("Nicolás Figueroa");
    assert.equal(creator.id, "creator");
    assert.equal(creator.name, "Nicolás Figueroa");
    assert.equal(creator.status, "going");
    assert.equal(creator.confirmedOrder, 0);
    assert.equal(creator.isCreator, true);
  });

  test("sin nombre guardado usa la etiqueta «El creador»", () => {
    assert.equal(buildCreatorAttendee(null).name, CREATOR_FALLBACK_LABEL);
    assert.equal(buildCreatorAttendee(undefined).name, CREATOR_FALLBACK_LABEL);
    assert.equal(buildCreatorAttendee("   ").name, CREATOR_FALLBACK_LABEL);
  });

  test("normaliza el nombre guardado (trims y espacios)", () => {
    assert.equal(buildCreatorAttendee("  Nicolás   Figueroa ").name, "Nicolás Figueroa");
  });
});

describe("withCreatorAttendee", () => {
  test("pone al creador primero y conserva a los invitados con su orden", () => {
    const guests = [
      makeAttendee({ id: "p1", name: "Ana", status: "going", confirmedOrder: 1 }),
      makeAttendee({ id: "p2", name: "Beto", status: "maybe", confirmedOrder: null }),
    ];
    const composite = withCreatorAttendee(guests, "Nicolás");
    assert.deepEqual(
      composite.map((attendee) => [attendee.name, attendee.confirmedOrder, attendee.status]),
      [
        ["Nicolás", 0, "going"],
        ["Ana", 1, "going"],
        ["Beto", null, "maybe"],
      ],
    );
    assert.equal(composite[0].isCreator, true);
  });

  test("no duplica si la lista ya venía compuesta", () => {
    const once = withCreatorAttendee([], "Nicolás");
    const twice = withCreatorAttendee(once, "Nicolás");
    assert.equal(twice.filter((attendee) => attendee.isCreator === true).length, 1);
  });
});

describe("la boleta cuenta al creador (n+1)", () => {
  test("con dos invitados y creador divide entre 3 con pozo común", () => {
    const guests = [
      makeAttendee({ id: "p1", name: "Ana", status: "going", confirmedOrder: 1 }),
      makeAttendee({ id: "p2", name: "Beto", status: "going", confirmedOrder: 2 }),
    ];
    const titulars = classifyAttendees(withCreatorAttendee(guests, "Nicolás"), null).titulars;
    assert.equal(titulars.length, 3);
    const split = splitCost(10000, titulars.length);
    assert.equal(split.canSplit, true);
    assert.equal(split.perHeadCLP, 3400); // redondeo chileno al múltiplo de $100
    assert.equal(split.surplusCLP, 200); // pozo común, sin decimales
  });

  test("sin invitados confirmados divide entre 1 (el creador paga)", () => {
    const titulars = classifyAttendees(withCreatorAttendee([], "Nicolás"), null).titulars;
    const split = splitCost(5000, titulars.length);
    assert.equal(split.canSplit, true);
    assert.equal(split.perHeadCLP, 5000);
    assert.equal(split.surplusCLP, 0);
  });
});

describe("el creador ocupa cupo y desplaza al suplente", () => {
  test("cupo 2: creador + primer invitado titulares, el segundo espera", () => {
    const guests = [
      makeAttendee({ id: "p1", name: "Ana", status: "going", confirmedOrder: 1 }),
      makeAttendee({ id: "p2", name: "Beto", status: "going", confirmedOrder: 2 }),
      makeAttendee({ id: "p3", name: "Caro", status: "going", confirmedOrder: 3 }),
    ];
    const classification = classifyAttendees(withCreatorAttendee(guests, "Nicolás"), 2);
    assert.deepEqual(
      classification.titulars.map((attendee) => attendee.name),
      ["Nicolás", "Ana"],
    );
    assert.deepEqual(
      classification.waitlist.map((attendee) => attendee.name),
      ["Beto", "Caro"],
    );
  });
});

describe("el quórum sigue midiendo solo a los invitados", () => {
  test("recién creado (solo creador) el semáforo sigue pendiente", () => {
    const composite = withCreatorAttendee([], "Nicolás");
    const guestsTitulars = classifyAttendees([], null).titulars.length;
    const compositeTitulars = classifyAttendees(composite, null).titulars.length;
    assert.equal(compositeTitulars, 1);
    assert.equal(getQuorumStatus(null, guestsTitulars), "pending");
  });

  test("el objetivo de asientos de invitados es cupo − 1 (el organizador ocupa uno)", () => {
    assert.equal(getGuestQuorumTarget(2), 1);
    assert.equal(getGuestQuorumTarget(5), 4);
    assert.equal(getGuestQuorumTarget(1), 0);
    assert.equal(getGuestQuorumTarget(null), null);
  });

  test("cupo 2 con la única invitada confirmada: semáforo verde, no «En camino»", () => {
    // Caso «Salida» de producción: organizador fijo + Vanessa Voy = 2/2.
    const guestTarget = getGuestQuorumTarget(2);
    assert.equal(getQuorumStatus(guestTarget, 1), "ready");
    assert.equal(getMissingToQuorum(guestTarget, 1), 0);
  });

  test("cupo 2 recién creado: pendiente hasta la primera confirmación", () => {
    const guestTarget = getGuestQuorumTarget(2);
    assert.equal(getQuorumStatus(guestTarget, 0), "pending");
    assert.equal(getMissingToQuorum(guestTarget, 0), 1);
  });

  test("cupo 1 (solo cabe el organizador): armado de entrada", () => {
    assert.equal(getQuorumStatus(getGuestQuorumTarget(1), 0), "ready");
    assert.equal(getMissingToQuorum(getGuestQuorumTarget(1), 0), 0);
  });

  test("cupo 5 con dos invitados confirmados: «En camino» con faltan 2", () => {
    const guestTarget = getGuestQuorumTarget(5);
    assert.equal(getQuorumStatus(guestTarget, 2), "partial");
    assert.equal(getMissingToQuorum(guestTarget, 2), 2);
  });

  test("sin cupo: verde con el primer invitado confirmado", () => {
    assert.equal(getQuorumStatus(getGuestQuorumTarget(null), 1), "ready");
    assert.equal(getQuorumStatus(getGuestQuorumTarget(null), 0), "pending");
  });
});

describe("el nombre del organizador está reservado", () => {
  test("un invitado no puede anotarse con el nombre del creador", () => {
    const composite = withCreatorAttendee(
      [makeAttendee({ id: "p1", name: "Ana", status: "going", confirmedOrder: 1 })],
      "Nicolás",
    );
    assert.equal(isDuplicateAttendeeName(composite, "Nicolás"), true); // exacto
    assert.equal(isDuplicateAttendeeName(composite, "  NICOLÁS  "), true); // sin mayúsculas
    assert.equal(isDuplicateAttendeeName(composite, "Felipe"), false); // otros libres
  });
});
