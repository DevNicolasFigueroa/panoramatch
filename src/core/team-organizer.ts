/**
 * Dominio "Organizador de Equipos" para el modo Deportivo (spec 003).
 *
 * Reglas de producto:
 * - Los elegibles son SOLO los titulares («Voy» dentro del cupo): el
 *   organizador es titular n.º 0 (virtual), y nunca entran suplentes ni
 *   espectadores. Vienen de `classifyAttendees` sobre la lista compuesta
 *   con `withCreatorAttendee`.
 * - Dos equipos siempre existen (A y B); los nombres por defecto son
 *   «Equipo A» y «Equipo B» y solo el creador los renombra (≤30 car.,
 *   no vacío y distinto del otro equipo ignorando mayúsculas y espacios).
 * - El sorteo determinista con semilla reparte SOLO los titulares sin
 *   equipo («libres»), mantiene tal cual a los asignados («fijos») y
 *   alterna hacia el equipo más chico; la diferencia ≤ 1 se alcanza
 *   siempre que sea posible (con fijos concentrados se acerca al máximo).
 * - El creador mueve jugadores a dedo entre equipos o los retira a «sin
 *   equipo» (un retiro a dedo NO crea vacante).
 * - Si un titular con equipo deja de ser titular («En duda», «No puedo»
 *   o cae a Lista de Espera), sale al instante y DEJA UNA VACANTE en su
 *   equipo (antigüedad: el primer elemento de la fila es el más antiguo).
 * - Un suplente que sube a titular hereda la vacante más antigua (FIFO)
 *   con su equipo; sin vacantes queda «sin equipo».
 *
 * Este módulo es puro: sin React, sin DOM, sin red y sin Supabase.
 */

import type { Attendee } from "./types";
import { classifyAttendees, normalizeAttendeeName } from "./quota-manager";

/** Nombres por defecto de los dos equipos (RF-2). */
export const DEFAULT_TEAM_A_NAME = "Equipo A";
export const DEFAULT_TEAM_B_NAME = "Equipo B";

/** Largo máximo del nombre de un equipo (decisiones del borrador v0.2). */
export const MAX_TEAM_NAME_LENGTH = 30;

/** Titulares mínimos para habilitar el sorteo (RF-4). */
export const MIN_TITULARS_TO_DRAW = 2;

/** Lado de un equipo: «a» y «b» (nombre y color los da la interfaz). */
export type TeamSide = "a" | "b";

/** Un equipo con su nombre vigente y su lado. */
export interface TeamInfo {
  side: TeamSide;
  name: string;
}

/**
 * Referencia del jugador: `creator` (organizador virtual) o el id del
 * asistente/participante, igual que las referencias de reclamos de la 002.
 */
export type PlayerRef = string;

/** Un titular con su referencia y nombre (orden = orden de confirmación). */
export interface TeamPlayer {
  ref: PlayerRef;
  name: string;
}

/** Asignación de un titular a un equipo. */
export interface TeamAssignment {
  playerRef: PlayerRef;
  team: TeamSide;
}

/** Vacante dejada por un titular que se bajó (RF-7). */
export interface TeamVacancy {
  team: TeamSide;
}

/** Estado completo del organizador de equipos de un panorama Deportivo. */
export interface TeamsState {
  /** Nombre elegido o null (= nombre por defecto). */
  teamAName: string | null;
  teamBName: string | null;
  /** Asignaciones vivas (solo titulares en vigor — ver `syncTeamsWithTitulars`). */
  assignments: TeamAssignment[];
  /** Vacantes por antigüedad: el índice 0 es la más antigua (FIFO). */
  vacancies: TeamVacancy[];
}

/** Motivos de rechazo de las operaciones (textos de la UI, en español). */
export type TeamOrganizerError =
  | "empty_name"
  | "too_long"
  | "duplicate_name"
  | "not_enough_titulars"
  | "nothing_to_draw"
  | "unknown_player"
  | "not_titular"
  | "already_assigned"
  | "same_team";

