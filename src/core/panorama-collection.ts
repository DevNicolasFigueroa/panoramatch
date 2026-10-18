/**
 * Gestión del listado de panoramas guardados ("Mis Panoramas"):
 * alta/baja por id, título no duplicado, orden por fecha, resumen de tarjeta
 * y migración del shape legacy de la V1.0.
 *
 * Reglas respetadas: nada de fechas UTC (solo comparación lexicográfica del
 * formato local 'YYYY-MM-DDTHH:mm') y montos CLP enteros mediante funciones
 * ya probadas de `currency-clp.ts`.
 *
 * Este módulo es puro: sin React, sin DOM y sin dependencias externas.
 */

import type {
  LegacyPanoramaStoreShape,
  PanoramaEvent,
  PanoramaStoreState,
  SavedPanorama,
  SavedPanoramaSummary,
} from "./types";
import {
  classifyAttendees,
  getMissingToQuorum,
  getQuorumLabel,
  getQuorumStatus,
} from "./quota-manager";
import { formatCLP } from "./currency-clp";
import { formatPanoramaStartsAt } from "./datetime-cl";
import { withCreatorAttendee } from "./creator-attendee";

/** Normaliza títulos igual que los nombres: trims y espacios colapsados. */
export function normalizePanoramaTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

/**
 * Detecta si ya existe otro panorama con el mismo título (sin mayúsculas ni
 * espacios de diferencia). `excludeId` permite ignorar el propio panorama
 * al validar una edición futura.
 */
export function isDuplicatePanoramaTitle(
  panoramas: readonly SavedPanorama[],
  title: string,
  excludeId?: string,
): boolean {
  const normalized = normalizePanoramaTitle(title).toLowerCase();
  if (normalized === "") {
    return false;
  }
  return panoramas.some(
    (panorama) =>
      panorama.id !== excludeId &&
      normalizePanoramaTitle(panorama.event.title).toLowerCase() === normalized,
  );
}

/** Envuelve el evento ya construido como entrada del listado (con asistentes vacíos). */
export function createSavedPanorama(event: PanoramaEvent): SavedPanorama {
  return { id: event.id, event, attendees: [] };
}

/**
 * Inserta o reemplaza por id. Defensivo: un `SavedPanorama` sin id válido
 * nunca entra al listado (los ids siempre nacen junto al evento).
 */
export function upsertPanorama(
  panoramas: readonly SavedPanorama[],
  saved: SavedPanorama,
): SavedPanorama[] {
  if (saved.id === "") {
    return [...panoramas];
  }
  const exists = panoramas.some((panorama) => panorama.id === saved.id);
  return exists
    ? panoramas.map((panorama) => (panorama.id === saved.id ? saved : panorama))
    : [...panoramas, saved];
}

/**
 * Elimina un panorama del listado; si era el activo, `activeId` pasa a null.
 */
export function removeSavedPanorama(
  state: PanoramaStoreState,
  panoramaId: string,
): PanoramaStoreState {
  return {
    panoramas: state.panoramas.filter((panorama) => panorama.id !== panoramaId),
    activeId: state.activeId === panoramaId ? null : state.activeId,
  };
}

/** Panorama abierto en el panel activo, o null si no existe/hay ninguno. */
export function getActivePanorama(state: PanoramaStoreState): SavedPanorama | null {
  return state.panoramas.find((panorama) => panorama.id === state.activeId) ?? null;
}

/**
 * Orden del listado: por fecha del evento más próxima primero (los pasados
 * quedan al inicio). Comparación lexicográfica del formato local, sin Date
 * ni UTC. Empate: título alfabético en español.
 */
export function sortSavedPanoramas(
  panoramas: readonly SavedPanorama[],
): SavedPanorama[] {
  return [...panoramas].sort((a, b) => {
    const byDate = a.event.startsAt.localeCompare(b.event.startsAt);
    if (byDate !== 0) {
      return byDate;
    }
    return a.event.title.localeCompare(b.event.title, "es");
  });
}

/** Resumen derivado para la tarjeta: quórum, cupo y costo, en formato CLP. */
export function buildSavedSummary(saved: SavedPanorama): SavedPanoramaSummary {
  const { event, attendees } = saved;
  // «Van» incluye al organizador (es «Voy» implícito); el quórum del
  // semáforo sigue midiendo solo a los invitados.
  const compositeAttendees = withCreatorAttendee(attendees, event.creatorName);
  const titularCount = classifyAttendees(compositeAttendees, event.maxCapacity).titulars.length;
  const guestsTitularCount = classifyAttendees(attendees, event.maxCapacity).titulars.length;
  const quorum = getQuorumStatus(event.maxCapacity, guestsTitularCount);
  const missingCount = getMissingToQuorum(event.maxCapacity, guestsTitularCount);
  return {
    id: saved.id,
    title: event.title,
    mode: event.mode,
    formattedDate: formatPanoramaStartsAt(event.startsAt),
    quorum,
    quorumLabel: getQuorumLabel(quorum, missingCount),
    titularCount,
    maxCapacity: event.maxCapacity,
    totalCostCLP: event.totalCostCLP,
  };
}

/**
 * Migra el shape legacy V1.0 ({ event, attendees }) al listado nuevo.
 * Abre el panorama antiguo como activo para que quien ya tenía datos
 * vea la misma pantalla que antes. Nada se descarta.
 */
export function migrateLegacyStore(legacy: LegacyPanoramaStoreShape): PanoramaStoreState {
  if (legacy.event === null || legacy.event.id === "") {
    return { panoramas: [], activeId: null };
  }
  const migrated: SavedPanorama = {
    id: legacy.event.id,
    event: legacy.event,
    attendees: legacy.attendees,
  };
  return { panoramas: [migrated], activeId: migrated.id };
}
