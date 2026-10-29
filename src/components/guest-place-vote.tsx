"use client";

/**
 * "¿A dónde vamos?" del enlace /p/<id> (auth universal). Muestra candidatos
 * y conteos exactos a cualquiera con sesión; si su estado es "Voy", propone
 * lugares y vota (un voto vigente, cambiable mientras esté abierta). La DB
 * valida `auth.uid()`: nadie toca la fila ajena.
 */

import { useEffect, useMemo, useState } from "react";

import type { AttendanceStatus, SavedPanorama } from "@/core/types";
import {
  computeMatchOutcome,
  getMatchStatusLabel,
  getPlaceRuleErrorMessage,
  normalizePlaceName,
  tallyPlaceVotes,
} from "@/core/place-vote";
import { MAX_PLACE_CANDIDATES, addPlaceCandidate } from "@/core/place-vote";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import {
  deletePlaceVoteRow,
  fetchPlaceData,
  insertPlaceCandidateRow,
  upsertPlaceVoteRow,
  type PlaceData,
} from "@/lib/supabase-panorama-repo";

interface GuestPlaceVoteProps {
  panorama: SavedPanorama;
  /** Id de la fila de participante propia (null si aún no participa). */
  ownParticipantId: string | null;
  /** Estado actual del propio invitado (null si aún no participa). */
  ownStatus: AttendanceStatus | null;
}

/** Estado local del tablero de lugares (duplico el shape mínimo del store). */
interface PlaceLocalState extends PlaceData {}

