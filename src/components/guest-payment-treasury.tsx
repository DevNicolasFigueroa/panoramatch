"use client";

/**
 * Pagos del invitado en el enlace (spec 005, privacidad 2A) — tres capas:
 * (a) métricas ANÓNIMAS del pozo (barra + % + «N de M pagados» + cuota),
 * (b) bloque bancario heredado del 004 con «Copiar»,
 * (c) SU tarjeta personal: estado de pago, devoluciones propias, SU
 *     comprobante (miniatura + visor firmado), nota de rechazo y acciones
 *     propias (marcar con imagen / reemplazar / retractar / respaldo D4).
 *
 * El tablero completo NO se muestra aquí: es solo del organizador.
 * La regla de negocio vive en `src/core/payment-receipt.ts` y
 * `src/core/payment-treasury.ts`; la visibilidad la decide el servidor con
 * RLS/RPC. Presentación pura: sin variantes `dark:` ni colores nuevos.
 */

import { useEffect, useMemo, useState } from "react";

import { formatCLP } from "@/core/currency-clp";
import type {
  GuestReceiptSnapshot,
  GuestTreasuryView,
} from "@/core/payment-receipt";
import { initialsFromName } from "@/core/initials";
import { fetchSignedReceiptUrlRow } from "@/lib/supabase-panorama-repo";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

const FLOW_CHIP: Record<string, string> = {
  paid: "border-cancha/50 bg-cancha-soft text-cancha",
  in_review: "border-camino/50 bg-camino-soft text-camino",
  pending: "border-ink/20 bg-paper text-ink-soft",
};

const FLOW_LABEL: Record<string, string> = {
  paid: "Pagado",
  in_review: "En revisión",
  pending: "Pendiente",
};

const RECEIPT_ACCEPT = "image/jpeg,image/png,image/webp";

