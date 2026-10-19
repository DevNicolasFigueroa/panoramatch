"use client";

/**
 * Clientes de Supabase. Solo esta capa (y el repo) conocen Supabase.
 *
 * Cliente único de sesión: `@supabase/ssr`, ligado a cookies. La auth es
 * universal: el creador y cada participante operan con su cuenta (Google o
 * correo), y la RLS valida `auth.uid()`; ya no existe cliente anónimo de
 * invitado (la fila legacy se adopta vía función segura de la base).
 */

import { createBrowserClient } from "@supabase/ssr";
import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/supabase-env";

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
