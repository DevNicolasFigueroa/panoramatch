"use client";

/**
 * Hook del estado global de PanoraMatch (listado + panorama activo).
 * Encapsula la sesión del creador, la sincronía con Supabase y todas las
 * acciones del usuario. La lógica de negocio vive en `src/core/` — este
 * hook solo orquesta: valida, actualiza en forma optimista y escribe en la
 * nube; si falla, revierte y muestra un error en español.
 */

import { useCallback, useEffect, useState } from "react";
import type {
  AttendanceStatus,
  CreateEventInput,
  SavedPanorama,
} from "@/core/types";
import { EMPTY_PANORAMA_STORE, type PanoramaStoreState } from "@/core/types";
import {
  createSavedPanorama,
  getActivePanorama,
  isDuplicatePanoramaTitle,
  removeSavedPanorama,
  sortSavedPanoramas,
  upsertPanorama,
} from "@/core/panorama-collection";
import {
  addAttendee,
  createPanoramaEvent,
  isDuplicateAttendeeName,
  setAttendeeStatus,
} from "@/core/quota-manager";
import {
  MAX_PLACE_CANDIDATES,
  addPlaceCandidate as addCorePlaceCandidate,
  canDeclareMatch,
  computeMatchOutcome,
  dropVotesOfVoter,
  removePlaceCandidate as removeCorePlaceCandidate,
  getPlaceRuleErrorMessage,
  normalizePlaceName,
  castPlaceVote as castCorePlaceVote,
  type PlaceCandidate,
  type PlaceVoteRecord,
} from "@/core/place-vote";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import {
  deletePanoramaRow,
  deletePlaceCandidateRow,
  deletePlaceVoteRow,
  fetchCreatorPanoramas,
  fetchPlaceData,
  declareMatchRow,
  insertPanoramaRow,
  insertParticipantRow,
  insertPlaceCandidateRow,
  updateParticipantStatus,
  upsertPlaceVoteRow,
  type ParticipantRow,
} from "@/lib/supabase-panorama-repo";

/** Acciones disponibles para la UI sobre los panoramas. */
export interface PanoramaStoreActions {
  /** Crea un panorama y lo abre. Devuelve false si el título ya existe. */
  createEvent: (input: CreateEventInput) => boolean;
  /** Agrega un amigo al panorama activo; por defecto parte "En duda". Devuelve false si el nombre se repite. */
  addFriend: (name: string, status?: AttendanceStatus) => boolean;
  /** Cambia el estado de un amigo del panorama activo (con ascenso automático de suplentes). */
  changeFriendStatus: (attendeeId: string, status: AttendanceStatus) => void;
  /** Abre un panorama guardado en el panel activo. */
  openPanorama: (panoramaId: string) => void;
  /** Vuelve a la vista de listado sin borrar nada. */
  goToNewForm: () => void;
  /** Elimina un panorama del listado (si era el activo, vuelve al listado). */
  removePanorama: (panoramaId: string) => void;
  /** Agrega un lugar candidato al panorama Social activo. Devuelve false si lo bloquean las reglas. */
  addPlaceCandidate: (name: string) => boolean;
  /** Elimina un candidato sin votos (regla: solo creador, solo 0 votos, abierto). */
  removePlaceCandidate: (candidateId: string) => boolean;
  /** Emite o cambia el voto propio del creador o lo delega en un confirmado que él anotó. */
  castCreatorVote: (candidateId: string, participantId: string | null) => boolean;
  /** Declara el Match con el candidato elegido y cierra la votación definitivamente. */
  declarePlaceMatch: (candidateId: string) => boolean;
}

/** Estado vivo del tablero de lugares del panorama activo (modo Social). */
export interface PlaceVoteState {
  candidates: PlaceCandidate[];
  votes: PlaceVoteRecord[];
  matchCandidateId: string | null;
}

const EMPTY_PLACE_STATE: PlaceVoteState = {
  candidates: [],
  votes: [],
  matchCandidateId: null,
};

