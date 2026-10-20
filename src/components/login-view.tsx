"use client";

/**
 * Pantalla de login: la identidad de la app es la boleta (papel, tinta y
 * sombra dura). Google arriba, perforación punteada, correo/contraseña
 * debajo. La validación vive pura en `core/auth-validation.ts`; aquí solo
 * navegación, estados y mensajes.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  getAuthValidationErrorMessage,
  resolveInternalRedirectPath,
  validateEmailValue,
  validatePasswordValue,
  validateSignUpInput,
} from "@/core/auth-validation";
import type { EmailErrorReason } from "@/lib/use-auth-session";
import { useAuthSession } from "@/lib/use-auth-session";
import ThemeToggle from "@/components/theme-toggle";

/** Mensajería por código de error que llega a /login desde el callback. */
const ERRORS_BY_CODE: Record<string, string> = {
  auth: "No pudimos completar el ingreso. Vuelve a intentarlo.",
  access_denied: "Cancelaste el ingreso con Google. Puedes intentarlo de nuevo cuando quieras.",
  user_cancelled_login: "Cancelaste el ingreso con Google. Puedes intentarlo de nuevo cuando quieras.",
};

/** Texto amable por razón de fallo del acceso por correo. */
function getEmailErrorMessage(reason: EmailErrorReason): string {
  switch (reason) {
    case "email_taken":
      return "Ese correo ya tiene cuenta: entra con tu contraseña o usa Google.";
    case "confirmation_required":
      return "Revisa tu correo: si hace falta confirmar, hazlo y vuelve a entrar; si ya tenías cuenta, entra con tu contraseña.";
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

/** Logo oficial de Google (multicolor, el único cuerpo que no tintamos). */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a11.96 11.96 0 0 0 0 10.76l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

/** Ruleta de carga (el CSS global ya la respeta con reduced-motion). */
function Spinner({ light = false }: { light?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`h-[18px] w-[18px] animate-spin rounded-full border-2 ${
        light ? "border-elev/30 border-t-elev" : "border-ink/20 border-t-ink"
      }`}
    />
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="m4 4 16 16" strokeLinecap="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 3.5 2.5 20h19L12 3.5Z" strokeLinejoin="round" />
      <path d="M12 10v4.5" strokeLinecap="round" />
      <path d="M12 17.25v.01" strokeLinecap="round" />
    </svg>
  );
}

/** Etiqueta + campo compartidos por los formularios. */
const inputClasses =
  "w-full rounded-xl border border-ink/20 bg-paper px-3.5 py-2.5 text-base text-ink outline-none transition focus:border-cancha disabled:opacity-60";

type Mode = "signin" | "signup";

export default function LoginView({
  initialError,
  pendingNext,
}: {
  initialError?: string;
  pendingNext?: string | null;
}) {
  const router = useRouter();
  const { loginWithGoogle, signUpWithEmail, signInWithEmail } = useAuthSession();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError === undefined ? null : (ERRORS_BY_CODE[initialError] ?? ERRORS_BY_CODE.auth),
  );
  const [busyAction, setBusyAction] = useState<"google" | "email" | null>(null);
  const isBusy = busyAction !== null;

  /** A dónde volver tras entrar (solo rutas internas validadas). */
  const nextPath = resolveInternalRedirectPath(
    typeof pendingNext === "string" ? pendingNext : null,
  );
  const goNext = (fallback: string) => {
    router.push(nextPath ?? fallback);
    router.refresh();
  };

  const handleGoogle = async () => {
    setBusyAction("google");
    setError(null);
    try {
      await loginWithGoogle(nextPath);
      // signInWithOAuth redirige fuera de la app; nada más por aquí.
    } catch {
      setError("No se pudo abrir Google. Revisa tu conexión e intenta otra vez.");
      setBusyAction(null);
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
    setBusyAction("email");
    setError(null);
    const result = await signInWithEmail(emailCheck.email, passwordCheck.password, nextPath);
    if (result.ok) {
      goNext("/");
      return;
    }
    setError(getEmailErrorMessage(result.reason));
    setBusyAction(null);
  };

  const handleSignUp = async (formEvent: React.FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const validation = validateSignUpInput({ email, password, displayName });
    if (!validation.ok) {
      setError(getAuthValidationErrorMessage(validation.error));
      return;
    }
    setBusyAction("email");
    setError(null);
    const result = await signUpWithEmail(validation.values, nextPath);
    if (result.ok) {
      goNext("/");
      return;
    }
    setError(getEmailErrorMessage(result.reason));
    setBusyAction(null);
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setError(null);
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col justify-center gap-8 px-4 py-8 sm:gap-10 sm:px-8 sm:py-12">
      <div className="grid items-center gap-8 sm:grid-cols-[minmax(0,1fr)_400px] sm:gap-12">
        {/* Presentación: por qué vale la pena tener tu cuenta aquí */}
        <header className="-order-1">
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            <span className="text-ink">Panora</span>
            <span className="text-cancha">Match</span>
          </h1>
          <p className="mt-3 max-w-md font-display text-xl font-semibold leading-snug text-ink sm:text-2xl">
            Arma el panorama, divide la cuenta.
          </p>
          <ul className="mt-5 flex max-w-md flex-col gap-2.5">
            <li className="flex items-start gap-2.5 text-sm leading-snug text-ink-soft">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-[2px] bg-cancha" />
              Tus panoramas quedan guardados y los abres desde cualquier dispositivo.
            </li>
            <li className="flex items-start gap-2.5 text-sm leading-snug text-ink-soft">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-[2px] bg-cancha" />
              Tu respuesta viaja con tu cuenta: la cambias cuando quieras.
            </li>
            <li className="flex items-start gap-2.5 text-sm leading-snug text-ink-soft">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-[2px] bg-cancha" />
              Gastos divididos en pesos chilenos, sin planillas ni calculadora.
            </li>
          </ul>
        </header>

        {/* La boleta: acceso con Google arriba, correo-perforación-correo abajo */}
        <section className="relative rounded-2xl border border-ink bg-elev p-5 shadow-boleta sm:p-6">
          <div className="flex justify-end">
            <ThemeToggle />
          </div>

          <button
            type="button"
            onClick={() => void handleGoogle()}
            disabled={isBusy}
            aria-busy={busyAction === "google"}
            className="mt-3 flex w-full items-center justify-center gap-2.5 rounded-xl border border-ink/25 bg-paper px-4 py-3 text-sm font-bold text-ink transition hover:border-ink/60 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
          >
            {busyAction === "google" ? <Spinner /> : <GoogleLogo />}
            <span>{busyAction === "google" ? "Conectando con Google…" : "Iniciar sesión con Google"}</span>
          </button>

          {/* Perforación de boleta: elegir entre los dos caminos */}
          <div className="relative my-5" aria-hidden="true">
            <div className="border-t border-dashed border-ink/30" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-elev px-2.5 text-xs font-semibold text-ink-soft">
              o con tu correo
            </span>
          </div>

          {mode === "signin" ? (
            <form onSubmit={(formEvent) => void handleSignIn(formEvent)} noValidate className="flex flex-col gap-3.5">
              <label className="block text-xs font-semibold text-ink-soft" htmlFor="login-email">
                Correo
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(inputEvent) => {
                  setEmail(inputEvent.target.value);
                  if (error !== null) {
                    setError(null);
                  }
                }}
                placeholder="tu-correo@gmail.com"
                autoComplete="email"
                disabled={isBusy}
                className={inputClasses}
              />
              <label className="block text-xs font-semibold text-ink-soft" htmlFor="login-password">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={isPasswordVisible ? "text" : "password"}
                  value={password}
                  onChange={(inputEvent) => {
                    setPassword(inputEvent.target.value);
                    if (error !== null) {
                      setError(null);
                    }
                  }}
                  placeholder="Tu contraseña"
                  autoComplete="current-password"
                  disabled={isBusy}
                  className={`${inputClasses} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                  aria-label={isPasswordVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={isPasswordVisible}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-ink-soft transition hover:text-ink"
                >
                  {isPasswordVisible ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              <button
                type="submit"
                disabled={isBusy}
                aria-busy={busyAction === "email"}
                className="mt-1 flex w-full items-center justify-center gap-2.5 rounded-xl border border-cancha bg-cancha px-4 py-3 text-sm font-bold text-elev transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
              >
                {busyAction === "email" && <Spinner light />}
                <span>{busyAction === "email" ? "Entrando…" : "Entrar"}</span>
              </button>
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className="text-xs text-ink-soft transition hover:text-ink"
              >
                ¿Primera vez aquí? <span className="font-semibold text-cancha">Crear cuenta</span>
              </button>
            </form>
          ) : (
            <form onSubmit={(formEvent) => void handleSignUp(formEvent)} noValidate className="flex flex-col gap-3.5">
              <label className="block text-xs font-semibold text-ink-soft" htmlFor="signup-name">
                Tu nombre visible
              </label>
              <input
                id="signup-name"
                type="text"
                value={displayName}
                onChange={(inputEvent) => {
                  setDisplayName(inputEvent.target.value);
                  if (error !== null) {
                    setError(null);
                  }
                }}
                placeholder="Cómo te ven tus amigos"
                maxLength={40}
                autoComplete="name"
                disabled={isBusy}
                className={inputClasses}
              />
              <label className="block text-xs font-semibold text-ink-soft" htmlFor="signup-email">
                Correo
              </label>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(inputEvent) => {
                  setEmail(inputEvent.target.value);
                  if (error !== null) {
                    setError(null);
                  }
                }}
                placeholder="tu-correo@gmail.com"
                autoComplete="email"
                disabled={isBusy}
                className={inputClasses}
              />
              <label className="block text-xs font-semibold text-ink-soft" htmlFor="signup-password">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="signup-password"
                  type={isPasswordVisible ? "text" : "password"}
                  value={password}
                  onChange={(inputEvent) => {
                    setPassword(inputEvent.target.value);
                    if (error !== null) {
                      setError(null);
                    }
                  }}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  disabled={isBusy}
                  className={`${inputClasses} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                  aria-label={isPasswordVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={isPasswordVisible}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-ink-soft transition hover:text-ink"
                >
                  {isPasswordVisible ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              <button
                type="submit"
                disabled={isBusy}
                aria-busy={busyAction === "email"}
                className="mt-1 flex w-full items-center justify-center gap-2.5 rounded-xl border border-cancha bg-cancha px-4 py-3 text-sm font-bold text-elev transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
              >
                {busyAction === "email" && <Spinner light />}
                <span>{busyAction === "email" ? "Creando cuenta…" : "Crear cuenta y entrar"}</span>
              </button>
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="text-xs text-ink-soft transition hover:text-ink"
              >
                ¿Ya tienes cuenta? <span className="font-semibold text-cancha">Entrar</span>
              </button>
            </form>
          )}

          {error !== null && (
            <div
              role="alert"
              aria-live="assertive"
              className="mt-4 flex items-start gap-2 rounded-xl border border-baja/40 bg-baja-soft px-3 py-2.5 text-baja"
            >
              <AlertIcon />
              <p className="text-xs font-semibold leading-relaxed">{error}</p>
            </div>
          )}
        </section>
      </div>

      {/* ¿Por qué pide cuenta quien solo venía a responder? */}
      <p className="mx-auto max-w-md text-center text-xs leading-relaxed text-ink-soft">
        ¿Llegaste por el enlace de un panorama? También usamos tu cuenta
        (con Google es un toque) para guardar tu confirmación en el
        panorama y dejarte cambiarla cuando cambien los planes.
      </p>
    </div>
  );
}
