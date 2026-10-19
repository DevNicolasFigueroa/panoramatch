"use client";

/**
 * Pantalla de login: Google o correo/contraseña (Requisito 1 + auth
 * universal). La validación de datos vive pura en `core/auth-validation.ts`;
 * aquí solo navegación y mensajes.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  getAuthValidationErrorMessage,
  resolveInternalRedirectPath,
  validatePasswordValue,
  validateEmailValue,
  validateSignUpInput,
} from "@/core/auth-validation";
import { useAuthSession, type EmailErrorReason } from "@/lib/use-auth-session";
import ThemeToggle from "@/components/theme-toggle";

const ERRORS_BY_CODE: Record<string, string> = {
  auth:
    "No pudimos iniciar sesión con Google. Vuelve a intentarlo o revisa que el proveedor esté activo.",
};

/** Texto amable por razón de fallo del acceso por correo. */
function getEmailErrorMessage(reason: EmailErrorReason): string {
  switch (reason) {
    case "email_taken":
      return "Ese correo ya tiene cuenta: cambia a la pestaña «Entrar».";
    case "confirmation_required":
      return "Revisa tu correo: si hace falta confirmar, hazlo y vuelve a «Entrar»; si ya tenías cuenta, entra con tu contraseña.";
    case "rate_limited":
      return "Demasiados intentos seguidos: espera un par de minutos y prueba de nuevo.";
    case "network_error":
      return "No se pudo conectar. Revisa tu conexión e intenta otra vez.";
    case "invalid_credentials":
      return "Correo o contraseña incorrectos.";
    default:
      return "No se pudo completar el acceso. Intenta otra vez.";
  }
}

type Tab = "google" | "signin" | "signup";