export interface PanoramaStore {
  state: PanoramaStoreState;
  /** true mientras se carga la lista desde Supabase. */
  isLoading: boolean;
  /** Último error de sincronía, con texto listo para la UI. */
  lastError: string | null;
  /** Panorama abierto en el panel activo; null = vista de listado. */
  activePanorama: SavedPanorama | null;
  /** Panoramas guardados ya ordenados (fecha próxima primero). */
  savedPanoramas: SavedPanorama[];
  /** Tablero de lugares del panorama activo Social (¿a dónde vamos?). */
  place: PlaceVoteState | null;
  actions: PanoramaStoreActions;
  /** Limpia el mensaje de error visible. */
  dismissError: () => void;
}

/** uuid v4 con respaldo para navegadores sin crypto.randomUUID. */
function newUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "00000000-0000-4000-8000-000000000000".replace(/0/g, (char, index, original) =>
    index >= 20 ? ((Number.parseInt(char, 10) ^ (Date.now() % 9)) & 0xf).toString(10) : char,
  );
}

/** Nombres de lugares normalizados y sin repetidos (máx 10, spec 001). */
function dedupePlaceCandidates(rawNames: string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of rawNames) {
    const normalized = normalizePlaceName(raw);
    if (normalized === "") {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    names.push(normalized);
    if (names.length >= MAX_PLACE_CANDIDATES) {
      break;
    }
  }
  return names;
}

