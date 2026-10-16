/**
 * Identidad del invitado en este dispositivo (localStorage).
 * Clave separada de los datos del creador: un invitado sin cuenta llega,
 * vota y puede volver a cambiar su voto desde el mismo navegador.
 */

import type { GuestIdentity } from "@/core/guest-participation";
import { isGuestSecretLike, isPanoramaIdLike } from "@/core/guest-participation";

export const PANORAMATCH_GUEST_KEY = "panoramatch-guest-v1";

const isBrowser = () => typeof window !== "undefined" && "localStorage" in window;

/** Carga todas las identidades guardadas y descarta las corruptas. */
export function loadGuestIdentities(): GuestIdentity[] {
  if (!isBrowser()) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(PANORAMATCH_GUEST_KEY);
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is GuestIdentity =>
        typeof item === "object" &&
        item !== null &&
        isPanoramaIdLike(String((item as GuestIdentity).panoramaId)) &&
        typeof (item as GuestIdentity).participantId === "string" &&
        (item as GuestIdentity).participantId !== "" &&
        typeof (item as GuestIdentity).name === "string" &&
        isGuestSecretLike((item as GuestIdentity).guestSecret),
    );
  } catch {
    return [];
  }
}

/** Identidad guardada para este panorama, si existe. */
export function getGuestIdentity(panoramaId: string): GuestIdentity | null {
  const found = loadGuestIdentities().find(
    (identity) => identity.panoramaId === panoramaId,
  );
  return found ?? null;
}

/** Guarda (inserta o reemplaza) la identidad del invitado para un panorama. */
export function saveGuestIdentity(identity: GuestIdentity): void {
  if (!isBrowser()) {
    return;
  }
  try {
    const rest = loadGuestIdentities().filter(
      (item) => item.panoramaId !== identity.panoramaId,
    );
    const next = [...rest, identity];
    window.localStorage.setItem(PANORAMATCH_GUEST_KEY, JSON.stringify(next));
  } catch {
    // Silencio: sin identidad guardada el invitado puede reingresar con nombre.
  }
}

/** Saca la identidad de este panorama (botón "Cambiar nombre"). */
export function clearGuestIdentity(panoramaId: string): void {
  if (!isBrowser()) {
    return;
  }
  try {
    const next = loadGuestIdentities().filter(
      (item) => item.panoramaId !== panoramaId,
    );
    window.localStorage.setItem(PANORAMATCH_GUEST_KEY, JSON.stringify(next));
  } catch {
    // Si falla, la identidad vieja se ignora porque no coincide en la lista.
  }
}
