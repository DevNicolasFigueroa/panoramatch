"use client";

/**
 * Sección «Control de pagos» (spec 004, compartida por los 3 modos):
 * bloque de datos de transferencia copiable + tablero por titular en orden
 * de confirmación + devoluciones pendientes (derivadas) y cierres
 * «Reembolsada» + totales de tesorería del creador.
 *
 * Toda la regla de negocio vive en `src/core/payment-treasury.ts`; aquí solo
 * presentación: cada fila pinta color = estado (adeudo o devolución pendiente
 * usan el fondo fuerte; el resto queda en tinta). El CREADOR recibe
 * `actions` (RF-5, RF-9, RF-10); el INVITADO del enlace recibe `selfActions`
 * (RF-11): solo la fila propia puede marcar «Ya transferí» o retractar.
 */

import { useEffect, useMemo, useState } from "react";

import { formatCLP } from "@/core/currency-clp";
import {
  getPaymentTreasuryView,
  isPaymentModuleActive,
  MAX_TRANSFER_INFO_LENGTH,
  type PaymentsState,
  type PlayerRef,
  type RefundKind,
} from "@/core/payment-treasury";
import { withCreatorAttendee } from "@/core/creator-attendee";
import { buildRestPlayers, buildTitularPlayers } from "@/core/team-organizer";
import { initialsFromName } from "@/core/initials";
import type { SavedPanorama } from "@/core/types";

const EMPTY_PAYMENTS: PaymentsState = {
  transferInfo: null,
  transactions: [],
  claims: [],
  resolvedRefunds: [],
};

/** Estilo (token) de cada estado de flujo y situación. */
const FLOW_CHIP: Record<string, string> = {
  paid: "border-cancha/50 bg-cancha-soft text-cancha",
  in_review: "border-camino/50 bg-camino-soft text-camino",
  pending: "border-ink/20 bg-paper text-ink-soft",
};

const SITUATION_CHIP: Record<string, string> = {
  even: "border-cancha/50 bg-cancha-soft text-cancha",
  owing: "border-baja bg-baja-soft text-baja",
  credit: "border-wait/50 bg-wait-soft text-wait",
};

const FLOW_LABEL: Record<string, string> = {
  paid: "Pagado",
  in_review: "En revisión",
  pending: "Pendiente",
};

const SITUATION_LABEL: Record<string, string> = {
  even: "Pago al día",
  owing: "Debe la diferencia",
  credit: "Saldo a favor",
};

const REFUND_KIND_LABEL: Record<RefundKind, string> = {
  exit: "Dejó de ser confirmado",
  overpay: "Cuota bajó",
};

interface CreatorActions {
  profferPaymentInfo: (rawTransferInfo: string) => boolean;
  confirmPayment: (playerRef: PlayerRef, amountCLP?: number) => boolean;
  revokePayment: (playerRef: PlayerRef, transactionId?: string) => boolean;
  resolveRefund: (playerRef: PlayerRef, kind: RefundKind) => boolean;
  reopenRefund: (playerRef: PlayerRef, kind: RefundKind) => boolean;
}

interface SelfActions {
  /** El titular con sesión que puede accionar SU fila. */
  playerRef: PlayerRef;
  /** true si la fila propia es titular vigente (podría marcar). */
  isTitular: boolean;
  isBusy: boolean;
  mark: () => void;
  retract: () => void;
}

