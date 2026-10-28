"use client";

/**
 * Semáforo de Quórum como tarjeta de progreso (lectura del prototipo de
 * Stitch con los tokens del sistema): estado coloreado, contador de cupos
 * y barra sólida de avance. Presentación pura: los estados los calcula
 * `core/quota-manager.ts`. La cuenta «van» incluye al organizador (Voy
 * implícito), igual que la lista compuesta; el quórum en sí sigue
 * midiendo SOLO a los invitados.
 */

import type { QuorumStatus } from "@/core/quota-manager";

const STATUS_STYLES = {
  pending: { dot: "bg-wait", text: "text-wait", bar: "bg-wait" },
  partial: { dot: "bg-camino", text: "text-camino", bar: "bg-camino" },
  ready: { dot: "bg-cancha", text: "text-cancha", bar: "bg-cancha" },
} as const;

export default function QuorumSemaphore({
  status,
  label,
  vanCount,
  maxCapacity,
}: {
  status: QuorumStatus;
  label: string;
  /** Asistentes confirmados (organizador incluido). Sin valor → versión compacta. */
  vanCount?: number;
  /** Cupo máximo: null = sin cupo (el número va solo, sin barra). */
  maxCapacity?: number | null;
}) {
  const styles = STATUS_STYLES[status];

  // Versión compacta: mientras llegan los datos, solo el estado.
  if (vanCount === undefined) {
    return (
      <div
        role="status"
        className="flex items-center gap-2.5 rounded-full border border-ink/15 bg-paper px-3.5 py-2"
      >
        <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${styles.dot} motion-safe:animate-pulse`} />
        <span className={`text-sm font-bold ${styles.text}`}>{label}</span>
      </div>
    );
  }

  const slots =
    maxCapacity !== null && maxCapacity !== undefined && maxCapacity > 0
      ? maxCapacity
      : null;
  const filled = slots === null ? null : Math.min(vanCount, slots);
  const percent =
    slots !== null && filled !== null ? Math.round((filled / slots) * 100) : null;

  return (
    <div role="status" className="rounded-2xl border border-ink/15 bg-paper p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${styles.dot} motion-safe:animate-pulse`}
          />
          <span className={`truncate text-sm font-bold ${styles.text}`}>{label}</span>
        </p>
        <p className="shrink-0 font-display text-xl font-extrabold leading-none tabular-nums text-ink">
          {vanCount}
          {slots !== null && (
            <span className="text-base font-bold text-ink-soft">/{slots}</span>
          )}
        </p>
      </div>

      {slots !== null && filled !== null && (
        <div className="mt-3" aria-hidden="true">
          <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
            <div
              className={`h-full rounded-full ${styles.bar} transition-[width] duration-500 motion-reduce:transition-none`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}
      {slots === null && (
        <div className="mt-3" aria-hidden="true">
          <div className="h-2 w-full rounded-full bg-ink/10" />
        </div>
      )}

      {percent !== null && (
        <p className="mt-1.5 flex items-baseline justify-between gap-2 text-xs">
          <span className="text-ink-soft">
            {filled === slots ? "¡Panorama armado!" : `Incluye al organizador`}
          </span>
          <span className={`font-display font-extrabold tabular-nums ${styles.text}`}>
            {percent}%
          </span>
        </p>
      )}
      {slots === null && (
        <p className="mt-1.5 text-xs text-ink-soft">Sin cupo máximo · se arma al primer confirmado</p>
      )}
    </div>
  );
}
