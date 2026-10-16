/**
 * Variables públicas de Supabase, compartidas por el cliente y el middleware
 * (edge). Solo valores públicos; nada de claves privadas en el repo.
 */

export const SUPABASE_HEADER_PARTICIPANT_SECRET = "x-participant-secret";

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

/** Lee y valida las variables públicas. */
export function getSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (url === "" || anonKey === "") {
    throw new Error(
      "Falta NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local",
    );
  }
  return { url, anonKey };
}