export default function LoginView({
  initialError,
  pendingNext,
}: {
  initialError?: string;
  pendingNext?: string | null;
}) {
  const router = useRouter();
  const { loginWithGoogle, signUpWithEmail, signInWithEmail } = useAuthSession();

  const [tab, setTab] = useState<Tab>("google");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(
    initialError === undefined ? null : ERRORS_BY_CODE[initialError] ?? null,
  );
  const [isBusy, setIsBusy] = useState(false);

  /** A dónde volver tras entrar (solo rutas internas validadas). */
  const nextPath =
    typeof pendingNext === "string"
      ? resolveInternalRedirectPath(pendingNext)
      : resolveInternalRedirectPath(null);
  const goNext = (fallback: string) => {
    router.push(nextPath ?? fallback);
    router.refresh();
  };

  const handleGoogle = async () => {
    setIsBusy(true);
    setError(null);
    try {
      await loginWithGoogle(nextPath);
      // signInWithOAuth redirige fuera de la app; nada más por aquí.
    } catch {
      setError("No se pudo abrir Google. Revisa tu conexión e intenta otra vez.");
      setIsBusy(false);
    }
  };

  const handleSignIn = async (formEvent: React.FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const emailCheck = validateEmailValue(email);
    if (!emailCheck.ok) {
      setError(getAuthValidationErrorMessage(emailCheck.error));
      return;
    }
    const passwordCheck = validatePasswordValue(password);
    if (!passwordCheck.ok) {
      setError(getAuthValidationErrorMessage(passwordCheck.error));
      return;
    }
    setIsBusy(true);
    setError(null);
    const result = await signInWithEmail(emailCheck.email, passwordCheck.password, nextPath);
    if (result.ok) {
      goNext("/");
      return;
    }
    setError(getEmailErrorMessage(result.reason));
    setIsBusy(false);
  };

  const handleSignUp = async (formEvent: React.FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const validation = validateSignUpInput({
      email,
      password,
      displayName,
    });
    if (!validation.ok) {
      setError(getAuthValidationErrorMessage(validation.error));
      return;
    }
    setIsBusy(true);
    setError(null);
    const result = await signUpWithEmail(validation.values, nextPath);
    if (result.ok) {
      goNext("/");
      return;
    }
    setError(getEmailErrorMessage(result.reason));
    setIsBusy(false);
  };

  const tabClass = (tabId: Tab) =>
    `rounded-lg px-3 py-1.5 text-sm font-bold transition ${
      tab === tabId
        ? "border border-ink/20 bg-paper text-ink"
        : "text-ink-soft hover:text-ink"
    }`;

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
          Arma la lista, parte el gasto en pesos chilenos y responde los
          panoramas que te compartieron. Todo con tu cuenta.
        </p>

        {/* Selector de método */}
        <nav className="mt-4 flex gap-1 rounded-xl border border-ink/10 bg-cancha-soft/50 p-1" aria-label="Método de acceso">
          <button type="button" onClick={() => { setTab("google"); setError(null); }} className={tabClass("google")}>
            Google
          </button>
          <button type="button" onClick={() => { setTab("signin"); setError(null); }} className={tabClass("signin")}>
            Entrar
          </button>
          <button type="button" onClick={() => { setTab("signup"); setError(null); }} className={tabClass("signup")}>
            Crear cuenta
          </button>
        </nav>

        {tab === "google" && (
          <button
            type="button"
            onClick={handleGoogle}
            disabled={isBusy}
            className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-xl border border-ink/25 bg-paper px-4 py-3 text-sm font-bold text-ink transition hover:border-ink/60 active:scale-[0.99] disabled:opacity-60"
          >
            {isBusy ? "Abriendo Google…" : "Continuar con Google"}
          </button>
        )}

        {tab === "signin" && (
          <form onSubmit={(formEvent) => void handleSignIn(formEvent)} noValidate className="mt-5 flex flex-col gap-2.5">
            <input
              type="email"
              value={email}
              onChange={(inputEvent) => { setEmail(inputEvent.target.value); setError(null); }}
              placeholder="tu-correo@gmail.com"
              autoComplete="email"
              className="w-full rounded-xl border border-ink/20 bg-paper px-3.5 py-2.5 text-base text-ink outline-none transition focus:border-cancha"
            />
            <input
              type="password"
              value={password}
              onChange={(inputEvent) => { setPassword(inputEvent.target.value); setError(null); }}
              placeholder="Tu contraseña"
              autoComplete="current-password"
              className="w-full rounded-xl border border-ink/20 bg-paper px-3.5 py-2.5 text-base text-ink outline-none transition focus:border-cancha"
            />
            <button
              type="submit"
              disabled={isBusy}
              className="mt-1 w-full rounded-xl border border-cancha bg-cancha px-4 py-3 text-sm font-bold text-elev transition active:scale-[0.99] disabled:opacity-60"
            >
              {isBusy ? "Entrando…" : "Entrar"}
            </button>
            <p className="text-xs text-ink-soft">¿Primera vez? Crea tu cuenta en la pestaña «Crear cuenta».</p>
          </form>
        )}

        {tab === "signup" && (
          <form onSubmit={(formEvent) => void handleSignUp(formEvent)} noValidate className="mt-5 flex flex-col gap-2.5">
            <input
              type="text"
              value={displayName}
              onChange={(inputEvent) => { setDisplayName(inputEvent.target.value); setError(null); }}
              placeholder="Tu nombre visible"
              maxLength={40}
              autoComplete="name"
              className="w-full rounded-xl border border-ink/20 bg-paper px-3.5 py-2.5 text-base text-ink outline-none transition focus:border-cancha"
            />
            <input
              type="email"
              value={email}
              onChange={(inputEvent) => { setEmail(inputEvent.target.value); setError(null); }}
              placeholder="tu-correo@gmail.com"
              autoComplete="email"
              className="w-full rounded-xl border border-ink/20 bg-paper px-3.5 py-2.5 text-base text-ink outline-none transition focus:border-cancha"
            />
            <input
              type="password"
              value={password}
              onChange={(inputEvent) => { setPassword(inputEvent.target.value); setError(null); }}
              placeholder="Contraseña (mínimo 8)"
              autoComplete="new-password"
              className="w-full rounded-xl border border-ink/20 bg-paper px-3.5 py-2.5 text-base text-ink outline-none transition focus:border-cancha"
            />
            <button
              type="submit"
              disabled={isBusy}
              className="mt-1 w-full rounded-xl border border-cancha bg-cancha px-4 py-3 text-sm font-bold text-elev transition active:scale-[0.99] disabled:opacity-60"
            >
              {isBusy ? "Creando cuenta…" : "Crear mi cuenta"}
            </button>
            <p className="text-xs text-ink-soft">
              El nombre con el que te van a ver sale de aquí; después participás igual por correo o con Google.
            </p>
          </form>
        )}

        {error !== null && (
          <p className="mt-3 text-xs font-semibold text-baja" role="alert">
            {error}
          </p>
        )}

        <p className="mt-6 text-xs leading-relaxed text-ink-soft">
          ¿Te llegaron los datos de un panorama?{" "}
          <span className="font-semibold text-ink">Abre el enlace e inicia sesión</span> para responder; si no tienes cuenta, crea una en «Crear cuenta».
        </p>
      </section>
    </div>
  );
}
