/**
 * Gestión de cupos, confirmaciones y suplentes del panorama.
 *
 * Reglas de negocio:
 * - Todo invitado agregado parte en "En duda" por defecto.
 * - Los "Voy" son titulares hasta agotar el cupo; los siguientes pasan
 *   automáticamente a la Lista de Espera (Suplentes).
 * - Si un titular deja de ir, el primer suplente sube automáticamente.
 * - El orden de confirmación se guarda con una numeración incremental.
 *
 * Este módulo es puro: sin React, sin DOM y sin dependencias externas.
 */

import type {
  AttendanceStatus,
  Attendee,
  AttendeeClassification,
  PanoramaEvent,
  QuorumStatus,
} from "./types";

/** Semáforo de quórum: definido en `types.ts`, reexportado por compatibilidad. */
export type { QuorumStatus } from "./types";

let attendeeIdSeed = 0;

/** Genera un id único local para un asistente (sin depender de APIs de red/DOM). */
function createAttendeeId(): string {
  attendeeIdSeed += 1;
  return `att-${Date.now().toString(36)}-${attendeeIdSeed}`;
}

/** Normaliza nombres: quita espacios de sobra y colapsa espacios internos. */
export function normalizeAttendeeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** Crea un nuevo asistente; por regla de producto parte siempre "En duda". */
export function createAttendee(
  name: string,
  initialStatus: AttendanceStatus = "maybe",
): Attendee {
  const hasOrder = initialStatus === "going";
  return {
    id: createAttendeeId(),
    name: normalizeAttendeeName(name),
    status: initialStatus,
    confirmedOrder: hasOrder ? 1 : null,
  };
}

/** Detecta si el nombre ya existe en la lista (comparación sin mayúsculas). */
export function isDuplicateAttendeeName(attendees: readonly Attendee[], name: string): boolean {
  const normalized = normalizeAttendeeName(name).toLowerCase();
  if (normalized === "") {
    return false;
  }
  return attendees.some(
    (attendee) => attendee.name.toLowerCase() === normalized,
  );
}

/** Siguiente número de confirmación disponible. */
export function nextConfirmedOrder(attendees: readonly Attendee[]): number {
  const maxOrder = attendees.reduce(
    (max, attendee) => Math.max(max, attendee.confirmedOrder ?? 0),
    0,
  );
  return maxOrder + 1;
}

/** Agrega un asistente nuevo a la lista (por defecto parte "En duda"). */
export function addAttendee(
  attendees: readonly Attendee[],
  name: string,
  initialStatus: AttendanceStatus = "maybe",
): Attendee[] {
  const newAttendee = createAttendee(name, initialStatus);
  if (newAttendee.status === "going") {
    newAttendee.confirmedOrder = nextConfirmedOrder(attendees);
  }
  return [...attendees, newAttendee];
}

/**
 * Cambia el estado de un asistente manteniendo la numeración coherente:
 * - Al pasar a "Voy" se le asigna el siguiente orden activo (queda al final de la fila).
 * - Al dejar de ir, se libera su lugar y los suplentes suben solos al reclasificar.
 */
export function setAttendeeStatus(
  attendees: readonly Attendee[],
  attendeeId: string,
  status: AttendanceStatus,
): Attendee[] {
  return attendees.map((attendee) => {
    if (attendee.id !== attendeeId) {
      return attendee;
    }
    if (attendee.status === status) {
      // Sin cambios: evita re-asignar orden innecesariamente.
      return attendee;
    }
    if (status === "going") {
      return { ...attendee, status, confirmedOrder: nextConfirmedOrder(attendees) };
    }
    return { ...attendee, status, confirmedOrder: null };
  });
}

/**
 * Clasifica los asistentes según el cupo del evento:
 * titulares (primeros "Voy" por orden de confirmación), lista de espera
 * (suplentes) y el resto (en duda / no pueden).
 */
export function classifyAttendees(
  attendees: readonly Attendee[],
  maxCapacity: number | null,
): AttendeeClassification {
  const going = attendees
    .filter((attendee) => attendee.status === "going")
    .sort(
      (a, b) => (a.confirmedOrder ?? Number.MAX_SAFE_INTEGER) - (b.confirmedOrder ?? Number.MAX_SAFE_INTEGER),
    );

  // El "orden real" decide los cupos aunque la numeración tenga huecos
  // (por ejemplo, cuando un titular anterior dejó de ir).
  const titulars = maxCapacity === null ? going : going.slice(0, maxCapacity);
  const waitlist = maxCapacity === null ? [] : going.slice(maxCapacity);

  const maybe = attendees.filter((attendee) => attendee.status === "maybe");
  const declined = attendees.filter((attendee) => attendee.status === "not_going");

  return { titulars, waitlist, maybe, declined };
}

/**
 * Evalúa el Semáforo de Quórum:
 * - pending: nadie ha confirmado aún.
 * - partial: hay confirmados, pero el cupo aún no se llena (solo aplica con cupo).
 * - ready: cupo completo o, en panoramas sin cupo, al menos un confirmado.
 */
export function getQuorumStatus(
  maxCapacity: number | null,
  titularCount: number,
): QuorumStatus {
  if (titularCount <= 0) {
    return "pending";
  }
  if (maxCapacity === null) {
    return "ready";
  }
  return titularCount >= maxCapacity ? "ready" : "partial";
}

/** Helpers de presentación del semáforo (textos de la UI, en español). */
export function getQuorumLabel(status: QuorumStatus, missingCount: number): string {
  switch (status) {
    case "ready":
      return "¡Panorama armado!";
    case "partial":
      return missingCount > 0 ? `En camino — faltan ${missingCount}` : "En camino";
    case "pending":
    default:
      return "En espera de confirmaciones";
  }
}

/** Cuántos confirmados faltan para armar el panorama (0 si ya está armado). */
export function getMissingToQuorum(
  maxCapacity: number | null,
  titularCount: number,
): number {
  if (maxCapacity === null || titularCount >= maxCapacity) {
    return 0;
  }
  return maxCapacity - titularCount;
}

/** Crea el evento desde los datos ya validados del formulario. */
export function createPanoramaEvent(eventId: string, input: import("./types").CreateEventInput): PanoramaEvent {
  return {
    id: eventId,
    title: input.title.trim().replace(/\s+/g, " "),
    mode: input.mode,
    startsAt: input.startsAt,
    maxCapacity: input.maxCapacity,
    totalCostCLP: input.totalCostCLP,
  };
}
