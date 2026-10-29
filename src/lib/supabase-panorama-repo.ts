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
import type { TeamAssignment, TeamSide, TeamVacancy, TeamsState } from "@/core/team-organizer";
import type {
  PaymentReceipt,
  ReceiptsState,
  TreasurySummaryMetrics,
} from "@/core/payment-receipt";
import type {
  PaymentClaim,
  PaymentsState,
  RefundKind,
  PaymentTransaction,
  ResolvedRefund,
} from "@/core/payment-treasury";

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
  /** Sello «Ya transferí» (solo escrita por RPC definer); null = «Pendiente». */
  payment_transfer_claimed_at?: string | null;
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
    authUserId: row.auth_user_id,
    // Sin cuenta (y sobra el secreto en filas legacy sin adoptar): lo anotó
    // el creador a mano (o es una fila anónima legacy aún no adoptada).
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

/**
 * Asegura la fila de perfil del usuario con sesión. Imbatible contra el
 * fallo silencioso del trigger `on_auth_user_created` (carrera durante
 * migraciones o borrado de usuarios): sin esta fila, el primer guardado de
 * un panorama muere en el FK `panoramas_creator_id_fkey`. Idempotente.
 */
export async function ensureOwnProfileRow(
  client: SupabaseClient,
  userId: string,
  displayName?: string,
): Promise<void> {
  const { error } = await client
    .from("profiles")
    .upsert(
      {
        id: userId,
        display_name: displayName !== undefined && displayName !== "" ? displayName : "Usuario",
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (error !== null) {
    throw new Error(error.message);
  }
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
    .select("id,creator_id,title,mode,starts_at,max_capacity,total_cost_clp,creator_name,created_at,participants(id,panorama_id,name,status,confirmed_order,auth_user_id,guest_secret,created_at)")
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
    .select("id,creator_id,title,mode,starts_at,max_capacity,total_cost_clp,creator_name,created_at,participants(id,panorama_id,name,status,confirmed_order,auth_user_id,guest_secret,created_at)")
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

/**
 * Inserta un participante nuevo (devuelve la fila con orden canónico).
 * Con `authUserId` se une el usuario con sesión (auth obligatoria); sin él
 * la fila queda anónima: solo el creador anota a mano así.
 */
export async function insertParticipantRow(
  client: SupabaseClient,
  payload: {
    panoramaId: string;
    participantId?: string;
    name: string;
    status: AttendanceStatus;
    /** Cuenta de la sesión para el flujo con cuenta (RLS lo exige). */
    authUserId?: string;
  },
): Promise<ParticipantRow> {
  const { data, error } = await client
    .from("participants")
    .insert({
      ...(payload.participantId !== undefined ? { id: payload.participantId } : {}),
      panorama_id: payload.panoramaId,
      name: payload.name,
      status: payload.status,
      ...(payload.authUserId !== undefined ? { auth_user_id: payload.authUserId } : {}),
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

/** Libera TODOS los reclamos de una referencia en un panorama (dejó de ir). */
export async function releaseChecklistClaimsOfRow(
  client: SupabaseClient,
  panoramaId: string,
  claimRef: string,
): Promise<void> {
  const { error } = await client
    .from("checklist_items")
    .update({ claimed_by_ref: null })
    .eq("panorama_id", panoramaId)
    .eq("claimed_by_ref", claimRef);
  if (error !== null) {
    throw new Error(error.message);
  }
}

/* ─────────────── Organizador de equipos (spec 003) ─────────────── */

/** Filas de `public.team_members`. */
export interface TeamMemberRow {
  id: string;
  panorama_id: string;
  team: TeamSide;
  /** 'creator' (organizador virtual) o el id de la fila `participants`. */
  player_ref: string;
  created_at: string;
}

/** Filas de `public.team_vacancies` (asiento que dejó un titular que se bajó). */
export interface TeamVacancyRow {
  id: string;
  panorama_id: string;
  team: TeamSide;
  created_at: string;
}

/** Datos completos de equipos de un panorama Deportivo. */
export interface TeamsData {
  teamAName: string | null;
  teamBName: string | null;
  assignments: TeamAssignment[];
  /** Vacantes de la más antigua a la más nueva (FIFO). */
  vacancies: TeamVacancy[];
}

function mapMemberRow(row: TeamMemberRow): TeamAssignment {
  return { playerRef: row.player_ref, team: row.team };
}

function mapVacancyRow(row: TeamVacancyRow): TeamVacancy {
  return { team: row.team };
}

/** Lee nombres de equipos, asignaciones vigentes y vacantes FIFO. */
export async function fetchTeamsData(
  client: SupabaseClient,
  panoramaId: string,
): Promise<TeamsData> {
  const [membersRes, vacanciesRes, nameRes] = await Promise.all([
    client
      .from("team_members")
      .select("*")
      .eq("panorama_id", panoramaId)
      .order("created_at", { ascending: true }),
    client
      .from("team_vacancies")
      .select("*")
      .eq("panorama_id", panoramaId)
      .order("created_at", { ascending: true }),
    client
      .from("panoramas")
      .select("team_a_name,team_b_name")
      .eq("id", panoramaId)
      .maybeSingle(),
  ]);

  if (membersRes.error !== null) {
    throw new Error(membersRes.error.message);
  }
  if (vacanciesRes.error !== null) {
    throw new Error(vacanciesRes.error.message);
  }
  if (nameRes.error !== null) {
    throw new Error(nameRes.error.message);
  }

  const memberRows = (membersRes.data ?? []) as TeamMemberRow[];
  const vacancyRows = (vacanciesRes.data ?? []) as TeamVacancyRow[];
  const names = nameRes.data as { team_a_name: string | null; team_b_name: string | null } | null;
  return {
    teamAName: names?.team_a_name ?? null,
    teamBName: names?.team_b_name ?? null,
    assignments: memberRows.map(mapMemberRow),
    vacancies: vacancyRows.map(mapVacancyRow),
  };
}

/** Renombra un equipo en la base (solo el creador; RLS valida la sesión). */
export async function updateTeamNameRow(
  client: SupabaseClient,
  panoramaId: string,
  side: TeamSide,
  name: string | null,
): Promise<void> {
  const column = side === "a" ? "team_a_name" : "team_b_name";
  const { error } = await client
    .from("panoramas")
    .update({ [column]: name })
    .eq("id", panoramaId);
  if (error !== null) {
    throw new Error(error.message);
  }
}

/** Inserta una asignación nueva (creador; p. ej. desde el sorteo). */
export async function insertTeamMemberRow(
  client: SupabaseClient,
  payload: { panoramaId: string; team: TeamSide; playerRef: string; memberId?: string },
): Promise<TeamMemberRow> {
  const { data, error } = await client
    .from("team_members")
    .insert({
      ...(payload.memberId !== undefined ? { id: payload.memberId } : {}),
      panorama_id: payload.panoramaId,
      team: payload.team,
      player_ref: payload.playerRef,
    })
    .select()
    .single();
  return assertData(data, error) as TeamMemberRow;
}

/** Mueve (o fija) el equipo de un jugador por su referencia (creador). */
export async function upsertTeamMemberRow(
  client: SupabaseClient,
  payload: { panoramaId: string; team: TeamSide; playerRef: string },
): Promise<void> {
  const { error } = await client
    .from("team_members")
    .upsert(
      { panorama_id: payload.panoramaId, team: payload.team, player_ref: payload.playerRef },
      { onConflict: "panorama_id,player_ref" },
    );
  if (error !== null) {
    throw new Error(error.message);
  }
}

/** Aplica el LOTE del sorteo en una sola escritura (creador). */
export async function upsertTeamDrawRows(
  client: SupabaseClient,
  drawn: TeamAssignment[],
  panoramaId: string,
): Promise<void> {
  const { error } = await client
    .from("team_members")
    .upsert(
      drawn.map((assignment) => ({
        panorama_id: panoramaId,
        team: assignment.team,
        player_ref: assignment.playerRef,
      })),
      { onConflict: "panorama_id,player_ref" },
    );
  if (error !== null) {
    throw new Error(error.message);
  }
}

/** Retira una asignación SIN dejar vacante (movimiento a dedo del creador). */
export async function removeTeamMemberRow(
  client: SupabaseClient,
  panoramaId: string,
  playerRef: string,
): Promise<void> {
  const { error } = await client
    .from("team_members")
    .delete()
    .eq("panorama_id", panoramaId)
    .eq("player_ref", playerRef);
  if (error !== null) {
    throw new Error(error.message);
  }
}

/**
 * Baja con asiento (RF-7): el titular deja su equipo y su asiento queda
 * VACANTE en el servidor, en una sola operación (función segura).
 */
export async function releaseTeamSeatRow(
  client: SupabaseClient,
  payload: { panoramaId: string; playerRef: string },
): Promise<void> {
  const { error } = await client.rpc("release_team_seat", {
    p_panorama_id: payload.panoramaId,
    p_player_ref: payload.playerRef,
  });
  if (error !== null) {
    throw new Error(error.message);
  }
}

/**
 * Herencia FIFO (RF-8): el titular nuevo hereda la vacante más antigua y
 * devuelve el equipo heredado, o `null` cuando no hay vacantes («sin equipo»).
 */
export async function claimTeamVacancyRow(
  client: SupabaseClient,
  payload: { panoramaId: string; playerRef: string },
): Promise<TeamSide | null> {
  const { data, error } = await client.rpc("claim_team_vacancy", {
    p_panorama_id: payload.panoramaId,
    p_player_ref: payload.playerRef,
  });
  if (error !== null) {
    throw new Error(error.message);
  }
  return (data as TeamSide | null) ?? null;
}

/** Datos de equipos ya mapificados, listos para el estado del dominio. */
export function mapTeamsDataToState(teams: TeamsData): TeamsState {
  return {
    teamAName: teams.teamAName,
    teamBName: teams.teamBName,
    assignments: teams.assignments,
    vacancies: teams.vacancies,
  };
}

/* ─────────────── Control de pagos y tesorería (spec 004) ─────────────── */

/** Filas de `public.panorama_payments` (historial completo, revocadas incluidas). */
export interface PaymentTransactionRow {
  id: number;
  panorama_id: string;
  /** 'creator' (organizador virtual) o el id de la fila `participants`. */
  player_ref: string;
  amount_clp: number;
  paid_at: string;
  /** Sello de la reversión; null = transacción vigente. */
  revoked_at: string | null;
}

/** Filas de `public.panorama_refunds` (SOLO cierres «Reembolsada»). */
export interface PanoramaRefundRow {
  id: number;
  panorama_id: string;
  player_ref: string;
  kind: RefundKind;
  amount_clp: number;
  resolved_at: string;
}

/**
 * Sello timestamptz del servidor → texto local `'YYYY-MM-DDTHH:mm'`.
 * La zona es America/Santiago: el sello llega como instante con offset
 * ( inputs del servidor ), así que la lectura con `Intl` es la única
 * conversión y jamás toca `toISOString()`.
 */
function mapTimestampToLocalText(serverStamp: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(serverStamp));
  const get = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function mapPaymentRowToTransaction(row: PaymentTransactionRow): PaymentTransaction {
  return {
    id: String(row.id),
    playerRef: row.player_ref,
    amountCLP: row.amount_clp,
    recordedAt: mapTimestampToLocalText(row.paid_at),
    revokedAt: row.revoked_at === null ? null : mapTimestampToLocalText(row.revoked_at),
  };
}

function mapRefundRowToResolved(row: PanoramaRefundRow): ResolvedRefund {
  return {
    playerRef: row.player_ref,
    kind: row.kind,
    amountCLP: row.amount_clp,
    resolvedAt: mapTimestampToLocalText(row.resolved_at),
  };
}

/**
 * Lee el estado completo de tesorería: bloque bancario (columna de
 * `panoramas`), transacciones con sus sellos convertidos a texto local,
 * marcas «Ya transferí» vigentes (columna de `participants`) y cierres
 * «Reembolsada». Devuelve `null` cuando el panorama ya no existe.
 */
export async function fetchPaymentsState(
  client: SupabaseClient,
  panoramaId: string,
): Promise<PaymentsState | null> {
  const [transferRes, paymentsRes, refundsRes, claimsRes] = await Promise.all([
    client
      .from("panoramas")
      .select("payment_info")
      .eq("id", panoramaId)
      .maybeSingle(),
    client
      .from("panorama_payments")
      .select("*")
      .eq("panorama_id", panoramaId)
      .order("paid_at", { ascending: true }),
    client
      .from("panorama_refunds")
      .select("*")
      .eq("panorama_id", panoramaId)
      .order("resolved_at", { ascending: true }),
    client
      .from("participants")
      .select("id,payment_transfer_claimed_at")
      .eq("panorama_id", panoramaId)
      .order("created_at", { ascending: true }),
  ]);

  if (transferRes.error !== null) {
    throw new Error(transferRes.error.message);
  }
  if (paymentsRes.error !== null) {
    throw new Error(paymentsRes.error.message);
  }
  if (refundsRes.error !== null) {
    throw new Error(refundsRes.error.message);
  }
  if (claimsRes.error !== null) {
    throw new Error(claimsRes.error.message);
  }

  const transferRow = transferRes.data as { payment_info: string | null } | null;
  if (transferRow === null) {
    return null;
  }
  const claimRows = (claimsRes.data ?? []) as Array<{
    id: string;
    payment_transfer_claimed_at: string | null;
  }>;
  const claims: PaymentClaim[] = claimRows
    .filter((row) => row.payment_transfer_claimed_at !== null)
    .map((row) => ({
      playerRef: row.id,
      claimedAt: mapTimestampToLocalText(row.payment_transfer_claimed_at as string),
    }));

  return {
    transferInfo: transferRow.payment_info,
    transactions: ((paymentsRes.data ?? []) as PaymentTransactionRow[]).map(
      mapPaymentRowToTransaction,
    ),
    claims,
    resolvedRefunds: ((refundsRes.data ?? []) as PanoramaRefundRow[]).map(
      mapRefundRowToResolved,
    ),
  };
}

/** Guarda (o vacía con `null`) el bloque de datos de transferencia (creador). */
export async function updateTransferInfoRow(
  client: SupabaseClient,
  panoramaId: string,
  transferInfo: string | null,
): Promise<string | null> {
  const { data, error } = await client
    .from("panoramas")
    .update({ payment_info: transferInfo })
    .eq("id", panoramaId)
    .select("payment_info")
    .single();

  if (error !== null) {
    throw new Error(error.message);
  }
  return (data as { payment_info: string | null } | null)?.payment_info ?? null;
}

/**
 * Confirmación «Pagado» del creador: RPC definer `record_payment` inserta
 * la transacción y CONSUME la marca «Ya transferí» en la misma transacción
 * de servidor (la columna de la marca no tiene grants directos para nadie).
 * La RPC devuelve el id de fila de la base: el store lo pisa en la
 * transacción local (`tx-N` de solo display) para que la reversión
 * posterior pueda apuntar a la fila real.
 */
export async function recordPaymentRow(
  client: SupabaseClient,
  payload: { panoramaId: string; playerRef: string; amountCLP: number },
): Promise<string> {
  const { data, error } = await client.rpc("record_payment", {
    p_panorama_id: payload.panoramaId,
    p_player_ref: payload.playerRef,
    p_amount_clp: payload.amountCLP,
  });
  if (error !== null) {
    throw new Error(error.message);
  }
  return String(data);
}

/**
 * Reversión del creador: RPC definer `revoke_payment` fija el sello
 * `revoked_at` EN EL SERVIDOR (la fila queda en el historial, fuera del
 * acumulado vigente). El pago se identifica por su id de transacción.
 */
export async function revokePaymentRow(
  client: SupabaseClient,
  payload: { panoramaId: string; paymentId: string },
): Promise<void> {
  const { error } = await client.rpc("revoke_payment", {
    p_panorama_id: payload.panoramaId,
    p_payment_id: Number.parseInt(payload.paymentId, 10),
  });
  if (error !== null) {
    throw new Error(error.message);
  }
}

/**
 * Cierre «Reembolsada» del creador: INSERT directo por RLS (el sello
 * `resolved_at` lo pone la base con su default `now()`; jamás se envía).
 */
export async function insertRefundRow(
  client: SupabaseClient,
  payload: { panoramaId: string; playerRef: string; kind: RefundKind; amountCLP: number },
): Promise<ResolvedRefund> {
  const { data, error } = await client
    .from("panorama_refunds")
    .insert({
      panorama_id: payload.panoramaId,
      player_ref: payload.playerRef,
      kind: payload.kind,
      amount_clp: payload.amountCLP,
    })
    .select()
    .single();

  return mapRefundRowToResolved(assertData(data, error) as PanoramaRefundRow);
}

/** Reabertura del creador: borrar el cierre; la devolución vuelve a derivarse. */
export async function deleteRefundRow(
  client: SupabaseClient,
  payload: { panoramaId: string; playerRef: string; kind: RefundKind },
): Promise<void> {
  const { error } = await client
    .from("panorama_refunds")
    .delete()
    .eq("panorama_id", payload.panoramaId)
    .eq("player_ref", payload.playerRef)
    .eq("kind", payload.kind);
  if (error !== null) {
    throw new Error(error.message);
  }
}

/** Marca propia «Ya transferí» del titular con cuenta (RPC definer). */
export async function claimSelfTransferRow(
  client: SupabaseClient,
  panoramaId: string,
): Promise<void> {
  const { error } = await client.rpc("claim_payment_transfer", {
    p_panorama_id: panoramaId,
  });
  if (error !== null) {
    throw new Error(error.message);
  }
}

/** Retracto de la marca propia del titular con cuenta (RPC definer). */
export async function retractSelfTransferRow(
  client: SupabaseClient,
  panoramaId: string,
): Promise<void> {
  const { error } = await client.rpc("retract_payment_transfer", {
    p_panorama_id: panoramaId,
  });
  if (error !== null) {
    throw new Error(error.message);
  }
}

/* ─────────────── Comprobantes de pago (spec 005) ─────────────── */

/** Bucket PRIVADO de comprobantes: ruta y acceso solo por URL firmada. */
export const RECEIPTS_BUCKET = "panorama-comprobantes";

/** Filas de `public.panorama_payment_receipts` (una vigente por persona). */
export interface PaymentReceiptRow {
  id: string;
  panorama_id: string;
  participant_id: string;
  storage_path: string;
  mime_type: string;
  byte_size: number;
  uploaded_at: string;
  confirmed_at: string | null;
}

/**
 * Conviención de ruta del objeto: `{panorama}/{participante}/receipt-…`.
 * Los policies del bucket la validan (dueño de fila o creador del panorama).
 */
export function buildReceiptStoragePath(
  panoramaId: string,
  participantId: string,
  extension: string,
): string {
  return `${panoramaId}/${participantId}/receipt-${Date.now()}.${extension}`;
}

/** Extensión por MIME del comprobante (los tres formatos permitidos). */
export function getReceiptFileExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

function mapReceiptRowToDomain(row: PaymentReceiptRow): PaymentReceipt {
  return {
    playerRef: row.participant_id,
    storagePath: row.storage_path,
    mimeType: row.mime_type as PaymentReceipt["mimeType"],
    byteSize: row.byte_size,
    uploadedAt: mapTimestampToLocalText(row.uploaded_at),
    confirmedAt: row.confirmed_at === null ? null : mapTimestampToLocalText(row.confirmed_at),
  };
}

/**
 * Lee los comprobantes vigentes visibles para quien pide:
 * el INVITADO ve solo SU fila (RLS `payment_receipts_owner_read`) y el
 * CREADOR las ve todas (`payment_receipts_creator_all`).
 */
export async function fetchReceiptRows(
  client: SupabaseClient,
  panoramaId: string,
): Promise<ReceiptsState> {
  const { data, error } = await client
    .from("panorama_payment_receipts")
    .select("id,panorama_id,participant_id,storage_path,mime_type,byte_size,uploaded_at,confirmed_at")
    .eq("panorama_id", panoramaId);

  if (error !== null) {
    throw new Error(error.message);
  }
  const rows = (data ?? []) as PaymentReceiptRow[];
  return { receipts: rows.map(mapReceiptRowToDomain) };
}

/** Filas de la vista propia `participant_payment_state` (solo TU fila). */
export interface OwnPaymentStateRow {
  id: string;
  panorama_id: string;
  name: string;
  status: AttendanceStatus;
  confirmed_order: number | null;
  created_at: string;
  payment_transfer_claimed_at: string | null;
  payment_transfer_rejection_note: string | null;
}

/**
 * La fila propia de pago del invitado (vista definer del servidor):
 * marca «Ya transferí» y nota de rechazo AHORA viven aquí (esas columnas
 * de la base ya no son legibles directamente por nadie con cuenta).
 */
export async function fetchOwnPaymentStateRow(
  client: SupabaseClient,
): Promise<OwnPaymentStateRow | null> {
  const { data, error } = await client
    .from("participant_payment_state")
    .select("id,panorama_id,name,status,confirmed_order,created_at,payment_transfer_claimed_at,payment_transfer_rejection_note")
    .maybeSingle();

  if (error !== null) {
    throw new Error(error.message);
  }
  return (data as OwnPaymentStateRow | null) ?? null;
}

/** Resumen ANÓNIMO del pozo que devuelve la RPC del servidor. */
export interface TreasurySummaryServerRow {
  collected_net_clp: number;
  to_collect_clp: number;
  paid_guests: number;
  guest_total: number;
  current_quota_clp: number;
  surplus_clp: number;
}

/**
 * Métricas anónimas del pozo (RF-7): la RPC definer `get_treasury_summary`
 * acepta cualquier sesión y solo suelta CIFRAS — el invitado jamás consulta
 * filas de terceros desde el navegador. El % sale de la fórmula del núcleo
 * (`computeAnonymousSummary`): techo 100 y 0 % con base vacía.
 */
export async function fetchTreasurySummaryRow(
  client: SupabaseClient,
  panoramaId: string,
): Promise<TreasurySummaryMetrics | null> {
  const { data, error } = await client.rpc("get_treasury_summary", {
    p_panorama_id: panoramaId,
  });
  if (error !== null) {
    throw new Error(error.message);
  }
  const row = (Array.isArray(data) ? data[0] : data) as TreasurySummaryServerRow | null;
  if (row === null || row === undefined) {
    return null;
  }
  const base = row.collected_net_clp + row.to_collect_clp;
  return {
    collectedNetCLP: row.collected_net_clp,
    toCollectCLP: row.to_collect_clp,
    paidGuests: row.paid_guests,
    guestTotal: row.guest_total,
    percent: base > 0 ? Math.min(100, Math.round((row.collected_net_clp / base) * 100)) : 0,
  };
}

/** Fila del estado de comprobantes para el CREADOR (RPC definer). */
export interface ReceiptsStateRow {
  participant_id: string;
  name: string;
  status: AttendanceStatus;
  claimed_at: string | null;
  rejection_note: string | null;
  storage_path: string | null;
  mime_type: string | null;
  byte_size: number | null;
  uploaded_at: string | null;
  confirmed_at: string | null;
}

/**
 * Estado de comprobantes de TODA la fila del panorama, solo para el creador:
 * marca, nota de rechazo y comprobante por persona (lo usa el panel de
 * Tesorería — el invitado jamás puede llamarlo: RPC definer lo niega).
 */
export async function fetchCreatorReceiptsStateRow(
  client: SupabaseClient,
  panoramaId: string,
): Promise<ReceiptsStateRow[]> {
  const { data, error } = await client.rpc("get_panorama_receipts_state", {
    p_panorama_id: panoramaId,
  });
  if (error !== null) {
    throw new Error(error.message);
  }
  return ((data ?? []) as ReceiptsStateRow[]).map((row) => ({
    ...row,
    byte_size: row.byte_size ?? 0,
  }));
}

/* ─────────────── Storage de comprobantes ─────────────── */

/**
 * Sube el objeto al bucket privado. Se llama ANTES de la RPC de marca:
 * el comprobante y su estado «En revisión» nacen juntos, y si la RPC
 * falla el llamador limpia el objeto con `removeReceiptObjectRow`.
 * Devuelve el MIME/peso CON los que la base validó (paridad con lo que
 * la RPC cruzará contra el metadata real del objeto).
 */
export async function uploadReceiptObjectRow(
  client: SupabaseClient,
  payload: { storagePath: string; file: File; mimeType: string },
): Promise<{ storagePath: string; byteSize: number }> {
  const { data, error } = await client.storage
    .from(RECEIPTS_BUCKET)
    .upload(payload.storagePath, payload.file, {
      contentType: payload.mimeType,
      cacheControl: "3600",
      upsert: false,
    });
  if (error !== null) {
    throw new Error(error.message);
  }
  const uploaded = data as { path?: string } | null;
  return {
    storagePath: uploaded?.path ?? payload.storagePath,
    byteSize: payload.file.size,
  };
}

/** URL firmada de CORTA vida para miniatura/visor (5 minutos). */
export async function fetchSignedReceiptUrlRow(
  client: SupabaseClient,
  storagePath: string,
): Promise<string | null> {
  const { data, error } = await client.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(storagePath, 300);
  if (error !== null || data === null) {
    return null;
  }
  return (data as { signedUrl?: string }).signedUrl ?? null;
}

/**
 * Borrado best-effort del objeto huérfano (falló la RPC tras la subida).
 * Los demás caminos (reemplazo/retracto/rechazo/cascada) limpian el
 * objeto en el SERVIDOR con el trigger de la base.
 */
export async function removeReceiptObjectRow(
  client: SupabaseClient,
  storagePath: string,
): Promise<boolean> {
  // Best-effort: nunca rompe el flujo principal por un error de storage.
  try {
    const { error } = await client.storage.from(RECEIPTS_BUCKET).remove([storagePath]);
    return error === null;
  } catch {
    return false;
  }
}

/* ─────────────── RPCs del flujo con comprobante (005) ─────────────── */

/**
 * Marca «Ya transferí» CON el comprobante (RF-3): la RPC registra marca
 * y fila de comprobante en UNA transacción y valida el MIME/peso REALES
 * del objeto subido. `byteSize` debe ser el peso real del archivo.
 */
export async function submitTransferClaimRow(
  client: SupabaseClient,
  payload: {
    panoramaId: string;
    storagePath: string;
    mimeType: string;
    byteSize: number;
  },
): Promise<void> {
  const { error } = await client.rpc("submit_transfer_claim", {
    p_panorama_id: payload.panoramaId,
    p_storage_path: payload.storagePath,
    p_mime_type: payload.mimeType,
    p_byte_size: payload.byteSize,
  });
  if (error !== null) {
    throw new Error(error.message);
  }
}

/**
 * Reemplazo (o primer adjunto a una marca legacy de la era 004, D2) del
 * comprobante en «En revisión». El objeto ANTERIOR lo borra el trigger
 * de la base al pisar el `storage_path`.
 */
export async function updateActiveReceiptRow(
  client: SupabaseClient,
  payload: {
    panoramaId: string;
    storagePath: string;
    mimeType: string;
    byteSize: number;
  },
): Promise<void> {
  const { error } = await client.rpc("update_payment_receipt", {
    p_panorama_id: payload.panoramaId,
    p_storage_path: payload.storagePath,
    p_mime_type: payload.mimeType,
    p_byte_size: payload.byteSize,
  });
  if (error !== null) {
    throw new Error(error.message);
  }
}

/**
 * Respaldo post-cierre (D4) del dueño de fila: «Pagado» a mano SIN
 * comprobante; la RPC fija `confirmed_at` con el sello del pago.
 */
export async function attachReceiptPostCloseRow(
  client: SupabaseClient,
  payload: {
    panoramaId: string;
    storagePath: string;
    mimeType: string;
    byteSize: number;
  },
): Promise<void> {
  const { error } = await client.rpc("attach_post_close_receipt", {
    p_panorama_id: payload.panoramaId,
    p_storage_path: payload.storagePath,
    p_mime_type: payload.mimeType,
    p_byte_size: payload.byteSize,
  });
  if (error !== null) {
    throw new Error(error.message);
  }
}

/** Rechazo del creador (RF-5): nota opcional en español hasta 500 chars. */
export async function rejectPaymentTransferRow(
  client: SupabaseClient,
  payload: { panoramaId: string; participantId: string; note: string | null },
): Promise<void> {
  const { error } = await client.rpc("reject_payment_transfer", {
    p_panorama_id: payload.panoramaId,
    p_participant_id: payload.participantId,
    ...(payload.note !== null && payload.note !== ""
      ? { p_note: payload.note }
      : { p_note: null }),
  });
  if (error !== null) {
    throw new Error(error.message);
  }
}

/** Edición de la nota mientras la fila siga «Pendiente» (D3, creador). */
export async function updateRejectionNoteRow(
  client: SupabaseClient,
  payload: { panoramaId: string; participantId: string; note: string | null },
): Promise<void> {
  const { error } = await client.rpc("update_rejection_note", {
    p_panorama_id: payload.panoramaId,
    p_participant_id: payload.participantId,
    ...(payload.note !== null && payload.note !== ""
      ? { p_note: payload.note }
      : { p_note: null }),
  });
  if (error !== null) {
    throw new Error(error.message);
  }
}
