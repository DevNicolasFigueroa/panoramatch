"use client";

/**
 * Página dedicada de Tesorería (tab «Tesorería» de la barra inferior):
 * si hay un panorama activo muestra su módulo de pagos a página completa;
 * si no, ofrece la lista «Mis panoramas» para elegir cuál revisar.
 * Presentación pura: la regla vive en `core/payment-treasury.ts`.
 */

import type { SavedPanorama } from "@/core/types";
import type { PaymentsState } from "@/core/payment-treasury";
import type { ReceiptsState } from "@/core/payment-receipt";
import type { PanoramaStoreActions } from "@/lib/use-panorama-store";
import { sortSavedPanoramas } from "@/core/panorama-collection";
import { formatCLP, splitCost } from "@/core/currency-clp";
import { classifyAttendees } from "@/core/quota-manager";
import { withCreatorAttendee } from "@/core/creator-attendee";
import { MODE_EMOJI, MODE_STYLES } from "@/components/ui-theme";
import PaymentTreasuryPanel from "@/components/payment-treasury-panel";
import FinancialPanel from "@/components/financial-panel";

export default function TreasuryView({
  activePanorama,
  payments,
  receipts,
  savedPanoramas,
  actions,
  onOpenPanorama,
  onGoBack,
}: {
  /** Panorama abierto; null = mostrar el selector. */
  activePanorama: SavedPanorama | null;
  /** Datos de pagos del activo; null mientras cargan. */
  payments: PaymentsState | null;
  /** Comprobantes vigentes del activo (miniaturas y visores). */
  receipts: ReceiptsState | null;
  savedPanoramas: readonly SavedPanorama[];
  actions: PanoramaStoreActions;
  onOpenPanorama: (panoramaId: string) => void;
  /** Vuelve al tablero del panorama activo (tab «Activo»). */
  onGoBack: () => void;
}) {
  // Sin ningún panorama guardado todavía: invitación a la creación.
  if (savedPanoramas.length === 0) {
    return (
      <section className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-ink/25 bg-elev px-4 py-10 text-center">
        <span className="font-display text-2xl">🧾</span>
        <h2 className="font-display text-lg font-bold tracking-tight text-ink">
          Tesorería vacía por ahora
        </h2>
        <p className="max-w-xs text-sm text-ink-soft">
          Crea un panorama con costo e ingresa los datos de transferencia para
          llevar la cuenta clara desde aquí.
        </p>
      </section>
    );
  }

  if (activePanorama === null) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="px-1 font-display text-lg font-bold tracking-tight text-ink">
          Elige un panorama
        </h2>
        <p className="px-1 text-xs text-ink-soft">
          La tesorería es por panorama: elige cuál revisar.
        </p>
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {sortSavedPanoramas(savedPanoramas).map((savedPanorama) => {
            const modeStyle = MODE_STYLES[savedPanorama.event.mode];
            return (
              <li key={savedPanorama.id}>
                <button
                  type="button"
                  onClick={() => onOpenPanorama(savedPanorama.id)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-ink/15 bg-elev p-3 text-left transition hover:border-ink/40 active:scale-[0.99]"
                >
                  <span aria-hidden className={`block h-8 w-1.5 shrink-0 rounded-full ${modeStyle.barClass}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">
                      {savedPanorama.event.title}
                    </span>
                    <span className="text-xs text-ink-soft">
                      {MODE_EMOJI[savedPanorama.event.mode]} {modeStyle.label} ·{" "}
                      {formatCLP(savedPanorama.event.totalCostCLP)}
                    </span>
                  </span>
                  <span aria-hidden className="shrink-0 text-ink-soft">›</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  // El panel resuelve su propia carga y captura «Apagado» (RF-1); el estado
  // vacío real de esta página es el costo $0 (sin cuota que cobrar).
  const isCostZero = activePanorama.event.totalCostCLP === 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-bold tracking-tight text-ink">
            {activePanorama.event.title}
          </h2>
          <p className="text-xs text-ink-soft">Tesorería del panorama</p>
        </div>
        <button
          type="button"
          onClick={onGoBack}
          className="shrink-0 rounded-lg border border-ink/20 px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-ink/60 active:scale-[0.98]"
        >
          Ir al tablero
        </button>
      </div>

      {isCostZero ? (
        <p className="rounded-2xl border border-dashed border-ink/25 bg-elev px-4 py-6 text-center text-sm text-ink-soft">
          Este panorama no tiene gasto ($0): no hay pagos que cobrar.
        </p>
      ) : (
        <PaymentTreasuryPanel
          panorama={activePanorama}
          payments={payments}
          receipts={receipts}
          actions={actions}
          boletaSlot={
            <FinancialPanel
              split={splitCost(
                activePanorama.event.totalCostCLP,
                classifyAttendees(
                  withCreatorAttendee(activePanorama.attendees),
                  activePanorama.event.maxCapacity,
                ).titulars.length,
              )}
            />
          }
        />
      )}
    </section>
  );
}
