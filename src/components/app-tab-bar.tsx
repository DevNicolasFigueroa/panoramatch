"use client";

/**
 * Barra de navegación inferior (diseño móvil del prototipo de Stitch,
 * traducido a los tokens del sistema). Siempre visible: la app es una
 * columna centrada en cualquier ancho de pantalla. Presentación pura:
 * los handlers y el estado de navegación los resuelve PanoramaApp.
 */

export type AppTab = "panoramas" | "activo" | "tesoreria";

export const TABS: ReadonlyArray<{
  tab: AppTab;
  label: string;
  icon: (className: string) => React.ReactNode;
}> = [
  {
    tab: "panoramas",
    label: "Panoramas",
    icon: (className) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 6h12M9 12h12M9 18h12" />
        <circle cx="4" cy="6" r="1.4" />
        <circle cx="4" cy="12" r="1.4" />
        <circle cx="4" cy="18" r="1.4" />
      </svg>
    ),
  },
  {
    tab: "activo",
    label: "Activo",
    icon: (className) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M13.5 2.5 4.8 13.2h5.4l-.7 8.3 8.7-10.7h-5.4l.7-8.3Z" />
      </svg>
    ),
  },
  {
    tab: "tesoreria",
    label: "Tesorería",
    icon: (className) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
        <circle cx="12" cy="12" r="2.6" />
        <path d="M6 9.6h.01M18 14.4h.01" />
      </svg>
    ),
  },
];

export default function AppTabBar({
  activeTab,
  onOpenTab,
  onOpenProfile,
}: {
  activeTab: AppTab;
  onOpenTab: (tab: AppTab) => void;
  /** Abre la ficha de perfil (hoja inferior); no es una vista persistente. */
  onOpenProfile: () => void;
}) {
  return (
    <nav
      aria-label="Secciones de PanoraMatch"
      className="fixed inset-x-0 bottom-0 z-40 w-full border-t border-ink/15 bg-elev pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1">
        {TABS.map(({ tab, label, icon }) => {
          const isActive = activeTab === tab;
          return (
            <li key={tab} className="flex flex-1">
              <button
                type="button"
                onClick={() => onOpenTab(tab)}
                aria-current={isActive ? "page" : undefined}
                className={`flex w-full flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-semibold transition-colors ${
                  isActive ? "text-cancha" : "text-ink-soft hover:text-ink"
                }`}
              >
                <span
                  className={`grid h-8 w-14 place-items-center rounded-full transition-colors ${
                    isActive ? "bg-cancha-soft" : ""
                  }`}
                >
                  {icon("h-[22px] w-[22px]")}
                </span>
                {label}
              </button>
            </li>
          );
        })}
        {/* Perfil: abre la ficha de sesión; nunca queda marcado como activo. */}
        <li className="flex flex-1">
          <button
            type="button"
            onClick={onOpenProfile}
            aria-haspopup="dialog"
            className="flex w-full flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-semibold text-ink-soft transition-colors hover:text-ink"
          >
            <span className="grid h-8 w-14 place-items-center rounded-full">
              <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="8" r="3.8" />
                <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
              </svg>
            </span>
            Perfil
          </button>
        </li>
      </ul>
    </nav>
  );
}