/** Mensaje legible por motivo (presentación, en español). */
export function getTeamOrganizerErrorMessage(error: TeamOrganizerError): string {
  switch (error) {
    case "empty_name":
      return "Primero escribe el nombre del equipo.";
    case "too_long":
      return `El nombre del equipo es demasiado largo (máx. ${MAX_TEAM_NAME_LENGTH} caracteres).`;
    case "duplicate_name":
      return "Ya hay otro equipo con ese nombre.";
    case "not_enough_titulars":
      return `Necesitas al menos ${MIN_TITULARS_TO_DRAW} titulares para armar equipos.`;
    case "nothing_to_draw":
      return "No hay titulares sin equipo para repartir.";
    case "unknown_player":
      return "Ese jugador ya no está en el panorama.";
    case "not_titular":
      return "Solo los titulares pueden estar en un equipo.";
    case "already_assigned":
      return "Ese jugador ya está en un equipo.";
    case "same_team":
      return "Ese jugador ya está donde lo quieres poner.";
    default:
      return "No se pudo completar la operación.";
  }
}

/** Crea el estado inicial: equipos vacíos con nombres por defecto (retro-compat). */
export function createEmptyTeamsState(): TeamsState {
  return {
    teamAName: null,
    teamBName: null,
    assignments: [],
    vacancies: [],
  };
}

/** Nombre vigente de un equipo: el elegido o el por defecto. */
export function getTeamName(state: TeamsState, side: TeamSide): string {
  const chosen = side === "a" ? state.teamAName : state.teamBName;
  const fallback = side === "a" ? DEFAULT_TEAM_A_NAME : DEFAULT_TEAM_B_NAME;
  return chosen ?? fallback;
}

/** Los dos equipos con nombre vigente, en orden fijo (A primero). */
export function getTeamsInfo(state: TeamsState): TeamInfo[] {
  return [
    { side: "a", name: getTeamName(state, "a") },
    { side: "b", name: getTeamName(state, "b") },
  ];
}

/* ─────────────── Nombres de equipos (RF-2) ─────────────── */

/** Normaliza el nombre de equipo igual que los demás textos del dominio. */
export function normalizeTeamName(name: string): string {
  return normalizeAttendeeName(name);
}

/** Valida un nombre de equipo contra el nombre del OTRO equipo (RF-2). */
export function validateTeamName(
  rawName: string,
  otherTeamName: string,
): { ok: boolean; reason?: TeamOrganizerError } {
  const normalized = normalizeTeamName(rawName);
  if (normalized === "") {
    return { ok: false, reason: "empty_name" };
  }
  if (normalized.length > MAX_TEAM_NAME_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  if (
    normalizeTeamName(otherTeamName).toLowerCase() === normalized.toLowerCase()
  ) {
    return { ok: false, reason: "duplicate_name" };
  }
  return { ok: true };
}

/**
 * Resultado genérico de las operaciones puras de equipos: el estado SIEMPRE
 * vuelve (igual o reconstruido inmutablemente); con `ok: false` queda intacto.
 */
export interface TeamsOpResult {
  ok: boolean;
  reason?: TeamOrganizerError;
  teams: TeamsState;
  /** Solo en `drawTeams`: lo que quedó asignado en ESTA corrida. */
  drawn?: TeamAssignment[];
  /** Solo en `claimVacancyOnPromotion`: equipo heredado, o null = «sin equipo». */
  inherited?: TeamSide | null;
}

/** Renombra un equipo conservando intactas las asignaciones (RF-2). */
export function renameTeam(
  state: TeamsState,
  side: TeamSide,
  rawName: string,
): TeamsOpResult {
  const otherName = getTeamName(state, side === "a" ? "b" : "a");
  const validation = validateTeamName(rawName, otherName);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason, teams: state };
  }
  const normalized = normalizeTeamName(rawName);
  const names =
    side === "a" ? { teamAName: normalized } : { teamBName: normalized };
  return { ok: true, teams: { ...state, ...names } };
}

/* ─────────────── Titulares elegibles (RF-3) ─────────────── */

/**
 * Los titulares elegibles como jugadores, en orden de confirmación
 * (el organizador virtual primero). La lista de asistentes DEBE venir
 * compuesta con `withCreatorAttendee` para incluir al creador.
 */
export function buildTitularPlayers(
  attendees: readonly Attendee[],
  maxCapacity: number | null,
): TeamPlayer[] {
  return classifyAttendees(attendees, maxCapacity).titulars.map((attendee) => ({
    ref: attendee.id,
    name: attendee.name,
  }));
}

/**
 * El resto de la lista compuesta: los que NO son titulares vigentes
 * (suplentes, «En duda» y «No puedo»), en su orden original. Sirve para
 * reconocer los nombres de ex-titulares en tableros de pagos (spec 004).
 */
