/**
 * Tests del Organizador de Equipos del modo Deportivo (spec 003):
 * nombres de equipos (límite 30, duplicados), titulares elegibles
 * (organizador incluido), sorteo determinista equilibrado con semilla
 * (fijos mantenidos, mínimos, sin libres), movimiento a dedo, baja con
 * vacante y herencia FIFO del suplente, purga contra titulares reales.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DEFAULT_TEAM_A_NAME,
  DEFAULT_TEAM_B_NAME,
  MAX_TEAM_NAME_LENGTH,
  MIN_TITULARS_TO_DRAW,
  buildTitularPlayers,
  buildRestPlayers,
  claimVacancyOnPromotion,
  createEmptyTeamsState,
  dropPlayerFromTeams,
  drawTeams,
  getDrawAvailability,
  getPlayerTeam,
  getTeamCounts,
  getTeamOrganizerErrorMessage,
  getTeamsInfo,
  getTeamsRoster,
  movePlayer,
  renameTeam,
  syncTeamsWithTitulars,
  validateTeamName,
  type PlayerRef,
  type TeamPlayer,
  type TeamSide,
  type TeamsState,
} from "../team-organizer";
import { buildCreatorAttendee, CREATOR_ATTENDEE_ID } from "../creator-attendee";
import type { Attendee } from "../types";

/** Fábrica de jugador de prueba (TeamPlayer). */
function player(ref: string, name: string): TeamPlayer {
  return { ref, name };
}

/** Fábrica de asistente de prueba. */
function attendee(
  id: string,
  name: string,
  status: Attendee["status"],
  confirmedOrder: number | null,
): Attendee {
  return { id, name, status, confirmedOrder };
}

/** Panorama compuesto: creador virtual + 4 invitados con curso de vida. */
function buildCompList(): Attendee[] {
  return [
    buildCreatorAttendee("Nico"),
    attendee("p1", "Ana", "going", 1),
    attendee("p2", "Beto", "going", 2),
    attendee("p3", "Caro", "going", 3),
    attendee("p4", "Diana", "maybe", null),
    attendee("p5", "Eva", "not_going", null),
    attendee("p6", "Fede", "going", 4),
  ];
}

/** Lista de jugadores titulares genérica (p1…p6) para el sorteo. */
const SIX_PLAYERS: TeamPlayer[] = [
  player("p1", "Ana"),
  player("p2", "Beto"),
  player("p3", "Caro"),
  player("p4", "Diana"),
  player("p5", "Eva"),
  player("p6", "Fede"),
];

/** Estado con asignaciones prefabricadas. */
function withAssignments(
  assignments: Array<[PlayerRef, TeamSide]>,
  vacancies: TeamSide[] = [],
): TeamsState {
  return {
    ...createEmptyTeamsState(),
    assignments: assignments.map(([playerRef, team]) => ({ playerRef, team })),
    vacancies: vacancies.map((team) => ({ team })),
  };
}

/** Diferencia de tamaño entre equipos. */
function sizeGap(state: TeamsState): number {
  const counts = getTeamCounts(state);
  return Math.abs(counts.a - counts.b);
}

describe("Estado inicial y nombres de equipos (RF-2)", () => {
  test("el estado inicial nace vacío con nombres por defecto", () => {
    const state = createEmptyTeamsState();
    assert.equal(state.assignments.length, 0);
    assert.equal(state.vacancies.length, 0);
    assert.deepEqual(getTeamsInfo(state), [
      { side: "a", name: DEFAULT_TEAM_A_NAME },
      { side: "b", name: DEFAULT_TEAM_B_NAME },
    ]);
  });

  test("renombra el equipo A y conserva sus asignaciones intactas", () => {
    const base = withAssignments([["p1", "a"], ["p2", "b"]]);
    const result = renameTeam(base, "a", "La U");
    assert.equal(result.ok, true);
    assert.deepEqual(result.teams.teamAName, "La U");
    assert.deepEqual(result.teams.assignments, base.assignments);
    assert.deepEqual(result.teams.vacancies, base.vacancies);
    assert.equal(result.teams.teamBName, null);
  });

  test(`acepta un nombre de ${MAX_TEAM_NAME_LENGTH} caracteres y rechaza ${MAX_TEAM_NAME_LENGTH + 1}`, () => {
    const max = "a".repeat(MAX_TEAM_NAME_LENGTH);
    const over = "a".repeat(MAX_TEAM_NAME_LENGTH + 1);
    assert.deepEqual(validateTeamName(max, "Equipo B"), { ok: true });
    assert.deepEqual(validateTeamName(over, "Equipo B"), {
      ok: false,
      reason: "too_long",
    });
  });

  test("bloquea vacíos y equivalentes al otro equipo sin mayúsculas ni espacios de sobra", () => {
    const base = createEmptyTeamsState();
    const empty = renameTeam(base, "a", "   ");
    assert.equal(empty.ok, false);
    assert.equal(empty.reason, "empty_name");
    const dup = renameTeam(base, "a", "  EQUIPO b ");
    assert.equal(dup.ok, false);
    assert.equal(dup.reason, "duplicate_name");
    assert.deepEqual(dup.teams, base);
  });
});

