"use client";

/**
 * "¿Qué hay que llevar?" para el invitado sin cuenta (enlace /p/<id>).
 * La lista es pública (con nombres); si el invitado va "Voy" dentro del
 * cupo, agrega ítems y toma/libera los SUYOS: la DB valida el secreto en
 * el header, nadie toca el reclamo ajeno. Al dejar de ir, sus ítems se
 * liberan al momento (RF-3, efecto igual que el del voto de lugares).
 */

import { useEffect, useMemo, useState } from "react";

import type { AttendanceStatus, SavedPanorama } from "@/core/types";
import {
  MAX_CONTRIBUTION_ITEMS,
  addContributionItem,
  claimContributionItem,
  dropContributionClaims,
  getContributionProgress,
  getContributionRuleErrorMessage,
  isClaimAuthorized,
  releaseContributionItem,
  sortContributionItems,
  type ContributionItem,
} from "@/core/contribution-list";
import { withCreatorAttendee } from "@/core/creator-attendee";
import type { GuestIdentity } from "@/core/guest-participation";
import { createGuestSupabaseClient } from "@/lib/supabase-client";
import {
  claimChecklistItemRow,
  fetchChecklistItems,
  insertChecklistItemRow,
  releaseChecklistClaimsOfRow,
  releaseChecklistItemRow,
} from "@/lib/supabase-panorama-repo";

interface GuestContributionListProps {
  panorama: SavedPanorama;
  identity: GuestIdentity | null;
  /** Estado actual del propio invitado (null si aún no participa). */
  ownStatus: AttendanceStatus | null;
}

