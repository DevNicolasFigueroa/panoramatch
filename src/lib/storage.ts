/**
 * Persistencia en localStorage bajo la clave 'panoramatch-v1-data'.
 * Diseñada para migrar después a Supabase sin cambiar la interfaz:
 * solo esta capa conoce el medio de almacenamiento.
 *
 * Compatibilidad hacia atrás: los datos en shape legacy V1.0 ({ event,
 * attendees }) se migran en memoria al listado nuevo; los items corruptos
 * se descartan, nunca se tira toda la app.
 */

import {
  EMPTY_PANORAMA_STORE,
  type AttendanceStatus,
  type Attendee,
  type PanoramaEvent,
  type PanoramaStoreState,
  type SavedPanorama,
} from "@/core/types";
import { migrateLegacyStore } from "@/core/panorama-collection";

export const PANORAMATCH_STORAGE_KEY = "panoramatch-v1-data";

/** Guardas mínimas de uso (localStorage no existe fuera del navegador). */
const isBrowser = () => typeof window !== "undefined" && "localStorage" in window;

const ATTENDANCE_STATUSES = new Set<AttendanceStatus>(["going", "maybe", "not_going"]);

/** Validación de un asistente individual (los ítems corruptos se descartan). */
function isAttendeeLike(value: unknown): value is Attendee {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const attendee = value as Partial<Attendee>;
  return (
    typeof attendee.id === "string" &&
    attendee.id !== "" &&
    typeof attendee.name === "string" &&
    attendee.status !== undefined &&
    ATTENDANCE_STATUSES.has(attendee.status) &&
    (typeof attendee.confirmedOrder === "number" || attendee.confirmedOrder === null)
  );
}

/** Validación de un evento individual con todas sus reglas intactas. */
function isPanoramaEventLike(value: unknown): value is PanoramaEvent {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const event = value as Partial<PanoramaEvent>;
  return (
    typeof event.id === "string" &&
    event.id !== "" &&
    typeof event.title === "string" &&
    (event.mode === "social" || event.mode === "colaborativo" || event.mode === "deportivo") &&
    typeof event.startsAt === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(event.startsAt) &&
    (typeof event.maxCapacity === "number" || event.maxCapacity === null) &&
    typeof event.totalCostCLP === "number" &&
    Number.isInteger(event.totalCostCLP) &&
    event.totalCostCLP >= 0
  );
}

/** Validación de una entrada del listado persistente. */
function isSavedPanoramaLike(value: unknown): value is SavedPanorama {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const saved = value as Partial<SavedPanorama>;
  return (
    typeof saved.id === "string" &&
    saved.id !== "" &&
    isPanoramaEventLike(saved.event) &&
    Array.isArray(saved.attendees) &&
    saved.attendees.every(isAttendeeLike)
  );
}

/** Limpia un listado crudo: descarta los ítems que no cumplan el contrato. */
function sanitizePanoramas(list: unknown): SavedPanorama[] {
  return Array.isArray(list) ? list.filter(isSavedPanoramaLike) : [];
}

/** Carga el estado almacenado; si no existe o está corrupto, parte vacío. */
export function loadPanoramaStore(): PanoramaStoreState {
  if (!isBrowser()) {
    return EMPTY_PANORAMA_STORE;
  }
  try {
    const raw = window.localStorage.getItem(PANORAMATCH_STORAGE_KEY);
    if (raw === null) {
      return EMPTY_PANORAMA_STORE;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object") {
      return EMPTY_PANORAMA_STORE;
    }
    const candidate = parsed as Partial<PanoramaStoreState> & Partial<import("@/core/types").LegacyPanoramaStoreShape>;

    // Shape nuevo (V1.1): listado + id activo.
    if (candidate.panoramas !== undefined) {
      const panoramas = sanitizePanoramas(candidate.panoramas);
      const activeId =
        candidate.activeId !== null &&
        typeof candidate.activeId === "string" &&
        panoramas.some((panorama) => panorama.id === candidate.activeId)
          ? candidate.activeId
          : null;
      return { panoramas, activeId };
    }

    // Shape legacy (V1.0): un solo panorama { event, attendees }. Migrar.
    if (
      "event" in candidate &&
      "attendees" in candidate &&
      Array.isArray(candidate.attendees) &&
      candidate.attendees.every(isAttendeeLike) &&
      (candidate.event === null || isPanoramaEventLike(candidate.event))
    ) {
      return migrateLegacyStore({
        event: candidate.event ?? null,
        attendees: candidate.attendees,
      });
    }

    return EMPTY_PANORAMA_STORE;
  } catch {
    // Datos corruptos o bloqueados: mejor empezar limpio que tirar la app.
    return EMPTY_PANORAMA_STORE;
  }
}

/** Guarda el estado completo. Fallos se ignoran en silencio (V1 local). */
export function savePanoramaStore(state: PanoramaStoreState): void {
  if (!isBrowser()) {
    return;
  }
  try {
    window.localStorage.setItem(PANORAMATCH_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Silencio: cuota llena o modo privado. No rompemos la UI.
  }
}
