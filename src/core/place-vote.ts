/**
 * Dominio "¿A dónde vamos?": votación de lugares para el modo Social.
 *
 * Reglas de producto (spec 001):
 * - En Social NO existen titulares ni suplentes: votan el creador y todos
 *   los participantes "Voy" (incluso si el panorama definía cupo).
 * - Cada votante tiene exactamente UN voto vigente; cambiarlo es permitido
 *   mientras la votación esté abierta. Al declararse el Match, se cierra.
 * - El creador vota a nombre de los confirmados que él mismo anotó
 *   (delegación); los que llegaron por el enlace o con cuenta deciden solos.
 * - Máximo 10 candidatos, nombre único (sin mayúsculas ni espacios extra);
 *   eliminar candidatos solo el creador y solo si el candidato tiene 0 votos.
 * - Conteo abierto a todos: líder único = "Match actual"; empate se resuelve
 *   con la declaración del creador.
 *
 * Este módulo es puro: sin React, sin DOM, sin red y sin Supabase.
 */

import type { Attendee } from "./types";
import { normalizeAttendeeName } from "./quota-manager";

/** Techo de candidatos por panorama (spec RF-2). */
export const MAX_PLACE_CANDIDATES = 10;

/** Un lugar candidato al que se puede votar. */
export interface PlaceCandidate {
  id: string;
  name: string;
}

/** Referencia de quién emite el voto: el creador o un participante. */
export type VoteCaster =
  | { kind: "creator" }
  | { kind: "participant"; participantId: string };

/** Quién está accionando el voto: el propio participante o el creador. */
export type VoteActor = "self" | "creator";

/** Un voto vigente dentro del panorama (una fila por votante). */
export interface PlaceVoteRecord {
  candidateId: string;
  /** 'creator' o el id del participante (identifica al votante de forma estable). */
  voterRef: string;
  /** true cuando el creador votó a nombre de un confirmado que él anotó. */
  delegated: boolean;
}

/** Estado del Match para la UI. */
export type MatchStatus = "no_votes" | "unique_leader" | "tie" | "declared";

/** Resultado del cálculo del Match. */
export interface MatchOutcome {
  status: MatchStatus;
  /** Candidato líder (se muestra como "Match actual") o el declarado. */
  leaderId: string | null;
  /** Ids empatados en el liderato (uno solo cuando declared/unique). */
  tieIds: string[];
  /** Empate sin Match declarado: falta la decisión del creador. */
  needsDecision: boolean;
}

/** Entrada del conteo ordenado para las listas en pantalla. */
export interface PlaceTallyEntry {
  candidateId: string;
  name: string;
  votes: number;
}

/* ─────────────── Nombres de candidatos ─────────────── */

/** Normaliza nombres de lugares igual que participantes (trims y espacios). */
export function normalizePlaceName(name: string): string {
  return normalizeAttendeeName(name);
}

/** Motivos de rechazo de las operaciones (textos de la UI, en español). */
export type PlaceRuleError =
  | "closed"
  | "empty_name"
  | "too_long"
  | "duplicate_name"
  | "max_candidates"
  | "unknown_candidate"
  | "has_votes"
  | "not_allowed"
  | "same_vote";

/** Mensaje legible por motivo (presentación, en español). */
export function getPlaceRuleErrorMessage(error: PlaceRuleError): string {
  switch (error) {
    case "closed":
      return "El match ya fue declarado y la votación está cerrada.";
    case "empty_name":
      return "Primero escribe el nombre del lugar.";
    case "too_long":
      return "El nombre del lugar es demasiado largo (máx. 60 caracteres).";
    case "duplicate_name":
      return "Ese lugar ya está en la lista.";
    case "max_candidates":
      return `Máximo ${MAX_PLACE_CANDIDATES} lugares por panorama.`;
    case "unknown_candidate":
      return "Ese lugar ya no está en la lista.";
    case "has_votes":
      return "No se puede eliminar: ya tiene votos.";
    case "not_allowed":
      return "Solo los confirmados «Voy» pueden votar en este panorama.";
    case "same_vote":
      return "Tu voto ya estaba en ese lugar.";
    default:
      return "No se pudo completar la operación.";
  }
}

/** Resultado genérico de las operaciones puras de lugares. */
export interface PlaceOpResult {
  ok: boolean;
  reason?: PlaceRuleError;
  candidates?: PlaceCandidate[];
  votes?: PlaceVoteRecord[];
}

