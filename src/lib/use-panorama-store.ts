"use client";

/**
 * Hook del estado global de PanoraMatch (listado + panorama activo).
 * Encapsula la hidratación desde el navegador, la persistencia y todas las
 * acciones del usuario. La lógica de negocio vive en `src/core/` —
 * este hook solo orquesta: valida flujos, llama core y persiste.
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
import { loadPanoramaStore, savePanoramaStore } from "@/lib/storage";

/** Acciones disponibles para la UI sobre los panoramas. */
export interface PanoramaStoreActions {
  /** Crea un panorama, lo agrega al listado y lo abre. Devuelve false si el título ya existe. */
  createEvent: (input: CreateEventInput) => boolean;
  /** Agrega un amigo al panorama activo; por defecto parte "En duda". Devuelve false si el nombre se repite. */
  addFriend: (name: string, status?: AttendanceStatus) => boolean;
  /** Cambia el estado de un amigo del panorama activo (con ascenso automático de suplentes). */
  changeFriendStatus: (attendeeId: string, status: AttendanceStatus) => void;
  /** Abre un panorama guardado en el panel activo. */
  openPanorama: (panoramaId: string) => void;
  /** Vuelve a la vista de creación/listado sin borrar nada. */
  goToNewForm: () => void;
  /** Elimina un panorama del listado (si era el activo, vuelve al listado). */
  removePanorama: (panoramaId: string) => void;
}

export interface PanoramaStore {
  state: PanoramaStoreState;
  /** true cuando ya se leyó localStorage en el navegador. */
  isHydrated: boolean;
  /** Panorama abierto en el panel activo; null = vista de creación/listado. */
  activePanorama: SavedPanorama | null;
  /** Panoramas guardados ya ordenados para el listado (fecha próxima primero). */
  savedPanoramas: SavedPanorama[];
  actions: PanoramaStoreActions;
}

let eventIdSeed = 0;

export function usePanoramaStore(): PanoramaStore {
  const [state, setState] = useState<PanoramaStoreState>(EMPTY_PANORAMA_STORE);
  const [isHydrated, setIsHydrated] = useState(false);

  // Carga inicial desde localStorage (solo en el navegador, tras el montaje).
  useEffect(() => {
    setState(loadPanoramaStore());
    setIsHydrated(true);
  }, []);

  // Persistencia: recién cuando la app está hidratada evitamos pisar datos viejos.
  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    savePanoramaStore(state);
  }, [state, isHydrated]);

  const createEvent = useCallback(
    (input: CreateEventInput): boolean => {
      // Chequeo síncrono contra el estado actual (los updaters corren en render).
      if (isDuplicatePanoramaTitle(state.panoramas, input.title)) {
        return false;
      }
      eventIdSeed += 1;
      const eventId = `pano-${Date.now().toString(36)}-${eventIdSeed}`;
      const saved = createSavedPanorama(createPanoramaEvent(eventId, input));
      setState((current) => ({
        panoramas: upsertPanorama(current.panoramas, saved),
        activeId: saved.id,
      }));
      return true;
    },
    [state.panoramas],
  );

  const addFriend = useCallback(
    (name: string, status: AttendanceStatus = "maybe"): boolean => {
      const active = getActivePanorama(state);
      if (active === null || isDuplicateAttendeeName(active.attendees, name)) {
        return false;
      }
      setState((current) => ({
        ...current,
        panoramas: current.panoramas.map((panorama) =>
          panorama.id === current.activeId
            ? { ...panorama, attendees: addAttendee(panorama.attendees, name, status) }
            : panorama,
        ),
      }));
      return true;
    },
    [state],
  );

  const changeFriendStatus = useCallback(
    (attendeeId: string, status: AttendanceStatus) => {
      setState((current) => ({
        ...current,
        panoramas: current.panoramas.map((panorama) =>
          panorama.id === current.activeId
            ? { ...panorama, attendees: setAttendeeStatus(panorama.attendees, attendeeId, status) }
            : panorama,
        ),
      }));
    },
    [],
  );

  const openPanorama = useCallback((panoramaId: string) => {
    setState((current) => ({ ...current, activeId: panoramaId }));
  }, []);

  const goToNewForm = useCallback(() => {
    setState((current) => ({ ...current, activeId: null }));
  }, []);

  const removePanorama = useCallback((panoramaId: string) => {
    setState((current) => removeSavedPanorama(current, panoramaId));
  }, []);

  // Derivados puros del core, recalculados con el estado.
  const activePanorama = getActivePanorama(state);
  const savedPanoramas = sortSavedPanoramas(state.panoramas);

  return {
    state,
    isHydrated,
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
  };
}
