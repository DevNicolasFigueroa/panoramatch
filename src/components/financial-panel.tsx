"use client";

/**
 * La boleta: calculadora financiera en CLP presentada como boleta troquelada
 * (titular grande + filas por partida). Cálculo puro de `core/currency-clp.ts`;
 * la interfaz solo formatea.
 */

import { formatCLP, type CostSplit } from "@/core/currency-clp";

export default function FinancialPanel({
  split,
}: {
  split: CostSplit;
}) {
  return (
    <aside className="relative rounded-2xl border border-ink bg-elev px-5 py-5 shadow-[3px_3px_0_0_rgba(38,48,58,0.9)]">
      <div className="flex items-baseline justify-between gap-3 pb-3">
        <h2 className="font-display text-lg font-bold tracking-tight text-ink">
          La boleta
        </h2>
        <span className="text-sm text-ink-soft">
          {split.canSplit
            ? `${split.confirmedCount} ${split.confirmedCount === 1 ? "persona" : "personas"}`
            : "sin confirmados"}
        </span>
      </div>

      {/* Titular: el monto que importa */}
      <div className="pb-2">
        <p className="text-sm text-ink-soft">Cada uno paga</p>
        <p className="font-display text-4xl font-extrabold leading-tight tracking-tight text-cancha tabular-nums">
          {split.canSplit ? formatCLP(split.perHeadCLP) : "$——"}
        </p>
      </div>

      <div className="relative">
        {/* Troquelado: picos al nivel de la línea, como boleta de cancha */}
        <span aria-hidden className="absolute top-[-9px] left-[-29px] h-[18px] w-[18px] rounded-full border border-ink bg-paper" />
        <span aria-hidden className="absolute top-[-9px] right-[-29px] h-[18px] w-[18px] rounded-full border border-ink bg-paper" />
        <div className="flex flex-col gap-2 border-t-2 border-dashed border-ink/50 pt-3 text-sm">
          <Row label="Costo total" value={formatCLP(split.totalCostCLP)} />

          {!split.canSplit ? (
            <p className="rounded-lg bg-wait-soft px-3 py-2 text-xs text-wait">
              La cuenta se divide recién cuando alguien confirme «Voy».
            </p>
          ) : (
            <Row
              label={
                split.isExactDivision
                  ? "División exacta"
                  : "Pozo a favor, por el redondeo"
              }
              value={formatCLP(split.surplusCLP)}
              valueClass={split.surplusCLP > 0 ? "text-wait" : undefined}
            />
          )}
        </div>
      </div>

      {split.canSplit && !split.isExactDivision && (
        <p className="border-t border-dashed border-ink/40 pt-2 text-xs leading-snug text-ink-soft">
          Redondeo práctico chileno: se sube al múltiplo de $100 más cercano y el
          sobrante queda para el pozo común. Cero decimales, siempre.
        </p>
      )}
    </aside>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-soft">{label}</span>
      <span className={`font-semibold tabular-nums ${valueClass ?? "text-ink"}`}>
        {value}
      </span>
    </div>
  );
}
