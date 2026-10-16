"use client";

/**
 * Listado "Mis Panoramas Guardados": resumen rápido por tarjeta (título,
 * modo, fecha, estado de quórum y total en CLP), apertura del panel activo
 * y eliminación. Los datos derivados los calcula `core/panorama-collection.ts`.
 */

import type { SavedPanorama } from "@/core/types";
import { buildSavedSummary, sortSavedPanoramas } from "@/core/panorama-collection";
import { formatCLP } from "@/core/currency-clp";
import { MODE_EMOJI, MODE_STYLES, QUORUM_STYLES } from "@/components/ui-theme";

export default function SavedPanoramasList({
  savedPanoramas,
  onOpenPanorama,
  onRemovePanorama,
}: {
  savedPanoramas: readonly SavedPanorama[];
  onOpenPanorama: (panoramaId: string) => void;
  onRemovePanorama: (panoramaId: string) => void;
}) {
  const ordered = sortSavedPanoramas(savedPanoramas);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-xl shadow-black/30">
      <h2 className="text-sm font-bold tracking-wide text-slate-200 uppercase">
        Mis panoramas guardados
      </h2>

      {ordered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 px-4 py-5 text-center text-sm text-slate-400">
          Crea tu primer panorama 🎉
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {ordered.map((saved) => (
            <SavedPanoramaCard
              key={saved.id}
              saved={saved}
              onOpenPanorama={onOpenPanorama}
              onRemovePanorama={onRemovePanorama}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SavedPanoramaCard({
  saved,
  onOpenPanorama,
  onRemovePanorama,
}: {
  saved: SavedPanorama;
  onOpenPanorama: (panoramaId: string) => void;
  onRemovePanorama: (panoramaId: string) => void;
}) {
  const summary = buildSavedSummary(saved);
  const quorumStyle = QUORUM_STYLES[summary.quorum];
  const modeStyle = MODE_STYLES[summary.mode];

  const handleRemove = () => {
    // Confirmación mínima: borrar con sus confirmaciones es irreversible (V1 local).
    if (window.confirm(`¿Eliminar "${summary.title}" con todas sus confirmaciones?`)) {
      onRemovePanorama(saved.id);
    }
  };

  return (
    <li className="flex items-stretch gap-2">
      {/* Zona clicable: abre el panel activo */}
      <button
        type="button"
        onClick={() => onOpenPanorama(summary.id)}
        className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-left transition hover:border-slate-600 hover:bg-slate-900 active:scale-[0.99]"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-bold text-slate-100">{summary.title}</span>
          <span className="shrink-0 text-sm font-extrabold tabular-nums text-teal-300">
            {formatCLP(summary.totalCostCLP)}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
          <span className={`rounded-full border px-1.5 py-px text-[10px] font-bold tracking-wide uppercase ${modeStyle.badgeClass}`}>
            {MODE_EMOJI[summary.mode]} {modeStyle.label}
          </span>
          <span className="truncate">📅 {summary.formattedDate}</span>
        </div>

        <div className="mt-1.5 flex items-center gap-2 text-xs">
          <span className={`h-2 w-2 shrink-0 rounded-full ${quorumStyle.dotClass}`} aria-hidden />
          <span className={`font-semibold ${quorumStyle.textClass}`}>{summary.quorumLabel}</span>
          <span className="text-slate-500">
            · {summary.titularCount}
            {summary.maxCapacity !== null ? ` / ${summary.maxCapacity}` : ""} titulares
          </span>
        </div>
      </button>

      {/* Eliminar el panorama guardado */}
      <button
        type="button"
        onClick={handleRemove}
        aria-label={`Eliminar ${summary.title}`}
        className="shrink-0 rounded-xl border border-rose-500/30 bg-slate-950/60 px-3 text-base text-rose-300 transition hover:border-rose-400/60 hover:bg-rose-500/10 active:scale-[0.97]"
      >
        🗑️
      </button>
    </li>
  );
}
