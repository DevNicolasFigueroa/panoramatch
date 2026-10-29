"use client";

/**
 * Shell de la aplicación: cabecera sticky de sesión (fidelidad al prototipo
 * de Stitch), barra de navegación inferior y la vista elegida: Panoramas
 * (inicio con creador + listado guardado), el tablero del panorama activo
 * o la página dedicada de Tesorería. Requiere sesión con Google: el server
 * component de "/" ya filtró a quien no la tenga.
 */

import { useState } from "react";
import { usePanoramaStore } from "@/lib/use-panorama-store";
import { useAuthSession } from "@/lib/use-auth-session";
import ThemeToggle from "@/components/theme-toggle";
import AppTabBar, { TABS, type AppTab } from "@/components/app-tab-bar";
import HomeView from "@/components/home-view";
import PanoramaDashboard from "@/components/panorama-dashboard";
import TreasuryView from "@/components/treasury-view";
import { useRouter } from "next/navigation";

import { initialsFromName } from "@/core/initials";
import { sortSavedPanoramas } from "@/core/panorama-collection";

export default function PanoramaApp() {
  const { user, isAuthReady, signOut } = useAuthSession();
  const router = useRouter();
  const [isConfirmingSignOut, setIsConfirmingSignOut] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  /** Vista elegida en la barra inferior (panoramas | activo | tesorería). */
  const [tab, setTab] = useState<AppTab>("panoramas");
  const {
    isLoading,
    lastError,
    activePanorama,
    savedPanoramas,
    place,
    checklist,
    teams,
    payments,
    receipts,
    actions,
    dismissError,
  } = usePanoramaStore(user?.userId ?? null, user?.displayName ?? null);

  const isReady = isAuthReady && user !== null && !isLoading;

  /** Abre un panorama guardado y aterriza en su tablero (regla de la tab «Activo»). */
  const openPanoramaInDashboard = (panoramaId: string) => {
    actions.openPanorama(panoramaId);
    setTab("activo");
  };

  /** Abre un panorama desde la página de Tesorería: aterriza en SU tesorería. */
  const openPanoramaInTreasury = (panoramaId: string) => {
    actions.openPanorama(panoramaId);
    setTab("tesoreria");
  };

  const handleOpenTab = (nextTab: AppTab) => {
    if (nextTab === "panoramas") {
      setTab("panoramas");
      actions.goToNewForm();
      return;
    }
    const newestId = sortSavedPanoramas(savedPanoramas)[0]?.id;
    if (nextTab === "activo") {
      setTab("activo");
      if (activePanorama !== null) {
        // Ya está en pantalla: la tab funciona como «volver arriba».
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (newestId !== undefined) {
        actions.openPanorama(newestId);
      }
      return;
    }
    // Tesorería: vista propia; sin panorama abierto, la propia vista ofrece el selector.
    setTab("tesoreria");
  };

  const handleCloseSession = async () => {
    await signOut();
    setIsConfirmingSignOut(false);
    setIsProfileOpen(false);
    router.replace("/login");
    router.refresh();
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 px-4 pt-2 pb-28 sm:px-6 md:gap-6 md:pt-3 md:pb-12 lg:px-8">
      {/* Cabecera sticky: marca a la izquierda, navegación en tablet/desktop al centro, tema y avatar a la derecha */}
      <header className="sticky top-0 z-30 -mx-4 flex items-center justify-between gap-3 border-b border-ink/10 bg-paper/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6 md:py-3 lg:-mx-8 lg:px-8">
        <div className="flex items-center gap-2.5 select-none">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 place-items-center rounded-xl bg-cancha font-display text-base font-extrabold text-elev"
          >
            P
          </span>
          <h1 className="font-display text-lg font-bold tracking-tight sm:text-xl">
            <span className="text-ink">Panora</span>
            <span className="text-cancha">Match</span>
          </h1>
        </div>

        {user !== null && (
          <nav aria-label="Navegación principal" className="hidden items-center gap-1 md:flex">
            {TABS.map(({ tab: itemTab, label, icon }) => {
              const isActive = tab === itemTab;
              return (
                <button
                  key={itemTab}
                  type="button"
                  onClick={() => handleOpenTab(itemTab)}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-cancha-soft text-cancha"
                      : "text-ink-soft hover:bg-elev hover:text-ink"
                  }`}
                >
                  {icon("h-4 w-4 shrink-0")}
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        )}

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user !== null && (
            <button
              type="button"
              onClick={() => setIsProfileOpen(true)}
              aria-haspopup="dialog"
              aria-label="Tu perfil"
              className="relative flex shrink-0 items-center gap-2 rounded-full transition active:scale-95 md:rounded-xl md:border md:border-ink/15 md:bg-elev md:py-1 md:pr-3 md:pl-1.5 md:hover:border-ink/40"
            >
              <span className="relative shrink-0">
                {user.avatarUrl !== null ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="h-9 w-9 rounded-full border border-ink/20 object-cover md:h-7 md:w-7"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="grid h-9 w-9 place-items-center rounded-full border border-ink/20 bg-cancha-soft font-display text-xs font-bold text-cancha md:h-7 md:w-7 md:text-[11px]"
                  >
                    {initialsFromName(user.displayName)}
                  </span>
                )}
                <span
                  aria-hidden="true"
                  className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-paper bg-cancha md:h-2 md:w-2"
                />
              </span>
              <span className="hidden max-w-[140px] truncate text-xs font-bold text-ink md:inline">
                {user.displayName}
              </span>
            </button>
          )}
        </div>
      </header>

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
      ) : tab === "tesoreria" ? (
        <TreasuryView
          activePanorama={activePanorama}
          payments={payments}
          receipts={receipts}
          savedPanoramas={savedPanoramas}
          actions={actions}
          onOpenPanorama={openPanoramaInTreasury}
          onGoBack={() => setTab("activo")}
        />
      ) : activePanorama === null ? (
        <HomeView
          savedPanoramas={savedPanoramas}
          onCreate={(input) => {
            const created = actions.createEvent(input);
            if (created) setTab("activo");
            return created;
          }}
          onOpenPanorama={openPanoramaInDashboard}
          onRemovePanorama={actions.removePanorama}
        />
      ) : (
        <PanoramaDashboard
          panorama={activePanorama}
          place={place}
          checklist={checklist}
          teams={teams}
          payments={payments}
          actions={actions}
          onAddFriend={actions.addFriend}
          onChangeStatus={actions.changeFriendStatus}
          onGoHome={() => {
            actions.goToNewForm();
            setTab("panoramas");
          }}
        />
      )}

      {/* Ficha de sesión (hoja inferior en móvil, diálogo centrado en tablet/desktop) */}
      {isProfileOpen && user !== null && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4">
          <div
            className="absolute inset-0 bg-ink/50 backdrop-blur-sm"
            onClick={() => setIsProfileOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Tu perfil"
            className="relative mx-auto w-full max-w-md rounded-t-3xl border border-b-0 border-ink bg-elev px-5 pt-3 pb-7 sm:rounded-2xl sm:border-b sm:py-5 sm:shadow-boleta"
          >
            <span aria-hidden="true" className="mx-auto mb-4 block h-1 w-10 rounded-full bg-ink/20 sm:hidden" />
            <ProfileCard
              user={user}
              isConfirmingSignOut={isConfirmingSignOut}
              onCancelSignOut={() => setIsConfirmingSignOut(false)}
              onSignOut={() => void handleCloseSession()}
              onStartSignOut={() => setIsConfirmingSignOut(true)}
              onClose={() => setIsProfileOpen(false)}
            />
          </div>
        </div>
      )}

      {user !== null && (
        <AppTabBar
          activeTab={tab}
          onOpenTab={handleOpenTab}
          onOpenProfile={() => setIsProfileOpen(true)}
        />
      )}
    </main>
  );
}

/** Ficha de identidad con sesión: avatar/iniciales, nombre, correo y Salir. */
function ProfileCard({
  user,
  isConfirmingSignOut,
  onSignOut,
  onStartSignOut,
  onCancelSignOut,
  onClose,
}: {
  user: NonNullable<ReturnType<typeof useAuthSession>["user"]>;
  isConfirmingSignOut: boolean;
  onSignOut: () => void;
  onStartSignOut: () => void;
  onCancelSignOut: () => void;
  onClose: () => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {user.avatarUrl !== null ? (
            <img
              src={user.avatarUrl}
              alt="Tu foto de perfil"
              className="h-11 w-11 shrink-0 rounded-full border border-ink/20 object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-ink/20 bg-cancha-soft font-display text-sm font-bold text-cancha"
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
        </div>
        {isConfirmingSignOut ? (
          <div className="flex shrink-0 items-center gap-1.5 text-xs" role="group" aria-label="Confirmar cierre de sesión">
            <span className="text-ink-soft">¿Salir?</span>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-lg border border-baja/50 px-2 py-1.5 font-semibold text-baja transition hover:bg-baja-soft"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={onCancelSignOut}
              className="rounded-lg border border-ink/20 px-2 py-1.5 font-semibold text-ink transition hover:border-ink/60"
            >
              Quedarme
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onStartSignOut}
            className="shrink-0 rounded-lg border border-ink/20 px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-baja hover:text-baja"
          >
            Salir
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="mt-5 w-full rounded-xl border border-ink/20 px-3 py-2.5 text-sm font-semibold text-ink transition hover:border-ink/60 active:scale-[0.99]"
      >
        Volver
      </button>
    </div>
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
