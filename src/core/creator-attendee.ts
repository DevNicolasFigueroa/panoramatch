/**
 * El asistente creador: quien organiza el panorama SIEMPRE va, así que
 * cuenta como «Voy» en la boleta final y en las listas «Van» de panel y
 * enlace, sin existir como fila en la base.
 *
 * Reglas de producto:
 * - «Voy» fijo con orden de confirmación 0: primero de la fila, jamás suplente.
 * - Ocupa cupo: si el cupo se llena, los invitados caen a Lista de Espera.
 * - El semáforo de quórum sigue midiendo SOLO a los invitados.
 * - Su nombre vive en `panoramas.creator_name`; sin valor → «El creador».
 *
 * Módulo puro: sin React, sin DOM, sin red y sin Supabase.
 */

import type { Attendee } from "./types";
import { normalizeAttendeeName } from "./quota-manager";

/** Id fijo del asistente virtual del creador. */
export const CREATOR_ATTENDEE_ID = "creator";

/** Etiqueta de respaldo cuando el panorama no guarda nombre del creador. */
export const CREATOR_FALLBACK_LABEL = "El creador";

/** Nombre visible del organizador: el guardado, o la etiqueta genérica. */
export function getCreatorDisplayName(creatorName: string | null | undefined): string {
  const normalized =
    creatorName === null || creatorName === undefined ? "" : normalizeAttendeeName(creatorName);
  return normalized === "" ? CREATOR_FALLBACK_LABEL : normalized;
}

/** El asistente virtual del creador: siempre «Voy», primero de la fila. */
export function buildCreatorAttendee(creatorName?: string | null): Attendee {
  return {
    id: CREATOR_ATTENDEE_ID,
    name: getCreatorDisplayName(creatorName),
    status: "going",
    confirmedOrder: 0,
    isCreator: true,
  };
}

/**
 * La lista efectiva de asistentes con el creador implícito al frente.
 * Defensivo: si la lista ya venía compuesta (doble composición) o traía una
 * fila marcada como creador, no se duplica.
 */
export function withCreatorAttendee(
  attendees: readonly Attendee[],
  creatorName?: string | null,
): Attendee[] {
  const guestAttendees = attendees.filter(
    (attendee) => attendee.id !== CREATOR_ATTENDEE_ID && attendee.isCreator !== true,
  );
  return [buildCreatorAttendee(creatorName), ...guestAttendees];
}
