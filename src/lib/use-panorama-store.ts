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
import { withCreatorAttendee } from "@/core/creator-attendee";
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
import {
  CREATOR_CLAIM_REF,
  MAX_CONTRIBUTION_ITEMS,
  MAX_CONTRIBUTION_NAME_LENGTH,
  addContributionItem as addCoreContributionItem,
  claimContributionItem as claimCoreContributionItem,
  dropContributionClaims,
  getContributionRuleErrorMessage,
  normalizeContributionName,
  releaseContributionItem as releaseCoreContributionItem,
  removeContributionItem as removeCoreContributionItem,
  type ContributionItem,
} from "@/core/contribution-list";
import {
  buildTitularPlayers,
  claimVacancyOnPromotion,
  createEmptyTeamsState,
  drawTeams as drawCoreTeams,
  dropPlayerFromTeams,
  getTeamOrganizerErrorMessage,
  movePlayer as moveCorePlayer,
  renameTeam as renameCoreTeam,
  type TeamPlayer,
  type TeamSide,
  type TeamsState,
} from "@/core/team-organizer";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import {
  deletePanoramaRow,
  deleteChecklistItemRow,
  deletePlaceCandidateRow,
  deletePlaceVoteRow,
  fetchChecklistItems,
  ensureOwnProfileRow,
  fetchCreatorPanoramas,
  fetchPlaceData,
  fetchTeamsData,
  releaseTeamSeatRow,
  claimTeamVacancyRow,
  removeTeamMemberRow,
  updateTeamNameRow,
  upsertTeamDrawRows,
  upsertTeamMemberRow,
  declareMatchRow,
  insertChecklistItemRow,
  insertPanoramaRow,
  insertParticipantRow,
  insertPlaceCandidateRow,
  releaseChecklistClaimsOfRow,
  releaseChecklistItemRow,
  claimChecklistItemRow,
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
  /** Agrega un ítem a la Lista de aportes (Colaborativo). Devuelve false si lo bloquean las reglas. */
  addChecklistItem: (name: string) => boolean;
  /** Elimina un ítem libre de la Lista de aportes (solo creador). Devuelve false si lo bloquean las reglas. */
  removeChecklistItem: (itemId: string) => boolean;
  /** El creador toma un ítem libre («Yo lo llevo»). Devuelve false si lo bloquean las reglas. */
  claimCreatorChecklistItem: (itemId: string) => boolean;
  /** El creador libera un ítem que él lleva. Devuelve false si lo bloquean las reglas. */
  releaseCreatorChecklistItem: (itemId: string) => boolean;
  /** Sorteo equilibrado (Deportivo): reparte solo los titulares sin equipo. Devuelve false si lo bloquean las reglas. */
  drawTeams: () => boolean;
  /** Mueve un titular de equipo el creador; `null` lo deja «sin equipo». */
  moveTeamPlayer: (playerRef: string, target: TeamSide | null) => boolean;
  /** Renombra un equipo (creador, ≤30 caracteres, único). Devuelve false si lo bloquean las reglas. */
  renameTeam: (side: TeamSide, rawName: string) => boolean;
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

const EMPTY_CONTRIBUTIONS: ContributionItem[] = [];

const EMPTY_TEAMS: TeamsState = createEmptyTeamsState();

/** Titulares reales del panorama activo (con el organizador virtual n.º 0). */
function titularPlayersOf(active: SavedPanorama): TeamPlayer[] {
  return buildTitularPlayers(
    withCreatorAttendee(active.attendees, active.event.creatorName),
    active.event.maxCapacity,
  );
}

/** Semilla del sorteo: la genera la orquestación en el toque; el núcleo la recibe. */
function createDrawSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

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
  /** Lista de aportes del panorama activo Colaborativo; null mientras carga. */
  checklist: ContributionItem[] | null;
  /** Estado de equipos del panorama activo Deportivo; null mientras carga u otro modo. */
  teams: TeamsState | null;
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

/** Textos de ítems normalizados y sin repetidos (máx 10, spec 002). */
function dedupeChecklistItems(rawNames: string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of rawNames) {
    const normalized = normalizeContributionName(raw);
    if (normalized === "" || normalized.length > MAX_CONTRIBUTION_NAME_LENGTH) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    names.push(normalized);
    if (names.length >= MAX_CONTRIBUTION_ITEMS) {
      break;
    }
  }
  return names;
}

