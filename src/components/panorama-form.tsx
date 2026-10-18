"use client";

/**
 * Creador rápido de Panorama.
 * Solo se encarga de capturar y validar datos de forma amigable;
 * la creación del evento (dominio) la resuelve `src/core/quota-manager.ts`
 * a través de la acción `createEvent` del store.
 */

import { useEffect, useState } from "react";
import type { CreateEventInput, PanoramaMode } from "@/core/types";
import { PANORAMA_MODES } from "@/core/types";
import { getTodayLocalValue, isValidLocalDatetime } from "@/core/datetime-cl";
import { formatCLP, isValidCLPAmount } from "@/core/currency-clp";
import { MAX_PLACE_CANDIDATES } from "@/core/place-vote";
import { MODE_EMOJI } from "@/components/ui-theme";

/** Errores por campo, presentados en español para el usuario. */
interface FormErrors {
  title?: string;
  mode?: string;
  startsAt?: string;
  maxCapacity?: string;
  totalCostCLP?: string;
  placeCandidates?: string;
}

export default function PanoramaForm({
  onCreate,
}: {
  /** Devuelve false si el título ya existe entre los panoramas guardados. */
  onCreate: (input: CreateEventInput) => boolean;
}) {
  // La fecha del navegador solo se conoce tras montar: evita desajustes de hidratación.
  const [startsAt, setStartsAt] = useState("");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<PanoramaMode | null>(null);
  const [capacityText, setCapacityText] = useState("");
  const [costText, setCostText] = useState("");
  const [placeNamesText, setPlaceNamesText] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    // Por defecto: hoy, ahora mismo, en hora local (nunca UTC).
    // El reloj se lee aquí (capa de interfaz) y se pasa a la lógica como parámetro.
    setStartsAt(getTodayLocalValue(new Date()));
  }, []);

  const handleSubmit = (formEvent: React.FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const nextErrors = validate(title, mode, startsAt, capacityText, costText, placeNamesText);
    if (nextErrors !== null) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    const created = onCreate({
      title,
      mode: mode as PanoramaMode,
      startsAt,
      maxCapacity: capacityText.trim() === "" ? null : Number(capacityText),
      totalCostCLP: Number(costText),
      // Social: candidatos iniciales, uno por línea (opcional; core los normaliza).
      placeCandidates:
        mode === "social"
          ? placeNamesText.split("\n").map((line) => line.trim())
          : undefined,
    });
    if (!created) {
      // Título repetido entre los panoramas guardados.
      setErrors({ title: "Ya existe un panorama con ese nombre." });
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <section className="rounded-2xl border border-ink/15 bg-elev px-5 py-5">
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
          Nuevo panorama
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Crea el plan, confirma la asistencia y divide la cuenta en pesos chilenos.
        </p>

        {/* Título */}
        <div className="mt-5 flex flex-col gap-1.5">
          <label htmlFor="title" className="text-sm font-semibold text-ink">
            Título
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Fútbol de jueves, asado en lo de Matías…"
            maxLength={80}
            className="w-full rounded-xl border border-ink/20 bg-paper px-3.5 py-2.5 text-base text-ink outline-none transition focus:border-cancha"
          />
          {errors.title !== undefined && <FieldError message={errors.title} />}
        </div>

        {/* Modo */}
        <div className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink">Modo</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {PANORAMA_MODES.map((modeInfo) => {
              const selected = mode === modeInfo.id;
              return (
                <button
                  type="button"
                  key={modeInfo.id}
                  onClick={() => setMode(modeInfo.id)}
                  aria-pressed={selected}
                  className={`rounded-xl border p-3 text-left transition ${
                    selected
                      ? "border-ink/60 bg-paper ring-2 ring-cancha"
                      : "border-ink/15 bg-paper hover:border-ink/35"
                  }`}
                >
                  <span className="block text-sm font-semibold text-ink">
                    {MODE_EMOJI[modeInfo.id]} {modeInfo.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-soft">
                    {modeInfo.description}
                  </span>
                </button>
              );
            })}
          </div>
          {errors.mode !== undefined && <FieldError message={errors.mode} />}
        </div>

        {/* Fecha y hora */}
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor="startsAt" className="text-sm font-semibold text-ink">
            Fecha y hora
          </label>
          <input
            id="startsAt"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="w-full rounded-xl border border-ink/20 bg-paper px-3.5 py-2.5 text-base text-ink outline-none transition focus:border-cancha"
          />
          <span className="text-xs text-ink-soft">Hora local, los cambios nunca viajan a UTC.</span>
          {errors.startsAt !== undefined && <FieldError message={errors.startsAt} />}
        </div>

        {/* Cupo + costo */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="maxCapacity" className="text-sm font-semibold text-ink">
              Cupo máximo
            </label>
            <input
              id="maxCapacity"
              type="number"
              inputMode="numeric"
              min={2}
              value={capacityText}
              onChange={(e) => setCapacityText(e.target.value)}
              placeholder="Sin límite"
              className="w-full rounded-xl border border-ink/20 bg-paper px-3.5 py-2.5 text-base text-ink outline-none transition focus:border-cancha"
            />
            <span className="text-xs text-ink-soft">
              {mode === "deportivo" ? "Obligatorio en deportivo" : "Opcional"}
            </span>
            {errors.maxCapacity !== undefined && <FieldError message={errors.maxCapacity} />}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="totalCost" className="text-sm font-semibold text-ink">
              Costo total (CLP)
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base text-ink-soft">
                $
              </span>
              <input
                id="totalCost"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={costText}
                onChange={(e) => setCostText(e.target.value)}
                placeholder="35000"
                className="w-full rounded-xl border border-ink/20 bg-paper py-2.5 pr-3 pl-7 text-base text-ink outline-none transition focus:border-cancha"
              />
            </div>
            <span className="text-xs text-ink-soft">{getFriendlyCostHint(costText)}</span>
            {errors.totalCostCLP !== undefined && <FieldError message={errors.totalCostCLP} />}
          </div>
        </div>

        {/* Lugares candidatos (solo modo Social) */}
        {mode === "social" && (
          <div className="mt-4 flex flex-col gap-1.5">
            <label htmlFor="placeCandidates" className="text-sm font-semibold text-ink">
              ¿A dónde pueden ir? (opcional)
            </label>
            <textarea
              id="placeCandidates"
              value={placeNamesText}
              onChange={(e) => setPlaceNamesText(e.target.value)}
              rows={3}
              placeholder={"Pub El Cachapoal\nCantina La Flota"}
              className="w-full rounded-xl border border-ink/20 bg-paper px-3.5 py-2.5 text-base text-ink outline-none transition focus:border-cancha"
            />
            <span className="text-xs text-ink-soft">
              Un lugar por línea, máximo {MAX_PLACE_CANDIDATES}. Puedes agregar más después.
            </span>
            {errors.placeCandidates !== undefined && <FieldError message={errors.placeCandidates} />}
          </div>
        )}

        {/* Acción */}
        <button
          type="submit"
          className="mt-6 w-full rounded-xl bg-cancha px-4 py-3 font-display text-base font-bold text-elev transition hover:bg-cancha-deep active:scale-[0.99]"
        >
          Crear panorama
        </button>
      </section>
    </form>
  );
}

