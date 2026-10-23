"use client";

/**
 * Panel Visual del Panorama (Vista activa):
 * cabecera con Semáforo de Quórum, confirmación rápida, asistentes y espera,
 * y la boleta financiera en CLP. Toda la lógica ya está en `src/core/`.
 */

import { useMemo, useState } from "react";
import type { Attendee, SavedPanorama } from "@/core/types";
import { formatPanoramaStartsAt } from "@/core/datetime-cl";
import {
  classifyAttendees,
  getGuestQuorumTarget,
  getMissingToQuorum,
  getQuorumLabel,
  getQuorumStatus,
} from "@/core/quota-manager";
import { splitCost } from "@/core/currency-clp";
import { withCreatorAttendee } from "@/core/creator-attendee";
import { MODE_EMOJI, MODE_STYLES } from "@/components/ui-theme";
import QuorumSemaphore from "@/components/quorum-semaphore";
import AddFriendForm from "@/components/add-friend-form";
import AttendeeSections from "@/components/attendee-sections";
import FinancialPanel from "@/components/financial-panel";
import PlaceVoteSection from "@/components/place-vote-section";
import ContributionListSection from "@/components/contribution-list-section";
import TeamOrganizerPanel from "@/components/team-organizer-panel";
import PaymentTreasuryPanel from "@/components/payment-treasury-panel";
import type { PanoramaStoreActions, PlaceVoteState } from "@/lib/use-panorama-store";
import type { ContributionItem } from "@/core/contribution-list";
import { buildTitularPlayers, type TeamsState } from "@/core/team-organizer";
import type { PaymentsState } from "@/core/payment-treasury";