export default function PaymentTreasuryPanel({
  panorama,
  payments,
  actions,
  selfActions,
  boletaSlot,
}: {
  panorama: SavedPanorama;
  /** Estado de tesorería cargado; null mientras carga («Cargando los pagos…»). */
  payments: PaymentsState | null;
  /** Solo el creador las recibe; el invitado ve el tablero en solo lectura. */
  actions?: CreatorActions;
  /** Solo el enlace la recibe: la fila propia del titular con sesión. */
  selfActions?: SelfActions;
  /** En la página de Tesorería: «La boleta» se integra en la columna derecha junto a reembolsos y recaudación. */
  boletaSlot?: React.ReactNode;
}) {
  const state = payments ?? EMPTY_PAYMENTS;
  const isLoading = payments === null;

  const allAttendees = useMemo(
    () => withCreatorAttendee(panorama.attendees, panorama.event.creatorName),
    [panorama.attendees, panorama.event.creatorName],
  );
  const titularPlayers = useMemo(
    () => buildTitularPlayers(allAttendees, panorama.event.maxCapacity),
    [allAttendees, panorama.event.maxCapacity],
  );
  const restPlayers = useMemo(
    () => buildRestPlayers(allAttendees, panorama.event.maxCapacity),
    [allAttendees, panorama.event.maxCapacity],
  );
  const isActive = !isLoading && isPaymentModuleActive(panorama.event.totalCostCLP, state);

  const view = useMemo(
    () => getPaymentTreasuryView(state, titularPlayers, restPlayers, panorama.event.totalCostCLP),
    [state, titularPlayers, restPlayers, panorama.event.totalCostCLP],
  );

  // El creador redacta el bloque en un borrador local; se sincroniza cuando
  // la nube devuelve algo distinto (carga, otra ventana, error y rollback).
  const [infoDraft, setInfoDraft] = useState(state.transferInfo ?? "");
  useEffect(() => {
    setInfoDraft(state.transferInfo ?? "");
  }, [state.transferInfo]);

  const [isCopied, setIsCopied] = useState<"idle" | "ok" | "failed">("idle");
  const [confirmDrafts, setConfirmDrafts] = useState<Record<string, string>>({});

  const copyTransferInfo = async () => {
    const text = state.transferInfo ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied("ok");
      window.setTimeout(() => setIsCopied("idle"), 2000);
    } catch {
      // El usuario selecciona el texto a mano: nunca un fallo silencioso.
      setIsCopied("failed");
      window.setTimeout(() => setIsCopied("idle"), 2500);
    }
  };

  const saveDraft = () => {
    if (actions === undefined) {
      return;
    }
    // El mensaje exacto (demasiado largo) lo emite el store con el núcleo.
    if (actions.profferPaymentInfo(infoDraft)) {
      // El borrador se re-sincroniza con el efecto de `transferInfo`.
    }
  };

  /** Editor del bloque (solo creador): comparten el módulo vivo y la captura apagada. */
  const editorBox =
    actions === undefined ? null : (
      <div className="mt-2 flex flex-col gap-2">
        <textarea
          value={infoDraft}
          onChange={(inputEvent) => setInfoDraft(inputEvent.target.value)}
          rows={3}
          maxLength={MAX_TRANSFER_INFO_LENGTH + 50}
          placeholder="Banco, tipo de cuenta, número y correo…"
          className="w-full whitespace-pre-line rounded-lg border border-ink/20 bg-elev px-2 py-1.5 text-sm leading-snug text-ink outline-none focus:border-ink/50"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setInfoDraft("");
              actions.profferPaymentInfo("");
            }}
            className="rounded-lg border border-baja/40 px-2.5 py-1 text-xs font-bold text-baja transition hover:bg-baja-soft active:scale-[0.97]"
          >
            Borrar
          </button>
          <button
            type="button"
            onClick={saveDraft}
            className="rounded-lg border border-cancha/50 bg-cancha-soft px-2.5 py-1 text-xs font-bold text-cancha transition hover:border-cancha active:scale-[0.97]"
          >
            Guardar bloque
          </button>
        </div>
      </div>
    );

  if (isLoading) {
    const loadingSection = (
      <section className="min-w-0 rounded-2xl border border-ink/15 bg-elev p-4" aria-busy="true">
        <h2 className="font-display text-lg font-bold tracking-tight text-ink">Control de pagos</h2>
        <p className="mt-1 text-sm text-ink-soft">Cargando los pagos…</p>
      </section>
    );
    if (boletaSlot !== undefined) {
      return (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
          <div className="lg:order-2">{boletaSlot}</div>
          <div className="min-w-0 lg:order-1">{loadingSection}</div>
        </div>
      );
    }
    return loadingSection;
  }
  // Sin cuota que cobrar ni registros que cerrar, el módulo no existe ($0).
  if (!isActive) {
    return boletaSlot !== undefined ? <>{boletaSlot}</> : null;
  }


  /** Parse del monto editable: solo dígitos; vacío = la cuota vigente. */
  const parseDraftAmount = (playerRef: PlayerRef): number | undefined => {
    const raw = (confirmDrafts[playerRef] ?? "").replace(/[^\d]/g, "");
    if (raw === "") {
      return undefined;
    }
    return Number.parseInt(raw, 10);
  };

  const hasRefundsOrTotals =
    view.pendingRefunds.length > 0 || view.resolvedRefunds.length > 0 || actions !== undefined;

  const refundsAndTotalsContent = (
    <>
      {/* Devoluciones PENDIENTES (derivadas: RF-7 y RF-8) */}
      {view.pendingRefunds.length > 0 && (
        <div className="rounded-xl border border-baja bg-baja-soft p-3">
          <h3 className="text-sm font-bold text-baja">Por devolver</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {view.pendingRefunds.map((refund) => (
              <li key={`${refund.playerRef}-${refund.kind}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-elev px-2.5 py-2">
                <div className="flex min-w-0 flex-col leading-tight sm:flex-row sm:items-center sm:gap-1.5">
                  <span className="truncate text-sm font-bold text-ink">
                    {refund.name ?? "Ex confirmado"}
                  </span>
                  <span className="text-xs text-ink-soft">
                    {REFUND_KIND_LABEL[refund.kind]}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="text-sm font-bold text-baja tabular-nums">
                    {formatCLP(refund.amountCLP)}
                  </span>
                  {actions !== undefined && (
                    <button
                      type="button"
                      onClick={() => actions.resolveRefund(refund.playerRef, refund.kind)}
                      className="rounded-lg border border-cancha/50 bg-cancha-soft px-2 py-1 text-xs font-bold text-cancha transition hover:border-cancha active:scale-[0.97]"
                    >
                      Reembolsada
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Cierres «Reembolsada» registrados (RF-9) */}
      {view.resolvedRefunds.length > 0 && (
        <div className="rounded-xl border border-cancha/40 bg-cancha-soft p-3">
          <h3 className="text-sm font-bold text-cancha">Reembolsadas</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {view.resolvedRefunds.map((refund, index) => (
              <li
                key={`${refund.playerRef}-${refund.kind}-${refund.resolvedAt}-${index}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-elev px-2.5 py-2"
              >
                <div className="flex min-w-0 flex-col leading-tight sm:flex-row sm:items-center sm:gap-1.5">
                  <span className="truncate text-sm font-bold text-ink">
                    {refund.name ?? "Ex confirmado"}
                  </span>
                  <span className="text-xs text-ink-soft">
                    {REFUND_KIND_LABEL[refund.kind]} · {refund.resolvedAt.replace("T", " · ")}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="text-sm font-bold text-cancha tabular-nums">
                    {formatCLP(refund.amountCLP)}
                  </span>
                  {actions !== undefined && (
                    <button
                      type="button"
                      onClick={() => actions.reopenRefund(refund.playerRef, refund.kind)}
                      className="rounded-lg border border-ink/15 px-2 py-1 text-xs font-bold text-ink-soft transition hover:border-ink/50 hover:text-ink active:scale-[0.97]"
                    >
                      Reabrir
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Totales de tesorería (RF-10): solo el creador, con la barra de recaudación */}
      {actions !== undefined && (() => {
        const expectedCLP = view.totals.collectedCLP + view.totals.toCollectCLP;
        const collectedPercent =
          expectedCLP > 0 ? Math.round((view.totals.collectedCLP / expectedCLP) * 100) : null;
        return (
          <div className="rounded-xl border border-ink/15 bg-paper p-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold text-ink">Recaudación en vivo</h3>
              {collectedPercent !== null && (
                <span className="font-display text-xs font-extrabold tabular-nums text-cancha">
                  {collectedPercent}%
                </span>
              )}
            </div>
            {collectedPercent !== null && (
              <div className="mt-2" aria-hidden="true">
                <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
                  <div
                    className="h-full rounded-full bg-cancha transition-[width] duration-500 motion-reduce:transition-none"
                    style={{ width: `${collectedPercent}%` }}
                  />
                </div>
              </div>
            )}
            <dl className="mt-2 grid grid-cols-1 gap-2 text-center min-[360px]:grid-cols-3">
              <Total title="Recaudado" value={formatCLP(view.totals.collectedCLP)} valueClass="text-cancha" />
              <Total title="Por cobrar" value={formatCLP(view.totals.toCollectCLP)} valueClass="text-baja" />
              <Total title="Por devolver" value={formatCLP(view.totals.toRefundCLP)} valueClass="text-wait" />
            </dl>
          </div>
        );
      })()}
    </>
  );

  const controlSection = (
    <section className="flex flex-col gap-4 rounded-2xl border border-ink/15 bg-elev p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold tracking-tight text-ink">Control de pagos</h2>
        <span className="text-xs text-ink-soft">
          {view.titulars.length > 0
            ? `${formatCLP(view.currentQuotaCLP)} por confirmado${view.surplusCLP > 0 ? ` · pozo ${formatCLP(view.surplusCLP)}` : ""}`
            : "Sin confirmados todavía"}
        </span>
      </div>

      {/* Bloque de datos de transferencia (RF-2): copiable para todos */}
      <div className="rounded-xl border border-ink/15 bg-paper p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">Datos de transferencia</h3>
          <button
            type="button"
            onClick={() => void copyTransferInfo()}
            className="shrink-0 rounded-lg border border-ink/20 px-2 py-1 text-xs font-bold text-ink-soft transition hover:border-ink/50 hover:text-ink active:scale-[0.97]"
          >
            {isCopied === "ok" ? "¡Copiado!" : isCopied === "failed" ? "No se pudo copiar" : "Copiar"}
          </button>
        </div>

        {actions === undefined ? (
          <p className="mt-2 whitespace-pre-line text-sm leading-snug text-ink">
            {state.transferInfo ?? ""}
          </p>
        ) : (
          editorBox
        )}
      </div>

      {/* Tablero por titular, en orden de confirmación (RF-4) */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-bold text-ink">Confirmados</h3>
          <span className="text-xs text-ink-soft">cuota {formatCLP(view.currentQuotaCLP)}</span>
        </div>
        <ul className="flex flex-col gap-2">
          {view.titulars.map((titular) => {
            const isOwn = selfActions !== undefined && selfActions.playerRef === titular.playerRef;
            const hasVigentePayment = titular.paidTotalCLP > 0;

            /* Fila del organizador: ES quien recibe las transferencias,
               así que no se le muestra adeudo, devolución ni acciones. */
            if (titular.isOrganizer) {
              return (
                <li
                  key={titular.playerRef}
                  className="rounded-xl border border-cancha/40 bg-paper p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-cancha-soft font-display text-[10px] font-bold text-cancha"
                      >
                        {initialsFromName(titular.name)}
                      </span>
                      <span className="min-w-0 truncate text-sm font-bold text-ink">{titular.name}</span>
                    </div>
                    <span className="shrink-0 rounded-full border border-cancha/40 bg-cancha-soft px-2 py-0.5 text-[10px] font-semibold text-cancha">
                      Recibe las transferencias
                    </span>
                  </div>
                </li>
              );
            }

            return (
              <li
                key={titular.playerRef}
                className={`rounded-xl border bg-paper p-3 ${
                  titular.situation === "owing"
                    ? "border-baja"
                    : isOwn
                      ? "border-cancha/60"
                      : "border-ink/15"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink/10 font-display text-[10px] font-bold text-ink-soft"
                    >
                      {initialsFromName(titular.name)}
                    </span>
                    <span className="min-w-0 truncate text-sm font-bold text-ink">{titular.name}</span>
                    <span
                      className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] font-semibold ${FLOW_CHIP[titular.flowState]}`}
                    >
                      {FLOW_LABEL[titular.flowState]}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-ink-soft">
                    {formatCLP(titular.paidTotalCLP)} pagado
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`rounded-full border px-1.5 py-px text-[10px] font-semibold ${SITUATION_CHIP[titular.situation]}`}
                  >
                    {SITUATION_LABEL[titular.situation]}
                  </span>
                  {titular.situation === "owing" && (
                    <span className="text-xs font-bold text-baja tabular-nums">
                      adeudo {formatCLP(titular.owingCLP)}
                    </span>
                  )}
                  {titular.situation === "credit" && (
                    <span className="text-xs font-bold text-wait tabular-nums">
                      devolver {formatCLP(titular.creditCLP)}
                    </span>
                  )}
                </div>

                {/* Acciones del creador en la fila (RF-5) */}
                {actions !== undefined && (
                  <div className="mt-2.5 flex flex-wrap items-center justify-end gap-1.5">
                    <input
                      inputMode="numeric"
                      value={confirmDrafts[titular.playerRef] ?? ""}
                      onChange={(inputEvent) =>
                        setConfirmDrafts((current) => ({
                          ...current,
                          [titular.playerRef]: inputEvent.target.value,
                        }))
                      }
                      placeholder={formatCLP(titular.currentQuotaCLP).slice(1)}
                      aria-label={`Monto transferido de ${titular.name}`}
                      className="w-24 rounded-lg border border-ink/20 bg-elev px-2 py-1 text-right text-xs font-bold tabular-nums text-ink outline-none focus:border-ink/50 sm:w-28"
                    />
                    <button
                      type="button"
                      onClick={() => actions.confirmPayment(titular.playerRef, parseDraftAmount(titular.playerRef))}
                      className="rounded-lg border border-cancha/50 bg-cancha-soft px-2 py-1 text-xs font-bold text-cancha transition hover:border-cancha active:scale-[0.97]"
                    >
                      Pagado
                    </button>
                    {hasVigentePayment && (
                      <button
                        type="button"
                        onClick={() => actions.revokePayment(titular.playerRef)}
                        className="rounded-lg border border-ink/15 px-2 py-1 text-xs font-bold text-ink-soft transition hover:border-baja hover:text-baja active:scale-[0.97]"
                      >
                        Revertir
                      </button>
                    )}
                  </div>
                )}

                {/* Acción propia del titular con sesión en el enlace (RF-11) */}
                {selfActions !== undefined && isOwn && selfActions.isTitular && (
                  <div className="mt-2 flex justify-end">
                    {state.claims.some((claim) => claim.playerRef === selfActions.playerRef) ? (
                      <button
                        type="button"
                        disabled={selfActions.isBusy}
                        onClick={selfActions.retract}
                        className="rounded-lg border border-camino/50 bg-camino-soft px-2.5 py-1 text-xs font-bold text-camino transition active:scale-[0.97] disabled:opacity-60"
                      >
                        Retractar mi marca
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={selfActions.isBusy}
                        onClick={selfActions.mark}
                        className="rounded-lg border border-cancha/50 bg-cancha-soft px-2.5 py-1 text-xs font-bold text-cancha transition active:scale-[0.97] disabled:opacity-60"
                      >
                        Ya transferí
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {view.titulars.length === 0 && (
            <li className="rounded-xl border border-dashed border-ink/20 px-3 py-2 text-center text-sm italic text-ink-soft">
              Sin confirmados vigentes todavía.
            </li>
          )}
        </ul>
      </div>

      {boletaSlot === undefined && refundsAndTotalsContent}
    </section>
  );

  if (boletaSlot === undefined) {
    return controlSection;
  }

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-6">
      {/* La boleta: arriba en móvil, columna derecha superior en escritorio */}
      <div className="lg:col-start-2 lg:row-start-1">{boletaSlot}</div>

      {/* Control de pagos: en medio en móvil, columna izquierda en escritorio */}
      <div className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
        {controlSection}
      </div>

      {/* Reembolsos y Recaudación en vivo: abajo en móvil, columna derecha (al lado del control de pagos) en escritorio */}
      {hasRefundsOrTotals && (
        <section className="flex flex-col gap-4 rounded-2xl border border-ink/15 bg-elev p-4 sm:p-5 lg:col-start-2 lg:row-start-2">
          {refundsAndTotalsContent}
        </section>
      )}
    </div>
  );
}

function Total({
  title,
  value,
  valueClass,
}: {
  title: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-elev px-1.5 py-2 sm:px-2">
      <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-ink-soft">{title}</dt>
      <dd className={`mt-0.5 truncate font-display text-sm font-extrabold tabular-nums sm:text-base ${valueClass}`}>
        {value}
      </dd>
    </div>
  );
}
