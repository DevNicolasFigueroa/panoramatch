/**
 * Reglas de participación en un panorama compartido (con sesión obligatoria).
 *
 * Producto: quien abre el enlace `/p/<panorama_id>` DEBE tener sesión
 * (Google o correo). Al confirmar asistencia se vincula con su cuota:
 * la fila `participants` lleva su `auth_user_id`; el nombre ya no se escribe
 * a mano, viene del perfil de la sesión.
 *
 * Compatibilidad: los invitados anónimos de la era anterior tienen fila con
 * `guest_secret` y SIN `auth_user_id`. Si vuelven con cuenta desde el mismo
 * dispositivo (identidad guardada en `localStorage`), pueden ADOPTAR su fila
 * vieja vía función segura de la base (secret de por medio).
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
 * Valida el nombre con el que un participante entra a un panorama: el nombre
 * viene fijo del perfil de la sesión, pero el choque de duplicados se valida
 * igual (sin mayúsculas ni espacios de sobra, `core/quota-manager.ts`).
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

/** Origen de la identidad LEGACY guardada en este dispositivo para un panorama. */
export type GuestIdentity = {
  panoramaId: string;
  /** id de la fila `participants` que el propio invitado creó (era anónima). */
  participantId: string;
  /** Nombre guardado para mostrarlo sin volver a pedirlo. */
  name: string;
  /** Secreto correspondiente a `participantId` (adopción de fila legacy). */
  guestSecret: string;
};

/** Estados del flujo de participación según la sesión y la lista viva. */
export type GuestFlow =
  | /** Sin sesión o nunca participó: muestra el tablero con el form de bienvenida. */
  "fresh"
  | /** Ya participa con su cuenta: formulari oculto, puede cambiar su voto. */
  "linked"
  | /** Tiene identidad legacy anónima viva: puede ADOPTAR la fila con la cuenta. */
  "adoptable";

/**
 * Resuelve qué pantalla le toca al participante: primero gana la fila de la
 * SESIÓN (por `auth_user_id`); si no existe, la identidad legacy del
 * dispositivo habilita la adopción de la fila anónima que él mismo creó.
 */
export function resolveGuestFlow(
  identity: GuestIdentity | null,
  panorama: SavedPanorama | null,
  sessionUserId: string | null,
): GuestFlow {
  if (panorama === null || sessionUserId === null) {
    return "fresh";
  }
  const linked = panorama.attendees.some(
    (attendee) => attendee.authUserId === sessionUserId,
  );
  if (linked) {
    return "linked";
  }
  const adoptable =
    identity !== null &&
    identity.panoramaId === panorama.id &&
    isGuestSecretLike(identity.guestSecret) &&
    panorama.attendees.some((attendee) => attendee.id === identity.participantId);
  return adoptable ? "adoptable" : "fresh";
}

/** El asistente propio (por id del participante), si participa. */
export function getOwnAttendee(
  panorama: SavedPanorama,
  identity: GuestIdentity,
): Attendee | null {
  return panorama.attendees.find((attendee) => attendee.id === identity.participantId) ?? null;
}

/** El asistente propio (por cuenta de la sesión), si ya participa. */
export function getOwnAttendeeByUserId(
  panorama: SavedPanorama,
  sessionUserId: string,
): Attendee | null {
  return (
    panorama.attendees.find((attendee) => attendee.authUserId === sessionUserId) ??
    null
  );
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
