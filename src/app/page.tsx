import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSupabaseEnv } from "@/lib/supabase-env";
import PanoramaApp from "@/components/panorama-app";

/**
 * Dashboard del creador (Requisito 2): solo usuarios autenticados.
 * Los invitados externos participan desde `/p/<panorama_id>` sin cuenta
 * (Requisito 3), así que aquí nadie los bloquea con un login forzado.
 */
export default async function HomePage() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // Sin escritura de cookies desde Server Component: lo hace el middleware.
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (data.user === null) {
    redirect("/login");
  }

  return <PanoramaApp />;
}
