/**
 * Tests de las reglas de la spec 001 (modo Social: match de lugares).
 * Corren con `npm run test` (node --test sobre la compilación tsc).
 * Sin dependencias externas: node:test + assert de la biblioteca estándar.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PLACE_CANDIDATES,
  addPlaceCandidate,
  canDeclareMatch,
  castPlaceVote,
  computeMatchOutcome,
  dropVotesOfVoter,
  getMatchStatusLabel,
  isDelegableAttendee,
  isDuplicatePlaceName,
  isParticipantVoter,
  isVoteLocked,
  normalizePlaceName,
  removePlaceCandidate,
  tallyPlaceVotes,
} from "../place-vote";
import { getTodayLocalValue, isValidLocalDatetime } from "../datetime-cl";
import type { Attendee } from "../types";

/** Utilidad: participante de prueba. */
function makeAttendee(
  overrides: Partial<Attendee> & Pick<Attendee, "id" | "name" | "status" | "confirmedOrder">,
): Attendee {
  return { ...overrides };
}

const C = (id: string, name: string) => ({ id, name });
const CREATOR = { kind: "creator" as const };
const VOTE = (candidateId: string, voterRef: string, delegated = false) => ({
  candidateId,
  voterRef,
  delegated,
});

/* ── RF-1 · crear sin candidatos ── */

test("RF-1: lista vacía al crear es válida (Sin votos todavía)", () => {
  const outcome = computeMatchOutcome([], [], null);
  assert.equal(outcome.status, "no_votes");
  assert.equal(getMatchStatusLabel(outcome.status), "Sin votos todavía");
});

/* ── RF-2 · candidatos ── */

test("RF-2: máximo 10 candidatos, el 11.º se rechaza", () => {
  const llenos = Array.from({ length: MAX_PLACE_CANDIDATES }, (_, i) =>
    C(`c${i + 1}`, `Lugar ${i + 1}`),
  );
  const result = addPlaceCandidate(llenos, "Undécimo", "c11", null);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "max_candidates");
});

test("RF-2: duplicados bloqueados sin importar mayúsculas ni espacios", () => {
  const base = [C("c1", "La Florida")];
  assert.equal(isDuplicatePlaceName(base, "la florida"), true);
  assert.equal(isDuplicatePlaceName(base, "La  Florida"), true);
  const dup = addPlaceCandidate(base, "la   florida", "c2", null);
  assert.equal(dup.ok, false);
  assert.equal(dup.reason, "duplicate_name");
});

test("RF-2: nombre vacío o excesivamente largo se rechaza; se normaliza espacios", () => {
  const vacio = addPlaceCandidate([], "   ", "c1", null);
  assert.equal(vacio.ok, false);
  assert.equal(vacio.reason, "empty_name");

  const largo = addPlaceCandidate([], "x".repeat(61), "c1", null);
  assert.equal(largo.ok, false);
  assert.equal(largo.reason, "too_long");

  const ok = addPlaceCandidate([], "  El   Lugar  ", "c1", null);
  assert.equal(ok.ok, true);
  assert.equal(ok.candidates?.[0].name, "El Lugar");
});

test("RF-2: eliminar confirma solo 0 votos y votación abierta", () => {
  const candidates = [C("c1", "Pub 1"), C("c2", "Pub 2")];
  const votes = [{ candidateId: "c1", voterRef: "creator", delegated: false }];

  const conVotos = removePlaceCandidate(candidates, votes, "c1", null);
  assert.equal(conVotos.ok, false);
  assert.equal(conVotos.reason, "has_votes");

  const cerrado = removePlaceCandidate(candidates, votes, "c2", "c1");
  assert.equal(cerrado.ok, false);
  assert.equal(cerrado.reason, "closed");

  const libre = removePlaceCandidate(candidates, votes, "c2", null);
  assert.equal(libre.ok, true);
  assert.deepEqual(libre.candidates, [C("c1", "Pub 1")]);
});

/* ── RF-3 · voto unitario y cambiable ── */

test("RF-3: un voto por votante; cambiar reemplaza, repetir no duplica", () => {
  const candidates = [C("c1", "Pub 1"), C("c2", "Pub 2")];
  const attendees = [makeAttendee({ id: "p1", name: "Ana", status: "going", confirmedOrder: 1 })];

  const first = castPlaceVote(candidates, [], CREATOR, "creator", "c1", attendees, null);
  assert.equal(first.ok, true);
  assert.deepEqual(first.votes, [VOTE("c1", "creator")]);

  const again = castPlaceVote(candidates, first.votes!, CREATOR, "creator", "c1", attendees, null);
  assert.equal(again.ok, true);
  assert.equal(again.votes!.length, 1);

  const change = castPlaceVote(candidates, first.votes!, CREATOR, "creator", "c2", attendees, null);
  assert.equal(change.ok, true);
  assert.deepEqual(change.votes, [VOTE("c2", "creator")]);
});

test("RF-3: solo 'Voy' vota; En duda y No puedo se rechazan", () => {
  const candidates = [C("c1", "Pub 1")];
  const attendees = [
    makeAttendee({ id: "p1", name: "Marta", status: "maybe", confirmedOrder: null }),
    makeAttendee({ id: "p2", name: "Sancho", status: "not_going", confirmedOrder: null }),
  ];
  for (const p of attendees) {
    let result = castPlaceVote(
      candidates,
      [],
      { kind: "participant", participantId: p.id },
      "self",
      "c1",
      attendees,
      null,
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "not_allowed");
  }
  assert.equal(isParticipantVoter(attendees[0]), false);
});

