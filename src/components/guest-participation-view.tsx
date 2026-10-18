"use client";

/**
 * Vista pública del panorama para invitados externos, sin cuenta.
 * Cargan el tablero con "leer" (RLS pública) y su voto es la única
 * escritura permitida: otra persona jamás puede cambiar su fila porque la
 * DB valida el secreto de participante en el header del cliente.
 *
 * Lenguaje puro en `core/guest-participation.ts`; aquí solo orquestación.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { AttendanceStatus, SavedPanorama } from "@/core/types";
import { classifyAttendees } from "@/core/quota-manager";
import { withCreatorAttendee } from "@/core/creator-attendee";
import {
  getGuestParticipationErrorMessage,
  isPanoramaIdLike,
  resolveGuestFlow,
  validateGuestName,
  type GuestIdentity,
} from "@/core/guest-participation";
import { formatPanoramaStartsAt } from "@/core/datetime-cl";
import { getQuorumLabel, getQuorumStatus, getMissingToQuorum } from "@/core/quota-manager";
import { createGuestSupabaseClient, getSupabaseBrowserClient } from "@/lib/supabase-client";
import { getGuestIdentity, saveGuestIdentity } from "@/lib/guest-identity";
import {
  fetchPanoramaById,
  insertParticipantRow,
  updateParticipantStatus,
  mapParticipantRowToAttendee,
} from "@/lib/supabase-panorama-repo";
import ThemeToggle from "@/components/theme-toggle";
import QuorumSemaphore from "@/components/quorum-semaphore";
import GuestPlaceVote from "@/components/guest-place-vote";
import { MODE_EMOJI, MODE_STYLES, STATUS_OPTIONS } from "@/components/ui-theme";

const SPLASH = (
  <div className="mt-20 grid place-items-center gap-3 text-ink-soft" aria-busy="true">
    <div className="h-7 w-7 animate-spin rounded-full border-2 border-ink/15 border-t-cancha" />
    <p className="text-sm">Abriendo el panorama…</p>
  </div>
);

const MISSING = (
  <div className="mt-16 rounded-2xl border border-ink/15 bg-elev p-6 text-center">
    <h2 className="font-display text-xl font-bold text-ink">Panorama no disponible</h2>
    <p className="mt-2 text-sm text-ink-soft">
      El enlace ya no es válido o el panorama fue eliminado por su organizador.
    </p>
  </div>
);

export default function GuestParticipationView({ panoramaId }: { panoramaId: string }) {
  const router = useRouter();
  const [panorama, setPanorama] = useState<SavedPanorama | null>(null);
  const [isInvalid, setIsInvalid] = useState(false);
  const [failedToLoad, setFailedToLoad] = useState(false);
  const [identity, setIdentity] = useState<GuestIdentity | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!isPanoramaIdLike(panoramaId)) {
      setIsInvalid(true);
      return;
    }
    setIdentity(getGuestIdentity(panoramaId));
    const client = createGuestSupabaseClient();
    const run = async () => {
      try {
        const loaded = await fetchPanoramaById(client, panoramaId);
        if (loaded === null) {
          setIsInvalid(true);
        } else {
          setPanorama(loaded);
        }
      } catch {
        setFailedToLoad(true);
      }
    };
    void run();
  }, [panoramaId]);

  const flow = resolveGuestFlow(identity, panorama);
  // Lista efectiva: el organizador es «Voy» implícito y primero.
  const allAttendees = useMemo(
    () =>
      panorama === null
        ? null
        : withCreatorAttendee(panorama.attendees, panorama.event.creatorName),
    [panorama],
  );
  // Tablero con el organizador en «Van»; el quórum sigue midiendo solo
  // a los invitados (memos de más abajo usan `panorama.attendees` directa).
  const classification =
    allAttendees === null || panorama === null
      ? null
      : classifyAttendees(allAttendees, panorama.event.maxCapacity);
  const quorum = useMemo(
    () =>
      panorama === null
        ? null
        : getQuorumStatus(
            panorama.event.maxCapacity,
            classifyAttendees(panorama.attendees, panorama.event.maxCapacity).titulars.length,
          ),
    [panorama],
  );
  const missingCount = useMemo(
    () =>
      panorama === null
        ? 0
        : getMissingToQuorum(
            panorama.event.maxCapacity,
            classifyAttendees(panorama.attendees, panorama.event.maxCapacity).titulars.length,
          ),
    [panorama],
  );

  /** El invitado entra a la lista con el estado elegido. */
  const joinAs = useCallback(
    async (status: AttendanceStatus) => {
      if (panorama === null) {
        return;
      }
      // Lista compuesta: el nombre del organizador también está reservado.
      const validation = validateGuestName(
        withCreatorAttendee(panorama.attendees, panorama.event.creatorName),
        name,
      );
      if (!validation.ok) {
        setError(getGuestParticipationErrorMessage(validation.error));
        return;
      }
      setIsBusy(true);
      setError(null);
      try {
        const guestSecret =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now().toString(16).padEnd(32, "0").slice(0, 32)}`;
        const row = await insertParticipantRow(createGuestSupabaseClient(guestSecret), {
          panoramaId,
          name: validation.name,
          status,
          guestSecret,
        });
        const attendee = mapParticipantRowToAttendee(row);
        const nextIdentity: GuestIdentity = {
          panoramaId,
          participantId: attendee.id,
          name: attendee.name,
          guestSecret,
        };
        saveGuestIdentity(nextIdentity);
        setIdentity(nextIdentity);
        setPanorama((current) =>
          current === null ? current : { ...current, attendees: [...current.attendees, attendee] },
        );
      } catch {
        setError(getGuestParticipationErrorMessage("duplicate_name"));
      } finally {
        setIsBusy(false);
      }
    },
    [name, panorama, panoramaId],
  );

  /** Cambia SOLO el voto del propio invitado (la DB valida el secreto). */
  const changeMyVote = useCallback(
    async (status: AttendanceStatus) => {
      if (identity === null || panorama === null) {
        return;
      }
      const previousPanorama = panorama;
      const previousAttendee = panorama.attendees.find(
        (attendee) => attendee.id === identity.participantId,
      );
      if (previousAttendee === undefined || previousAttendee.status === status) {
        return;
      }
      setIsBusy(true);
      setPanorama((current) =>
        current === null
          ? current
          : {
              ...current,
              attendees: current.attendees.map((attendee) =>
                attendee.id === identity.participantId ? { ...attendee, status } : attendee,
              ),
            },
      );
      try {
        const row = await updateParticipantStatus(
          createGuestSupabaseClient(identity.guestSecret),
          identity.participantId,
          status,
        );
        setPanorama((current) =>
          current === null
            ? current
            : {
                ...current,
                attendees: current.attendees.map((attendee) =>
                  attendee.id === row.id ? mapParticipantRowToAttendee(row) : attendee,
                ),
              },
        );
      } catch {
        setPanorama(previousPanorama);
        setError("No se pudo actualizar tu respuesta. Intenta otra vez.");
      } finally {
        setIsBusy(false);
      }
    },
    [identity, panorama],
  );

  if (isInvalid) {
    return MISSING;
  }
  if (panorama === null) {
    return failedToLoad ? MISSING : SPLASH;
  }

  const { event } = panorama;
  const modeStyle = MODE_STYLES[event.mode];
  const quorumLabel = quorum === null ? null : getQuorumLabel(quorum, missingCount);
  const ownAttendee =
    identity === null
      ? null
      : panorama.attendees.find((attendee) => attendee.id === identity.participantId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* Cabecera */}
      <header className="flex items-center justify-between select-none">
        <h1 className="font-display text-xl font-bold tracking-tight">
          <span className="text-ink">Panora</span>
          <span className="text-cancha">Match</span>
        </h1>
        <ThemeToggle />
      </header>

      {/* Resumen del evento */}
      <section className="rounded-2xl border border-ink/15 bg-elev p-5">
        <div className="flex items-center justify-between gap-2">
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${modeStyle.chipClass}`}>
            {MODE_EMOJI[event.mode]} {modeStyle.label}
          </span>
          <span className="text-xs text-ink-soft">
            {event.maxCapacity !== null ? `Cupo para ${event.maxCapacity}` : "Sin cupo máximo"}
          </span>
        </div>
        <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-tight text-ink">
          {event.title}
        </h2>
        <p className="mt-1 text-sm text-ink-soft">{formatPanoramaStartsAt(event.startsAt)}</p>
        {quorum !== null && quorumLabel !== null && (
          <div className="mt-4">
            <QuorumSemaphore status={quorum} label={quorumLabel} />
          </div>
        )}
      </section>

      {/* Bienvenida / formulario de voto sin cuenta */}
      {flow === "fresh" || flow === "stale" ? (
        <section className="rounded-2xl border border-ink/15 bg-elev p-4">
          <h2 className="font-display text-lg font-bold tracking-tight text-ink">
            ¿Vas o no vas?
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            Escribe tu nombre y responde; no necesitas crear cuenta.
          </p>
          {flow === "stale" && (
            <p className="mt-2 text-xs font-semibold text-wait">
              Ya no participas con el nombre guardado en este navegador. Anótate otra vez.
            </p>
          )}
          <form
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              void joinAs("maybe");
            }}
            noValidate
            className="mt-3 flex flex-col gap-2.5"
          >
            <input
              type="text"
              value={name}
              onChange={(inputEvent) => {
                setName(inputEvent.target.value);
                setError(null);
              }}
              placeholder="Tu nombre"
              maxLength={40}
              className="w-full rounded-xl border border-ink/20 bg-paper px-3.5 py-2.5 text-base text-ink outline-none transition focus:border-cancha"
            />
            <div className="grid grid-cols-3 gap-2">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.status}
                  type="button"
                  disabled={isBusy}
                  onClick={() => void joinAs(option.status)}
                  className={`rounded-xl border px-2 py-2 text-sm font-bold transition active:scale-[0.97] disabled:opacity-60 ${option.inactiveClass}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </form>
          {error !== null && (
            <p className="mt-2 text-xs font-semibold text-baja" role="alert">
              {error}
            </p>
          )}
        </section>
      ) : null}

      {/* Mi respuesta (cuando ya participo) */}
      {flow === "linked" && ownAttendee !== null && (
        <section className="rounded-2xl border border-cancha/40 bg-cancha-soft p-4">
          <h2 className="font-display text-lg font-bold tracking-tight text-ink">
            Participas como {ownAttendee.name}
          </h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            Puedes cambiar tu respuesta cuando quieras desde este mismo enlace.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {STATUS_OPTIONS.map((option) => {
              const isActive = ownAttendee.status === option.status;
              return (
                <button
                  key={option.status}
                  type="button"
                  disabled={isBusy}
                  onClick={() => void changeMyVote(option.status)}
                  aria-pressed={isActive}
                  className={`rounded-xl border px-2 py-2 text-sm font-bold transition active:scale-[0.97] disabled:opacity-60 ${
                    isActive ? option.activeClass : option.inactiveClass
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {error !== null && (
            <p className="mt-2 text-xs font-semibold text-baja" role="alert">
              {error}
            </p>
          )}
        </section>
      )}

      {/* ¿A dónde vamos? (modo Social): conteos públicos; vota solo "Voy" */}
      {event.mode === "social" && (
        <GuestPlaceVote
          panorama={panorama}
          identity={identity}
          ownStatus={ownAttendee?.status ?? null}
        />
      )}

      {/* Tablero (solo lectura para invitados: nadie toca la fila ajena) */}
      {classification !== null && (
        <section className="flex flex-col gap-4 rounded-2xl border border-ink/15 bg-elev p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-bold tracking-tight text-ink">La lista</h2>
            <span className="text-xs text-ink-soft">
              {classification.titulars.length}
              {event.maxCapacity !== null ? ` de ${event.maxCapacity}` : ""} van ·{" "}
              {classification.waitlist.length} en espera
            </span>
          </div>

          <Group title="Van" situation="dentro del cupo" textClass="text-cancha">
            {classification.titulars.length === 0 ? (
              <p className="text-sm italic text-ink-soft">Nadie ha confirmado todavía.</p>
            ) : (
              classification.titulars.map((attendee) => (
                <Row
                  key={attendee.id}
                  name={attendee.name}
                  isOwn={identity !== null && attendee.id === identity.participantId}
                  // En Social no hay "titulares": la fila del organizador es
                  // la única que lleva chip; los demás van limpios.
                  badge={
                    attendee.isCreator === true
                      ? { label: "Organizador", className: "border-cancha/40 bg-cancha-soft text-cancha" }
                      : undefined
                  }
                  statusLabel={statusLabel(attendee.status)}
                />
              ))
            )}
          </Group>

          {classification.waitlist.length > 0 && (
            <Group title="En espera" situation="entran si alguien se baja" textClass="text-camino">
              {classification.waitlist.map((attendee) => (
                <Row
                  key={attendee.id}
                  name={attendee.name}
                  isOwn={identity !== null && attendee.id === identity.participantId}
                  statusLabel={statusLabel(attendee.status)}
                />
              ))}
            </Group>
          )}

          {classification.maybe.length > 0 && (
            <Group title="En duda" situation="aún no responden" textClass="text-wait">
              {classification.maybe.map((attendee) => (
                <Row
                  key={attendee.id}
                  name={attendee.name}
                  isOwn={identity !== null && attendee.id === identity.participantId}
                  statusLabel={statusLabel(attendee.status)}
                />
              ))}
            </Group>
          )}

          {classification.declined.length > 0 && (
            <Group title="No pueden" situation="quedaron fuera" textClass="text-baja">
              {classification.declined.map((attendee) => (
                <Row
                  key={attendee.id}
                  name={attendee.name}
                  isOwn={identity !== null && attendee.id === identity.participantId}
                  statusLabel={statusLabel(attendee.status)}
                />
              ))}
            </Group>
          )}
        </section>
      )}

      {/* Pie del invitado */}
      <p className="mt-1 text-center text-xs text-ink-soft">
        Organizado con{" "}
        <button
          type="button"
          onClick={() => router.push("/")}
          className="font-semibold text-ink underline decoration-dotted underline-offset-2"
        >
          PanoraMatch
        </button>
      </p>
    </div>
  );
}

function statusLabel(status: AttendanceStatus): string {
  return STATUS_OPTIONS.find((option) => option.status === status)?.label ?? "";
}

interface GroupProps {
  title: string;
  situation: string;
  textClass: string;
  children: React.ReactNode;
}

function Group({ title, situation, textClass, children }: GroupProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={`text-sm font-bold leading-none ${textClass}`}>{title}</h3>
        <span className="text-xs text-ink-soft">{situation}</span>
      </div>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  );
}

function Row({
  name,
  isOwn,
  badge,
  statusLabel: label,
}: {
  name: string;
  isOwn: boolean;
  badge?: { label: string; className: string };
  statusLabel: string;
}) {
  return (
    <li
      className={`rounded-xl border bg-paper p-2.5 ${
        isOwn ? "border-cancha/60" : "border-ink/15"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`truncate text-sm font-bold ${isOwn ? "text-cancha" : "text-ink"}`}>
          {name}
          {isOwn ? " (tú)" : ""}
        </span>
        {badge !== undefined && (
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
          >
            {badge.label}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs font-semibold text-ink-soft">{label}</p>
    </li>
  );
}
