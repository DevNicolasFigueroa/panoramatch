import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseEnv } from "@/lib/supabase-env";

/**
 * Refresca la sesión de Supabase en cada petición (patrón de @supabase/ssr)
 * y protege las rutas de participación: auth universal, nadie responde un
 * panorama sin sesión. La protección de "/" vive en su server component.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { url, anonKey } = getSupabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // /p/<panorama_id>: solo con sesión; de vuelta va al login con `next`.
  if (data.user === null && path.startsWith("/p/")) {
    const redirectTo = request.nextUrl.clone();
    redirectTo.pathname = "/login";
    redirectTo.search = `?next=${encodeURIComponent(`${path}${request.nextUrl.search}`)}`;
    return NextResponse.redirect(redirectTo);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Todo menos: assets estáticos (Next), favicon y archivos de imagen.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
