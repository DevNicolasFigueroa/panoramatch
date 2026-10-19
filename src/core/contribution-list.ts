/**
 * Dominio "Lista de aportes" (checklist) para el modo Colaborativo (spec 002).
 *
 * Reglas de producto:
 * - Cada ítem ("Carbón", "2 bolsas de hielo"…) tiene 0 o 1 responsable: quien
 *   va y está dentro del cupo toma un ítem libre («Yo lo llevo») o libera el
 *   que él mismo lleva; una persona puede llevar varios ítems.
 * - El creador es «Voy» permanente: toma y libera como cualquiera.
 * - Añadir ítems: el creador y los confirmados "Voy" con identidad propia
 *   (enlace o cuenta); anotados a mano no reclaman nada.
 * - Si un responsable deja de estar "Voy" (o cae a Lista de Espera), sus
 *   ítems quedan libres al momento.
 * - Eliminar: solo el creador y solo ítems libres.
 * - Listado: ítems libres primero y luego los tomados (orden de creación
 *   dentro de cada grupo); progreso "X de Y" público para todos.
 *
 * Este módulo es puro: sin React, sin DOM, sin red y sin Supabase.
 */

import type { Attendee } from "./types";
import { classifyAttendees, normalizeAttendeeName } from "./quota-manager";

/** Techo de ítems por panorama (spec RF-2). */
export const MAX_CONTRIBUTION_ITEMS = 10;

/** Largo máximo del texto del ítem (la cantidad vive dentro del texto). */
export const MAX_CONTRIBUTION_NAME_LENGTH = 40;

/** Referencia fija del responsable creador ("creator"). */
export const CREATOR_CLAIM_REF = "creator";

/** Un ítem de la lista de aportes. */
export interface ContributionItem {
  id: string;
  name: string;
  /** 'creator' o el id del participante que lo lleva; null = libre. */
  claimedByRef: string | null;
}

/** Quién acciona el reclamo: el creador o un participante con identidad. */
export type ContributionClaimer =
  | { kind: "creator" }
  | { kind: "participant"; participantId: string };

/** Motivos de rechazo de las operaciones (textos de la UI, en español). */
export type ContributionRuleError =
  | "empty_name"
  | "too_long"
  | "duplicate_name"
  | "max_items"
  | "unknown_item"
  | "taken"
  | "not_allowed"
  | "not_mine";

/** Mensaje legible por motivo (presentación, en español). */
export function getContributionRuleErrorMessage(error: ContributionRuleError): string {
  switch (error) {
    case "empty_name":
      return "Primero escribe qué hay que llevar.";
    case "too_long":
      return `El nombre del ítem es demasiado largo (máx. ${MAX_CONTRIBUTION_NAME_LENGTH} caracteres).`;
    case "duplicate_name":
      return "Ese ítem ya está en la lista.";
    case "max_items":
      return `Máximo ${MAX_CONTRIBUTION_ITEMS} ítems por panorama.`;
    case "unknown_item":
      return "Ese ítem ya no está en la lista.";
    case "taken":
      return "Ese ítem ya lo lleva otra persona.";
    case "not_allowed":
      return "Solo los confirmados «Voy» dentro del cupo pueden llevar ítems.";
    case "not_mine":
      return "Solo quien lo lleva puede liberarlo.";
    default:
      return "No se pudo completar la operación.";
  }
}

/** Resultado genérico de las operaciones puras de la lista. */
export interface ContributionOpResult {
  ok: boolean;
  reason?: ContributionRuleError;
  items?: ContributionItem[];
}

/** Resultado del progreso "X de Y" de la lista. */
export interface ContributionProgress {
  total: number;
  claimed: number;
  isEmpty: boolean;
  isComplete: boolean;
}

/** Normaliza el texto del ítem igual que participantes y lugares (trims). */
export function normalizeContributionName(name: string): string {
  return normalizeAttendeeName(name);
}

/** Detecta ítem duplicado por nombre (sin mayúsculas ni espacios extra). */
export function isDuplicateContributionName(
  items: readonly ContributionItem[],
  name: string,
  excludeItemId?: string,
): boolean {
  const normalized = normalizeContributionName(name).toLowerCase();
  if (normalized === "") {
    return false;
  }
  return items.some(
    (item) =>
      item.id !== excludeItemId &&
      normalizeContributionName(item.name).toLowerCase() === normalized,
  );
}

/** ¿El ítem está libre (nadie lo lleva)? */
export function isContributionFree(item: ContributionItem): boolean {
  return item.claimedByRef === null;
}

/** Convierte el reclamante en su referencia única ('creator' o id). */
export function toClaimRef(claimer: ContributionClaimer): string {
  return claimer.kind === "creator" ? CREATOR_CLAIM_REF : claimer.participantId;
}

/** ¿El participante va "Voy" dentro del cupo (titular)? */
function isGoingWithinCapacity(
  attendee: Attendee | undefined,
  attendees: readonly Attendee[],
  maxCapacity: number | null,
): boolean {
  if (attendee === undefined || attendee.status !== "going") {
    return false;
  }
  if (maxCapacity === null) {
    return true;
  }
  const titulars = classifyAttendees(attendees, maxCapacity).titulars;
  return titulars.some((candidate) => candidate.id === attendee.id);
}

/**
 * ¿Este reclamante puede tomar/liberar ítems?
 * - Creador: siempre (es "Voy" permanente).
 * - Participante: solo si va "Voy" dentro del cupo y tiene identidad propia
 *   (llegó por el enlace o con cuenta; los anotados a mano no reclaman).
 */
