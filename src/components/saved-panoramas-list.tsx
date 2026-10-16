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
    <section className="flex flex-col gap-3">
      <h2 className="px-1 font-display text-lg font-bold tracking-tight text-ink">
        Mis panoramas
      </h2>

      {ordered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ink/25 bg-elev px-4 py-6 text-center text-sm text-ink-soft">
          Crea tu primer panorama 🎉
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {ordered.map((savedPanorama) => (
            <SavedPanoramaCard
              key={savedPanorama.id}
              savedPanorama={savedPanorama}
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
  savedPanorama,
  onOpenPanorama,
  onRemovePanorama,
}: {
  savedPanorama: SavedPanorama;
  onOpenPanorama: (panoramaId: string) => void;
  onRemovePanorama: (panoramaId: string) => void;
}) {
  const summary = buildSavedSummary(savedPanorama);
  const quorumStyle = QUORUM_STYLES[summary.quorum];
  const modeStyle = MODE_STYLES[summary.mode];

  const handleRemove = () => {
    // Confirmación mínima: borrar con sus confirmaciones es irreversible (V1 local).
    if (window.confirm(`¿Eliminar "${summary.title}" con todas sus confirmaciones?`)) {
      onRemovePanorama(savedPanorama.id);
    }
  };

  return (
    <li
      className="relative flex items-stretch gap-2 overflow-hidden rounded-xl border border-ink/15 bg-elev"
    >
      {/* Franja lateral con el color del modo: es información, no adorno */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-[3px] ${modeStyle.barClass}`}
      />
      {/* Zona clicable: abre el panel activo */}
      <button
        type="button"
        onClick={() => onOpenPanorama(summary.id)}
        className="min-w-0 flex-1 rounded-xl py-3 pr-3 pl-4 text-left transition hover:bg-paper active:scale-[0.99]"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-bold text-ink">{summary.title}</span>
          <span className="shrink-0 font-display text-base font-extrabold tabular-nums text-cancha">
            {formatCLP(summary.totalCostCLP)}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
          <span className={`rounded-full border px-1.5 py-px font-semibold ${modeStyle.chipClass}`}>
            {MODE_EMOJI[summary.mode]} {modeStyle.label}
          </span>
          <span>{summary.formattedDate}</span>
        </div>

        <div className="mt-1.5 flex items-center gap-2 text-xs">
          <span className={`h-2 w-2 shrink-0 rounded-full ${quorumStyle.dotClass}`} aria-hidden />
          <span className={`font-semibold ${quorumStyle.textClass}`}>{summary.quorumLabel}</span>
          <span className="text-ink-soft">
            {summary.titularCount}
            {summary.maxCapacity !== null ? ` / ${summary.maxCapacity}` : ""} van
          </span>
        </div>
      </button>

      {/* Eliminar el panorama guardado */}
      <button
        type="button"
        onClick={handleRemove}
        aria-label={`Eliminar ${summary.title}`}
        className="shrink-0 border-l border-ink/10 px-3 text-base transition hover:bg-baja-soft active:scale-[0.97]"
      >
        <span aria-hidden className="text-ink-soft transition hover:text-baja">✕</span>
      </button>
    </li>
  );
}
