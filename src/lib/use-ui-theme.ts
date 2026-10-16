"use client";

/**
 * Hook del tema de interfaz (claro/oscuro).
 * Es un asunto de presentación: nunca vive en `src/core/` ni en el store de
 * datos. La fuente de verdad inicial es `document.documentElement.dataset.theme`,
 * fijado por el script anti-flash de `layout.tsx` antes del primer pintado.
 */

import { useCallback, useEffect, useState } from "react";
import { saveUiTheme, type UiTheme } from "@/lib/storage";

const THEME_COLOR_BY_THEME: Record<UiTheme, string> = {
  light: "#f4efe3",
  dark: "#111b16",
};

export interface UiThemeState {
  /** Tema efectivo; null mientras la app aún no hidrata (no se puede saber en SSR). */
  theme: UiTheme | null;
  /** Alterna claro↔oscuro aplicando el atributo y recordando la elección. */
  toggle: () => void;
}

export function useUiTheme(): UiThemeState {
  const [theme, setTheme] = useState<UiTheme | null>(null);

  useEffect(() => {
    // El script anti-flash ya aplicó data-theme: lo leemos y sincronizamos la meta.
    const applied: UiTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    setTheme(applied);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", THEME_COLOR_BY_THEME[applied]);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: UiTheme = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      saveUiTheme(next);
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", THEME_COLOR_BY_THEME[next]);
      return next;
    });
  }, []);

  return { theme, toggle };
}