export default function GuestPaymentTreasury({
  view,
  transferInfo,
  receiptStoragePath,
  isBusy,
  error,
  onPickReceipt,
  onRetract,
}: {
  /** Vista de 3 capas del núcleo; null mientras carga. */
  view: GuestTreasuryView | null;
  /** Bloque de datos de transferencia del organizador. */
  transferInfo: string | null;
  /** Ruta del objeto del comprobante propio (para la URL firmada). */
  receiptStoragePath: string | null;
  isBusy: boolean;
  /** Aviso local de la tarjeta de pagos (texto en español). */
  error: string | null;
  /**
   * Único gesto de imagen: el llamador decide qué operación aplica según el
   * flujo propio (marca nueva / reemplazo / adjunto a marca legacy / D4).
   */
  onPickReceipt: (file: File) => void;
  /** Retracto de la marca propia (la imagen sale con ella). */
  onRetract: () => void;
}) {
  const self = view?.self ?? null;

  /** Botón por flujo: el único `onPickReceipt` decide la operación. */
  const pickState: "claim" | "replace" | "attach" | null = useMemo(() => {
    if (self === null) {
      return null;
    }
    if (self.flowState === "in_review") {
      return "replace";
    }
    if (self.flowState === "paid" && self.receipt === null) {
      return "attach";
    }
    if (self.flowState === "pending") {
      return "claim";
    }
    return null;
  }, [self]);

  const canRetract = self !== null && self.flowState === "in_review";
  const isLegacyClaim =
    pickState === "replace" && self !== null && self.receipt === null;

  if (view === null) {
    return (
      <section className="min-w-0 rounded-2xl border border-ink/15 bg-elev p-4" aria-busy="true">
        <h2 className="font-display text-lg font-bold tracking-tight text-ink">Pagos</h2>
        <p className="mt-1 text-sm text-ink-soft">Cargando los pagos…</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-ink/15 bg-elev p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold tracking-tight text-ink">Pagos</h2>
        <span className="text-xs text-ink-soft">
          {formatCLP(view.currentQuotaCLP)} por confirmado
        </span>
      </div>

      {/* Capa 1: métricas anónimas del pozo (sin nombres ni montos ajenos) */}
      <div className="rounded-xl border border-ink/15 bg-paper p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">Recaudación del grupo</h3>
          <span className="font-display text-xs font-extrabold tabular-nums text-cancha">
            {view.summary.percent}%
          </span>
        </div>
        <div className="mt-2" aria-hidden="true">
          <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
            <div
              className="h-full rounded-full bg-cancha transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${view.summary.percent}%` }}
            />
          </div>
        </div>
        <p className="mt-2 text-xs font-semibold text-ink-soft">
          {view.summary.paidGuests} de {view.summary.guestTotal} pagados
          {view.surplusCLP > 0 ? ` · pozo común ${formatCLP(view.surplusCLP)}` : ""}
        </p>
      </div>

      {/* Capa 2: bloque bancario heredado del 004 (copiable) */}
      <BankBlock transferInfo={transferInfo} />

      {/* Capa 3: SU tarjeta personal */}
      {self !== null ? (
        <SelfCard
          self={self}
          pickState={pickState}
          isLegacyClaim={isLegacyClaim}
          canRetract={canRetract}
          isBusy={isBusy}
          receiptStoragePath={receiptStoragePath}
          onPickReceipt={onPickReceipt}
          onRetract={onRetract}
        />
      ) : (
        <p className="rounded-xl border border-dashed border-ink/20 px-3 py-2 text-center text-sm italic text-ink-soft">
          Aún no participas en este panorama: confirma tu asistencia para ver tus pagos.
        </p>
      )}

      {error !== null && (
        <p className="text-xs font-semibold text-baja" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/* ─────────────── Capa 2: bloque bancario ─────────────── */

function BankBlock({ transferInfo }: { transferInfo: string | null }) {
  const [copyState, setCopyState] = useState<"idle" | "ok" | "failed">("idle");

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(transferInfo ?? "");
      setCopyState("ok");
    } catch {
      // El usuario selecciona el texto a mano: nunca un fallo silencioso.
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 2000);
  };

  return (
    <div className="rounded-xl border border-ink/15 bg-paper p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">Datos de transferencia</h3>
        <button
          type="button"
          onClick={() => void copyText()}
          className="shrink-0 rounded-lg border border-ink/20 px-2 py-1 text-xs font-bold text-ink-soft transition hover:border-ink/50 hover:text-ink active:scale-[0.97]"
        >
          {copyState === "ok" ? "¡Copiado!" : copyState === "failed" ? "No se pudo copiar" : "Copiar"}
        </button>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm leading-snug text-ink">
        {transferInfo ?? ""}
      </p>
    </div>
  );
}

/* ─────────────── Capa 3: la tarjeta propia ─────────────── */

function SelfCard({
  self,
  pickState,
  isLegacyClaim,
  canRetract,
  isBusy,
  receiptStoragePath,
  onPickReceipt,
  onRetract,
}: {
  self: NonNullable<GuestTreasuryView["self"]>;
  pickState: "claim" | "replace" | "attach" | null;
  isLegacyClaim: boolean;
  canRetract: boolean;
  isBusy: boolean;
  receiptStoragePath: string | null;
  onPickReceipt: (file: File) => void;
  onRetract: () => void;
}) {
  return (
    <div className="rounded-xl border border-cancha/40 bg-cancha-soft p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-cancha font-display text-[10px] font-bold text-elev"
          >
            {initialsFromName(self.name)}
          </span>
          <span className="min-w-0 truncate text-sm font-bold text-ink">{self.name} (tú)</span>
        </div>
        <span className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] font-semibold ${FLOW_CHIP[self.flowState]}`}>
          {FLOW_LABEL[self.flowState]}
        </span>
      </div>

      {/* Montos: solo la fila propia */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {self.flowState === "pending" && self.remainingCLP > 0 && (
          <span className="font-bold text-baja tabular-nums">
            falta {formatCLP(self.remainingCLP)}
          </span>
        )}
        {self.situation === "credit" && self.creditCLP > 0 && (
          <span className="font-bold text-wait tabular-nums">
            te devolvemos {formatCLP(self.creditCLP)}
          </span>
        )}
        {self.situation === "even" && self.flowState === "paid" && (
          <span className="font-bold text-cancha">¡Pago al día!</span>
        )}
        {self.pendingRefundCLP > 0 && (
          <span className="font-bold text-wait tabular-nums">
            devolución pendiente {formatCLP(self.pendingRefundCLP)}
          </span>
        )}
      </div>

      {/* Devoluciones propias ya registradas (herencia 004) */}
      {self.ownResolvedRefunds.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {self.ownResolvedRefunds.map((refund, index) => (
            <li
              key={`${refund.kind}-${refund.resolvedAt}-${index}`}
              className="text-xs text-ink-soft"
            >
              Reembolsada {formatCLP(refund.amountCLP)} · {refund.resolvedAt.replace("T", " · ")}
            </li>
          ))}
        </ul>
      )}

      {/* Nota de rechazo vigente (hasta la próxima marca) */}
      {self.rejectionNote !== null && (
        <div className="mt-2 rounded-lg border border-baja/40 bg-baja-soft px-2.5 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-baja">
            El organizador pidió corregir tu comprobante
          </p>
          <p className="mt-0.5 whitespace-pre-line text-xs leading-snug text-ink">
            {self.rejectionNote}
          </p>
        </div>
      )}

      {/* SU comprobante: miniatura + visor + «Reemplazar» en «En revisión» */}
      {self.receipt !== null && (
        <div className="mt-2">
          <ReceiptSnapshot
            snapshot={self.receipt}
            storagePath={receiptStoragePath}
            isBusy={isBusy}
            onReplacePick={onPickReceipt}
          />
        </div>
      )}
      {isLegacyClaim && (
        <p className="mt-2 text-xs text-ink-soft">
          Marca heredada sin imagen: adjunta tu comprobante para completarla.
        </p>
      )}

      {/* Acciones propias: un solo gesto de imagen */}
      {pickState !== null && (
        <label
          className={`mt-3 flex w-full cursor-pointer items-center justify-center rounded-xl border px-3 py-2 text-sm font-bold transition active:scale-[0.99] ${
            pickState === "claim"
              ? "border-cancha bg-cancha text-elev hover:bg-cancha-deep"
              : "border-camino/50 bg-camino-soft text-camino"
          } ${isBusy ? "pointer-events-none opacity-60" : ""}`}
        >
          {pickState === "claim"
            ? "Elegir comprobante y marcar «Ya transferí»"
            : pickState === "replace"
              ? self.receipt === null
                ? "Adjuntar comprobante"
                : "Reemplazar comprobante"
              : "Adjuntar respaldo del pago"}
          <input
            type="file"
            accept={RECEIPT_ACCEPT}
            className="hidden"
            disabled={isBusy}
            onChange={(changeEvent) => {
              const file = changeEvent.target.files?.[0] ?? null;
              // Permite volver a elegir el MISMO archivo (reset del input).
              changeEvent.target.value = "";
              if (file !== null) {
                onPickReceipt(file);
              }
            }}
          />
        </label>
      )}

      {canRetract && (
        <button
          type="button"
          disabled={isBusy}
          onClick={onRetract}
          className="mt-2 w-full rounded-xl border border-ink/15 px-3 py-2 text-xs font-bold text-ink-soft transition hover:border-baja hover:text-baja active:scale-[0.98] disabled:opacity-60"
        >
          Retractar mi marca
        </button>
      )}
    </div>
  );
}

/* ─────────────── Miniatura y visor del comprobante ─────────────── */

function ReceiptSnapshot({
  snapshot,
  storagePath,
  isBusy,
  onReplacePick,
}: {
  snapshot: GuestReceiptSnapshot;
  storagePath: string | null;
  isBusy: boolean;
  onReplacePick: (file: File) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [isUrlFailed, setIsUrlFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // URL firmada de corta vida (5 min): se pide al montar y al reintentar.
  useEffect(() => {
    let cancelled = false;
    setIsUrlFailed(false);
    setUrl(null);
    if (storagePath === null) {
      return;
    }
    const run = async () => {
      try {
        const signed = await fetchSignedReceiptUrlRow(getSupabaseBrowserClient(), storagePath);
        if (!cancelled) {
          setUrl(signed);
          if (signed === null) {
            setIsUrlFailed(true);
          }
        }
      } catch {
        if (!cancelled) {
          setIsUrlFailed(true);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [storagePath, retryKey]);

  const isLocked = snapshot.confirmed;
  const canReplace = snapshot.canReplace;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="block h-16 w-16 overflow-hidden rounded-xl border border-ink/20 bg-paper active:scale-[0.98]"
          aria-label="Ver mi comprobante"
        >
          {url !== null ? (
            <img src={url} alt="Comprobante" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden="true" className="grid h-full w-full place-items-center text-lg text-ink-soft">
              🧾
            </span>
          )}
        </button>
        {isLocked && (
          <span className="absolute -right-1.5 -top-1.5 rounded-full border border-cancha/50 bg-cancha-soft px-1.5 py-px text-[9px] font-bold text-cancha">
            Respaldo
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-ink">
          {isLocked ? "Respaldo bloqueado de tu pago" : "Comprobante en revisión"}
        </p>
        <p className="mt-0.5 text-[11px] leading-tight text-ink-soft">
          {formatByteSize(snapshot.byteSize)} · subido {snapshot.uploadedAt.replace("T", " · ")}
          {isUrlFailed ? " · vista no disponible" : ""}
        </p>
        {isUrlFailed && (
          <button
            type="button"
            onClick={() => setRetryKey((key) => key + 1)}
            className="mt-1 text-[11px] font-bold text-cancha underline decoration-dotted underline-offset-2"
          >
            Reintentar
          </button>
        )}
        {canReplace && (
          <label
            className={`mt-1 inline-flex cursor-pointer items-center rounded-lg border border-camino/50 bg-camino-soft px-2 py-1 text-xs font-bold text-camino transition active:scale-[0.97] ${
              isBusy ? "pointer-events-none opacity-60" : ""
            }`}
          >
            Reemplazar
            <input
              type="file"
              accept={RECEIPT_ACCEPT}
              className="hidden"
              disabled={isBusy}
              onChange={(changeEvent) => {
                const file = changeEvent.target.files?.[0] ?? null;
                changeEvent.target.value = "";
                if (file !== null) {
                  onReplacePick(file);
                }
              }}
            />
          </label>
        )}
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4">
          <button
            type="button"
            aria-hidden="true"
            className="absolute inset-0 bg-ink/70 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mi comprobante"
            className="relative mx-auto w-full max-w-2xl rounded-t-3xl border border-ink bg-elev p-4 sm:rounded-2xl"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-ink">Mi comprobante</p>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg border border-ink/20 px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-ink/60"
              >
                Cerrar
              </button>
            </div>
            <div className="mt-3 max-h-[70vh] overflow-auto rounded-xl border border-ink/15 bg-paper">
              {url !== null ? (
                <img src={url} alt="Comprobante completo" className="mx-auto max-h-[70vh] w-auto max-w-full" />
              ) : (
                <p className="grid place-items-center gap-2 p-8 text-sm text-ink-soft">
                  {isUrlFailed ? "La vista no está disponible ahora." : "Abriendo la imagen…"}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatByteSize(byteSize: number): string {
  if (byteSize >= 1024 * 1024) {
    return `${(byteSize / (1024 * 1024)).toLocaleString("es-CL", { maximumFractionDigits: 1 })} MB`;
  }
  if (byteSize >= 1024) {
    return `${Math.round(byteSize / 1024)} KB`;
  }
  return `${byteSize} B`;
}
