"use client";

/**
 * Semáforo de Quórum: indicador visual del estado del panorama.
 * Presentación pura: los estados los calcula `core/quota-manager.ts`.
 */

import type { QuorumStatus } from "@/core/quota-manager";

const SEMAPHORE_BY_STATUS = {
  pending: {
    ring: "border-amber-500/40 bg-amber-500/10",
    dot: "bg-amber-400 animate-pulse",
    text: "text-amber-300",
  },
  partial: {
    ring: "border-sky-500/40 bg-sky-500/10",
    dot: "bg-sky-400 animate-pulse",
    text: "text-sky-300",
  },
  ready: {
    ring: "border-emerald-500/40 bg-emerald-500/10",
    dot: "bg-emerald-400",
    text: "text-emerald-300",
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
      className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 ${styles.ring}`}
      role="status"
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${styles.dot}`} aria-hidden />
      <span className={`text-sm font-semibold ${styles.text}`}>{label}</span>
    </div>
  );
}
