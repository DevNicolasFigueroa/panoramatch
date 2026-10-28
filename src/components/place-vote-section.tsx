"use client";

/**
 * Sección "¿A dónde vamos?": votación de lugares del modo Social.
 * En el dashboard la maneja el CREADOR: propone, quita sin votos, vota por sí,
 * vota a nombre de los confirmados que él anotó (delegación) y declara Match.
 * Toda la lógica vive puro en `src/core/place-vote.ts`; aquí solo presentación.
 */

import { useMemo, useState } from "react";
import type { Attendee } from "@/core/types";
import {
  MAX_PLACE_CANDIDATES,
  computeMatchOutcome,
  getMatchStatusLabel,
  isDelegableAttendee,
  tallyPlaceVotes,
  toVoterRef,
  type VoteCaster,
} from "@/core/place-vote";
import type { PlaceVoteState } from "@/lib/use-panorama-store";

interface PlaceVoteSectionProps {
  attendees: Attendee[];
  /** Datos del tablero de lugares; null mientras cargan o sin datos. */
  place: PlaceVoteState | null;
  actions: {
    addPlaceCandidate: (name: string) => boolean;
    removePlaceCandidate: (candidateId: string) => boolean;
    castCreatorVote: (candidateId: string, participantId: string | null) => boolean;
    declarePlaceMatch: (candidateId: string) => boolean;
  };
}

