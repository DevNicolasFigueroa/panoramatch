import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getSupabaseEnv } from "@/lib/supabase-env";
import { resolveInternalRedirectPath } from "@/core/auth-validation";

/**
 * Callback del OAuth/Correo: recibe el `code`, lo cambia por sesión (que
 * queda en cookies via middleware) y regresa al `next` interno o al inicio.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");

  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Llamado desde un Server Component: el middleware ya pone las cookies.
        }
      },
    },
  });

  if (errorParam !== null || code === null) {
    const safeNext = resolveInternalRedirectPath(searchParams.get("next"));
    return NextResponse.redirect(`${origin}/login?error=auth${safeNext !== null ? `&next=${encodeURIComponent(safeNext)}` : ""}`);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error !== null) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  return NextResponse.redirect(`${origin}${resolveInternalRedirectPath(searchParams.get("next")) ?? "/"}`);
}