export function buildRestPlayers(
  attendees: readonly Attendee[],
  maxCapacity: number | null,
): TeamPlayer[] {
  const titularRefs = new Set(
    buildTitularPlayers(attendees, maxCapacity).map((player) => player.ref),
  );
  return attendees
    .filter((attendee) => !titularRefs.has(attendee.id))
    .map((attendee) => ({ ref: attendee.id, name: attendee.name }));
}

/* ─────────────── Lectura de equipos (RF-9) ─────────────── */

/** Conteo de jugadores por equipo según las asignaciones vivas. */
export function getTeamCounts(state: TeamsState): Record<TeamSide, number> {
  return state.assignments.reduce(
    (counts, assignment) => {
      counts[assignment.team] += 1;
      return counts;
    },
    { a: 0, b: 0 } as Record<TeamSide, number>,
  );
}

/** Equipo de un jugador; null = «sin equipo» (o fuera del panorama). */
export function getPlayerTeam(
  state: TeamsState,
  playerRef: PlayerRef,
): TeamSide | null {
  const assignment = state.assignments.find(
    (item) => item.playerRef === playerRef,
  );
  return assignment?.team ?? null;
}

/**
 * La vista completa para la interfaz (RF-9): jugadores de cada equipo y la
 * fila «sin equipo», cada grupo en orden de confirmación (el de la entrada).
 */
export function getTeamsRoster(
  state: TeamsState,
  titularPlayers: readonly TeamPlayer[],
): { teamA: TeamPlayer[]; teamB: TeamPlayer[]; unassigned: TeamPlayer[] } {
  const roster = { teamA: [], teamB: [], unassigned: [] } as {
    teamA: TeamPlayer[];
    teamB: TeamPlayer[];
    unassigned: TeamPlayer[];
  };
  for (const player of titularPlayers) {
    const team = getPlayerTeam(state, player.ref);
    if (team === null) {
      roster.unassigned.push(player);
    } else if (team === "a") {
      roster.teamA.push(player);
    } else {
      roster.teamB.push(player);
    }
  }
  return roster;
}

/* ─────────────── Purga defensiva ─────────────── */

/**
 * Invariante (RF-3): los equipos son SIEMPRE un subconjunto de los
 * titulares vigentes. Recibe los titulares recién calculados y descarta
 * cualquier asignación huérfana (p. ej. datos que llegaron desincronizados).
 * Las vacantes no dependen de jugadores vivos: se conservan.
 */
export function syncTeamsWithTitulars(
  state: TeamsState,
  titularPlayers: readonly TeamPlayer[],
): TeamsState {
  const titularRefs = new Set(titularPlayers.map((player) => player.ref));
  const assignments = state.assignments.filter((assignment) =>
    titularRefs.has(assignment.playerRef),
  );
  if (assignments.length === state.assignments.length) {
    return state;
  }
  return { ...state, assignments };
}

/* ─────────────── Movimiento a dedo (RF-6) ─────────────── */

/**
 * Mueve un titular a un equipo o lo retira a «sin equipo» (`target` null).
 * Un retiro a dedo NO crea vacante: el jugador sigue siendo titular, solo
 * queda «sin equipo» (RF-6) — la vacante es de las baja (RF-7).
 */
export function movePlayer(
  state: TeamsState,
  playerRef: PlayerRef,
  target: TeamSide | null,
  titularPlayers: readonly TeamPlayer[],
): TeamsOpResult {
  const isTitular = titularPlayers.some((player) => player.ref === playerRef);
  if (!isTitular) {
    return { ok: false, reason: "not_titular", teams: state };
  }
  const current = getPlayerTeam(state, playerRef);
  if (current === target) {
    return { ok: false, reason: "same_team", teams: state };
  }
  const withoutPlayer = state.assignments.filter(
    (assignment) => assignment.playerRef !== playerRef,
  );
  const assignments =
    target === null
      ? withoutPlayer
      : [...withoutPlayer, { playerRef, team: target }];
  return { ok: true, teams: { ...state, assignments } };
}

/* ─────────────── Sorteo equilibrado determinista (RF-4 y RF-5) ─────────────── */