export function usePanoramaStore(
  userId: string | null,
  /** Nombre de Google del creador, para persistirlo al crear. */
  creatorDisplayName: string | null = null,
): PanoramaStore {
  const [state, setState] = useState<PanoramaStoreState>(EMPTY_PANORAMA_STORE);
  const [isLoading, setIsLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [place, setPlace] = useState<PlaceVoteState | null>(null);
  const [checklist, setChecklist] = useState<ContributionItem[] | null>(null);
  const [teams, setTeams] = useState<TeamsState | null>(null);

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
        // Auto-reparación: si el trigger `on_auth_user_created` no logró crear
        // el perfil (carrera/limpieza de usuarios), el primer guardado de un
        // panorama moriría en el FK `panoramas_creator_id_fkey`. La política
        // `profiles_insert_own` permite al cliente crear su fila aquí.
        await ensureOwnProfileRow(
          getSupabaseBrowserClient(),
          userId,
          creatorDisplayName ?? undefined,
        );
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

  // Carga de la Lista de aportes del panorama activo (solo Colaborativo).
  const activeIdForChecklist = getActivePanorama(state)?.id ?? null;
  const activeModeForChecklist = getActivePanorama(state)?.event.mode ?? null;
  useEffect(() => {
    if (activeIdForChecklist === null || activeModeForChecklist !== "colaborativo") {
      setChecklist(null);
      return;
    }
    let cancelled = false;
    setChecklist(null);
    const run = async () => {
      try {
        const items = await fetchChecklistItems(getSupabaseBrowserClient(), activeIdForChecklist);
        if (!cancelled) {
          setChecklist(items);
        }
      } catch {
        if (!cancelled) {
          setChecklist(EMPTY_CONTRIBUTIONS);
          setLastError("No se pudo cargar la lista de aportes. Intenta recargar.");
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeIdForChecklist, activeModeForChecklist]);

  // Carga de equipos del panorama activo (solo Deportivo).
  const activeIdForTeams = getActivePanorama(state)?.id ?? null;
  const activeModeForTeams = getActivePanorama(state)?.event.mode ?? null;
  useEffect(() => {
    if (activeIdForTeams === null || activeModeForTeams !== "deportivo") {
      setTeams(null);
      return;
    }
    let cancelled = false;
    setTeams(null);
    const run = async () => {
      try {
        const data = await fetchTeamsData(getSupabaseBrowserClient(), activeIdForTeams);
        if (!cancelled) {
          setTeams({
            teamAName: data.teamAName,
            teamBName: data.teamBName,
            assignments: data.assignments,
            vacancies: data.vacancies,
          });
        }
      } catch {
        if (!cancelled) {
          setTeams(EMPTY_TEAMS);
          setLastError("No se pudo cargar el reparto de equipos. Intenta recargar.");
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeIdForTeams, activeModeForTeams]);

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
      const saved = createSavedPanorama(
        createPanoramaEvent(panoramaId, { ...input, creatorName: creatorDisplayName }),
      );
      setState((current) => ({
        panoramas: upsertPanorama(current.panoramas, saved),
        activeId: saved.id,
      }));
      // Candidatos iniciales del modo Social: ids del cliente, vacío es válido.
      const initialCandidates =
        input.mode === "social"
          ? dedupePlaceCandidates(input.placeCandidates ?? [])
          : [];
      // Ítems iniciales de la Lista de aportes (modo Colaborativo).
      const initialItems =
        input.mode === "colaborativo"
          ? dedupeChecklistItems(input.checklistItems ?? [])
          : [];
      void insertPanoramaRow(getSupabaseBrowserClient(), saved, userId)
        .then(() => {
          setLastError(null);
          if (initialCandidates.length > 0) {
            void seedPlaceCandidates(panoramaId, initialCandidates);
          }
          if (initialItems.length > 0) {
            void seedChecklistItems(panoramaId, initialItems);
          }
        })
        .catch(() => {
          setState((current) => removeSavedPanorama(current, panoramaId));
          setLastError("No se pudo guardar el panorama en la nube. Intenta otra vez.");
        });
      return true;
    },
    [state.panoramas, userId, creatorDisplayName],  );

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

  /** Inserta en la nube los ítems iniciales y muestra la lista local. */
  const seedChecklistItems = useCallback((panoramaId: string, names: string[]) => {
    const items: ContributionItem[] = names.map((name) => ({
      id: newUuid(),
      name,
      claimedByRef: null,
    }));
    setChecklist(items);
    void Promise.all(
      items.map((item) =>
        insertChecklistItemRow(getSupabaseBrowserClient(), {
          panoramaId,
          name: item.name,
          itemId: item.id,
        }),
      ),
    )
      .then(() => setLastError(null))
      .catch(() => {
        setChecklist(EMPTY_CONTRIBUTIONS);
        setLastError("No se pudieron guardar los ítems iniciales. Agrégalos en el panel.");
      });
  }, []);

  const addFriend = useCallback(
    (name: string, status: AttendanceStatus = "maybe"): boolean => {
      const active = getActivePanorama(state);
      if (active === null) {
        return false;
      }
      // Lista compuesta: el nombre del organizador también está reservado.
      if (isDuplicateAttendeeName(withCreatorAttendee(active.attendees, active.event.creatorName), name)) {
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
      // Espejo Colaborativo (RF-3): quien deja de ser «Voy» libera sus ítems
      // de la lista de aportes en el mismo flujo.
      let previousChecklist: ContributionItem[] | null = null;
      if (leavesGoing && active.event.mode === "colaborativo" && checklist !== null) {
        previousChecklist = checklist;
        setChecklist(dropContributionClaims(checklist, attendeeId));
      }
      // Espejo Deportivo (RF-7/RF-8): al bajar, su asiento queda vacante;
      // al subir un suplente, hereda la vacante más antigua (o «sin equipo»).
      const risesToGoing = status === "going" && previous.status !== "going";
      let previousTeams: TeamsState | null = null;
      if (active.event.mode === "deportivo" && teams !== null && (leavesGoing || risesToGoing)) {
        previousTeams = teams;
        if (leavesGoing) {
          setTeams(dropPlayerFromTeams(teams, attendeeId));
        } else {
          // Titulares de la reclasificación PROSPECTIVA: el jugador ya es «Voy».
          const prospectiveTitulars = titularPlayersOf({
            ...active,
            attendees: setAttendeeStatus(active.attendees, attendeeId, status),
          });
          setTeams(claimVacancyOnPromotion(teams, attendeeId, prospectiveTitulars).teams);
        }
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
            // Colaborativo: liberar en la base los ítems que él llevaba.
            if (active.event.mode === "colaborativo") {
              void releaseChecklistClaimsOfRow(getSupabaseBrowserClient(), panoramaId, attendeeId).catch(() => {
                setLastError("No se pudieron liberar sus ítems de la lista. Intenta otra vez.");
                if (previousChecklist !== null) {
                  setChecklist(previousChecklist);
                }
              });
            }
            // Deportivo: su asiento de equipo queda VACANTE en el servidor.
            if (active.event.mode === "deportivo") {
              void releaseTeamSeatRow(getSupabaseBrowserClient(), { panoramaId, playerRef: attendeeId })
                .then(() => setLastError(null))
                .catch(() => {
                  setLastError("No se pudo dejar vacante su asiento de equipo. Intenta otra vez.");
                  if (previousTeams !== null) {
                    setTeams(previousTeams);
                  }
                });
            }
          } else if (active.event.mode === "deportivo" && risesToGoing) {
            // Deportivo: el titular nuevo hereda la vacante FIFO en el servidor;
            // si la base eligió otra vacante (carrera), la nube manda.
            void claimTeamVacancyRow(getSupabaseBrowserClient(), { panoramaId, playerRef: attendeeId })
              .then((inheritedSide) => {
                setLastError(null);
                void fetchTeamsData(getSupabaseBrowserClient(), panoramaId)
                  .then((fresh) => {
                    setTeams({
                      teamAName: fresh.teamAName,
                      teamBName: fresh.teamBName,
                      assignments: fresh.assignments,
                      vacancies: fresh.vacancies,
                    });
                  })
                  .catch(() => {
                    /* La herencia ya está aplicada en la base; el desacuerdo local se resuelve al recargar. */
                    if (inheritedSide !== null) {
                      setLastError("No se pudo sincronizar el reparto de equipos. Recarga la página.");
                    }
                  });
              })
              .catch(() => {
                setLastError("No se pudo heredar el asiento de equipo. Intenta otra vez.");
                if (previousTeams !== null) {
                  setTeams(previousTeams);
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
    [state, place, checklist, teams],
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

  /* ─────────────── Lista de aportes (creador, Colaborativo) ─────────────── */

  const addChecklistItem = useCallback(
    (name: string): boolean => {
      const active = getActivePanorama(state);
      if (active === null || active.event.mode !== "colaborativo") {
        return false;
      }
      const current = checklist ?? EMPTY_CONTRIBUTIONS;
      const result = addCoreContributionItem(
        current,
        name,
        newUuid(),
        { kind: "creator" },
        active.attendees,
        active.event.maxCapacity,
      );
      if (!result.ok || result.items === undefined) {
        setLastError(result.reason !== undefined ? getContributionRuleErrorMessage(result.reason) : "No se pudo agregar el ítem.");
        return false;
      }
      const created = result.items[result.items.length - 1];
      const previous = current;
      setChecklist(result.items);
      void insertChecklistItemRow(getSupabaseBrowserClient(), {
        panoramaId: active.id,
        name: created.name,
        itemId: created.id,
      })
        .then(() => setLastError(null))
        .catch(() => {
          setChecklist(previous);
          setLastError("No se pudo guardar el ítem. Intenta otra vez.");
        });
      return true;
    },
    [state, checklist],
  );

  const removeChecklistItem = useCallback(
    (itemId: string): boolean => {
      const active = getActivePanorama(state);
      if (active === null || active.event.mode !== "colaborativo") {
        return false;
      }
      const current = checklist ?? EMPTY_CONTRIBUTIONS;
      const result = removeCoreContributionItem(current, itemId, { kind: "creator" }, active.attendees, active.event.maxCapacity);
      if (!result.ok || result.items === undefined) {
        setLastError(result.reason !== undefined ? getContributionRuleErrorMessage(result.reason) : "No se pudo eliminar el ítem.");
        return false;
      }
      const previous = current;
      setChecklist(result.items);
      void deleteChecklistItemRow(getSupabaseBrowserClient(), itemId)
        .then(() => setLastError(null))
        .catch(() => {
          setChecklist(previous);
          setLastError("No se pudo eliminar el ítem. Intenta otra vez.");
        });
      return true;
    },
    [state, checklist],
  );

  const claimCreatorChecklistItem = useCallback(
    (itemId: string): boolean => {
      const active = getActivePanorama(state);
      if (active === null || active.event.mode !== "colaborativo") {
        return false;
      }
      const current = checklist ?? EMPTY_CONTRIBUTIONS;
      const result = claimCoreContributionItem(current, itemId, { kind: "creator" }, active.attendees, active.event.maxCapacity);
      if (!result.ok || result.items === undefined) {
        setLastError(result.reason !== undefined ? getContributionRuleErrorMessage(result.reason) : "No se pudo tomar el ítem.");
        return false;
      }
      const previous = current;
      setChecklist(result.items);
      void claimChecklistItemRow(getSupabaseBrowserClient(), {
        itemId,
        claimedByRef: CREATOR_CLAIM_REF,
      })
        .then(() => setLastError(null))
        .catch(() => {
          setChecklist(previous);
          setLastError("No se pudo registrar tu ítem. Intenta otra vez.");
        });
      return true;
    },
    [state, checklist],
  );

  const releaseCreatorChecklistItem = useCallback(
    (itemId: string): boolean => {
      const active = getActivePanorama(state);
      if (active === null || active.event.mode !== "colaborativo") {
        return false;
      }
      const current = checklist ?? EMPTY_CONTRIBUTIONS;
      const result = releaseCoreContributionItem(current, itemId, { kind: "creator" }, active.attendees, active.event.maxCapacity);
      if (!result.ok || result.items === undefined) {
        setLastError(result.reason !== undefined ? getContributionRuleErrorMessage(result.reason) : "No se pudo liberar el ítem.");
        return false;
      }
      const previous = current;
      setChecklist(result.items);
      void releaseChecklistItemRow(getSupabaseBrowserClient(), itemId, CREATOR_CLAIM_REF)
        .then(() => setLastError(null))
        .catch(() => {
          setChecklist(previous);
          setLastError("No se pudo liberar el ítem. Intenta otra vez.");
        });
      return true;
    },
    [state, checklist],
  );

  /* ─────────────── Organizador de equipos (creador, Deportivo) ─────────────── */

  const drawTeams = useCallback((): boolean => {
    const active = getActivePanorama(state);
    if (active === null || active.event.mode !== "deportivo") {
      return false;
    }
    const current = teams ?? EMPTY_TEAMS;
    const result = drawCoreTeams(current, titularPlayersOf(active), createDrawSeed());
    if (!result.ok || result.teams === undefined) {
      setLastError(
        result.reason !== undefined
          ? getTeamOrganizerErrorMessage(result.reason)
          : "No se pudo sortear los equipos.",
      );
      return false;
    }
    const previous = current;
    setTeams(result.teams);
    void upsertTeamDrawRows(getSupabaseBrowserClient(), result.drawn ?? [], active.id)
      .then(() => setLastError(null))
      .catch(() => {
        setTeams(previous);
        setLastError("No se pudo guardar el sorteo. Intenta otra vez.");
      });
    return true;
  }, [state, teams]);

  const moveTeamPlayer = useCallback(
    (playerRef: string, target: TeamSide | null): boolean => {
      const active = getActivePanorama(state);
      if (active === null || active.event.mode !== "deportivo") {
        return false;
      }
      const current = teams ?? EMPTY_TEAMS;
      const result = moveCorePlayer(current, playerRef, target, titularPlayersOf(active));
      if (!result.ok || result.teams === undefined) {
        setLastError(
          result.reason !== undefined
            ? getTeamOrganizerErrorMessage(result.reason)
            : "No se pudo mover al jugador.",
        );
        return false;
      }
      const previous = current;
      setTeams(result.teams);
      void (target === null
        ? removeTeamMemberRow(getSupabaseBrowserClient(), active.id, playerRef)
        : upsertTeamMemberRow(getSupabaseBrowserClient(), {
            panoramaId: active.id,
            team: target,
            playerRef,
          })
      )
        .then(() => setLastError(null))
        .catch(() => {
          setTeams(previous);
          setLastError("No se pudo guardar el cambio de equipo. Intenta otra vez.");
        });
      return true;
    },
    [state, teams],
  );

  const renameTeamAction = useCallback(
    (side: TeamSide, rawName: string): boolean => {
      const active = getActivePanorama(state);
      if (active === null || active.event.mode !== "deportivo") {
        return false;
      }
      const current = teams ?? EMPTY_TEAMS;
      const result = renameCoreTeam(current, side, rawName);
      if (!result.ok || result.teams === undefined) {
        setLastError(
          result.reason !== undefined
            ? getTeamOrganizerErrorMessage(result.reason)
            : "No se pudo renombrar el equipo.",
        );
        return false;
      }
      const previous = current;
      setTeams(result.teams);
      // El núcleo normalizó el nombre: eso mismo es lo que queda en la base.
      void updateTeamNameRow(
        getSupabaseBrowserClient(),
        active.id,
        side,
        (side === "a" ? result.teams.teamAName : result.teams.teamBName) ?? null,
      )
        .then(() => setLastError(null))
        .catch(() => {
          setTeams(previous);
          setLastError("No se pudo guardar el nombre del equipo. Intenta otra vez.");
        });
      return true;
    },
    [state, teams],
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
      addChecklistItem,
      removeChecklistItem,
      claimCreatorChecklistItem,
      releaseCreatorChecklistItem,
      drawTeams,
      moveTeamPlayer,
      renameTeam: renameTeamAction,
    },
    place,
    checklist,
    teams,
    dismissError,
  };
}
