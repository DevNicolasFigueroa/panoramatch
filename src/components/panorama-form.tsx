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

/** Errores por campo, presentados en español para el usuario. */
interface FormErrors {
  title?: string;
  mode?: string;
  startsAt?: string;
  maxCapacity?: string;
  totalCostCLP?: string;
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
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    // Por defecto: hoy, ahora mismo, en hora local (nunca UTC).
    setStartsAt(getTodayLocalValue());
  }, []);

  const handleSubmit = (formEvent: React.FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const nextErrors = validate(title, mode, startsAt, capacityText, costText);
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
    });
    if (!created) {
      // Título repetido entre los panoramas guardados.
      setErrors({ title: "Ya existe un panorama con ese nombre." });
    }
  };

  const modeBadge = (modeId: PanoramaMode) =>
    modeId === "social"
      ? "border-fuchsia-500/40 bg-fuchsia-500/10"
      : modeId === "colaborativo"
        ? "border-amber-500/40 bg-amber-500/10"
        : "border-emerald-500/40 bg-emerald-500/10";

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-black/30">
        <h2 className="text-xl font-bold text-slate-100">Crear panorama</h2>
        <p className="mt-1 text-sm text-slate-400">
          Arma el plan, confirma asistencia y divide la cuenta en pesos chilenos.
        </p>

        {/* Título */}
        <div className="mt-5 flex flex-col gap-1.5">
          <label htmlFor="title" className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
            Título del panorama *
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Fútbol de jueves, asado en lo de Matías…"
            maxLength={80}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-base text-slate-100 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
          />
          {errors.title !== undefined && <FieldError message={errors.title} />}
        </div>

        {/* Modo */}
        <div className="mt-4 flex flex-col gap-1.5">
          <span className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
            Modo / Plantilla *
          </span>
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
                      ? `${modeBadge(modeInfo.id)} ring-2 ring-white/10`
                      : "border-slate-700 bg-slate-950 hover:bg-slate-800"
                  }`}
                >
                  <span
                    className={`block text-sm font-semibold ${
                      selected ? "text-slate-100" : "text-slate-300"
                    }`}
                  >
                    {modeInfo.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-400">
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
          <label htmlFor="startsAt" className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
            Fecha y hora
          </label>
          <input
            id="startsAt"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-base text-slate-100 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
          />
          <span className="text-xs text-slate-500">Hora local de Chile. Por defecto hoy.</span>
          {errors.startsAt !== undefined && <FieldError message={errors.startsAt} />}
        </div>

        {/* Cupo + costo */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="maxCapacity" className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
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
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-base text-slate-100 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
            />
            <span className="text-xs text-slate-500">
              {mode === "deportivo" ? "Obligatorio en deportivo (10, 12…)" : "Opcional"}
            </span>
            {errors.maxCapacity !== undefined && <FieldError message={errors.maxCapacity} />}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="totalCost" className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
              Costo total (CLP) *
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-slate-500">
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
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pr-3 pl-7 text-base text-slate-100 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              />
            </div>
            <span className="text-xs text-slate-500">
              {getFriendlyCostHint(costText)}
            </span>
            {errors.totalCostCLP !== undefined && <FieldError message={errors.totalCostCLP} />}
          </div>
        </div>

        {/* Acción */}
        <button
          type="submit"
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-3 text-base font-bold text-emerald-950 transition hover:brightness-110 active:scale-[0.99]"
        >
          Crear panorama 🚀
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
    errors.totalCostCLP = "Ingresa un costo entero en CLP (sin centavos, 0 o más).";
  }

  return Object.keys(errors).length === 0 ? null : errors;
}

/** Pista amigable bajo el campo de costo: muestra el monto ya formateado. */
function getFriendlyCostHint(costText: string): string {
  const trimmed = costText.trim();
  if (trimmed === "") {
    return "Presupuesto base, arriendo de cancha…";
  }
  const value = Number(trimmed);
  return isValidCLPAmount(value) ? `Se dividirá como ${formatCLP(value)}` : "Debe ser un entero (sin centavos)";
}

/** Mensaje de error compacto bajo el campo correspondiente. */
function FieldError({ message }: { message: string }) {
  return (
    <span className="text-xs font-medium text-rose-400" role="alert">
      {message}
    </span>
  );
}
