"use client";

/**
 * Semáforo de Quórum: indicador visual del estado del panorama.
 * Presentación pura: los estados los calcula `core/quota-manager.ts`.
 */

import type { QuorumStatus } from "@/core/quota-manager";

const SEMAPHORE_BY_STATUS = {
  pending: {
    ring: "border-wait/40 bg-wait-soft",
    dot: "bg-wait motion-safe:animate-pulse",
    text: "text-wait",
  },
  partial: {
    ring: "border-camino/40 bg-camino-soft",
    dot: "bg-camino motion-safe:animate-pulse",
    text: "text-camino",
  },
  ready: {
    ring: "border-cancha/40 bg-cancha-soft",
    dot: "bg-cancha",
    text: "text-cancha",
  },
} as const;

export default function QuorumSemaphore({
  status,
  label,
}: {
  status: QuorumStatus;
  label: string;
}) {
  const styles = SEMAPHORE_BY_STATUS[status];
  return (
    <div
      className={`flex items-center gap-2.5 rounded-full border px-3.5 py-2 ${styles.ring}`}
      role="status"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${styles.dot}`} aria-hidden />
      <span className={`text-sm font-semibold ${styles.text}`}>{label}</span>
    </div>
  );
}
