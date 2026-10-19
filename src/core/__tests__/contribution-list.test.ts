/**
 * Tests de la lista de aportes (checklist) del modo Colaborativo (spec 002):
 * añadido (máx. 10, duplicados), autorización de reclamo, un responsable por
 * ítem, liberar solo lo propio, liberación automática al salir de "Voy",
 * orden libres primero y progreso "X de Y".
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  MAX_CONTRIBUTION_ITEMS,
  addContributionItem,
  claimContributionItem,
  dropContributionClaims,
  getContributionProgress,
  isClaimAuthorized,
  releaseContributionItem,
  removeContributionItem,
  sortContributionItems,
  toClaimRef,
} from "../contribution-list";
import type { Attendee } from "../types";

/** Fábrica de asistente de prueba. */
function makeAttendee(input: {
  id: string;
  name: string;
  status: Attendee["status"];
  confirmedOrder: number | null;
  creatorAdded?: boolean;
}): Attendee {
  return { ...input };
}

/** Fábrica de ítem de prueba (libre por defecto). */
function makeItem(
  id: string,
  name: string,
  claimedByRef: string | null = null,
): { id: string; name: string; claimedByRef: string | null } {
  return { id, name, claimedByRef };
}

const OWNER = { kind: "creator" as const };
const GUEST = { kind: "participant" as const, participantId: "p1" };
const CONFIRMED = [
  makeAttendee({ id: "p1", name: "Ana", status: "going", confirmedOrder: 1 }),
  makeAttendee({ id: "p2", name: "Beto", status: "going", confirmedOrder: 2 }),
  makeAttendee({ id: "p3", name: "Caro", status: "maybe", confirmedOrder: null }),
];

describe("Añadir ítems", () => {
  test("el creador añade un ítem libre al final", () => {
    const result = addContributionItem([], "Carbón", "i1", OWNER, CONFIRMED, null);
    assert.equal(result.ok, true);
    assert.deepEqual(result.items, [makeItem("i1", "Carbón")]);
  });

  test("texto vacío, demasiado largo y duplicado (sin mayúsculas) se bloquean", () => {
    const base = [makeItem("i1", "Carbón")];
    const empty = addContributionItem(base, "   ", "i2", OWNER, CONFIRMED, null);
    assert.equal(empty.reason, "empty_name");
    const long = addContributionItem(
      base,
      "un item con un nombre verdaderamente demasiado extenso xl",
      "i2",
      OWNER,
      CONFIRMED,
      null,
    );
    assert.equal(long.reason, "too_long");
    const dup = addContributionItem(base, "  CARBÓN  ", "i2", OWNER, CONFIRMED, null);
    assert.equal(dup.reason, "duplicate_name");
  });

  test("el 11.º ítem se rechaza indicando el máximo", () => {
    const full = Array.from({ length: MAX_CONTRIBUTION_ITEMS }, (_, index) =>
      makeItem(`i${index}`, `Ítem ${index}`),
    );
    const result = addContributionItem(full, "Parrilla", "i11", OWNER, CONFIRMED, null);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "max_items");
  });

  test("el confirmado «Voy» con identidad propia puede añadir; el anotado a mano no", () => {
    const added = addContributionItem([], "Bebidas", "i1", GUEST, CONFIRMED, null);
    assert.equal(added.ok, true);
    const handAdded = [
      makeAttendee({ id: "p1", name: "Ana", status: "going", confirmedOrder: 1, creatorAdded: true }),
    ];
    const rejected = addContributionItem([], "Bebidas", "i1", GUEST, handAdded, null);
    assert.equal(rejected.reason, "not_allowed");
  });
});

describe("Autorización de reclamo", () => {
  test("es «Voy» permanente", () => {
    assert.equal(isClaimAuthorized(OWNER, CONFIRMED, 1), true);
  });

  test("«Voy» dentro del cupo puede; en espera y espectadores no", () => {
    assert.equal(isClaimAuthorized(GUEST, CONFIRMED, 2), true); // Ana es titular
    const inWaitlist = { kind: "participant" as const, participantId: "p0" };
    const waitlist = [
      ...CONFIRMED,
      makeAttendee({ id: "p0", name: "Diego", status: "going", confirmedOrder: 3 }),
    ];
    assert.equal(isClaimAuthorized(inWaitlist, waitlist, 2), false); // fuera del cupo
    assert.equal(isClaimAuthorized(inWaitlist, waitlist, null), true); // sin cupo todos van
    const waiting = { kind: "participant" as const, participantId: "p3" }; // En duda
    assert.equal(isClaimAuthorized(waiting, CONFIRMED, null), false);
    const declined = { kind: "participant" as const, participantId: "p9" };
    const notGoing = [
      ...CONFIRMED,
      makeAttendee({ id: "p9", name: "Eva", status: "not_going", confirmedOrder: null }),
    ];
    assert.equal(isClaimAuthorized(declined, notGoing, null), false);
  });
});