/** Detecta candidato duplicado por nombre (sin mayúsculas). */
export function isDuplicatePlaceName(
  candidates: readonly PlaceCandidate[],
  name: string,
  excludeCandidateId?: string,
): boolean {
  const normalized = normalizePlaceName(name).toLowerCase();
  if (normalized === "") {
    return false;
  }
  return candidates.some(
    (candidate) =>
      candidate.id !== excludeCandidateId &&
      normalizePlaceName(candidate.name).toLowerCase() === normalized,
  );
}

/** La votación está cerrada cuando ya se declaró el Match. */
export function isVoteLocked(matchCandidateId: string | null): boolean {
  return matchCandidateId !== null;
}

/* ─────────────── Candidatos ─────────────── */

/** Agrega un candidato; requiere votación abierta, máximo y nombre único. */
export function addPlaceCandidate(
  candidates: readonly PlaceCandidate[],
  rawName: string,
  newCandidateId: string,
  matchCandidateId: string | null,
): PlaceOpResult {
  if (isVoteLocked(matchCandidateId)) {
    return { ok: false, reason: "closed", candidates: [...candidates] };
  }
  const normalized = normalizePlaceName(rawName);
  if (normalized === "") {
    return { ok: false, reason: "empty_name", candidates: [...candidates] };
  }
  if (normalized.length > 60) {
    return { ok: false, reason: "too_long", candidates: [...candidates] };
  }
  if (isDuplicatePlaceName(candidates, normalized)) {
    return { ok: false, reason: "duplicate_name", candidates: [...candidates] };
  }
  if (candidates.length >= MAX_PLACE_CANDIDATES) {
    return { ok: false, reason: "max_candidates", candidates: [...candidates] };
  }
  return {
    ok: true,
    candidates: [
      ...candidates,
      { id: newCandidateId, name: normalized },
    ],
  };
}

/** Elimina un candidato: solo con la votación abierta y sin votos. */
export function removePlaceCandidate(
  candidates: readonly PlaceCandidate[],
  votes: readonly PlaceVoteRecord[],
  candidateId: string,
  matchCandidateId: string | null,
): PlaceOpResult {
  if (isVoteLocked(matchCandidateId)) {
    return { ok: false, reason: "closed", candidates: [...candidates] };
  }
  const target = candidates.find((candidate) => candidate.id === candidateId);
  if (target === undefined) {
    return { ok: false, reason: "unknown_candidate", candidates: [...candidates] };
  }
  if (votes.some((vote) => vote.candidateId === candidateId)) {
    return { ok: false, reason: "has_votes", candidates: [...candidates] };
  }
  return {
    ok: true,
    candidates: candidates.filter((candidate) => candidate.id !== candidateId),
    // El Match declarado nunca referencia este id (está cerrado), pero por defensividad:
    votes: votes.filter((vote) => vote.candidateId !== candidateId),
  };
}

/* ─────────────── Votación ─────────────── */

/** ¿Este participante puede votar en Social? Solo los confirmados "Voy". */
export function isParticipantVoter(attendee: Attendee | undefined): boolean {
  return attendee !== undefined && attendee.status === "going";
}

/** ¿El creador puede delegar el voto de este participante? Solo si él lo anotó. */
export function isDelegableAttendee(attendee: Attendee | undefined): boolean {
  return (
    attendee !== undefined &&
    // El asistente creador ya tiene su propio voto — jamás delegable.
    attendee.isCreator !== true &&
    attendee.creatorAdded === true &&
    isParticipantVoter(attendee)
  );
}

/** Convierte un votante en su referencia única ('creator' o id participante). */
export function toVoterRef(caster: VoteCaster): string {
  return caster.kind === "creator" ? "creator" : caster.participantId;
}

/** ¿El punto de emisión está autorizado para este acto con la votación abierta? */
export function isCasterAuthorized(
  caster: VoteCaster,
  actor: VoteActor,
  attendees: readonly Attendee[],
  matchCandidateId: string | null,
): boolean {
  if (isVoteLocked(matchCandidateId)) {
    return false;
  }
  if (caster.kind === "creator") {
    return actor === "creator";
  }
  const attendee = attendees.find((item) => item.id === caster.participantId);
  if (!isParticipantVoter(attendee)) {
    return false;
  }
  // El participante vota por sí mismo desde su vista/enlace...
  if (actor === "self") {
    return true;
  }
  // ...o el creador lo hace a nombre de uno que él anotó (delegación).
  return actor === "creator" && isDelegableAttendee(attendee);
}

