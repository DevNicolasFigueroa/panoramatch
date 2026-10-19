import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSupabaseEnv } from "@/lib/supabase-env";
import LoginView from "@/components/login-view";
import { resolveInternalRedirectPath } from "@/core/auth-validation";

/**
 * Pantalla de acceso (Requisito 1). Si ya hay sesión, directo al dashboard
 * (o al panorama que pedía el `next`).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const paramsResolved = await searchParams;
  const rawError = paramsResolved.error;
  const initialError = typeof rawError === "string" ? rawError : undefined;
  const rawNext = paramsResolved.next;
  // El `next` solo viaja si es una ruta interna con nuestra forma; lo demás
  // se descarta (nada de open-redirect).
  const pendingNext = resolveInternalRedirectPath(
    typeof rawNext === "string" ? rawNext : undefined,
  );

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
  if (data.user !== null) {
    redirect(pendingNext ?? "/");
  }

  return <LoginView initialError={initialError} pendingNext={pendingNext} />;
}