describe("Tomar un ítem libre («Yo lo llevo»)", () => {
  test("queda con el nombre del reclamante al instante", () => {
    const items = [makeItem("i1", "Carbón")];
    const result = claimContributionItem(items, "i1", GUEST, CONFIRMED, null);
    assert.equal(result.ok, true);
    assert.equal(result.items?.[0].claimedByRef, "p1");
  });

  test("un ítem con responsable no lo toma otro («taken»)", () => {
    const items = [makeItem("i1", "Carbón", "p1")];
    const other = { kind: "participant" as const, participantId: "p2" };
    const result = claimContributionItem(items, "i1", other, CONFIRMED, null);
    assert.equal(result.reason, "taken");
  });

  test("una persona puede llevar varios ítems", () => {
    const items = [makeItem("i1", "Carbón", "p1"), makeItem("i2", "Hielo")];
    const result = claimContributionItem(items, "i2", GUEST, CONFIRMED, null);
    assert.equal(result.ok, true);
    assert.equal(result.items?.filter((item) => item.claimedByRef === "p1").length, 2);
  });
});

describe("Liberar el ítem propio", () => {
  test("quien lo lleva lo libera y vuelve a estar libre", () => {
    const items = [makeItem("i1", "Carbón", "p1")];
    const result = releaseContributionItem(items, "i1", GUEST, CONFIRMED, null);
    assert.equal(result.ok, true);
    assert.equal(result.items?.[0].claimedByRef, null);
  });

  test("otra persona no puede liberarlo («not_mine»)", () => {
    const items = [makeItem("i1", "Carbón", "p1")];
    const other = { kind: "participant" as const, participantId: "p2" };
    const result = releaseContributionItem(items, "i1", other, CONFIRMED, null);
    assert.equal(result.reason, "not_mine");
  });
});

describe("Liberación automática al dejar de ser «Voy»", () => {
  test("sus ítems quedan libres y los de otras personas intactos", () => {
    const items = [
      makeItem("i1", "Carbón", "p1"),
      makeItem("i2", "Hielo", "p2"),
      makeItem("i3", "Bebidas", "p1"),
    ];
    const released = dropContributionClaims(items, "p1");
    assert.deepEqual(
      released.map((item) => item.claimedByRef),
      [null, "p2", null],
    );
  });

  test("la referencia del creador también se puede liberar", () => {
    assert.equal(toClaimRef(OWNER), "creator");
    const items = [makeItem("i1", "Parrilla", "creator")];
    const released = dropContributionClaims(items, "creator");
    assert.equal(released[0].claimedByRef, null);
  });
});

describe("Eliminar ítems", () => {
  test("el creador elimina un ítem libre", () => {
    const items = [makeItem("i1", "Carbón")];
    const result = removeContributionItem(items, "i1", OWNER, CONFIRMED, null);
    assert.equal(result.ok, true);
    assert.deepEqual(result.items, []);
  });

  test("no se elimina un ítem con responsable, y el asistente no elimina", () => {
    const items = [makeItem("i1", "Carbón", "p1")];
    const claimed = removeContributionItem(items, "i1", OWNER, CONFIRMED, null);
    assert.equal(claimed.reason, "taken");
    const guest = removeContributionItem(items, "i1", GUEST, CONFIRMED, null);
    assert.equal(guest.reason, "not_allowed");
  });
});

describe("Orden de la lista: libres primero", () => {
  test("libres arriba conservando el orden de creación; tomados después", () => {
    const ordered = sortContributionItems([
      makeItem("i1", "Parrilla", "p1"),
      makeItem("i2", "Carbón"),
      makeItem("i3", "Hielo", "p2"),
      makeItem("i4", "Bebidas"),
    ]);
    assert.deepEqual(
      ordered.map((item) => item.name),
      ["Carbón", "Bebidas", "Parrilla", "Hielo"],
    );
  });

  test("al liberar, el ítem vuelve al grupo de arriba", () => {
    const items = [
      makeItem("i1", "Parrilla", "p1"),
      makeItem("i2", "Carbón"),
    ];
    const afterRelease = releaseContributionItem(items, "i1", GUEST, CONFIRMED, null);
    assert.deepEqual(
      sortContributionItems(afterRelease.items ?? []).map((item) => item.name),
      ["Parrilla", "Carbón"],
    );
  });
});

describe("Progreso «X de Y»", () => {
  test("cuenta tomados y total, con estado vacío y completo", () => {
    const progress = getContributionProgress([
      makeItem("i1", "Carbón", "p1"),
      makeItem("i2", "Hielo"),
    ]);
    assert.equal(progress.total, 2);
    assert.equal(progress.claimed, 1);
    assert.equal(progress.isEmpty, false);
    assert.equal(progress.isComplete, false);

    const empty = getContributionProgress([]);
    assert.equal(empty.isEmpty, true);
    assert.equal(empty.isComplete, false);

    const complete = getContributionProgress([
      makeItem("i1", "Carbón", "p1"),
      makeItem("i2", "Hielo", "p2"),
    ]);
    assert.equal(complete.isComplete, true);
  });
});