export default function GuestContributionList({
  panorama,
  identity,
  ownStatus,
}: GuestContributionListProps) {
  const [items, setItems] = useState<ContributionItem[] | null>(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const { event } = panorama;

  // Carga inicial: lectura pública a través del cliente de invitado.
  useEffect(() => {
    if (event.mode !== "colaborativo") {
      setItems(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        // El secreto se envía si existe, pero NO es obligatorio para leer.
        const loaded = await fetchChecklistItems(
          createGuestSupabaseClient(identity?.guestSecret),
          panorama.id,
        );
        if (!cancelled) {
          setItems(loaded);
        }
      } catch {
        if (!cancelled) {
          setItems([]);
          setError("No se pudo cargar la lista de aportes.");
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [panorama.id, event.mode, identity?.guestSecret]);

  const sorted = useMemo(() => sortContributionItems(items ?? []), [items]);
  const progress = useMemo(() => getContributionProgress(items ?? []), [items]);

  /** ¿Puede llevar ítems? Solo "Voy" dentro del cupo y con identidad propia. */
  const canCarry =
    identity !== null &&
    ownStatus === "going" &&
    isClaimAuthorized(
      { kind: "participant", participantId: identity.participantId },
      panorama.attendees,
      event.maxCapacity,
    );

  if (event.mode !== "colaborativo") {
    return null;
  }

  /** Nombre visible del responsable ('creator' o participante). */
  const claimantLabel = (claimedByRef: string): string => {
    if (claimedByRef === "creator") {
      return event.creatorName ?? "El organizador";
    }
    return (
      withCreatorAttendee(panorama.attendees, event.creatorName).find(
        (attendee) => attendee.id === claimedByRef,
      )?.name ?? "Un asistente"
    );
  };

  /** Agrega un ítem a la lista (máx 10; duplicado bloqueado en core). */
  const addOwnItem = async (formEvent: React.FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (identity === null || !canCarry) {
      return;
    }
    const result = addContributionItem(
      items ?? [],
      newName,
      "",
      { kind: "participant", participantId: identity.participantId },
      panorama.attendees,
      event.maxCapacity,
    );
    if (!result.ok) {
      setError(getContributionRuleErrorMessage(result.reason ?? "empty_name"));
      return;
    }
    const itemsAfter = result.items;
    if (itemsAfter === undefined) {
      return;
    }
    const chosenName = itemsAfter[itemsAfter.length - 1].name;
    setIsBusy(true);
    setError(null);
    try {
      // La base genera el id (y el orden de creación real).
      const row = await insertChecklistItemRow(createGuestSupabaseClient(identity.guestSecret), {
        panoramaId: panorama.id,
        name: chosenName,
      });
      setItems((current) =>
        current === null ? current : [...current, { id: row.id, name: row.name, claimedByRef: null }],
      );
      setNewName("");
    } catch {
      setError("No se pudo agregar el ítem. Intenta otra vez.");
    } finally {
      setIsBusy(false);
    }
  };

  /** Toma un ítem libre y lo deja a nombre del propio invitado. */
  const takeItem = async (itemId: string) => {
    if (identity === null || !canCarry) {
      return;
    }
    const result = claimContributionItem(
      items ?? [],
      itemId,
      { kind: "participant", participantId: identity.participantId },
      panorama.attendees,
      event.maxCapacity,
    );
    if (!result.ok || result.items === undefined) {
      setError(result.reason !== undefined ? getContributionRuleErrorMessage(result.reason) : "No se pudo tomar el ítem.");
      return;
    }
    setIsBusy(true);
    setError(null);
    const previous = items;
    setItems(result.items);
    try {
      await claimChecklistItemRow(createGuestSupabaseClient(identity.guestSecret), {
        itemId,
        claimedByRef: identity.participantId,
      });
    } catch {
      setItems(previous);
      setError("No se pudo registrar tu ítem. Intenta otra vez.");
    } finally {
      setIsBusy(false);
    }
  };

  /** Libera un ítem que el propio invitado lleva. */
  const freeItem = async (itemId: string) => {
    if (identity === null) {
      return;
    }
    const result = releaseContributionItem(
      items ?? [],
      itemId,
      { kind: "participant", participantId: identity.participantId },
      panorama.attendees,
      event.maxCapacity,
    );
    if (!result.ok || result.items === undefined) {
      setError(result.reason !== undefined ? getContributionRuleErrorMessage(result.reason) : "No se pudo liberar el ítem.");
      return;
    }
    setIsBusy(true);
    setError(null);
    const previous = items;
    setItems(result.items);
    try {
      await releaseChecklistItemRow(
        createGuestSupabaseClient(identity.guestSecret),
        itemId,
        identity.participantId,
      );
    } catch {
      setItems(previous);
      setError("No se pudo liberar el ítem. Intenta otra vez.");
    } finally {
      setIsBusy(false);
    }
  };

  // RF-3: al dejar de ser "Voy", sus ítems se liberan al momento.
  useEffect(() => {
    if (
      ownStatus !== null &&
      ownStatus !== "going" &&
      identity !== null &&
      items !== null &&
      items.some((item) => item.claimedByRef === identity.participantId)
    ) {
      const previous = items;
      setItems(dropContributionClaims(items, identity.participantId));
      void releaseChecklistClaimsOfRow(
        createGuestSupabaseClient(identity.guestSecret),
        panorama.id,
        identity.participantId,
      ).catch(() => {
        setItems(previous);
      });
    }
  }, [ownStatus, identity?.participantId]); // eslint-disable-line react-hooks/exhaustive-deps

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
        {items === null
          ? "Cargando la lista…"
          : progress.isEmpty
            ? "Aún no hay ítems en la lista."
            : "Los ítems libres primero; cada uno lleva el nombre de quien lo lleva."}
      </p>

      {/* Lista pública, con el nombre de quien lleva cada ítem */}
      <ul className="mt-3 flex flex-col gap-2">
        {sorted.map((item) => {
          const isFree = item.claimedByRef === null;
          const isMine =
            identity !== null && item.claimedByRef === identity.participantId;
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
                      ? "Libre"
                      : `${claimantLabel(item.claimedByRef)} lo lleva${isMine ? " (tú)" : ""}`}
                  </p>
                </div>
                {canCarry && item.claimedByRef === null && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void takeItem(item.id)}
                    className="shrink-0 rounded-lg border border-cancha/40 text-cancha px-2.5 py-1.5 text-xs font-bold transition hover:bg-cancha-soft active:scale-[0.97] disabled:opacity-60"
                  >
                    Yo lo llevo
                  </button>
                )}
                {isMine && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void freeItem(item.id)}
                    className="shrink-0 rounded-lg border border-cancha bg-cancha px-2.5 py-1.5 text-xs font-bold text-elev transition active:scale-[0.97] disabled:opacity-60"
                  >
                    Liberar
                  </button>
                )}
              </div>
            </li>
          );
        })}
        {items !== null && progress.isEmpty && (
          <li className="rounded-xl border border-dashed border-ink/20 p-3 text-center text-sm italic text-ink-soft">
            Todavía nadie anotó ítems.
          </li>
        )}
      </ul>

      {/* Agregar ítem: solo "Voy" dentro del cupo, con su identidad propia */}
      {canCarry && (
        <form
          onSubmit={(formEvent) => void addOwnItem(formEvent)}
          noValidate
          className="mt-3 flex gap-2"
        >
          <input
            type="text"
            value={newName}
            onChange={(inputEvent) => {
              setNewName(inputEvent.target.value);
              setError(null);
            }}
            placeholder="Ej: carbón, hielo x2…"
            maxLength={40}
            disabled={isBusy || (items ?? []).length >= MAX_CONTRIBUTION_ITEMS}
            className="min-w-0 flex-1 rounded-xl border border-ink/20 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-cancha disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isBusy || (items ?? []).length >= MAX_CONTRIBUTION_ITEMS || newName.trim() === ""}
            className="shrink-0 rounded-xl border border-cancha/40 bg-cancha-soft px-3 py-2 text-sm font-bold text-cancha transition hover:border-cancha active:scale-[0.97] disabled:opacity-50"
          >
            Agregar
          </button>
        </form>
      )}
      {ownStatus !== null && ownStatus !== "going" && (
        <p className="mt-2 text-xs text-ink-soft">
          Solo los confirmados «Voy» dentro del cupo pueden llevar ítems.
        </p>
      )}
      {error !== null && (
        <p className="mt-2 text-xs font-semibold text-baja" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