export default function GuestPlaceVote({ panorama, ownParticipantId, ownStatus }: GuestPlaceVoteProps) {
  const [place, setPlace] = useState<PlaceLocalState | null>(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const { event } = panorama;

  // Carga inicial del tablero: lectura pública con el cliente de sesión.
  useEffect(() => {
    if (event.mode !== "social") {
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const data = await fetchPlaceData(getSupabaseBrowserClient(), panorama.id);
        if (!cancelled) {
          setPlace(data);
        }
      } catch {
        if (!cancelled) {
          setPlace({ candidates: [], votes: [], matchCandidateId: null });
          setError("No se pudo cargar la votación de lugares.");
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [panorama.id, event.mode]);

  const candidates = place?.candidates ?? [];
  const votes = place?.votes ?? [];
  const matchCandidateId = place?.matchCandidateId ?? null;

  const tally = useMemo(() => tallyPlaceVotes(candidates, votes), [candidates, votes]);
  const outcome = useMemo(
    () => computeMatchOutcome(candidates, votes, matchCandidateId),
    [candidates, votes, matchCandidateId],
  );
  const isOpen = matchCandidateId === null;
  const canVote = isOpen && ownStatus === "going" && ownParticipantId !== null;
  const myVote = ownParticipantId === null ? null : votes.find((vote) => vote.voterRef === ownParticipantId);

  if (event.mode !== "social") {
    return null;
  }

  /** Vota (o cambia) el propio asistente: una fila de place_votes con su id. */
  const voteFor = async (candidateId: string) => {
    if (ownParticipantId === null || !canVote) {
      return;
    }
    setIsBusy(true);
    setError(null);
    const previous = place;
    setPlace((current) => {
      if (current === null) {
        return current;
      }
      const nextVote = { candidateId, voterRef: ownParticipantId, delegated: false };
      const existing = current.votes.find((vote) => vote.voterRef === ownParticipantId);
      if (existing !== undefined && existing.candidateId === candidateId) {
        return current;
      }
      return {
        ...current,
        votes:
          existing === undefined
            ? [...current.votes, nextVote]
            : current.votes.map((vote) => (vote.voterRef === ownParticipantId ? nextVote : vote)),
      };
    });
    try {
      await upsertPlaceVoteRow(getSupabaseBrowserClient(), {
        panoramaId: panorama.id,
        candidateId,
        voterRef: ownParticipantId,
      });
    } catch {
      setPlace(previous);
      setError("No se pudo registrar tu voto. Intenta otra vez.");
    } finally {
      setIsBusy(false);
    }
  };

  /** Propone un lugar nuevo a la lista (máx 10; duplicado bloqueado en core). */
  const proposePlace = async (formEvent: React.FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!canVote) {
      return;
    }
    const result = addPlaceCandidate(candidates, newName, "", matchCandidateId);
    if (!result.ok) {
      setError(getPlaceRuleErrorMessage(result.reason ?? "empty_name"));
      return;
    }
    setIsBusy(true);
    setError(null);
    const optimisticName = normalizePlaceName(newName);
    try {
      const row = await insertPlaceCandidateRow(getSupabaseBrowserClient(), {
        panoramaId: panorama.id,
        name: optimisticName,
      });
      setPlace((current) =>
        current === null
          ? current
          : { ...current, candidates: [...current.candidates, { id: row.id, name: row.name }] },
      );
      setNewName("");
    } catch {
      setError("No se pudo proponer el lugar. Intenta otra vez.");
    } finally {
      setIsBusy(false);
    }
  };

  // Caso límite 6: al dejar de estar "Voy", su voto sale del tablero manualmente.
  useEffect(() => {
    if (ownStatus !== null && ownStatus !== "going" && myVote !== null && ownParticipantId !== null) {
      const previous = place;
      setPlace((current) =>
        current === null
          ? current
          : { ...current, votes: current.votes.filter((vote) => vote.voterRef !== ownParticipantId) },
      );
      void deletePlaceVoteRow(getSupabaseBrowserClient(), panorama.id, ownParticipantId).catch(
        () => {
          setPlace(previous);
        },
      );
    }
  }, [ownStatus, myVote?.candidateId, ownParticipantId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="relative overflow-hidden rounded-2xl border border-ink/15 bg-elev p-4">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-social" />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold tracking-tight text-ink">¿A dónde vamos?</h2>
        <span className={`text-xs font-semibold ${outcome.status === "tie" ? "text-wait" : "text-cancha"}`}>
          {getMatchStatusLabel(outcome.status)}
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {tally.map((entry) => {
          const isMatch = matchCandidateId !== null && entry.candidateId === matchCandidateId;
          const isLeader = !isMatch && ((outcome.status === "unique_leader" && entry.candidateId === outcome.leaderId) || (outcome.status === "tie" && outcome.tieIds.includes(entry.candidateId)));
          const isTied = outcome.status === "tie" && outcome.tieIds.includes(entry.candidateId);
          const isMine = myVote?.candidateId === entry.candidateId;
          const accent = isMatch ? "border-cancha bg-cancha-soft" : isLeader ? "border-cancha/50 bg-cancha-soft" : "border-ink/15 bg-paper";
          return (
            <li key={entry.candidateId} className={`rounded-xl border p-2.5 ${accent}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">
                    {isMatch ? "🏆 " : ""}
                    {entry.name}
                    {isMine && <span className="ml-1 text-cancha">(tu voto)</span>}
                  </p>
                  <p className="text-xs font-semibold text-ink-soft">
                    {entry.votes} {entry.votes === 1 ? "voto" : "votos"}
                    {isTied ? " · empate" : isLeader ? " · Match actual" : ""}
                  </p>
                </div>
                {canVote && (
                  <button
                    type="button"
                    disabled={isBusy || isMine}
                    onClick={() => void voteFor(entry.candidateId)}
                    aria-pressed={isMine}
                    className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition active:scale-[0.97] disabled:opacity-60 ${
                      isMine
                        ? "border-cancha bg-cancha text-elev"
                        : "border-cancha/40 text-cancha hover:bg-cancha-soft"
                    }`}
                  >
                    {isMine ? "Tu voto" : "Votar"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {canVote && (
        <form
          onSubmit={(formEvent) => void proposePlace(formEvent)}
          noValidate
          className="mt-3 flex gap-2"
        >
          <input
            type="text"
            value={newName}
            onChange={(inputEvent) => {
              setNewName(inputEvent.target.value);
              setError(null);
            }}
            placeholder="Propon un lugar"
            maxLength={60}
            disabled={isBusy || candidates.length >= MAX_PLACE_CANDIDATES}
            className="min-w-0 flex-1 rounded-xl border border-ink/20 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-cancha disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isBusy || candidates.length >= MAX_PLACE_CANDIDATES || newName.trim() === ""}
            className="shrink-0 rounded-xl border border-cancha/40 bg-cancha-soft px-3 py-2 text-sm font-bold text-cancha transition hover:border-cancha active:scale-[0.97] disabled:opacity-50"
          >
            Agregar
          </button>
        </form>
      )}
      {ownStatus !== "going" && isOpen && (
        <p className="mt-2 text-xs text-ink-soft">
          Solo quienes van («Voy») pueden votar lugares en este panorama.
        </p>
      )}
      {error !== null && (
        <p className="mt-2 text-xs font-semibold text-baja" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
