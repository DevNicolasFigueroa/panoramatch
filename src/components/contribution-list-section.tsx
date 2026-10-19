"use client";

/**
 * Sección "¿Qué hay que llevar?": Lista de aportes del modo Colaborativo.
 * En el dashboard la maneja el CREADOR: agrega ítems, elimina los LIBRES,
 * toma («Yo lo llevo») o libera los suyos; todo con el orden y el progreso
 * que entrega el core (ítems libres primero). La lógica vive en
 * `src/core/contribution-list.ts`; aquí solo presentación.
 */

import { useMemo, useState } from "react";
import type { Attendee } from "@/core/types";
import {
  MAX_CONTRIBUTION_ITEMS,
  getContributionProgress,
  sortContributionItems,
  type ContributionItem,
} from "@/core/contribution-list";

interface ContributionListSectionProps {
  /** Lista compuesta (organizador primero): resuelve el nombre de cada responsable. */
  allAttendees: Attendee[];
  creatorName: string | null | undefined;
  /** Ítems cargados desde la nube; null mientras cargan. */
  checklist: ContributionItem[] | null;
  actions: {
    addChecklistItem: (name: string) => boolean;
    removeChecklistItem: (itemId: string) => boolean;
    claimCreatorChecklistItem: (itemId: string) => boolean;
    releaseCreatorChecklistItem: (itemId: string) => boolean;
  };
}

export default function ContributionListSection({
  allAttendees,
  creatorName,
  checklist,
  actions,
}: ContributionListSectionProps) {
  const [newName, setNewName] = useState("");

  const items = checklist ?? [];
  const sorted = useMemo(() => sortContributionItems(items), [items]);
  const progress = useMemo(() => getContributionProgress(items), [items]);
  const isListLoading = checklist === null;
  const isListFull = items.length >= MAX_CONTRIBUTION_ITEMS;

  /** Nombre visible del responsable: 'creator' o el participante. */
  const claimantLabel = (claimedByRef: string): string => {
    if (claimedByRef === "creator") {
      return creatorName ?? "El organizador";
    }
    return allAttendees.find((attendee) => attendee.id === claimedByRef)?.name ?? "Un asistente";
  };

  return (
    <section className="rounded-2xl border border-ink/15 bg-elev p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold tracking-tight text-ink">
          ¿Qué hay que llevar?
        </h2>
        {!progress.isEmpty && (
          <span
            className={`shrink-0 text-xs font-semibold ${progress.isComplete ? "text-cancha" : "text-wait"}`}
          >
            {progress.claimed} de {progress.total}
            {progress.isComplete ? " · listo" : ""}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-ink-soft">
        {isListLoading
          ? "Cargando la lista…"
          : progress.isEmpty
            ? "Anota lo primero que falta y quien va lo lleva."
            : "«Yo lo llevo» toma un ítem libre; solo quien lo lleva puede liberarlo."}
      </p>

      {/* Lista ordenada por el core: libres primero; cada responsable con nombre */}
      <ul className="mt-3 flex flex-col gap-2">
        {sorted.map((item) => {
          const isFree = item.claimedByRef === null;
          const isMine = item.claimedByRef === "creator";
          return (
            <li
              key={item.id}
              className={`rounded-xl border p-2.5 ${isFree ? "border-ink/15 bg-paper" : "border-cancha/40 bg-cancha-soft"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{item.name}</p>
                  <p className="text-xs font-semibold text-ink-soft">
                    {item.claimedByRef === null
                      ? "Libre — lo puedes llevar tú"
                      : `Lo lleva: ${claimantLabel(item.claimedByRef)}${isMine ? " (tú)" : ""}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {isMine ? (
                    <button
                      type="button"
                      onClick={() => actions.releaseCreatorChecklistItem(item.id)}
                      className="rounded-lg border border-cancha bg-cancha px-2.5 py-1.5 text-xs font-bold text-elev transition active:scale-[0.97]"
                    >
                      Liberar
                    </button>
                  ) : isFree ? (
                    <>
                      <button
                        type="button"
                        onClick={() => actions.claimCreatorChecklistItem(item.id)}
                        className="rounded-lg border border-cancha/40 text-cancha px-2.5 py-1.5 text-xs font-bold transition hover:bg-cancha-soft active:scale-[0.97]"
                      >
                        Yo lo llevo
                      </button>
                      <button
                        type="button"
                        aria-label={`Quitar ${item.name}`}
                        onClick={() => actions.removeChecklistItem(item.id)}
                        className="rounded-lg border border-ink/15 px-2 py-1.5 text-xs font-bold text-ink-soft transition hover:border-baja hover:text-baja active:scale-[0.97]"
                      >
                        ✕
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
        {!isListLoading && progress.isEmpty && (
          <li className="rounded-xl border border-dashed border-ink/20 p-3 text-center text-sm italic text-ink-soft">
            Agrega el primer ítem abajo.
          </li>
        )}
      </ul>

      {/* Agregar ítem (el creador siempre puede; el cupo lo validan los invitados en el enlace) */}
      <form
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          if (actions.addChecklistItem(newName)) {
            setNewName("");
          }
        }}
        noValidate
        className="mt-3 flex gap-2"
      >
        <input
          type="text"
          value={newName}
          onChange={(inputEvent) => setNewName(inputEvent.target.value)}
          placeholder={isListFull ? "Lista llena (máx. 10)" : "Ej: carbón, hielo x2, talegos…"}
          maxLength={40}
          disabled={isListLoading || isListFull}
          className="min-w-0 flex-1 rounded-xl border border-ink/20 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-cancha disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isListLoading || isListFull || newName.trim() === ""}
          className="shrink-0 rounded-xl border border-cancha/40 bg-cancha-soft px-3 py-2 text-sm font-bold text-cancha transition hover:border-cancha active:scale-[0.97] disabled:opacity-50"
        >
          Agregar
        </button>
      </form>
    </section>
  );
}
