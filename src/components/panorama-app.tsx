"use client";

/**
 * Shell de la aplicación: pantalla de inicio (creador + listado guardado)
 * o el panel activo del panorama elegido. Se marca "use client" porque
 * toda la UI V1 vive del estado local.
 */

import { usePanoramaStore } from "@/lib/use-panorama-store";
import HomeView from "@/components/home-view";
import PanoramaDashboard from "@/components/panorama-dashboard";

export default function PanoramaApp() {
  const { isHydrated, activePanorama, savedPanoramas, actions } = usePanoramaStore();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pt-6 pb-10 sm:max-w-lg">
      {/* Marca compacta, común a las dos vistas */}
      <header className="flex items-center justify-center gap-2 select-none">
        <span className="text-lg" aria-hidden>
          🗓️
        </span>
        <h1 className="bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-lg font-bold tracking-tight text-transparent">
          PanoraMatch
        </h1>
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
    <div className="mt-16 grid place-items-center gap-3 text-slate-400" aria-busy="true">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-400" />
      <p className="text-sm">Cargando tus panoramas…</p>
    </div>
  );
}
