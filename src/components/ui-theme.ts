/**
 * Estilos compartidos de la UI (presentación solamente, cero lógica de negocio).
 */

import type { AttendanceStatus, PanoramaMode, QuorumStatus } from "@/core/types";

/** Opciones de respuesta con sus estilos activos. */
export const STATUS_OPTIONS: ReadonlyArray<{
  status: AttendanceStatus;
  label: string;
  activeClass: string;
  inactiveClass: string;
}> = [
  {
    status: "going",
    label: "Voy",
    activeClass: "bg-emerald-500 text-white border-emerald-400 shadow-emerald-500/25",
    inactiveClass: "border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10",
  },
  {
    status: "maybe",
    label: "En duda",
    activeClass: "bg-amber-400 text-amber-950 border-amber-300 shadow-amber-400/25",
    inactiveClass: "border-amber-500/30 text-amber-300 hover:bg-amber-500/10",
  },
  {
    status: "not_going",
    label: "No puedo",
    activeClass: "bg-rose-500 text-white border-rose-400 shadow-rose-500/25",
    inactiveClass: "border-rose-500/30 text-rose-300 hover:bg-rose-500/10",
  },
] as const;

/** Etiqueta y colores de cada modo de panorama. */
export const MODE_STYLES: Record<PanoramaMode, { label: string; badgeClass: string; accentText: string }> = {
  social: {
    label: "Social (Salida/Bar)",
    badgeClass: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
    accentText: "text-fuchsia-300",
  },
  colaborativo: {
    label: "Colaborativo (Asado/Junta)",
    badgeClass: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    accentText: "text-amber-300",
  },
  deportivo: {
    label: "Deportivo (Fútbol/Partido)",
    badgeClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    accentText: "text-emerald-300",
  },
};

/** Emoji del modo, compartido por cabecera y tarjetas. */
export const MODE_EMOJI: Record<PanoramaMode, string> = {
  social: "🎉",
  colaborativo: "🍢",
  deportivo: "⚽",
};

/** Colores del punto de estado del semáforo, para badges compactos en tarjetas. */
export const QUORUM_STYLES: Record<QuorumStatus, { dotClass: string; textClass: string }> = {
  pending: { dotClass: "bg-amber-400", textClass: "text-amber-300" },
  partial: { dotClass: "bg-sky-400", textClass: "text-sky-300" },
  ready: { dotClass: "bg-emerald-400", textClass: "text-emerald-300" },
};