describe("Titulares elegibles (RF-3)", () => {
  test("el organizador es jugador n.º 0 y recorta con cupo; suplentes y espectadores quedan fuera", () => {
    const titulars = buildTitularPlayers(buildCompList(), 3);
    assert.deepEqual(
      titulars.map((t) => t.ref),
      [CREATOR_ATTENDEE_ID, "p1", "p2"],
    );
    // Sin cupo van todos los «Voy» (el organizador incluido).
    const noCap = buildTitularPlayers(buildCompList(), null);
    assert.deepEqual(
      noCap.map((t) => t.ref),
      [CREATOR_ATTENDEE_ID, "p1", "p2", "p3", "p6"],
    );
  });

  test("el resto de la lista compuesta abandona a los titulares vigentes (spec 004)", () => {
    const rest = buildRestPlayers(buildCompList(), 3);
    assert.deepEqual(
      rest.map((p) => p.ref),
      ["p3", "p4", "p5", "p6"],
    );
    // Con cupo 5 los ex-titulares bajados vuelven al resto.
    const restWideCap = buildRestPlayers(buildCompList(), 5);
    assert.deepEqual(
      restWideCap.map((p) => p.ref),
      ["p4", "p5"],
    );
  });

  test("la fila «sin equipo» es visible y con nombre (RF-9)", () => {
    const state = withAssignments([["p1", "a"]]);
    const roster = getTeamsRoster(state, SIX_PLAYERS);
    assert.deepEqual(roster.teamA.map((t) => t.ref), ["p1"]);
    assert.deepEqual(roster.teamB, []);
    assert.deepEqual(
      roster.unassigned.map((t) => t.ref),
      ["p2", "p3", "p4", "p5", "p6"],
    );
  });

  test("la purga deja los equipos SIEMPRE dentro de los titulares vigentes", () => {
    const state = withAssignments([["p1", "a"], ["ghost", "b"]]);
    const titulars = [player("p1", "Ana"), player("p2", "Beto")];
    const synced = syncTeamsWithTitulars(state, titulars);
    assert.deepEqual(synced.assignments, [{ playerRef: "p1", team: "a" }]);
    // Las vacantes no dependen de jugadores vivos: se conservan.
    const withVacancy = withAssignments([["ghost", "b"]], ["a"]);
    const syncedVacant = syncTeamsWithTitulars(withVacancy, titulars);
    assert.deepEqual(syncedVacant.assignments, []);
    assert.deepEqual(syncedVacant.vacancies, [{ team: "a" }]);
  });
});