/**
 * Valida en un solo paso. Devuelve los errores por campo o `null` si todo OK.
 * (Mantiene la validación de UI separada de la lógica de dominio del core.)
 */
function validate(
  title: string,
  mode: PanoramaMode | null,
  startsAt: string,
  capacityText: string,
  costText: string,
  placeNamesText: string,
): FormErrors | null {
  const errors: FormErrors = {};

  if (title.trim() === "") {
    errors.title = "Escribe un título para tu panorama.";
  }
  if (mode === null) {
    errors.mode = "Elige el modo del panorama.";
  }
  if (!isValidLocalDatetime(startsAt)) {
    errors.startsAt = "Revisa la fecha y hora del evento.";
  }

  // Lugares candidatos solo en Social: máximo 10, cada uno con nombre.
  if (mode === "social") {
    const lines = placeNamesText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    if (lines.length > MAX_PLACE_CANDIDATES) {
      errors.placeCandidates = `Máximo ${MAX_PLACE_CANDIDATES} lugares por panorama.`;
    }
  }

  const capacityTrimmed = capacityText.trim();
  if (capacityTrimmed !== "") {
    const capacity = Number(capacityTrimmed);
    if (!Number.isInteger(capacity) || capacity < 2) {
      errors.maxCapacity = "El cupo debe ser un número de al menos 2 personas.";
    } else if (mode === "deportivo" && capacity < 2) {
      errors.maxCapacity = "Un partido necesita al menos 2 jugadores.";
    }
  } else if (mode === "deportivo") {
    errors.maxCapacity = "El modo deportivo exige cupo máximo (ej. 10 jugadores).";
  }

  const costTrimmed = costText.trim();
  if (costTrimmed === "" || !isValidCLPAmount(Number(costTrimmed))) {
    errors.totalCostCLP = "Ingresa un costo entero en CLP (sin centavos, cero o más).";
  }

  return Object.keys(errors).length === 0 ? null : errors;
}

/** Pista amigable bajo el campo de costo: muestra el monto ya formateado. */
function getFriendlyCostHint(costText: string): string {
  const trimmed = costText.trim();
  if (trimmed === "") {
    return "Arriendo de cancha, presupuesto del asado…";
  }
  const value = Number(trimmed);
  return isValidCLPAmount(value) ? `Se dividirá como ${formatCLP(value)}` : "Debe ser un entero, sin decimales";
}

/** Mensaje de error compacto bajo el campo correspondiente. */
function FieldError({ message }: { message: string }) {
  return (
    <span className="text-xs font-semibold text-baja" role="alert">
      {message}
    </span>
  );
}
