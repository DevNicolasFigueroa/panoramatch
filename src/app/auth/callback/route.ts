import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getSupabaseEnv } from "@/lib/supabase-env";
import { resolveInternalRedirectPath } from "@/core/auth-validation";

/**
 * Callback del OAuth/Correo: recibe el `code`, lo cambia por sesión (que
 * se fija en cookies) y regresa al `next` interno del panorama o al inicio.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");

  const cookieStore = await cookies();
  const cookieNext = cookieStore.get("panoramatch_next")?.value;
  const decodedCookieNext =
    cookieNext !== undefined ? decodeURIComponent(cookieNext) : undefined;
  const targetPath =
    resolveInternalRedirectPath(searchParams.get("next")) ??
    resolveInternalRedirectPath(decodedCookieNext) ??
    "/";

  const forwardedHost = request.headers.get("x-forwarded-host");
  const redirectOrigin = forwardedHost ? `https://${forwardedHost}` : origin;
  const redirectUrl = `${redirectOrigin}${targetPath}`;

  const response = NextResponse.redirect(redirectUrl);
  // Limpiamos la cookie de retorno temporal
  response.cookies.delete("panoramatch_next");

  const { url, anonKey } = getSupabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  if (errorParam !== null || code === null) {
    const loginError =
      errorParam !== null && /^[a-zA-Z0-9_]{1,60}$/.test(errorParam) ? errorParam : "auth";
    const errorUrl = `${redirectOrigin}/login?error=${loginError}${
      targetPath !== "/" ? `&next=${encodeURIComponent(targetPath)}` : ""
    }`;
    const errorResponse = NextResponse.redirect(errorUrl);
    errorResponse.cookies.delete("panoramatch_next");
    return errorResponse;
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error !== null) {
    const failUrl = `${redirectOrigin}/login?error=auth${
      targetPath !== "/" ? `&next=${encodeURIComponent(targetPath)}` : ""
    }`;
    const failResponse = NextResponse.redirect(failUrl);
    failResponse.cookies.delete("panoramatch_next");
    return failResponse;
  }

  return response;
}
