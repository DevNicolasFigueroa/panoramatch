/**
 * Estilos compartidos de la UI (presentación solamente, cero lógica de negocio).
 * Sistema "Cuentas claras en la cancha": papel, tinta y kits de color por modo.
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
    activeClass: "bg-cancha text-elev border-cancha",
    inactiveClass: "border-cancha/30 text-cancha hover:bg-cancha-soft",
  },
  {
    status: "maybe",
    label: "En duda",
    activeClass: "bg-wait text-elev border-wait",
    inactiveClass: "border-wait/30 text-wait hover:bg-wait-soft",
  },
  {
    status: "not_going",
    label: "No puedo",
    activeClass: "bg-baja text-elev border-baja",
    inactiveClass: "border-baja/30 text-baja hover:bg-baja-soft",
  },
] as const;

/** Kit visual por modo de panorama (chip + barra lateral de tarjeta). */
export const MODE_STYLES: Record<
  PanoramaMode,
  { label: string; chipClass: string; barClass: string; accentText: string }
> = {
  social: {
    label: "Social (Salida/Bar)",
    chipClass: "border-social/30 bg-social-soft text-social",
    barClass: "bg-social",
    accentText: "text-social",
  },
  colaborativo: {
    label: "Colaborativo (Asado/Junta)",
    chipClass: "border-ember/30 bg-ember-soft text-ember",
    barClass: "bg-ember",
    accentText: "text-ember",
  },
  deportivo: {
    label: "Deportivo (Fútbol/Partido)",
    chipClass: "border-deporte/30 bg-deporte-soft text-deporte",
    barClass: "bg-deporte",
    accentText: "text-deporte",
  },
};

/** Emoji del modo: dato semántico del chip, no decoración. */
export const MODE_EMOJI: Record<PanoramaMode, string> = {
  social: "🎉",
  colaborativo: "🍢",
  deportivo: "⚽",
};

/** Colores del punto de estado del semáforo (punto + texto a contraste). */
export const QUORUM_STYLES: Record<QuorumStatus, { dotClass: string; textClass: string }> = {
  pending: { dotClass: "bg-wait", textClass: "text-wait" },
  partial: { dotClass: "bg-camino", textClass: "text-camino" },
  ready: { dotClass: "bg-cancha", textClass: "text-cancha" },
};
