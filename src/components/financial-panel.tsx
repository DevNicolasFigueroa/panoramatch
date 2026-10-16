"use client";

/**
 * Calculadora Financiera en CLP en tiempo real (regla chilena):
 * sin decimales — cada confirmado paga un múltiplo de $100 hacia arriba
 * y la diferencia es un pozo común explícito. Los cálculos vienen de
 * `core/currency-clp.ts`.
 */

import { formatCLP, type CostSplit } from "@/core/currency-clp";

export default function FinancialPanel({
  split,
}: {
  split: CostSplit;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-xl shadow-black/30">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold tracking-wide text-slate-200 uppercase">
          La cuenta (CLP)
        </h2>
        {split.canSplit && (
          <span className="text-xs text-slate-400">
            entre {split.confirmedCount} {split.confirmedCount === 1 ? "persona" : "personas"}
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <Metric label="Costo total" value={formatCLP(split.totalCostCLP)} />
        <Metric
          label="Cada uno paga"
          value={split.canSplit ? formatCLP(split.perHeadCLP) : "—"}
          highlight
        />
      </div>

      {!split.canSplit ? (
        <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          La cuenta se divide en cuanto haya confirmados «Voy».
        </p>
      ) : (
        <div className="mt-3 rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">
              {split.isExactDivision
                ? "División exacta ✅"
                : "Pozo a favor (diferencia por redondeo)"}
            </span>
            <span className={`font-bold ${split.surplusCLP > 0 ? "text-teal-300" : "text-slate-300"}`}>
              {formatCLP(split.surplusCLP)}
            </span>
          </div>
          {!split.isExactDivision && (
            <p className="mt-1 text-[11px] leading-snug text-slate-500">
              Redondeo práctico: se sube al múltiplo de $100 más cercano. El sobrante queda
              para el pozo común de los amigos.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        highlight
          ? "border-emerald-500/40 bg-emerald-500/10"
          : "border-slate-700/60 bg-slate-950/60"
      }`}
    >
      <p className="text-[11px] font-medium tracking-wide text-slate-400 uppercase">{label}</p>
      <p
        className={`mt-0.5 text-lg font-extrabold tabular-nums ${
          highlight ? "text-emerald-300" : "text-slate-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
