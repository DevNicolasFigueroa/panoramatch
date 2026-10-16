/**
 * Repo de panoramas contra Supabase (única capa que conoce las tablas).
 * Convierte filas snake_case ↔ tipos del dominio de `src/core/types.ts`.
 * Nada de lógica de negocio aquí: eso vive puro en core; esto es I/O.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AttendanceStatus,
  Attendee,
  PanoramaEvent,
  PanoramaMode,
  SavedPanorama,
} from "@/core/types";

/** Filas de `public.panoramas`. */
export interface PanoramaRow {
  id: string;
  creator_id: string;
  title: string;
  mode: PanoramaMode;
  starts_at: string;
  max_capacity: number | null;
  total_cost_clp: number;
  created_at: string;
}

/** Filas de `public.participants`. */
export interface ParticipantRow {
  id: string;
  panorama_id: string;
  name: string;
  status: AttendanceStatus;
  confirmed_order: number | null;
  auth_user_id: string | null;
  guest_secret: string | null;
  created_at: string;
}

/** Reemplaza un error en silencio por uno accionable. */
function assertData<T>(data: T | null, error: { message: string } | null): T {
  if (error !== null) {
    throw new Error(error.message);
  }
  if (data === null) {
    throw new Error("Respuesta vacía de Supabase.");
  }
  return data;
}

/* ─────────────── Mapeo filas → dominio ─────────────── */

export function mapParticipantRowToAttendee(row: ParticipantRow): Attendee {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    confirmedOrder: row.confirmed_order,
  };
}

export function mapRowsToSavedPanorama(
  panorama: PanoramaRow,
  participants: ParticipantRow[],
): SavedPanorama {
  const event: PanoramaEvent = {
    id: panorama.id,
    title: panorama.title,
    mode: panorama.mode,
    startsAt: panorama.starts_at,
    maxCapacity: panorama.max_capacity,
    totalCostCLP: panorama.total_cost_clp,
  };
  return {
    id: panorama.id,
    event,
    attendees: participants.map(mapParticipantRowToAttendee),
  };
}

/* ─────────────── Lecturas ─────────────── */

/**
 * Todos los panoramas del creador con sus participantes embebidos.
 * Uso: dashboard del creador autenticado.
 */
export async function fetchCreatorPanoramas(
  client: SupabaseClient,
  creatorId: string,
): Promise<SavedPanorama[]> {
  const { data, error } = await client
    .from("panoramas")
    .select("*, participants(*)")
    .eq("creator_id", creatorId);

  const rows = assertData(data, error) as Array<
    PanoramaRow & { participants: ParticipantRow[] | null }
  >;
  return rows.map((row) =>
    mapRowsToSavedPanorama(row, row.participants ?? []),
  );
}

/** Un panorama su id (con participantes) para el enlace del invitado. */
export async function fetchPanoramaById(
  client: SupabaseClient,
  panoramaId: string,
): Promise<SavedPanorama | null> {
  const { data, error } = await client
    .from("panoramas")
    .select("*, participants(*)")
    .eq("id", panoramaId)
    .order("created_at", { foreignTable: "participants", ascending: true })
    .maybeSingle();

  if (error !== null) {
    throw new Error(error.message);
  }
  if (data === null) {
    return null;
  }
  const row = data as PanoramaRow & { participants: ParticipantRow[] | null };
  return mapRowsToSavedPanorama(row, row.participants ?? []);
}

/* ─────────────── Creaciones ─────────────── */

/** Inserta el panorama (id generado en cliente, para UI optimista). */
export async function insertPanoramaRow(
  client: SupabaseClient,
  saved: SavedPanorama,
  creatorId: string,
): Promise<PanoramaRow> {
  const { data, error } = await client
    .from("panoramas")
    .insert({
      id: saved.id,
      creator_id: creatorId,
      title: saved.event.title,
      mode: saved.event.mode,
      starts_at: saved.event.startsAt,
      max_capacity: saved.event.maxCapacity,
      total_cost_clp: saved.event.totalCostCLP,
    })
    .select()
    .single();

  return assertData(data, error) as PanoramaRow;
}

/** Inserta un participante nuevo (devuelve la fila con orden canónico). */
export async function insertParticipantRow(
  client: SupabaseClient,
  payload: {
    panoramaId: string;
    participantId?: string;
    name: string;
    status: AttendanceStatus;
    /** Solo para el flujo de invitado sin cuenta. */
    guestSecret?: string;
  },
): Promise<ParticipantRow> {
  const { data, error } = await client
    .from("participants")
    .insert({
      ...(payload.participantId !== undefined ? { id: payload.participantId } : {}),
      panorama_id: payload.panoramaId,
      name: payload.name,
      status: payload.status,
      ...(payload.guestSecret !== undefined ? { guest_secret: payload.guestSecret } : {}),
      ...(payload.guestSecret === undefined ? { auth_user_id: null } : {}),
    })
    .select()
    .single();

  return assertData(data, error) as ParticipantRow;
}

/* ─────────────── Cambios de voto ─────────────── */

/**
 * Cambia el status de un participante. La base recalcula `confirmed_order`
 * (trigger) y devuelve la fila canónica; el llamador ajusta su estado local.
 */
export async function updateParticipantStatus(
  client: SupabaseClient,
  participantId: string,
  status: AttendanceStatus,
): Promise<ParticipantRow> {
  const { data, error } = await client
    .from("participants")
    .update({ status })
    .eq("id", participantId)
    .select()
    .single();

  return assertData(data, error) as ParticipantRow;
}

/* ─────────────── Bajas ─────────────── */

/** Elimina el panorama completo (los participantes mueren por cascada). */
export async function deletePanoramaRow(
  client: SupabaseClient,
  panoramaId: string,
): Promise<void> {
  const { error } = await client
    .from("panoramas")
    .delete()
    .eq("id", panoramaId);
  if (error !== null) {
    throw new Error(error.message);
  }
}
