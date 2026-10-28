"use client";

/**
 * Vista de inicio (sin panorama activo): creador rápido arriba y el
 * listado "Mis Panoramas Guardados" debajo. Solo composición y pasamanos.
 */

import type { SavedPanorama } from "@/core/types";
import type { CreateEventInput } from "@/core/types";
import PanoramaForm from "@/components/panorama-form";
import SavedPanoramasList from "@/components/saved-panoramas-list";

export default function HomeView({
  savedPanoramas,
  onCreate,
  onOpenPanorama,
  onRemovePanorama,
}: {
  savedPanoramas: readonly SavedPanorama[];
  /** Devuelve false si el título ya existe (el formulario muestra el error). */
  onCreate: (input: CreateEventInput) => boolean;
  onOpenPanorama: (panoramaId: string) => void;
  onRemovePanorama: (panoramaId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start lg:gap-6">
      <PanoramaForm onCreate={onCreate} />
      <SavedPanoramasList
        savedPanoramas={savedPanoramas}
        onOpenPanorama={onOpenPanorama}
        onRemovePanorama={onRemovePanorama}
      />
    </div>
  );
}
