"use client";

/**
 * Botón del tema claro/oscuro: icono sol/luna en SVG inline (sin librerías).
 * Presenta un marcador de tamaño mientras la app hidrata, para no mover el layout.
 */

import { useUiTheme } from "@/lib/use-ui-theme";

export default function ThemeToggle() {
  const { theme, toggle } = useUiTheme();

  if (theme === null) {
    // Pre-hidratación: reserva el espacio exacto del botón.
    return <span aria-hidden className="h-9 w-9" />;
  }

  const nextIsDark = theme === "light";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={nextIsDark ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
      aria-pressed={theme === "dark"}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-ink/20 text-ink transition hover:border-ink/60 hover:bg-paper active:scale-95"
    >
      {theme === "dark" ? (
        <SunIcon className="h-[18px] w-[18px]" />
      ) : (
        <MoonIcon className="h-[18px] w-[18px]" />
      )}
    </button>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.55 1.55M17.15 17.15l1.55 1.55M18.7 5.3l-1.55 1.55M6.85 17.15L5.3 18.7" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.6 8.6 0 1 0 10.7 10.7Z" />
    </svg>
  );
}
