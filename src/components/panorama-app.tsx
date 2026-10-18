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

export default function PanoramaApp() {
  const { user, isAuthReady, signOut } = useAuthSession();
  const {
    isLoading,
    lastError,
    activePanorama,
    savedPanoramas,
    place,
    actions,
    dismissError,
  } = usePanoramaStore(user?.userId ?? null);

  const isReady = isAuthReady && user !== null && !isLoading;

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

      {/* Saludo + Salir (solo con sesión) */}
      {user !== null && (
        <div className="-mt-3 flex items-center justify-between px-1 text-xs text-ink-soft">
          <span>Hola, {user.displayName}</span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="font-semibold text-ink transition hover:text-baja"
          >
            Salir
          </button>
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