export default function PanoramaDashboard({
  panorama,
  place,
  checklist,
  teams,
  payments,
  actions,
  onAddFriend,
  onChangeStatus,
  onGoHome,
}: {
  panorama: SavedPanorama;
  /** Tablero de lugares (¿a dónde vamos?); null mientras carga o sin datos. */
  place: PlaceVoteState | null;
  /** Lista de aportes (¿qué llevar?); null mientras carga o en otros modos. */
  checklist: ContributionItem[] | null;
  /** Equipos del modo Deportivo; null mientras carga o en otros modos. */
  teams: TeamsState | null;
  /** Estado de tesorería del panorama activo; null mientras carga. */
  payments: PaymentsState | null;
  /** Acciones completas del store (incluye lugares, lista y equipos). */
  actions: PanoramaStoreActions;
  onAddFriend: (name: string, status: Attendee["status"]) => boolean;
  onChangeStatus: (attendeeId: string, status: Attendee["status"]) => void;
  onGoHome: () => void;
}) {
  const { event, attendees } = panorama;

  // Lista efectiva: el organizador es «Voy» implícito y primero.
  const allAttendees = useMemo(
    () => withCreatorAttendee(attendees, event.creatorName),
    [attendees, event.creatorName],
  );
  // Tablero con el creador dentro (boleta y «Van»). El quórum del semáforo
  // sigue midiendo solo a los invitados, pero el objetivo de asientos es
  // el cupo menos el del organizador (que siempre va y ocupa uno).
  const classification = useMemo(
    () => classifyAttendees(allAttendees, event.maxCapacity),
    [allAttendees, event.maxCapacity],
  );
  const guestQuorumTarget = useMemo(
    () => getGuestQuorumTarget(event.maxCapacity),
    [event.maxCapacity],
  );
  const guestsTitularCount = useMemo(
    () => classifyAttendees(attendees, event.maxCapacity).titulars.length,
    [attendees, event.maxCapacity],
  );
  const quorum = useMemo(
    () => getQuorumStatus(guestQuorumTarget, guestsTitularCount),
    [guestQuorumTarget, guestsTitularCount],
  );
  const missingCount = useMemo(
    () => getMissingToQuorum(guestQuorumTarget, guestsTitularCount),
    [guestQuorumTarget, guestsTitularCount],
  );
  const split = useMemo(
    () => splitCost(event.totalCostCLP, classification.titulars.length),
    [event.totalCostCLP, classification.titulars.length],
  );

  const modeStyle = MODE_STYLES[event.mode];

  return (
    <div className="flex flex-col gap-4">
      {/* Cabecera del panorama */}
      <section className="rounded-2xl border border-ink/15 bg-elev p-5">
        <div className="flex items-center justify-between gap-2">
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${modeStyle.chipClass}`}>
            {MODE_EMOJI[event.mode]} {modeStyle.label}
          </span>
          <span className="text-xs text-ink-soft">
            {event.maxCapacity !== null
              ? `Cupo para ${event.maxCapacity}`
              : "Sin cupo máximo"}
          </span>
        </div>

        <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-tight text-ink">
          {event.title}
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          {formatPanoramaStartsAt(event.startsAt)}
        </p>

        <div className="mt-4">
          <QuorumSemaphore status={quorum} label={getQuorumLabel(quorum, missingCount)} />
        </div>
      </section>

      {/* El enlace compartido: los amigos responden sin crear cuenta */}
      <ShareLinkSection panoramaId={panorama.id} />

      {/* Modo Social: votación de lugares (¿a dónde vamos?) */}
      {event.mode === "social" && (
        <PlaceVoteSection attendees={attendees} place={place} actions={actions} />
      )}

      {/* Modo Colaborativo: lista de aportes (¿qué hay que llevar?) */}
      {event.mode === "colaborativo" && (
        <ContributionListSection
          allAttendees={allAttendees}
          creatorName={event.creatorName}
          checklist={checklist}
          actions={actions}
        />
      )}

      {/* Modo Deportivo: organizador de equipos (sortear, mover, renombrar) */}
      {event.mode === "deportivo" && (
        <TeamOrganizerPanel
          teams={teams}
          titularPlayers={buildTitularPlayers(allAttendees, event.maxCapacity)}
          isOrganizer
          actions={actions}
        />
      )}

      {/* Control de pagos (los 3 modos; se oculta sin banco o con costo $0) */}
      <PaymentTreasuryPanel
        panorama={panorama}
        payments={payments}
        actions={actions}
      />

      {/* Módulo de Confirmación Rápida */}
      <AddFriendForm onAddFriend={onAddFriend} />

      {/* Asistentes y Espera */}
      <AttendeeSections
        classification={classification}
        maxCapacity={event.maxCapacity}
        onChangeStatus={onChangeStatus}
      />

      {/* La boleta financiera */}
      <FinancialPanel split={split} />

      {/* Navegación: listado guardado o crear otro (el listado se conserva) */}
      <div className="mt-1 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onGoHome}
          className="rounded-xl border border-ink/25 bg-elev px-3 py-2.5 text-sm font-semibold text-ink transition hover:border-ink/60 active:scale-[0.99]"
        >
          Mis panoramas
        </button>
        <button
          type="button"
          onClick={onGoHome}
          className="rounded-xl bg-cancha px-3 py-2.5 text-sm font-bold text-elev transition hover:bg-cancha-deep active:scale-[0.99]"
        >
          Crear uno nuevo
        </button>
      </div>
    </div>
  );
}

/** Enlace público de votación: copiarlo para enviarlo por WhatsApp, etc. */
function ShareLinkSection({ panoramaId }: { panoramaId: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const shareUrl = `${window.location.origin}/p/${panoramaId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copia el enlace para responder:", shareUrl);
    }
  };

  return (
    <section className="rounded-2xl border border-ink/15 bg-elev p-4">
      <h2 className="font-display text-lg font-bold tracking-tight text-ink">
        Que ellos respondan solos
      </h2>
      <p className="mt-0.5 text-sm text-ink-soft">
        Comparte este enlace: tus amigos marcan Voy / En duda / No puedo sin crear cuenta.
      </p>
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="mt-3 w-full rounded-xl border border-cancha/40 bg-cancha-soft px-3 py-2.5 text-sm font-bold text-cancha transition hover:border-cancha active:scale-[0.99]"
      >
        {copied ? "¡Enlace copiado! ✓" : "Copiar enlace para responder"}
      </button>
    </section>
  );
}
