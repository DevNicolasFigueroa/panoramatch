"use client";

/**
 * Shell de la aplicación: pantalla de inicio (creador + listado guardado)
 * o el panel activo del panorama elegido. requiere sesión con Google:
 * el server component de "/" ya filtró a quien no la tenga.
 */

import { usePanoramaStore } from "@/lib/use-panorama-store";
import { useAuthSession } from "@/lib/use-auth-session";
import ThemeToggle from "@/components/theme-toggle";
import HomeView from "@/components/home-view";
import PanoramaDashboard from "@/components/panorama-dashboard";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { initialsFromName } from "@/core/initials";

export default function PanoramaApp() {
  const { user, isAuthReady, signOut } = useAuthSession();
  const router = useRouter();
  const [isConfirmingSignOut, setIsConfirmingSignOut] = useState(false);
  const {
    isLoading,
    lastError,
    activePanorama,
    savedPanoramas,
    place,
    checklist,
    actions,
    dismissError,
  } = usePanoramaStore(user?.userId ?? null, user?.displayName ?? null);

  const isReady = isAuthReady && user !== null && !isLoading;

  const handleCloseSession = async () => {
    await signOut();
    setIsConfirmingSignOut(false);
    router.replace("/login");
    router.refresh();
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pt-7 pb-12 sm:max-w-lg">
      {/* Cabecera: marca centrada y tema a la derecha */}
      <header className="flex items-center justify-between select-none">
        <span className="w-9" aria-hidden />
        <h1 className="font-display text-xl font-bold tracking-tight">
          <span className="text-ink">Panora</span>
          <span className="text-cancha">Match</span>
        </h1>
        <ThemeToggle />
      </header>

      {/* Identidad con sesión: avatar o iniciales, nombre, correo y Salir */}
      {user !== null && (
        <div className="rounded-2xl border border-ink/15 bg-elev px-3.5 py-2.5">
          <div className="flex items-center gap-3">
            {user.avatarUrl !== null ? (
              <img
                src={user.avatarUrl}
                alt="Tu foto de perfil"
                className="h-9 w-9 shrink-0 rounded-full border border-ink/20 object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-ink/20 bg-cancha-soft font-display text-xs font-bold text-cancha"
              >
                {initialsFromName(user.displayName)}
              </span>
            )}
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-bold text-ink">{user.displayName}</p>
              <p className="truncate text-xs text-ink-soft">
                {user.email ?? "Cuenta de PanoraMatch"}
              </p>
            </div>
            {isConfirmingSignOut ? (
              <div className="flex shrink-0 items-center gap-1.5 text-xs" role="group" aria-label="Confirmar cierre de sesión">
                <span className="text-ink-soft">¿Salir?</span>
                <button
                  type="button"
                  onClick={() => void handleCloseSession()}
                  className="rounded-lg border border-baja/50 px-2 py-1.5 font-semibold text-baja transition hover:bg-baja-soft"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingSignOut(false)}
                  className="rounded-lg border border-ink/20 px-2 py-1.5 font-semibold text-ink transition hover:border-ink/60"
                >
                  Quedarme
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirmingSignOut(true)}
                className="shrink-0 rounded-lg border border-ink/20 px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-baja hover:text-baja"
              >
                Salir
              </button>
            )}
          </div>
        </div>
      )}

      {/* Aviso de sincronía con la nube */}
      {lastError !== null && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl border border-baja/40 bg-baja-soft px-3 py-2 text-xs font-semibold text-baja"
        >
          <span>{lastError}</span>
          <button type="button" onClick={dismissError} aria-label="Descartar aviso" className="shrink-0 px-1 text-base">
            ✕
          </button>
        </div>
      )}

      {!isReady ? (
        <SplashScreen />
      ) : activePanorama === null ? (
        <HomeView
          savedPanoramas={savedPanoramas}
          onCreate={actions.createEvent}
          onOpenPanorama={actions.openPanorama}
          onRemovePanorama={actions.removePanorama}
        />
      ) : (
        <PanoramaDashboard
          panorama={activePanorama}
          place={place}
          checklist={checklist}
          actions={actions}
          onAddFriend={actions.addFriend}
          onChangeStatus={actions.changeFriendStatus}
          onGoHome={actions.goToNewForm}
        />
      )}
    </main>
  );
}

/** Pantalla breve mientras se resuelve sesión y cargan los panoramas. */
function SplashScreen() {
  return (
    <div className="mt-20 grid place-items-center gap-3 text-ink-soft" aria-busy="true">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-ink/15 border-t-cancha" />
      <p className="text-sm">Cargando tus panoramas…</p>
    </div>
  );
}