/**
 * PRNG determinista mulberry32: misma semilla → misma secuencia de números.
 * El azar vive SOLO en la semilla, que entra como parámetro puro.
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Baraja Fisher–Yates con el PRNG dado (copia propia, sin mutar entrada). */
function shuffleWithRandom<TValue>(values: TValue[], random: () => number): TValue[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

/** Equipo del turno: el más chico; empate resuelto por semilla (aleatorio). */
function pickTeamForTurn(counts: Record<TeamSide, number>, random: () => number): TeamSide {
  if (counts.a < counts.b) {
    return "a";
  }
  if (counts.b < counts.a) {
    return "b";
  }
  return random() < 0.5 ? "a" : "b";
}

/** ¿Está el sorteo disponible y porqué no? (para inhibir el botón con razón). */
export function getDrawAvailability(
  state: TeamsState,
  titularPlayers: readonly TeamPlayer[],
): { available: boolean; reason?: TeamOrganizerError } {
  if (titularPlayers.length < MIN_TITULARS_TO_DRAW) {
    return { available: false, reason: "not_enough_titulars" };
  }
  const hasFreePlayers = titularPlayers.some(
    (player) => getPlayerTeam(state, player.ref) === null,
  );
  if (!hasFreePlayers) {
    return { available: false, reason: "nothing_to_draw" };
  }
  return { available: true };
}

/**
 * El sorteo (RF-4): reparte SOLO los titulares sin equipo, manteniendo tal
 * cual a los fijos; los libres entran barajados por semilla y cada uno al
 * equipo más chico del momento (empates por semilla). Con fijos concentrados
 * el resultado se acerca al máximo posible sin tocar fijos (caso límite 7).
 * Determinista (RF-5): misma entrada + misma semilla → mismo reparto y,
 * corrida dos veces sobre el mismo estado, el resultado es idéntico.
 */
export function drawTeams(
  state: TeamsState,
  titularPlayers: readonly TeamPlayer[],
  seed: number,
): TeamsOpResult {
  if (titularPlayers.length < MIN_TITULARS_TO_DRAW) {
    return { ok: false, reason: "not_enough_titulars", teams: state };
  }
  const assignedTeams = new Map(
    state.assignments.map((item) => [item.playerRef, item.team]),
  );
  const freePlayers = titularPlayers.filter(
    (player) => !assignedTeams.has(player.ref),
  );
  if (freePlayers.length === 0) {
    return { ok: false, reason: "nothing_to_draw", teams: state };
  }
  const random = createRandom(seed);
  const queue = shuffleWithRandom(freePlayers, random);
  const counts = getTeamCounts(state);
  const assignments = [...state.assignments];
  const drawn: TeamAssignment[] = [];
  for (const player of queue) {
    const team = pickTeamForTurn(counts, random);
    counts[team] += 1;
    const assignment: TeamAssignment = { playerRef: player.ref, team };
    assignments.push(assignment);
    drawn.push(assignment);
  }
  return { ok: true, teams: { ...state, assignments }, drawn };
}

/* ─────────────── Baja con vacante y herencia FIFO (RF-7 y RF-8) ─────────────── */

/**
 * Baja de un titular asignado (RF-7): sale de su equipo al instante y deja
 * VACANTE en ese equipo, al final de la fila de antigüedad (la más vieja
 * queda al frente). Si el jugador no tenía asignación, el estado no cambia
 * (y no nace vacante: nadie renunció a un asiento de equipo).
 */
export function dropPlayerFromTeams(state: TeamsState, playerRef: PlayerRef): TeamsState {
  const assignment = state.assignments.find(
    (item) => item.playerRef === playerRef,
  );
  if (assignment === undefined) {
    return state;
  }
  return {
    ...state,
    assignments: state.assignments.filter(
      (item) => item.playerRef !== playerRef,
    ),
    vacancies: [...state.vacancies, { team: assignment.team }],
  };
}

/**
 * Herencia del suplente que sube a titular (RF-8): toma la vacante más
 * antigua (FIFO) y hereda ese equipo. Sin vacantes queda «sin equipo»
 * (`inherited: null`), listo para el sorteo o el movimiento a dedo.
 */
export function claimVacancyOnPromotion(
  state: TeamsState,
  playerRef: PlayerRef,
  titularPlayers: readonly TeamPlayer[],
): TeamsOpResult {
  const isTitular = titularPlayers.some((player) => player.ref === playerRef);
  if (!isTitular) {
    return { ok: false, reason: "not_titular", teams: state };
  }
  const alreadyAssigned = getPlayerTeam(state, playerRef) !== null;
  if (alreadyAssigned) {
    return { ok: false, reason: "already_assigned", teams: state };
  }
  const [oldest, ...remaining] = state.vacancies;
  if (oldest === undefined) {
    return { ok: true, teams: state, inherited: null };
  }
  return {
    ok: true,
    teams: {
      ...state,
      assignments: [...state.assignments, { playerRef, team: oldest.team }],
      vacancies: remaining,
    },
    inherited: oldest.team,
  };
}
