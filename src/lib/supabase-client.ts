"use client";

/**
 * Clientes de Supabase. Solo esta capa (y el repo) conocen Supabase.
 *
 * - Cliente de sesión: `@supabase/ssr`, ligado a cookies (usuario con Google).
 * - Cliente de invitado: `@supabase/supabase-js` plano, con el secreto del
 *   invitado en un header propio; `participants_guest_*` en la base lo
 *   valida contra ese header para permitir el voto sin cuenta.
 */

import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/supabase-env";
import { SUPABASE_HEADER_PARTICIPANT_SECRET as PARTICIPANT_SECRET_HEADER } from "@/lib/supabase-env";

export { PARTICIPANT_SECRET_HEADER };

let browserClient: SupabaseClient | null = null;

/** Cliente con sesión (cookies). Singleton: una sola instancia por página. */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient !== null) {
    return browserClient;
  }
  const { url, anonKey } = getSupabaseEnv();
  browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}

/**
 * Cliente anónimo del invitado. Sin sesión ni cookies; si se pasa secreto,
 * va en el header de participant (así la RLS lo acepta o rechaza el voto).
 */
export function createGuestSupabaseClient(guestSecret?: string): SupabaseClient {
  const { url, anonKey } = getSupabaseEnv();
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global:
      guestSecret !== undefined
        ? { headers: { [PARTICIPANT_SECRET_HEADER]: guestSecret } }
        : undefined,
  });
}
