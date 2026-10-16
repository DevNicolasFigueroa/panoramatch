"use client";

/**
 * Shell de la aplicación: pantalla de inicio (creador + listado guardado)
 * o el panel activo del panorama elegido. Se marca "use client" porque
 * toda la UI V1 vive del estado local.
 */

import { usePanoramaStore } from "@/lib/use-panorama-store";
import ThemeToggle from "@/components/theme-toggle";
import HomeView from "@/components/home-view";
import PanoramaDashboard from "@/components/panorama-dashboard";

export default function PanoramaApp() {
  const { isHydrated, activePanorama, savedPanoramas, actions } = usePanoramaStore();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pt-7 pb-12 sm:max-w-lg">
      {/* Cabecera: marca centrada y botón de tema a la derecha */}
      <header className="flex items-center justify-between select-none">
        <span className="w-9" aria-hidden />
        <h1 className="font-display text-xl font-bold tracking-tight">
          <span className="text-ink">Panora</span>
          <span className="text-cancha">Match</span>
        </h1>
        <ThemeToggle />
      </header>

      {!isHydrated ? (
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
          onAddFriend={actions.addFriend}
          onChangeStatus={actions.changeFriendStatus}
          onGoHome={actions.goToNewForm}
        />
      )}
    </main>
  );
}

/** Pantalla breve mientras localStorage se lee en el navegador. */
function SplashScreen() {
  return (
    <div className="mt-20 grid place-items-center gap-3 text-ink-soft" aria-busy="true">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-ink/15 border-t-cancha" />
      <p className="text-sm">Cargando tus panoramas…</p>
    </div>
  );
}