describe("Sorteo equilibrado determinista (RF-4 y RF-5)", () => {
  test("con 6 titulares reparte 3 contra 3 y a todos", () => {
    const result = drawTeams(createEmptyTeamsState(), SIX_PLAYERS, 42);
    assert.equal(result.ok, true);
    assert.notEqual(result.teams, undefined);
    const counts = getTeamCounts(result.teams);
    assert.equal(counts.a, 3);
    assert.equal(counts.b, 3);
    assert.equal(result.teams.assignments.length, SIX_PLAYERS.length);
    assert.notEqual(result.drawn, undefined);
    assert.equal(result.drawn?.length, SIX_PLAYERS.length);
  });

  test("con 5 titulares (impar) deja diferencia exacta de 1", () => {
    const five = SIX_PLAYERS.slice(0, 5);
    const result = drawTeams(createEmptyTeamsState(), five, 7);
    assert.equal(result.ok, true);
    assert.equal(sizeGap(result.teams), 1);
    assert.equal(result.teams.assignments.length, 5);
  });

  test("misma semilla + mismo estado = mismo reparto exactamente", () => {
    const first = drawTeams(createEmptyTeamsState(), SIX_PLAYERS, 123);
    const second = drawTeams(createEmptyTeamsState(), SIX_PLAYERS, 123);
    assert.deepEqual(second.teams, first.teams);
    assert.deepEqual(second.drawn, first.drawn);
  });

  test("otra semilla produce otro reparto legítimo", () => {
    const bySeedOne = drawTeams(createEmptyTeamsState(), SIX_PLAYERS, 1);
    const bySeedTwo = drawTeams(createEmptyTeamsState(), SIX_PLAYERS, 2);
    assert.notDeepEqual(bySeedOne.teams.assignments, bySeedTwo.teams.assignments);
  });

  test("sortear dos veces con la misma semilla no cambia nadie (nadie libre)", () => {
    const first = drawTeams(createEmptyTeamsState(), SIX_PLAYERS, 9);
    assert.equal(first.ok, true);
    const again = drawTeams(first.teams, SIX_PLAYERS, 9);
    assert.equal(again.ok, false);
    assert.equal(again.reason, "nothing_to_draw");
    assert.deepEqual(again.teams, first.teams);
  });

  test("mantiene a los fijos tal cual y reparte solo a los libres", () => {
    const base = withAssignments([["p1", "a"], ["p4", "b"]]);
    const result = drawTeams(base, SIX_PLAYERS, 5);
    assert.equal(result.ok, true);
    assert.equal(getPlayerTeam(result.teams, "p1"), "a"); // fijo intacto
    assert.equal(getPlayerTeam(result.teams, "p4"), "b"); // fijo intacto
    for (const libero of ["p2", "p3", "p5", "p6"]) {
      assert.notEqual(getPlayerTeam(result.teams, libero), null);
    }
    assert.deepEqual(
      getTeamCounts(result.teams),
      { a: 3, b: 3 },
    );
  });

  test("con fijos concentrados 4-0 reparte los libres hacia el más chico (4-2)", () => {
    const base = withAssignments([
      ["p1", "a"],
      ["p2", "a"],
      ["p3", "a"],
      ["p4", "a"],
    ]);
    const result = drawTeams(base, SIX_PLAYERS, 88);
    assert.equal(result.ok, true);
    // El sorteo jamás traslada fijos: solo acerca con los libres.
    assert.equal(getPlayerTeam(result.teams, "p1"), "a");
    for (const libero of ["p5", "p6"]) {
      assert.equal(getPlayerTeam(result.teams, libero), "b");
    }
    assert.deepEqual(getTeamCounts(result.teams), { a: 4, b: 2 });
  });

  test(`con menos de ${MIN_TITULARS_TO_DRAW} titulares el sorteo se bloquea con razón`, () => {
    const zero = drawTeams(createEmptyTeamsState(), [], 1);
    assert.equal(zero.ok, false);
    assert.equal(zero.reason, "not_enough_titulars");
    const one = drawTeams(createEmptyTeamsState(), [player("p1", "Ana")], 1);
    assert.equal(one.ok, false);
    assert.equal(one.reason, "not_enough_titulars");
    assert.deepEqual(one.teams, createEmptyTeamsState());
  });

  test("la disponibilidad del sorteo refleja los tres estados del botón", () => {
    const tooFew = getDrawAvailability(createEmptyTeamsState(), []);
    assert.equal(tooFew.available, false);
    assert.equal(tooFew.reason, "not_enough_titulars");
    const ready = getDrawAvailability(createEmptyTeamsState(), SIX_PLAYERS);
    assert.equal(ready.available, true);
    const allAssigned = getDrawAvailability(
      withAssignments(SIX_PLAYERS.map((p) => [p.ref, "a" as TeamSide])),
      SIX_PLAYERS,
    );
    assert.equal(allAssigned.available, false);
    assert.equal(allAssigned.reason, "nothing_to_draw");
  });
});

describe("Movimiento a dedo (RF-6)", () => {
  test("mueve entre equipos y solo el jugador movido cambia", () => {
    const base = withAssignments([["p1", "a"], ["p2", "b"]]);
    const result = movePlayer(base, "p1", "b", SIX_PLAYERS);
    assert.equal(result.ok, true);
    assert.equal(getPlayerTeam(result.teams, "p1"), "b");
    assert.equal(getPlayerTeam(result.teams, "p2"), "b");
    assert.equal(getPlayerTeam(result.teams, "p3"), null);
  });

  test("retira a «sin equipo» sin crear vacante (solo la baja la crea)", () => {
    const base = withAssignments([["p1", "a"]]);
    const result = movePlayer(base, "p1", null, SIX_PLAYERS);
    assert.equal(result.ok, true);
    assert.equal(getPlayerTeam(result.teams, "p1"), null);
    assert.equal(result.teams.vacancies.length, 0);
  });

  test("bloquea no-titular y destino igual, dejando el estado intacto", () => {
    const base = withAssignments([["p1", "a"]]);
    const stranger = movePlayer(base, "p9", "a", SIX_PLAYERS);
    assert.equal(stranger.ok, false);
    assert.equal(stranger.reason, "not_titular");
    const same = movePlayer(base, "p1", "a", SIX_PLAYERS);
    assert.equal(same.ok, false);
    assert.equal(same.reason, "same_team");
    const nowhere = movePlayer(base, "p3", null, SIX_PLAYERS);
    assert.equal(nowhere.reason, "same_team");
    assert.deepEqual(same.teams, base);
    assert.deepEqual(nowhere.teams, base);
  });
});

