"use client";

/**
 * Listado "Mis Panoramas Guardados" como carrusel horizontal de tarjetas
 * (lectura del prototipo de Stitch): cada card abre el panel activo;
 * eliminar pide confirmación. Los datos derivados los calcula
 * `core/panorama-collection.ts`.
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
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="font-display text-lg font-bold tracking-tight text-ink">
          Mis panoramas
        </h2>
        {ordered.length > 0 && (
          <span className="text-xs font-semibold text-ink-soft">
            {ordered.length} {ordered.length === 1 ? "activo" : "activos"}
          </span>
        )}
      </div>

      {ordered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ink/25 bg-elev px-4 py-6 text-center text-sm text-ink-soft">
          Crea tu primer panorama 🎉
        </p>
      ) : (
        <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-1">
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
    <li className="relative shrink-0 snap-start overflow-hidden rounded-2xl border border-ink/15 bg-elev sm:w-full sm:shrink">
      {/* Franja superior con el color del modo: es información, no adorno */}
      <span aria-hidden className={`block h-1.5 ${modeStyle.barClass}`} />

      {/* Zona clicable: abre el panel activo (la ✕ de eliminar va aparte) */}
      <button
        type="button"
        onClick={() => onOpenPanorama(summary.id)}
        className="flex w-64 flex-col p-4 pr-9 text-left transition hover:bg-paper active:scale-[0.99] sm:w-full"
      >
        <span className={`w-fit rounded-full border px-1.5 py-px font-semibold text-[11px] ${modeStyle.chipClass}`}>
          {MODE_EMOJI[summary.mode]} {modeStyle.label}
        </span>

        <span className="mt-2 truncate text-base font-bold text-ink">
          {summary.title}
        </span>
        <span className="mt-0.5 text-xs text-ink-soft">{summary.formattedDate}</span>

        <span className="mt-3 flex items-center gap-1.5 text-xs">
          <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${quorumStyle.dotClass}`} />
          <span className={`font-semibold ${quorumStyle.textClass}`}>{summary.quorumLabel}</span>
        </span>
        <span className="mt-1 text-xs text-ink-soft">
          {summary.titularCount}
          {summary.maxCapacity !== null ? ` / ${summary.maxCapacity}` : ""} van
        </span>

        <span className="mt-3 font-display text-lg font-extrabold tabular-nums text-cancha">
          {formatCLP(summary.totalCostCLP)}
        </span>
      </button>

      {/* Eliminar el panorama guardado */}
      <button
        type="button"
        onClick={handleRemove}
        aria-label={`Eliminar ${summary.title}`}
        className="absolute top-3 right-3 grid h-7 w-7 place-items-center rounded-full border border-ink/10 text-sm text-ink-soft transition hover:border-baja hover:bg-baja-soft hover:text-baja active:scale-95"
      >
        <span aria-hidden>✕</span>
      </button>
    </li>
  );
}
