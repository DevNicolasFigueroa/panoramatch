/**
 * Reglas de participación para invitados externos (enlace compartido).
 *
 * Producto: el invitado no crea cuenta. Abre el enlace `/p/<panorama_id>`,
 * escribe su nombre y marca Voy / En duda / No puedo. Su identidad en el
 * dispositivo vive en localStorage (`guest-identity.ts`); la base de datos
 * solo lo vincula mientras se envíe su secreto en el header.
 *
 * Este módulo es puro: sin React, sin DOM, sin red y sin Supabase.
 */

import type {
  AttendanceStatus,
  Attendee,
  PanoramaEvent,
  SavedPanorama,
} from "./types";
import {
  isDuplicateAttendeeName,
  normalizeAttendeeName,
} from "./quota-manager";

/** El secreto del invitado es un uuid v4, aquí se valida por forma. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validación barata de un id de panorama antes de llamar a la base. */
export function isPanoramaIdLike(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Validación barata de un secreto de invitado. */
export function isGuestSecretLike(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Motivos de rechazo al unirse o votar (textos de la UI, en español). */
export type GuestParticipationError =
  | "empty_name"
  | "duplicate_name"
  | "invalid_name";

/** Mensaje legible por motivo. */
export function getGuestParticipationErrorMessage(error: GuestParticipationError): string {
  switch (error) {
    case "empty_name":
      return "Primero escribe tu nombre.";
    case "duplicate_name":
      return "Ese nombre ya está anotado en este panorama.";
    case "invalid_name":
    default:
      return "El nombre no es válido.";
  }
}

/**
 * Valida el nombre con el que un invitado quiere entrar a un panorama ya
 * cargado: igual que el creador, reutiliza las reglas de duplicado sin
 * mayúsculas ni espacios de sobra (`core/quota-manager.ts`).
 */
export function validateGuestName(
  attendees: readonly Attendee[],
  rawName: string,
): { ok: true; name: string } | { ok: false; error: GuestParticipationError } {
  const normalized = normalizeAttendeeName(rawName);
  if (normalized === "") {
    return { ok: false, error: "empty_name" };
  }
  if (normalized.length > 40) {
    return { ok: false, error: "invalid_name" };
  }
  if (isDuplicateAttendeeName(attendees, normalized)) {
    return { ok: false, error: "duplicate_name" };
  }
  return { ok: true, name: normalized };
}

/** El invitado solo decide su modo de asistencia; nada más (DB fija el resto). */
export function isGuestStatusValue(status: string): status is AttendanceStatus {
  return status === "going" || status === "maybe" || status === "not_going";
}

/** Origen de la identidad guardada del dispositivo para este panorama. */
export type GuestIdentity = {
  panoramaId: string;
  /** id de la fila `participants` que el propio invitado creó. */
  participantId: string;
  /** Nombre guardado para mostrarlo sin volver a pedirlo. */
  name: string;
  /** Secreto correspondiente a `participantId` (header del cliente). */
  guestSecret: string;
};

/** Estados del flujo de invitado según la identidad guardada y la lista viva. */
export type GuestFlow =
  | /** Nunca participó: muestra el formulario de bienvenida. */
  "fresh"
  | /** Ya participa: formulari oculto, puede cambiar su voto. */
  "linked"
  | /** Tenía identidad guardada, pero su fila ya no existe. */
  "stale";

/** Resuelve qué pantalla le toca al invitado (sin efectos, solo comparación). */
export function resolveGuestFlow(
  identity: GuestIdentity | null,
  panorama: SavedPanorama | null,
): GuestFlow {
  if (panorama === null) {
    return "fresh";
  }
  if (identity === null || !isGuestSecretLike(identity.guestSecret)) {
    return "fresh";
  }
  const linked = panorama.attendees.some(
    (attendee) => attendee.id === identity.participantId,
  );
  return linked ? "linked" : "stale";
}

/** El asistente propio (por id) dentro de la clasificación, si participa. */
export function getOwnAttendee(
  panorama: SavedPanorama,
  identity: GuestIdentity,
): Attendee | null {
  return panorama.attendees.find((attendee) => attendee.id === identity.participantId) ?? null;
}

/** Resumen del tablero para el invitado: fechas y montos ya con formato local. */
export interface GuestPanoramaSummary {
  event: PanoramaEvent;
  attendeeCount: number;
}

/** Cuenta de invitados activa (sin los que ya no irán) para un chip de texto. */
export function countActiveReplies(panorama: SavedPanorama): number {
  return panorama.attendees.filter(
    (attendee) =>
      attendee.status === "going" ||
      attendee.status === "maybe" ||
      attendee.status === "not_going",
  ).length;
}
