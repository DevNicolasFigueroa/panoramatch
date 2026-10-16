"use client";

/**
 * Panel Visual del Panorama (Vista activa):
 * cabecera con Semáforo de Quórum, confirmación rápida, asistentes y espera,
 * y calculadora financiera en CLP. Toda la lógica ya está en `src/core/`.
 */

import { useMemo } from "react";
import type { Attendee, SavedPanorama } from "@/core/types";
import { formatPanoramaStartsAt } from "@/core/datetime-cl";
import {
  classifyAttendees,
  getMissingToQuorum,
  getQuorumLabel,
  getQuorumStatus,
  type QuorumStatus,
} from "@/core/quota-manager";
import { splitCost } from "@/core/currency-clp";
import { MODE_EMOJI, MODE_STYLES } from "@/components/ui-theme";
import QuorumSemaphore from "@/components/quorum-semaphore";
import AddFriendForm from "@/components/add-friend-form";
import AttendeeSections from "@/components/attendee-sections";
import FinancialPanel from "@/components/financial-panel";

export default function PanoramaDashboard({
  panorama,
  onAddFriend,
  onChangeStatus,
  onGoHome,
}: {
  panorama: SavedPanorama;
  onAddFriend: (name: string, status: Attendee["status"]) => boolean;
  onChangeStatus: (attendeeId: string, status: Attendee["status"]) => void;
  onGoHome: () => void;
}) {
  const { event, attendees } = panorama;
  // Derivados puros: clasificación de asistentes y reparto del costo.
  const classification = useMemo(
    () => classifyAttendees(attendees, event.maxCapacity),
    [attendees, event.maxCapacity],
  );
  const quorum: QuorumStatus = useMemo(
    () => getQuorumStatus(event.maxCapacity, classification.titulars.length),
    [event.maxCapacity, classification.titulars.length],
  );
  const missingCount = useMemo(
    () => getMissingToQuorum(event.maxCapacity, classification.titulars.length),
    [event.maxCapacity, classification.titulars.length],
  );
  const split = useMemo(
    () => splitCost(event.totalCostCLP, classification.titulars.length),
    [event.totalCostCLP, classification.titulars.length],
  );

  const modeStyle = MODE_STYLES[event.mode];

  return (
    <div className="flex flex-col gap-4">
      {/* Cabecera del panorama */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-black/30">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase ${modeStyle.badgeClass}`}
          >
            {MODE_EMOJI[event.mode]} {modeStyle.label}
          </span>
          <span className="text-xs text-slate-400">
            {event.maxCapacity !== null ? `Cupo: ${event.maxCapacity} personas` : "Sin cupo máximo"}
          </span>
        </div>

        <h2 className="mt-2.5 text-2xl leading-tight font-extrabold text-slate-50">
          {event.title}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          📅 {formatPanoramaStartsAt(event.startsAt)}
        </p>

        <div className="mt-4">
          <QuorumSemaphore status={quorum} label={getQuorumLabel(quorum, missingCount)} />
        </div>
      </section>

      {/* Módulo de Confirmación Rápida */}
      <AddFriendForm onAddFriend={onAddFriend} />

      {/* Asistentes y Espera */}
      <AttendeeSections
        classification={classification}
        maxCapacity={event.maxCapacity}
        onChangeStatus={onChangeStatus}
      />

      {/* Calculadora Financiera en CLP */}
      <FinancialPanel split={split} />

      {/* Navegación: listado guardado o crear otro (el listado se conserva) */}
      <div className="mt-1 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onGoHome}
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-slate-100 active:scale-[0.99]"
        >
          ◀ Mis panoramas
        </button>
        <button
          type="button"
          onClick={onGoHome}
          className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 active:scale-[0.99]"
        >
          ➕ Crear nuevo
        </button>
      </div>
    </div>
  );
}