export function isClaimAuthorized(
  claimer: ContributionClaimer,
  attendees: readonly Attendee[],
  maxCapacity: number | null,
): boolean {
  if (claimer.kind === "creator") {
    return true;
  }
  const attendee = attendees.find((item) => item.id === claimer.participantId);
  if (attendee === undefined || attendee.creatorAdded === true) {
    return false;
  }
  return isGoingWithinCapacity(attendee, attendees, maxCapacity);
}

/* ─────────────── Ítems ─────────────── */

/** Agrega un ítem a la lista; requiere autorización, máx. y nombre único. */
export function addContributionItem(
  items: readonly ContributionItem[],
  rawName: string,
  newItemId: string,
  claimer: ContributionClaimer,
  attendees: readonly Attendee[],
  maxCapacity: number | null,
): ContributionOpResult {
  if (!isClaimAuthorized(claimer, attendees, maxCapacity)) {
    return { ok: false, reason: "not_allowed", items: [...items] };
  }
  const normalized = normalizeContributionName(rawName);
  if (normalized === "") {
    return { ok: false, reason: "empty_name", items: [...items] };
  }
  if (normalized.length > MAX_CONTRIBUTION_NAME_LENGTH) {
    return { ok: false, reason: "too_long", items: [...items] };
  }
  if (isDuplicateContributionName(items, normalized)) {
    return { ok: false, reason: "duplicate_name", items: [...items] };
  }
  if (items.length >= MAX_CONTRIBUTION_ITEMS) {
    return { ok: false, reason: "max_items", items: [...items] };
  }
  return {
    ok: true,
    items: [...items, { id: newItemId, name: normalized, claimedByRef: null }],
  };
}

/** Elimina un ítem: solo el creador y solo si está libre. */
export function removeContributionItem(
  items: readonly ContributionItem[],
  itemId: string,
  claimer: ContributionClaimer,
  attendees: readonly Attendee[],
  maxCapacity: number | null,
): ContributionOpResult {
  if (claimer.kind !== "creator") {
    return { ok: false, reason: "not_allowed", items: [...items] };
  }
  const target = items.find((item) => item.id === itemId);
  if (target === undefined) {
    return { ok: false, reason: "unknown_item", items: [...items] };
  }
  if (!isContributionFree(target)) {
    return { ok: false, reason: "taken", items: [...items] };
  }
  return { ok: true, items: items.filter((item) => item.id !== itemId) };
}

/* ─────────────── Reclamos («Yo lo llevo» / liberar) ─────────────── */

/** Toma un ítem libre: queda con el nombre del reclamante al instante. */
export function claimContributionItem(
  items: readonly ContributionItem[],
  itemId: string,
  claimer: ContributionClaimer,
  attendees: readonly Attendee[],
  maxCapacity: number | null,
): ContributionOpResult {
  if (!isClaimAuthorized(claimer, attendees, maxCapacity)) {
    return { ok: false, reason: "not_allowed", items: [...items] };
  }
  const target = items.find((item) => item.id === itemId);
  if (target === undefined) {
    return { ok: false, reason: "unknown_item", items: [...items] };
  }
  if (!isContributionFree(target)) {
    return { ok: false, reason: "taken", items: [...items] };
  }
  const claimRef = toClaimRef(claimer);
  return {
    ok: true,
    items: items.map((item) =>
      item.id === itemId ? { ...item, claimedByRef: claimRef } : item,
    ),
  };
}

/** Libera un ítem: solo quien lo lleva; vuelve a estar libre. */
export function releaseContributionItem(
  items: readonly ContributionItem[],
  itemId: string,
  claimer: ContributionClaimer,
  attendees: readonly Attendee[],
  maxCapacity: number | null,
): ContributionOpResult {
  if (!isClaimAuthorized(claimer, attendees, maxCapacity)) {
    return { ok: false, reason: "not_allowed", items: [...items] };
  }
  const target = items.find((item) => item.id === itemId);
  if (target === undefined) {
    return { ok: false, reason: "unknown_item", items: [...items] };
  }
  if (target.claimedByRef !== toClaimRef(claimer)) {
    return { ok: false, reason: "not_mine", items: [...items] };
  }
  return {
    ok: true,
    items: items.map((item) =>
      item.id === itemId ? { ...item, claimedByRef: null } : item,
    ),
  };
}

/**
 * Libera automáticamente TODOS los ítems de un reclamante cuando este deja
 * de estar "Voy" (paso a "En duda"/"No puedo" o caída a Lista de Espera).
 * Los ítems permanecen en la lista, solo vuelven a estar libres.
 */
export function dropContributionClaims(
  items: readonly ContributionItem[],
  claimerRef: string,
): ContributionItem[] {
  return items.map((item) =>
    item.claimedByRef === claimerRef ? { ...item, claimedByRef: null } : item,
  );
}

/* ─────────────── Listado y progreso ─────────────── */

/**
 * Orden de presentación (spec RF-7): ítems LIBRES primero y luego los que
 * ya tienen responsable; el orden de creación se conserva dentro de cada
 * grupo (los filtros preservan el orden original).
 */
export function sortContributionItems(
  items: readonly ContributionItem[],
): ContributionItem[] {
  const free = items.filter((item) => isContributionFree(item));
  const claimed = items.filter((item) => !isContributionFree(item));
  return [...free, ...claimed];
}

/** Progreso público "X de Y": la lista vacía NO es "0 de 0". */
export function getContributionProgress(
  items: readonly ContributionItem[],
): ContributionProgress {
  const total = items.length;
  const claimed = items.filter((item) => !isContributionFree(item)).length;
  return {
    total,
    claimed,
    isEmpty: total === 0,
    isComplete: total > 0 && claimed === total,
  };
}
