"use client";

/**
 * Sesión de Google vía Supabase Auth. Solo hidratación y pasamanos:
 * las reglas del dominio siguen viviendo en `src/core/`.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

/** Datos mínimos del usuario para la UI (cabecera y saludo). */
export interface AuthUser {
  userId: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
}

/** Lo que expone el hook. */
export interface AuthSession {
  user: AuthUser | null;
  /* true cuando ya se resolvió la sesión en el navegador (evita parpadeo). */
  isAuthReady: boolean;
  loginWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuthSession(): AuthSession {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const client = getSupabaseBrowserClient();

    const readSession = async () => {
      const { data } = await client.auth.getSession();
      if (cancelled) {
        return;
      }
      const sessionUser = data.session?.user ?? null;
      setUser(resolveUser(sessionUser));
      setIsAuthReady(true);
    };

    void readSession();

    const { data: subscription } = client.auth.onAuthStateChange(() => {
      void readSession();
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback`
            : "/auth/callback",
      },
    });
  }, []);

  const signOut = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    await client.auth.signOut();
    setUser(null);
    router.push("/login");
    router.refresh();
  }, [router]);

  return { user, isAuthReady, loginWithGoogle, signOut };
}

/** De la sesión cruda de Supabase a la interfaz mínima de la UI. */
function resolveUser(sessionUser: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
} | null): AuthUser | null {
  if (sessionUser === null) {
    return null;
  }
  const meta = sessionUser.user_metadata ?? {};
  const displayName =
    (typeof meta.full_name === "string" && meta.full_name !== ""
      ? meta.full_name
      : null) ??
    (typeof meta.name === "string" && meta.name !== "" ? meta.name : null) ??
    sessionUser.email ??
    "Usuario";
  return {
    userId: sessionUser.id,
    email: sessionUser.email ?? null,
    displayName,
    avatarUrl:
      typeof meta.avatar_url === "string" && meta.avatar_url !== ""
        ? meta.avatar_url
        : null,
  };
}