/**
 * Emite o cambia el voto vigente del votante (una fila por votante).
 * Votación cerrada, candidato inexistente o votante no autorizado → rechazo.
 * Es idempotente: votar de nuevo por el mismo candidato devuelve la lista igual.
 */
export function castPlaceVote(
  candidates: readonly PlaceCandidate[],
  votes: readonly PlaceVoteRecord[],
  caster: VoteCaster,
  actor: VoteActor,
  candidateId: string,
  attendees: readonly Attendee[],
  matchCandidateId: string | null,
): PlaceOpResult {
  if (isVoteLocked(matchCandidateId)) {
    return { ok: false, reason: "closed", votes: [...votes] };
  }
  const target = candidates.find((candidate) => candidate.id === candidateId);
  if (target === undefined) {
    return { ok: false, reason: "unknown_candidate", votes: [...votes] };
  }
  if (!isCasterAuthorized(caster, actor, attendees, matchCandidateId)) {
    return { ok: false, reason: "not_allowed", votes: [...votes] };
  }
  const voterRef = toVoterRef(caster);
  const existing = votes.find((vote) => vote.voterRef === voterRef);
  if (existing !== undefined && existing.candidateId === candidateId) {
    return { ok: true, votes: [...votes] };
  }
  const nextVote: PlaceVoteRecord = {
    candidateId,
    voterRef,
    delegated: caster.kind === "participant" && actor === "creator",
  };
  const votes_ =
    existing === undefined
      ? [...votes, nextVote]
      : votes.map((vote) => (vote.voterRef === voterRef ? nextVote : vote));
  return { ok: true, votes: votes_ };
}

/** Retira el voto vigente de un participante (ej. dejó de estar "Voy"). */
export function dropVotesOfVoter(
  votes: readonly PlaceVoteRecord[],
  voterRef: string,
): PlaceVoteRecord[] {
  return votes.filter((vote) => vote.voterRef !== voterRef);
}

/* ─────────────── Conteos y Match ─────────────── */

/** Conteo por candidato ordenado: más votos primero, empates alfabético (es). */
export function tallyPlaceVotes(
  candidates: readonly PlaceCandidate[],
  votes: readonly PlaceVoteRecord[],
): PlaceTallyEntry[] {
  return candidates
    .map((candidate) => ({
      candidateId: candidate.id,
      name: candidate.name,
      votes: votes.filter((vote) => vote.candidateId === candidate.id).length,
    }))
    .sort((a, b) => {
      if (a.votes !== b.votes) {
        return b.votes - a.votes;
      }
      return a.name.localeCompare(b.name, "es");
    });
}

/** Estado del Match calculado sobre los votos vigentes. */
export function computeMatchOutcome(
  candidates: readonly PlaceCandidate[],
  votes: readonly PlaceVoteRecord[],
  matchCandidateId: string | null,
): MatchOutcome {
  if (matchCandidateId !== null) {
    return {
      status: "declared",
      leaderId: matchCandidateId,
      tieIds: [matchCandidateId],
      needsDecision: false,
    };
  }
  const tally = tallyPlaceVotes(candidates, votes);
  const topVotes = tally.length > 0 ? tally[0].votes : 0;
  if (topVotes === 0) {
    return { status: "no_votes", leaderId: null, tieIds: [], needsDecision: false };
  }
  const leaders = tally.filter((entry) => entry.votes === topVotes);
  if (leaders.length === 1) {
    return {
      status: "unique_leader",
      leaderId: leaders[0].candidateId,
      tieIds: [leaders[0].candidateId],
      needsDecision: false,
    };
  }
  return {
    status: "tie",
    leaderId: null,
    tieIds: leaders.map((entry) => entry.candidateId),
    needsDecision: true,
  };
}

/** Etiqueta del estado del Match (presentación, en español). */
export function getMatchStatusLabel(status: MatchStatus): string {
  switch (status) {
    case "declared":
      return "Match declarado";
    case "unique_leader":
      return "Match actual";
    case "tie":
      return "Empate: el creador decide";
    case "no_votes":
      return "Sin votos todavía";
    default:
      return "Sin votos todavía";
  }
}

/** ¿Puede el creador declarar el Match en este estado? */
export function canDeclareMatch(outcome: MatchOutcome): boolean {
  return outcome.status === "unique_leader" || outcome.status === "tie";
}
