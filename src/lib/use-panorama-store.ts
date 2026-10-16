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
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import {
  deletePanoramaRow,
  fetchCreatorPanoramas,
  insertPanoramaRow,
  insertParticipantRow,
  updateParticipantStatus,
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

export function usePanoramaStore(userId: string | null): PanoramaStore {
  const [state, setState] = useState<PanoramaStoreState>(EMPTY_PANORAMA_STORE);
  const [isLoading, setIsLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

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
      void insertPanoramaRow(getSupabaseBrowserClient(), saved, userId)
        .then(() => setLastError(null))
        .catch(() => {
          setState((current) => removeSavedPanorama(current, panoramaId));
          setLastError("No se pudo guardar el panorama en la nube. Intenta otra vez.");
        });
      return true;
    },
    [state.panoramas, userId],
  );

  const addFriend = useCallback(
    (name: string, status: AttendanceStatus = "maybe"): boolean => {
      const active = getActivePanorama(state);
      if (active === null || isDuplicateAttendeeName(active.attendees, name)) {
        return false;
      }
      // Optimista: id nuevo del cliente; la base devuelve el orden canónico.
      const attendees = addAttendee(active.attendees, name, status);
      const created = attendees[attendees.length - 1];
      const attendee = { ...created, id: newUuid() };
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
      setState((current) => ({
        ...current,
        panoramas: current.panoramas.map((panorama) =>
          panorama.id === panoramaId
            ? { ...panorama, attendees: setAttendeeStatus(panorama.attendees, attendeeId, status) }
            : panorama,
        ),
      }));
      void updateParticipantStatus(getSupabaseBrowserClient(), attendeeId, status)
        .then((row) => reconcileConfirmedOrder(panoramaId, row))
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
          setLastError("No se pudo actualizar el voto. Intenta otra vez.");
        });
    },
    [state],
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
    },
    dismissError,
  };
}