describe("Baja con vacante (RF-7)", () => {
  test("el titular con equipo sale al instante y deja vacante en su equipo", () => {
    const base = withAssignments([["p1", "a"], ["p2", "b"]]);
    const after = dropPlayerFromTeams(base, "p1");
    assert.equal(getPlayerTeam(after, "p1"), null);
    assert.equal(getPlayerTeam(after, "p2"), "b");
    assert.deepEqual(after.vacancies, [{ team: "a" }]);
  });

  test("quien no tenía asignación se va sin dejar vacante", () => {
    const base = withAssignments([["p2", "b"]]);
    const after = dropPlayerFromTeams(base, "p1");
    assert.deepEqual(after, base);
    assert.equal(after.vacancies.length, 0);
  });

  test("las vacantes quedan ordenadas por antigüedad: primero la más vieja", () => {
    let state = withAssignments([["p1", "a"], ["p2", "b"], ["p3", "a"]]);
    state = dropPlayerFromTeams(state, "p1"); // renuncia más antigua (a)
    state = dropPlayerFromTeams(state, "p2"); // renuncia más reciente (b)
    assert.deepEqual(
      state.vacancies.map((v) => v.team),
      ["a", "b"],
    );
  });
});

describe("Herencia FIFO del suplente (RF-8)", () => {
  const TITULARS = SIX_PLAYERS;

  test("hereda la vacante más antigua y la vacante se consume", () => {
    const withVacancy = withAssignments([["p2", "a"]], ["a"]);
    const result = claimVacancyOnPromotion(withVacancy, "p5", TITULARS);
    assert.equal(result.ok, true);
    assert.equal(result.inherited, "a");
    assert.equal(getPlayerTeam(result.teams, "p5"), "a");
    assert.equal(result.teams.vacancies.length, 0);
  });

  test("dos renuncias (una por equipo) y dos subidas: hereda una por una en FIFO", () => {
    let state = withAssignments([["p1", "a"], ["p2", "b"]]);
    state = dropPlayerFromTeams(state, "p1"); // deja vacante en a (más vieja)
    state = dropPlayerFromTeams(state, "p2"); // deja vacante en b
    const first = claimVacancyOnPromotion(state, "p5", TITULARS);
    assert.equal(first.inherited, "a");
    const second = claimVacancyOnPromotion(first.teams, "p6", TITULARS);
    assert.equal(second.inherited, "b");
    assert.equal(second.teams.vacancies.length, 0);
    assert.deepEqual(getTeamCounts(second.teams), { a: 1, b: 1 });
  });

  test("sin vacantes queda «sin equipo» listo para el sorteo o el movimiento a dedo", () => {
    const state = createEmptyTeamsState();
    const result = claimVacancyOnPromotion(state, "p5", TITULARS);
    assert.equal(result.ok, true);
    assert.equal(result.inherited, null);
    assert.deepEqual(result.teams, state);
    assert.equal(getPlayerTeam(result.teams, "p5"), null);
  });

  test("bloquea subidas sin ser titular o con equipo ya asignado", () => {
    const state = withAssignments([["p2", "a"]], ["b"]);
    const stranger = claimVacancyOnPromotion(state, "p9", TITULARS);
    assert.equal(stranger.ok, false);
    assert.equal(stranger.reason, "not_titular");
    const assigned = claimVacancyOnPromotion(state, "p2", TITULARS);
    assert.equal(assigned.ok, false);
    assert.equal(assigned.reason, "already_assigned");
    assert.deepEqual(assigned.teams, state);
  });
});

describe("Mensajes de la regla en español", () => {
  test("cada motivo tiene su texto legible", () => {
    assert.equal(
      getTeamOrganizerErrorMessage("not_enough_titulars"),
      `Necesitas al menos ${MIN_TITULARS_TO_DRAW} titulares para armar equipos.`,
    );
    assert.equal(
      getTeamOrganizerErrorMessage("nothing_to_draw"),
      "No hay titulares sin equipo para repartir.",
    );
    assert.equal(
      getTeamOrganizerErrorMessage("duplicate_name"),
      "Ya hay otro equipo con ese nombre.",
    );
  });
});