export function usePanoramaStore(userId: string | null): PanoramaStore {
  const [state, setState] = useState<PanoramaStoreState>(EMPTY_PANORAMA_STORE);
  const [isLoading, setIsLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [place, setPlace] = useState<PlaceVoteState | null>(null);

  // Carga inicial: solo los panoramas del creador con sesión.
  useEffect(() => {
    let cancelled = false;
    if (userId === null) {
      setState(EMPTY_PANORAMA_STORE);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const run = async () => {
      try {
        const panoramas = await fetchCreatorPanoramas(
          getSupabaseBrowserClient(),
          userId,
        );
        if (!cancelled) {
          setState({ panoramas, activeId: null });
        }
      } catch {
        if (!cancelled) {
          setLastError("No se pudieron cargar tus panoramas. Revisa tu conexión.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Carga del tablero de lugares del panorama activo (solo Social).
  const activeIdForPlace = getActivePanorama(state)?.id ?? null;
  const activeModeForPlace = getActivePanorama(state)?.event.mode ?? null;
  useEffect(() => {
    if (activeIdForPlace === null || activeModeForPlace !== "social") {
      setPlace(null);
      return;
    }
    let cancelled = false;
    setPlace(null);
    const run = async () => {
      try {
        const data = await fetchPlaceData(getSupabaseBrowserClient(), activeIdForPlace);
        if (!cancelled) {
          setPlace({
            candidates: data.candidates,
            votes: data.votes,
            matchCandidateId: data.matchCandidateId,
          });
        }
      } catch {
        if (!cancelled) {
          setPlace(EMPTY_PLACE_STATE);
          setLastError("No se pudo cargar la votación de lugares. Intenta recargar.");
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeIdForPlace, activeModeForPlace]);

  const createEvent = useCallback(
    (input: CreateEventInput): boolean => {
      if (userId === null) {
        return false;
      }
      // Chequeo síncrono contra el estado actual (los updaters corren en render).
      if (isDuplicatePanoramaTitle(state.panoramas, input.title)) {
        return false;
      }
      const panoramaId = newUuid();
      const saved = createSavedPanorama(createPanoramaEvent(panoramaId, input));
      setState((current) => ({
        panoramas: upsertPanorama(current.panoramas, saved),
        activeId: saved.id,
      }));
      // Candidatos iniciales del modo Social: ids del cliente, vacío es válido.
      const initialCandidates =
        input.mode === "social"
          ? dedupePlaceCandidates(input.placeCandidates ?? [])
          : [];
      void insertPanoramaRow(getSupabaseBrowserClient(), saved, userId)
        .then(() => {
          setLastError(null);
          if (initialCandidates.length > 0) {
            void seedPlaceCandidates(panoramaId, initialCandidates);
          }
        })
        .catch(() => {
          setState((current) => removeSavedPanorama(current, panoramaId));
          setLastError("No se pudo guardar el panorama en la nube. Intenta otra vez.");
        });
      return true;
    },
    [state.panoramas, userId],
  );

  /** Inserta en la nube los candidatos iniciales y muestra el tablero local. */
  const seedPlaceCandidates = useCallback((panoramaId: string, names: string[]) => {
    const candidates: PlaceCandidate[] = names.map((name) => ({
      id: newUuid(),
      name,
    }));
    setPlace({ candidates, votes: [], matchCandidateId: null });
    void Promise.all(
      candidates.map((candidate) =>
        insertPlaceCandidateRow(getSupabaseBrowserClient(), {
          panoramaId,
          name: candidate.name,
          candidateId: candidate.id,
        }),
      ),
    )
      .then(() => setLastError(null))
      .catch(() => {
        setPlace(EMPTY_PLACE_STATE);
        setLastError("No se pudieron guardar los lugares iniciales. Agrégalos en el panel.");
      });
  }, []);

  const addFriend = useCallback(
    (name: string, status: AttendanceStatus = "maybe"): boolean => {
      const active = getActivePanorama(state);
      if (active === null || isDuplicateAttendeeName(active.attendees, name)) {
        return false;
      }
      // Optimista: id nuevo del cliente; la base devuelve el orden canónico.
      const attendees = addAttendee(active.attendees, name, status);
      const created = attendees[attendees.length - 1];
      // Anotado a mano por el creador: en Social su voto se delega al creador.
      const attendee = { ...created, id: newUuid(), creatorAdded: true };
      const panoramaId = active.id;
      setState((current) => ({
        ...current,
        panoramas: current.panoramas.map((panorama) =>
          panorama.id === panoramaId
            ? { ...panorama, attendees: [...panorama.attendees, attendee] }
            : panorama,
        ),
      }));
      void insertParticipantRow(getSupabaseBrowserClient(), {
        panoramaId,
        participantId: attendee.id,
        name,
        status,
      })
        .then((row) => {
          setState((current) => ({
            ...current,
            panoramas: current.panoramas.map((panorama) =>
              panorama.id === panoramaId
                ? {
                    ...panorama,
                    attendees: panorama.attendees.map((item) =>
                      item.id === row.id ? { ...item, confirmedOrder: row.confirmed_order } : item,
                    ),
                  }
                : panorama,
            ),
          }));
        })
        .catch(() => {
          setState((current) => ({
            ...current,
            panoramas: current.panoramas.map((panorama) =>
              panorama.id === panoramaId
                ? {
                    ...panorama,
                    attendees: panorama.attendees.filter((item) => item.id !== attendee.id),
                  }
                : panorama,
            ),
          }));
          setLastError(`No se pudo anotar a ${name}. Intenta otra vez.`);
        });
      return true;
    },
    [state],
  );

  const changeFriendStatus = useCallback(
    (attendeeId: string, status: AttendanceStatus) => {
      const active = getActivePanorama(state);
      const previous = active?.attendees.find((attendee) => attendee.id === attendeeId);
      if (active === null || previous === undefined || previous.status === status) {
        return;
      }
      const panoramaId = active.id;
      // Caso límite 6 (spec 001): quien deja de estar "Voy" retira su voto
      // de lugares al instante (solo aplica en Social).
      const leavesGoing = previous.status === "going" && status !== "going";
      let previousPlace: PlaceVoteState | null = null;
      if (leavesGoing && active.event.mode === "social" && place !== null) {
        previousPlace = place;
        setPlace((current) =>
          current === null
            ? current
            : { ...current, votes: dropVotesOfVoter(current.votes, attendeeId) },
        );
      } else if (leavesGoing && active.event.mode === "social" && place === null) {
        previousPlace = EMPTY_PLACE_STATE;
        setPlace(previousPlace);
      }
      setState((current) => ({
        ...current,
        panoramas: current.panoramas.map((panorama) =>
          panorama.id === panoramaId
            ? { ...panorama, attendees: setAttendeeStatus(panorama.attendees, attendeeId, status) }
            : panorama,
        ),
      }));
      void updateParticipantStatus(getSupabaseBrowserClient(), attendeeId, status)
        .then((row) => {
          reconcileConfirmedOrder(panoramaId, row);
          if (leavesGoing) {
            void deletePlaceVoteRow(getSupabaseBrowserClient(), panoramaId, attendeeId).catch(() => {
              // Remota fallida: se avisa y se revierte el retiro optimista.
              setLastError("No se pudo retirar su voto de lugares. Intenta otra vez.");
              if (previousPlace !== null) {
                setPlace(previousPlace);
              }
            });
          }
        })
        .catch(() => {
          setState((current) => ({
            ...current,
            panoramas: current.panoramas.map((panorama) =>
              panorama.id === panoramaId
                ? {
                    ...panorama,
                    attendees: setAttendeeStatus(panorama.attendees, attendeeId, previous.status),
                  }
                : panorama,
            ),
          }));
          if (previousPlace !== null) {
            setPlace(previousPlace);
          }
          setLastError("No se pudo actualizar el voto. Intenta otra vez.");
        });
    },
    [state, place],
  );

  /** Ajusta confirmedOrder local con el valor canónico que devolvió la base. */
  const reconcileConfirmedOrder = useCallback((panoramaId: string, row: ParticipantRow) => {
    setState((current) => ({
      ...current,
      panoramas: current.panoramas.map((panorama) =>
        panorama.id === panoramaId
          ? {
              ...panorama,
              attendees: panorama.attendees.map((item) =>
                item.id === row.id ? { ...item, confirmedOrder: row.confirmed_order } : item,
              ),
            }
          : panorama,
      ),
    }));
  }, []);

  const openPanorama = useCallback((panoramaId: string) => {
    setState((current) => ({ ...current, activeId: panoramaId }));
  }, []);

  /* ─────────────── ¿A dónde vamos? (creador) ─────────────── */

  const addPlaceCandidate = useCallback(
    (name: string): boolean => {
      const active = getActivePanorama(state);
      if (active === null || active.event.mode !== "social") {
        return false;
      }
      const current = place ?? EMPTY_PLACE_STATE;
      const result = addCorePlaceCandidate(current.candidates, name, newUuid(), current.matchCandidateId);
      if (!result.ok || result.candidates === undefined) {
        setLastError(result.reason !== undefined ? getPlaceRuleErrorMessage(result.reason) : "No se pudo proponer el lugar.");
        return false;
      }
      const candidateId = result.candidates[result.candidates.length - 1].id;
      setPlace({ ...current, candidates: result.candidates });
      void insertPlaceCandidateRow(getSupabaseBrowserClient(), {
        panoramaId: active.id,
        name: normalizePlaceName(name),
        candidateId,
      })
        .then(() => setLastError(null))
        .catch(() => {
          setPlace((currentPlace) =>
            currentPlace === null
              ? currentPlace
              : {
                  ...currentPlace,
                  candidates: currentPlace.candidates.filter((candidate) => candidate.id !== candidateId),
                },
          );
          setLastError("No se pudo guardar el lugar. Intenta otra vez.");
        });
      return true;
    },
    [state, place],
  );

  const removePlaceCandidate = useCallback(
    (candidateId: string): boolean => {
      const active = getActivePanorama(state);
      if (active === null || active.event.mode !== "social") {
        return false;
      }
      const current = place ?? EMPTY_PLACE_STATE;
      const result = removeCorePlaceCandidate(current.candidates, current.votes, candidateId, current.matchCandidateId);
      if (!result.ok || result.candidates === undefined) {
        setLastError(result.reason !== undefined ? getPlaceRuleErrorMessage(result.reason) : "No se pudo eliminar el lugar.");
        return false;
      }
      const previous = current;
      setPlace({ ...current, candidates: result.candidates });
      void deletePlaceCandidateRow(getSupabaseBrowserClient(), candidateId)
        .then(() => setLastError(null))
        .catch(() => {
          setPlace(previous);
          setLastError("No se pudo eliminar el lugar. Intenta otra vez.");
        });
      return true;
    },
    [state, place],
  );

  const castCreatorVote = useCallback(
    (candidateId: string, participantId: string | null): boolean => {
      const active = getActivePanorama(state);
      if (active === null || active.event.mode !== "social") {
        return false;
      }
      const current = place ?? EMPTY_PLACE_STATE;
      const caster =
        participantId === null
          ? { kind: "creator" as const }
          : { kind: "participant" as const, participantId };
      const result = castCorePlaceVote(
        current.candidates,
        current.votes,
        caster,
        "creator",
        candidateId,
        active.attendees,
        current.matchCandidateId,
      );
      if (!result.ok || result.votes === undefined) {
        setLastError(result.reason !== undefined ? getPlaceRuleErrorMessage(result.reason) : "No se pudo registrar el voto.");
        return false;
      }
      const voterRef = participantId === null ? "creator" : participantId;
      const delegated = participantId !== null;
      const previous = current;
      setPlace({ ...current, votes: result.votes });
      void upsertPlaceVoteRow(getSupabaseBrowserClient(), {
        panoramaId: active.id,
        candidateId,
        voterRef,
        delegated,
      })
        .then(() => setLastError(null))
        .catch(() => {
          setPlace(previous);
          setLastError("No se pudo registrar el voto. Intenta otra vez.");
        });
      return true;
    },
    [state, place],
  );

  const declarePlaceMatch = useCallback(
    (candidateId: string): boolean => {
      const active = getActivePanorama(state);
      if (active === null || active.event.mode !== "social") {
        return false;
      }
      const current = place ?? EMPTY_PLACE_STATE;
      const outcome = computeMatchOutcome(current.candidates, current.votes, current.matchCandidateId);
      const canDeclare = canDeclareMatch(outcome);
      // Con empate, la UI obliga a elegir uno de los empatados.
      const isLeaderOrTied =
        outcome.status === "unique_leader"
          ? outcome.leaderId === candidateId
          : outcome.status === "tie"
            ? outcome.tieIds.includes(candidateId)
            : false;
      if (!canDeclare || !isLeaderOrTied) {
        setLastError("Elige el lugar con más votos (o uno de los empatados) para declarar el Match.");
        return false;
      }
      const previous = current;
      setPlace({ ...current, matchCandidateId: candidateId });
      void declareMatchRow(getSupabaseBrowserClient(), active.id, candidateId)
        .then((matchId) => {
          setLastError(null);
          setPlace((currentPlace) =>
            currentPlace === null
              ? currentPlace
              : { ...currentPlace, matchCandidateId: matchId ?? candidateId },
          );
        })
        .catch(() => {
          setPlace(previous);
          setLastError("No se pudo declarar el Match. Intenta otra vez.");
        });
      return true;
    },
    [state, place],
  );

  const goToNewForm = useCallback(() => {
    setState((current) => ({ ...current, activeId: null }));
  }, []);

  const removePanorama = useCallback(
    (panoramaId: string) => {
      const previous = state;
      setState((current) => removeSavedPanorama(current, panoramaId));
      void deletePanoramaRow(getSupabaseBrowserClient(), panoramaId).catch(() => {
        setState(previous);
        setLastError("No se pudo eliminar el panorama. Intenta otra vez.");
      });
    },
    [state],
  );

  const dismissError = useCallback(() => {
    setLastError(null);
  }, []);

  // Derivados puros del core, recalculados con el estado.
  const activePanorama = getActivePanorama(state);
  const savedPanoramas = sortSavedPanoramas(state.panoramas);

  return {
    state,
    isLoading,
    lastError,
    activePanorama,
    savedPanoramas,
    actions: {
      createEvent,
      addFriend,
      changeFriendStatus,
      openPanorama,
      goToNewForm,
      removePanorama,
      addPlaceCandidate,
      removePlaceCandidate,
      castCreatorVote,
      declarePlaceMatch,
    },
    place,
    dismissError,
  };
}
