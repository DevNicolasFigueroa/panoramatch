"use client";

/**
 * Sesión de Supabase Auth (Google o correo). Solo hidratación y pasamanos:
 * las reglas del dominio siguen viviendo en `src/core/` (validación de los
 * datos del acceso: `core/auth-validation.ts`).
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import type { SignUpInputValues } from "@/core/auth-validation";

/** Datos mínimos del usuario para la UI (cabecera y saludo). */
export interface AuthUser {
  userId: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
}

/** Lanza Google y regresa a `/auth/callback` (el callback devuelve al `next`). */
function buildGoogleRedirectTo(nextPath: string | null): string {
  const callback =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : "/auth/callback";
  return nextPath === null ? callback : `${callback}?next=${encodeURIComponent(nextPath)}`;
}

/** Lo que expone el hook. */
export interface AuthSession {
  user: AuthUser | null;
  /* true cuando ya se resolvió la sesión en el navegador (evita parpadeo). */
  isAuthReady: boolean;
  loginWithGoogle: (nextPath?: string | null) => Promise<void>;
  signUpWithEmail: (
    values: SignUpInputValues,
    nextPath?: string | null,
  ) => Promise<EmailResult>;
  signInWithEmail: (
    email: string,
    password: string,
    nextPath?: string | null,
  ) => Promise<EmailResult>;
  signOut: () => Promise<void>;
}

/** Resultado de una operación de acceso por correo. */
export type EmailResult =
  | { ok: true }
  | { ok: false; reason: EmailErrorReason; rawMessage?: string };

export type EmailErrorReason =
  | "invalid_credentials"
  | "email_taken"
  | "confirmation_required"
  | "rate_limited"
  | "network_error";

const REASON_BY_MESSAGE: Array<{ pattern: RegExp; reason: EmailErrorReason }> = [
  { pattern: /already registered/i, reason: "email_taken" },
  { pattern: /over_email_send_rate_limit|rate limit/i, reason: "rate_limited" },
  { pattern: /invalid login/i, reason: "invalid_credentials" },
  { pattern: /email.*not.*confirm/i, reason: "invalid_credentials" },
];

function toEmailResult(error: { message: string } | null): EmailResult {
  if (error === null) {
    return { ok: true };
  }
  const matched = REASON_BY_MESSAGE.find((entry) =>
    entry.pattern.test(error.message),
  );
  return {
    ok: false,
    reason: matched?.reason ?? "invalid_credentials",
    rawMessage: error.message,
  };
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

  const loginWithGoogle = useCallback(async (nextPath?: string | null) => {
    const client = getSupabaseBrowserClient();
    await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: buildGoogleRedirectTo(nextPath ?? null) },
    });
  }, []);

  /** Registro con correo: sesión inmediata si la confirmación está apagada. */
  const signUpWithEmail = useCallback(
    async (values: SignUpInputValues, nextPath?: string | null): Promise<EmailResult> => {
      try {
        const client = getSupabaseBrowserClient();
        const { data, error } = await client.auth.signUp({
          email: values.email,
          password: values.password,
          options: {
            data: { full_name: values.displayName },
            emailRedirectTo: buildGoogleRedirectTo(nextPath ?? null),
          },
        });
        if (error !== null) {
          return toEmailResult(error);
        }
        if (data.session === null) {
          // El proyecto debe tener la confirmación de correo DESACTIVADA;
          // si algún día se activa, esto manda al mensaje correcto.
          return { ok: false, reason: "confirmation_required" };
        }
        // La sesión quedó en cookies; el caller navega a `next`.
        return { ok: true };
      } catch {
        return { ok: false, reason: "network_error" };
      }
    },
    [],
  );

  /** Acceso con correo y contraseña ya registrados. */
  const signInWithEmail = useCallback(
    async (email: string, password: string, nextPath?: string | null): Promise<EmailResult> => {
      try {
        const client = getSupabaseBrowserClient();
        const { error } = await client.auth.signInWithPassword({ email, password });
        const result = toEmailResult(error as { message: string } | null);
        if (result.ok) {
          void nextPath;
        }
        return result;
      } catch {
        return { ok: false, reason: "network_error" };
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    await client.auth.signOut();
    setUser(null);
    router.push("/login");
    router.refresh();
  }, [router]);

  return { user, isAuthReady, loginWithGoogle, signUpWithEmail, signInWithEmail, signOut };
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
