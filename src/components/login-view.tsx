"use client";

/**
 * Pantalla de login: la única vía de entrada del creador es Google
 * (Requisito 1). Cero lógica de dominio aquí.
 */

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import ThemeToggle from "@/components/theme-toggle";

const ERRORS_BY_CODE: Record<string, string> = {
  auth:
    "No pudimos iniciar sesión con Google. Vuelve a intentarlo o revisa que el proveedor esté activo.",
};

export default function LoginView({ initialError }: { initialError?: string }) {
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError === undefined ? null : ERRORS_BY_CODE[initialError] ?? null,
  );

  // OAuth redirige fuera y de vuelta: si la sesión ya existe tras volver,
  // el server component de "/" manda al dashboard; aquí solo se inicia.
  useEffect(() => {
    void getSupabaseBrowserClient();
  }, []);

  const handleGoogle = async () => {
    setIsLaunching(true);
    setError(null);
    try {
      const client = getSupabaseBrowserClient();
      const { error: authError } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (authError !== null) {
        setError(authError.message);
      }
    } catch {
      setError("No se pudo abrir Google. Revisa tu conexión e intenta otra vez.");
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="flex min-h-dvh w-full items-center justify-center px-4">
      <section className="w-full max-w-sm rounded-2xl border border-ink/15 bg-elev p-6">
        <header className="flex items-center justify-between select-none">
          <h1 className="font-display text-xl font-bold tracking-tight">
            <span className="text-ink">Panora</span>
            <span className="text-cancha">Match</span>
          </h1>
          <ThemeToggle />
        </header>

        <p className="mt-3 text-sm text-ink-soft">
          Arma la lista, parte el gasto en pesos chilenos y comparte el enlace
          para que tus amigos respondan sin crear cuenta.
        </p>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={isLaunching}
          className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-xl border border-ink/25 bg-paper px-4 py-3 text-sm font-bold text-ink transition hover:border-ink/60 active:scale-[0.99] disabled:opacity-60"
        >
          {(isLaunching) ? "Abriendo Google…" : "Continuar con Google"}
        </button>

        {error !== null && (
          <p className="mt-3 text-xs font-semibold text-baja" role="alert">
            {error}
          </p>
        )}

        <p className="mt-6 text-xs leading-relaxed text-ink-soft">
          ¿Te llegaron los datos de un panorama?
          Abre el enlace que te mandó el organizador:{" "}
          <span className="font-semibold text-ink">puedes responder sin iniciar sesión</span>.
        </p>
      </section>
    </div>
  );
}