/* ── RF-4 · delegación ── */

test("RF-4: creador vota a solo nombre de confirmados que él anotó", () => {
  const candidates = [C("c1", "Pub 1")];
  const attendees = [
    makeAttendee({ id: "p1", name: "Anotado", status: "going", confirmedOrder: 1, creatorAdded: true }),
    makeAttendee({ id: "p2", name: "Link", status: "going", confirmedOrder: 2, creatorAdded: false }),
  ];
  const delegable = castPlaceVote(
    candidates,
    [],
    { kind: "participant", participantId: "p1" },
    "creator",
    "c1",
    attendees,
    null,
  );
  assert.equal(delegable.ok, true);
  assert.equal(delegable.votes![0].delegated, true);

  const noDelegable = castPlaceVote(
    candidates,
    [],
    { kind: "participant", participantId: "p2" },
    "creator",
    "c1",
    attendees,
    null,
  );
  assert.equal(noDelegable.ok, false);
  assert.equal(noDelegable.reason, "not_allowed");

  assert.equal(isDelegableAttendee(attendees[1]), false);
  assert.equal(isDelegableAttendee(attendees[0]), true);
});

test("RF-4: anotado a mano pero 'palabra' (no Voy) → no es delegable", () => {
  const attendees = [
    makeAttendee({ id: "p1", name: "Anotado", status: "maybe", confirmedOrder: null, creatorAdded: true }),
  ];
  const delegable = castPlaceVote(
    [C("c1", "Pub 1")],
    [],
    { kind: "participant", participantId: "p1" },
    "creator",
    "c1",
    attendees,
    null,
  );
  assert.equal(delegable.ok, false);
  assert.equal(delegable.reason, "not_allowed");
});

/* ── RF-5 · Match y empate ── */

test("RF-5: líder único es Match; empate separado; sin votos es vacío", () => {
  const candidates = [C("c1", "Pub 1"), C("c2", "Pub 2"), C("c3", "Pub 3")];
  // Empate inicial: dos candidatos con 1 voto cada uno
  const empateBase = [VOTE("c1", "p1"), VOTE("c2", "p2")];

  const oneMas = castPlaceVote(candidates, empateBase, CREATOR, "creator", "c1", [], null);
  const outcome = computeMatchOutcome(candidates, oneMas.votes!, null);
  assert.equal(outcome.status, "unique_leader");
  assert.equal(outcome.leaderId, "c1");
  assert.equal(outcome.needsDecision, false);

  const empate = computeMatchOutcome(candidates, empateBase, null);
  assert.equal(empate.status, "tie");
  assert.equal(empate.needsDecision, true);
  assert.equal(empate.tieIds.length, 2);
  assert.ok(getMatchStatusLabel(empate.status).includes("Empate"));

  const sinVotos = computeMatchOutcome(candidates, [], null);
  assert.equal(sinVotos.status, "no_votes");
});

/* ── RF-6 · orden de conteo ── */

test("RF-6: conteo descendente; empate alfabético en español", () => {
  const candidates = [C("c1", "Bar Chile"), C("c2", "Ñam Ñam"), C("c3", "Zona Zero")];
  const votes = [
    VOTE("c2", "p1"),
    VOTE("c2", "p2"),
    VOTE("c1", "creator"),
    VOTE("c3", "p3"),
  ];
  const tally = tallyPlaceVotes(candidates, votes);
  assert.deepEqual(tally.map((entry) => entry.candidateId), ["c2", "c1", "c3"]);
  assert.equal(tally[0].votes, 2);
});

/* ── RF-7 · cierre ── */

test("RF-7: votación cerrada tras declarar Match (votar, cambiar, añadir, eliminar)", () => {
  const candidates = [C("c1", "Pub 1"), C("c2", "Pub 2")];
  const attendees = [makeAttendee({ id: "p1", name: "Ana", status: "going", confirmedOrder: 1 })];
  const matchId = "c1";

  assert.equal(isVoteLocked(matchId), true);

  const cerradoVote = castPlaceVote(
    candidates,
    [],
    { kind: "participant", participantId: "p1" },
    "self",
    "c2",
    attendees,
    matchId,
  );
  assert.equal(cerradoVote.ok, false);
  assert.equal(cerradoVote.reason, "closed");

  const cerradoAdd = addPlaceCandidate(candidates, "Nuevo", "c3", matchId);
  assert.equal(cerradoAdd.ok, false);
  assert.equal(cerradoAdd.reason, "closed");
});

/* ── Caso límite: cambia de estado y su voto se retira ── */

test("Cuando alguien deja de estar 'Voy', sus votos vigentes se retiran", () => {
  const votes = [VOTE("c1", "p1"), VOTE("c2", "creator")];
  const retirados = dropVotesOfVoter(votes, "p1");
  assert.deepEqual(retirados, [VOTE("c2", "creator")]);
});

/* ── RF-8 · la fecha entra como parámetro ── */

test("RF-8: getTodayLocalValue recibe el 'ahora' como parámetro puro", () => {
  const fija = new Date(2026, 9, 18, 20, 45); // 18 de octubre de 2026, 20:45 local
  assert.equal(getTodayLocalValue(fija), "2026-10-18T20:45");
  assert.equal(isValidLocalDatetime(getTodayLocalValue(fija)), true);
  const normalizada = normalizePlaceName("  dos   espacios ");
  assert.equal(normalizada, "dos espacios");
});