export default function PlaceVoteSection({ attendees, place, actions }: PlaceVoteSectionProps) {
  const [newName, setNewName] = useState("");
  // Voto de identidad: "Yo" o un confirmado anotado a mano (delegación).
  const [delegatedId, setDelegatedId] = useState<string>("self");

  const candidates = place?.candidates ?? [];
  const votes = place?.votes ?? [];
  const matchCandidateId = place?.matchCandidateId ?? null;

  const tally = useMemo(() => tallyPlaceVotes(candidates, votes), [candidates, votes]);
  const outcome = useMemo(
    () => computeMatchOutcome(candidates, votes, matchCandidateId),
    [candidates, votes, matchCandidateId],
  );
  const isOpen = matchCandidateId === null;
  const delegables = useMemo(
    () => attendees.filter((attendee) => isDelegableAttendee(attendee)),
    [attendees],
  );
  const selectedCaster: VoteCaster =
    delegatedId === "self"
      ? { kind: "creator" }
      : { kind: "participant", participantId: delegatedId };
  const selectedVoterRef = toVoterRef(selectedCaster);
  const selectedVote = votes.find((vote) => vote.voterRef === selectedVoterRef);

  if (!isOpen) {
    const matchName = candidates.find((candidate) => candidate.id === matchCandidateId)?.name ?? "";
    return (
      <section className="relative overflow-hidden rounded-2xl border border-cancha/40 bg-cancha-soft p-4">
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-social" />
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-bold tracking-tight text-ink">
            ¿A dónde vamos?
          </h2>
          <span className="rounded-full border border-cancha bg-cancha px-2.5 py-0.5 text-xs font-bold text-elev">
            Match declarado
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-soft">La votación está cerrada.</p>
        <MatchRow name={matchName} votes={votes.filter((vote) => vote.candidateId === matchCandidateId).length} />
      </section>
    );
  }

  const seedOrFailed = place === null && candidates.length === 0;
  return (
    <section className="relative overflow-hidden rounded-2xl border border-ink/15 bg-elev p-4">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-social" />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold tracking-tight text-ink">
          ¿A dónde vamos?
        </h2>
        <span className={`text-xs font-semibold ${outcome.status === "tie" ? "text-wait" : "text-cancha"}`}>
          {getMatchStatusLabel(outcome.status)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-ink-soft">
        {seedOrFailed
          ? "Cargando la votación…"
          : candidates.length === 0
            ? "Aún no hay lugares: anota el primero y vote el grupo."
            : "Votan tú y todos los «Voy». Puedes cambiar tu voto a cualquier rato."}
      </p>

      {/* Votar a nombre de… (delegación; visible solo con anotados a mano) */}
      {delegables.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
          <label htmlFor="vote-as" className="shrink-0 text-xs font-bold text-ink">
            Votar a nombre de
          </label>
          <select
            id="vote-as"
            value={delegatedId}
            onChange={(selectEvent) => setDelegatedId(selectEvent.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-ink/20 bg-paper px-2.5 py-1.5 text-xs text-ink outline-none transition focus:border-cancha"
          >
            <option value="self">Yo (creador)</option>
            {delegables.map((attendee) => (
              <option key={attendee.id} value={attendee.id}>
                {attendee.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Lista de candidatos con conteos exactos */}
      <ul className="mt-3 flex flex-col gap-2">
        {tally.map((entry) => {
          const isLeaderLeading =
            outcome.status === "unique_leader" && entry.candidateId === outcome.leaderId;
          const isTiedLeader = outcome.status === "tie" && outcome.tieIds.includes(entry.candidateId);
          const isMine = selectedVote?.candidateId === entry.candidateId;
          const accent = isLeaderLeading || isTiedLeader ? "border-cancha/50 bg-cancha-soft" : "border-ink/15 bg-paper";
          return (
            <li key={entry.candidateId} className={`rounded-xl border p-2.5 ${accent}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">
                    {entry.name}
                    {isMine && <span className="ml-1 text-cancha">(tu voto)</span>}
                  </p>
                  <p className="text-xs font-semibold text-ink-soft">
                    {entry.votes} {entry.votes === 1 ? "voto" : "votos"}
                    {isLeaderLeading ? " · Match actual" : isTiedLeader ? " · empate" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      actions.castCreatorVote(entry.candidateId, delegatedId === "self" ? null : delegatedId)
                    }
                    aria-pressed={isMine}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition active:scale-[0.97] ${
                      isMine
                        ? "border-cancha bg-cancha text-elev"
                        : "border-cancha/40 text-cancha hover:bg-cancha-soft"
                    }`}
                  >
                    Votar
                  </button>
                  {/* Declarar Match: solo líder o empatado (con empate, eliges). */}
                  {(isLeaderLeading || isTiedLeader) && (
                    <button
                      type="button"
                      onClick={() => actions.declarePlaceMatch(entry.candidateId)}
                      className="rounded-lg border border-ink/25 bg-paper px-2.5 py-1.5 text-xs font-bold text-ink transition hover:border-ink/50 active:scale-[0.97]"
                    >
                      Declarar Match
                    </button>
                  )}
                  {entry.votes === 0 && (
                    <button
                      type="button"
                      aria-label={`Quitar ${entry.name}`}
                      onClick={() => actions.removePlaceCandidate(entry.candidateId)}
                      className="rounded-lg border border-ink/15 px-2 py-1.5 text-xs font-bold text-ink-soft transition hover:border-baja hover:text-baja active:scale-[0.97]"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {candidates.length === 0 && (
          <li className="rounded-xl border border-dashed border-ink/20 p-3 text-center text-sm italic text-ink-soft">
            {seedOrFailed ? "Cargando…" : "Propón el primer lugar abajo."}
          </li>
        )}
      </ul>

      {/* Proponer lugar */}
      <form
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          if (actions.addPlaceCandidate(newName)) {
            setNewName("");
          }
        }}
        noValidate
        className="mt-3 flex flex-col gap-2"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(inputEvent) => setNewName(inputEvent.target.value)}
            placeholder={`Proponer lugar ${candidates.length >= MAX_PLACE_CANDIDATES ? "(lista llena)" : ""}`}
            maxLength={60}
            disabled={candidates.length >= MAX_PLACE_CANDIDATES}
            className="min-w-0 flex-1 rounded-xl border border-ink/20 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-cancha disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={candidates.length >= MAX_PLACE_CANDIDATES}
            className="shrink-0 rounded-xl border border-cancha/40 bg-cancha-soft px-3 py-2 text-sm font-bold text-cancha transition hover:border-cancha active:scale-[0.97] disabled:opacity-50"
          >
            Agregar
          </button>
        </div>
      </form>
    </section>
  );
}

/** Fila grande del Match declarado (resumen final). */
function MatchRow({ name, votes }: { name: string; votes: number }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-cancha bg-paper p-3">
      <span className="truncate font-display text-base font-extrabold text-ink">
        🏆 {name}
      </span>
      <span className="shrink-0 text-xs font-semibold text-ink-soft">
        {votes} {votes === 1 ? "voto" : "votos"}
      </span>
    </div>
  );
}
