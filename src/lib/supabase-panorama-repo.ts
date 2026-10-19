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
import type { PlaceCandidate, PlaceVoteRecord } from "@/core/place-vote";
import type { ContributionItem } from "@/core/contribution-list";

/** Filas de `public.panoramas`. */
export interface PanoramaRow {
  id: string;
  creator_id: string;
  title: string;
  mode: PanoramaMode;
  starts_at: string;
  max_capacity: number | null;
  total_cost_clp: number;
  /** Nombre de Google del creador; null en panoramas antiguos. */
  creator_name: string | null;
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
    // Sin enlace (sin secreto) y sin cuenta Google: lo anotó el creador a mano.
    creatorAdded: row.guest_secret === null && row.auth_user_id === null,
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
    creatorName: panorama.creator_name ?? null,
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
      creator_name: saved.event.creatorName ?? null,
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

/* ─────────────── ¿A dónde vamos? (modo Social) ─────────────── */

/** Filas de `public.place_candidates`. */
export interface PlaceCandidateRow {
  id: string;
  panorama_id: string;
  name: string;
  created_at: string;
}

/** Filas de `public.place_votes`. */
export interface PlaceVoteRow {
  id: string;
  panorama_id: string;
  candidate_id: string;
  voter_ref: string;
  delegated: boolean;
  created_at: string;
}

/** El tablero de lugares del panorama tal como vive en la base. */
export interface PlaceData {
  candidates: PlaceCandidate[];
  votes: PlaceVoteRecord[];
  matchCandidateId: string | null;
}

function mapCandidateRow(row: PlaceCandidateRow): PlaceCandidate {
  return { id: row.id, name: row.name };
}

function mapVoteRow(row: PlaceVoteRow): PlaceVoteRecord {
  return { candidateId: row.candidate_id, voterRef: row.voter_ref, delegated: row.delegated };
}

/** Lee candidatos, votos vigentes y el Match declarado del panorama. */
export async function fetchPlaceData(
  client: SupabaseClient,
  panoramaId: string,
): Promise<PlaceData> {
  const [candidatesRes, votesRes, matchRes] = await Promise.all([
    client
      .from("place_candidates")
      .select("*")
      .eq("panorama_id", panoramaId)
      .order("created_at", { ascending: true }),
    client
      .from("place_votes")
      .select("*")
      .eq("panorama_id", panoramaId)
      .order("created_at", { ascending: true }),
    client
      .from("panoramas")
      .select("match_candidate_id")
      .eq("id", panoramaId)
      .maybeSingle(),
  ]);

  if (candidatesRes.error !== null) {
    throw new Error(candidatesRes.error.message);
  }
  if (votesRes.error !== null) {
    throw new Error(votesRes.error.message);
  }
  if (matchRes.error !== null) {
    throw new Error(matchRes.error.message);
  }

  const candidateRows = (candidatesRes.data ?? []) as PlaceCandidateRow[];
  const voteRows = (votesRes.data ?? []) as PlaceVoteRow[];
  const match = matchRes.data as { match_candidate_id: string | null } | null;
  return {
    candidates: candidateRows.map(mapCandidateRow),
    votes: voteRows.map(mapVoteRow),
    matchCandidateId: match?.match_candidate_id ?? null,
  };
}

/**
 * Inserta un candidato nuevo. Con `candidateId` se usa el id generado por el
 * cliente (flujo optimista del creador); sin él, lo genera la base (invitado).
 */
export async function insertPlaceCandidateRow(
  client: SupabaseClient,
  payload: { panoramaId: string; name: string; candidateId?: string },
): Promise<PlaceCandidateRow> {
  const { data, error } = await client
    .from("place_candidates")
    .insert({
      ...(payload.candidateId !== undefined ? { id: payload.candidateId } : {}),
      panorama_id: payload.panoramaId,
      name: payload.name,
    })
    .select()
    .single();

  return assertData(data, error) as PlaceCandidateRow;
}

/** Elimina un candidato (solo creador; la base valida la sesión). */
export async function deletePlaceCandidateRow(
  client: SupabaseClient,
  candidateId: string,
): Promise<void> {
  const { error } = await client
    .from("place_candidates")
    .delete()
    .eq("id", candidateId);
  if (error !== null) {
    throw new Error(error.message);
  }
}

/**
 * Emite o cambia el voto vigente del votante en la base (una fila por
 * votante, upsert contra el índice único `panorama_id + voter_ref`).
 * Para el invitado se omite `delegated` (no tiene privilegio en esa columna).
 */
export async function upsertPlaceVoteRow(
  client: SupabaseClient,
  payload: { panoramaId: string; candidateId: string; voterRef: string; delegated?: boolean },
): Promise<PlaceVoteRow> {
  const { data, error } = await client
    .from("place_votes")
    .upsert(
      {
        panorama_id: payload.panoramaId,
        candidate_id: payload.candidateId,
        voter_ref: payload.voterRef,
        ...(payload.delegated !== undefined ? { delegated: payload.delegated } : {}),
      },
      { onConflict: "panorama_id,voter_ref" },
    )
    .select()
    .single();

  return assertData(data, error) as PlaceVoteRow;
}

/** Retira el voto vigente de un votante (dejó de estar "Voy"). */
export async function deletePlaceVoteRow(
  client: SupabaseClient,
  panoramaId: string,
  voterRef: string,
): Promise<void> {
  const { error } = await client
    .from("place_votes")
    .delete()
    .eq("panorama_id", panoramaId)
    .eq("voter_ref", voterRef);
  if (error !== null) {
    throw new Error(error.message);
  }
}

/** Declara el Match: fija el candidato y cierra la votación en la base. */
export async function declareMatchRow(
  client: SupabaseClient,
  panoramaId: string,
  candidateId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("panoramas")
    .update({ match_candidate_id: candidateId })
    .eq("id", panoramaId)
    .select("match_candidate_id")
    .single();

  if (error !== null) {
    throw new Error(error.message);
  }
  return (data as { match_candidate_id: string | null } | null)?.match_candidate_id ?? null;
}

/* ─────────────── Lista de aportes (checklist, spec 002) ─────────────── */

/** Filas de `public.checklist_items`. */
export interface ChecklistItemRow {
  id: string;
  panorama_id: string;
  name: string;
  /** 'creator' o el id del participante que lo lleva; null = libre. */
  claimed_by_ref: string | null;
  created_at: string;
}

function mapChecklistRow(row: ChecklistItemRow): ContributionItem {
  return { id: row.id, name: row.name, claimedByRef: row.claimed_by_ref };
}

/** Lee la lista de aportes del panorama (en orden de creación). */
export async function fetchChecklistItems(
  client: SupabaseClient,
  panoramaId: string,
): Promise<ContributionItem[]> {
  const { data, error } = await client
    .from("checklist_items")
    .select("*")
    .eq("panorama_id", panoramaId)
    .order("created_at", { ascending: true });

  if (error !== null) {
    throw new Error(error.message);
  }
  return ((data ?? []) as ChecklistItemRow[]).map(mapChecklistRow);
}

/**
 * Inserta un ítem nuevo. Con `itemId` se usa el id generado por el cliente
 * (flujo optimista del creador); sin él, lo genera la base (invitado).
 */
export async function insertChecklistItemRow(
  client: SupabaseClient,
  payload: { panoramaId: string; name: string; itemId?: string },
): Promise<ChecklistItemRow> {
  const { data, error } = await client
    .from("checklist_items")
    .insert({
      ...(payload.itemId !== undefined ? { id: payload.itemId } : {}),
      panorama_id: payload.panoramaId,
      name: payload.name,
    })
    .select()
    .single();

  return assertData(data, error) as ChecklistItemRow;
}

/** Elimina un ítem libre (solo creador; la base valida la sesión y el estado). */
export async function deleteChecklistItemRow(
  client: SupabaseClient,
  itemId: string,
): Promise<void> {
  const { error } = await client
    .from("checklist_items")
    .delete()
    .eq("id", itemId);
  if (error !== null) {
    throw new Error(error.message);
  }
}

/** Toma un ítem libre: rellena el responsable («Yo lo llevo»). */
export async function claimChecklistItemRow(
  client: SupabaseClient,
  payload: { itemId: string; claimedByRef: string | "creator" },
): Promise<ChecklistItemRow> {
  const { data, error } = await client
    .from("checklist_items")
    .update({ claimed_by_ref: payload.claimedByRef })
    .eq("id", payload.itemId)
    .select()
    .single();

  return assertData(data, error) as ChecklistItemRow;
}

/** Libera el ítem propio: vacía el responsable (solo quien lo lleva). */
export async function releaseChecklistItemRow(
  client: SupabaseClient,
  itemId: string,
  claimedByRef: string | "creator",
): Promise<void> {
  const { error } = await client
    .from("checklist_items")
    .update({ claimed_by_ref: null })
    .eq("id", itemId)
    .eq("claimed_by_ref", claimedByRef);
  if (error !== null) {
    throw new Error(error.message);
  }
}
