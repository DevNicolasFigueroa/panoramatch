"use client";

/**
 * Vista del panorama compartido con AUTH UNIVERSAL: quien abre el enlace
 * necesita sesión (Google o correo) y su nombre sale del perfil, no se
 * escribe a mano. La fila `participants` queda ligada a su `auth_user_id`
 * y solo él puede tocarla (RLS la valida con `auth.uid()`).
 *
 * Las filas anónimas de la era sin cuenta (con `guest_secret`) se ADOPTAN
 * con la función segura `adopt_anonymous_participant` cuando la identidad
 * guardada de este dispositivo (`guest-identity.ts`) corresponde a una de
 * ellas: la respuesta anterior se recupera con la nueva cuenta.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { AttendanceStatus, SavedPanorama } from "@/core/types";
import { classifyAttendees } from "@/core/quota-manager";
import { withCreatorAttendee } from "@/core/creator-attendee";
import { createEmptyPaymentsState, type PaymentsState } from "@/core/payment-treasury";
import {
  getGuestParticipationErrorMessage,
  getOwnAttendeeByUserId,
  isPanoramaIdLike,
  resolveGuestFlow,
  validateGuestName,
  type GuestIdentity,
} from "@/core/guest-participation";
import { formatPanoramaStartsAt } from "@/core/datetime-cl";
import { getGuestQuorumTarget, getQuorumLabel, getQuorumStatus, getMissingToQuorum } from "@/core/quota-manager";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { getGuestIdentity, clearGuestIdentity } from "@/lib/guest-identity";
import { useAuthSession } from "@/lib/use-auth-session";
import {
  claimSelfTransferRow,
  fetchPanoramaById,
  fetchPaymentsState,
  insertParticipantRow,
  mapParticipantRowToAttendee,
  releaseTeamSeatRow,
  claimTeamVacancyRow,
  retractSelfTransferRow,
  updateParticipantStatus,
} from "@/lib/supabase-panorama-repo";
import ThemeToggle from "@/components/theme-toggle";
import QuorumSemaphore from "@/components/quorum-semaphore";
import GuestPlaceVote from "@/components/guest-place-vote";
import GuestContributionList from "@/components/guest-contribution-list";
import GuestTeamOrganizer from "@/components/guest-team-organizer";
import PaymentTreasuryPanel from "@/components/payment-treasury-panel";
import { MODE_EMOJI, MODE_STYLES, STATUS_OPTIONS } from "@/components/ui-theme";

const SPLASH = (
  <div className="mt-20 grid place-items-center gap-3 text-ink-soft" aria-busy="true">
    <div className="h-7 w-7 animate-spin rounded-full border-2 border-ink/15 border-t-cancha" />
    <p className="text-sm">Abriendo el panorama…</p>
  </div>
);

const NEED_LOGIN = (
  <div className="mt-16 rounded-2xl border border-ink/15 bg-elev p-6 text-center">
    <h2 className="font-display text-xl font-bold text-ink">Inicia sesión para responder</h2>
    <p className="mt-2 text-sm text-ink-soft">
      Este panorama ahora pide sesión (Google o correo) para participar.
    </p>
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
  const { user, isAuthReady } = useAuthSession();
  const [panorama, setPanorama] = useState<SavedPanorama | null>(null);
  const [isInvalid, setIsInvalid] = useState(false);
  const [failedToLoad, setFailedToLoad] = useState(false);
  const [identity, setIdentity] = useState<GuestIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isAdopting, setIsAdopting] = useState(false);
  // Bump para releer los equipos sorteados tras bajar/subir de «Voy».
  const [teamsRefreshKey, setTeamsRefreshKey] = useState(0);
  // Estado de tesorería del enlace (solo lectura + la marca propia, RF-11).
  const [payments, setPayments] = useState<PaymentsState | null>(null);
  const [paymentsRefreshKey, setPaymentsRefreshKey] = useState(0);
  const [isSelfPaymentBusy, setIsSelfPaymentBusy] = useState(false);

  const canLoad = isAuthReady && user !== null;

  useEffect(() => {
    if (!isPanoramaIdLike(panoramaId)) {
      setIsInvalid(true);
      return;
    }
    if (!canLoad) {
      return;
    }
    setIdentity(getGuestIdentity(panoramaId));
    const client = getSupabaseBrowserClient();
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
  }, [panoramaId, canLoad]);

  // Carga del tablero de pagos (los 3 modos): se repite con el bump de la
  // marca propia («Ya transferí» / retracto) para releer las marcas.
  const loadedPanoramaId = panorama?.id ?? null;
  useEffect(() => {
    if (loadedPanoramaId === null) {
      setPayments(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const loaded = await fetchPaymentsState(getSupabaseBrowserClient(), loadedPanoramaId);
        if (!cancelled) {
          setPayments(loaded === null ? createEmptyPaymentsState() : loaded);
        }
      } catch {
        if (!cancelled) {
          setPayments(createEmptyPaymentsState());
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [loadedPanoramaId, paymentsRefreshKey]);

  const flow = resolveGuestFlow(identity, panorama, user?.userId ?? null);
  // El asistente propio: la fila ligada a la cuenta de la sesión.
  const ownAttendee =
    user === null || panorama === null
      ? null
      : getOwnAttendeeByUserId(panorama, user.userId);

  // Lista efectiva: el organizador es «Voy» implícito y primero.
  const allAttendees = useMemo(
    () =>
      panorama === null
        ? null
        : withCreatorAttendee(panorama.attendees, panorama.event.creatorName),
    [panorama],
  );
  // Tablero con el organizador en «Van»; el quórum sigue midiendo solo
  // a los invitados, con objetivo de asientos cupo−1 (el organizador
  // ocupa uno fijo). Memos de más abajo usan `panorama.attendees` directa.
  const classification =
    allAttendees === null || panorama === null
      ? null
      : classifyAttendees(allAttendees, panorama.event.maxCapacity);
  const guestQuorumTarget = useMemo(
    () => (panorama === null ? null : getGuestQuorumTarget(panorama.event.maxCapacity)),
    [panorama],
  );
  const quorum = useMemo(
    () =>
      panorama === null
        ? null
        : getQuorumStatus(
            guestQuorumTarget,
            classifyAttendees(panorama.attendees, panorama.event.maxCapacity).titulars.length,
          ),
    [panorama, guestQuorumTarget],
  );
  const missingCount = useMemo(
    () =>
      panorama === null
        ? 0
        : getMissingToQuorum(
            guestQuorumTarget,
            classifyAttendees(panorama.attendees, panorama.event.maxCapacity).titulars.length,
          ),
    [panorama, guestQuorumTarget],
  );

  /** El usuario entra a la lista con el estado elegido y SU cuenta. */
  const joinAs = useCallback(
    async (status: AttendanceStatus) => {
      if (panorama === null || user === null) {
        return;
      }
      // El nombre viene del perfil; el choque de duplicados se valida igual.
      const validation = validateGuestName(
        withCreatorAttendee(panorama.attendees, panorama.event.creatorName),
        user.displayName,
      );
      if (!validation.ok) {
        setError(getGuestParticipationErrorMessage(validation.error));
        return;
      }
      setIsBusy(true);
      setError(null);
      try {
        const row = await insertParticipantRow(getSupabaseBrowserClient(), {
          panoramaId,
          name: validation.name,
          status,
          authUserId: user.userId,
        });
        setPanorama((current) =>
          current === null
            ? current
            : { ...current, attendees: [...current.attendees, mapParticipantRowToAttendee(row)] },
        );
        // Conseguí membresía: el tablero de pagos se leyó antes con la RLS
        // ocultando filas; releerlo ahora con la fila propia.
        setPaymentsRefreshKey((key) => key + 1);
      } catch {
        setError("No se pudo guardar tu respuesta. Intenta otra vez.");
      } finally {
        setIsBusy(false);
      }
    },
    [panorama, user, panoramaId],
  );

  /** Adopta la fila anónima legacy de este dispositivo con la sesión actual. */
  const adoptLegacyRow = useCallback(async () => {
    if (identity === null || panorama === null || user === null) {
      return;
    }
    setIsAdopting(true);
    setError(null);
    try {
      const { data, error: rpcError } = await getSupabaseBrowserClient()
        .rpc("adopt_anonymous_participant", {
          p_panorama_id: panorama.id,
          p_guest_secret: identity.guestSecret,
        });
      if (rpcError !== null) {
        throw new Error(rpcError.message);
      }
      if (data !== null) {
        clearGuestIdentity(panoramaId);
      }
      setIdentity(null);
      const refreshed = await fetchPanoramaById(getSupabaseBrowserClient(), panoramaId);
      if (refreshed !== null) {
        setPanorama(refreshed);
        // La fila adoptada da membresía: releer el tablero de pagos.
        setPaymentsRefreshKey((key) => key + 1);
      }
    } catch {
      setError("No se pudo recuperar tu respuesta anterior. Intenta otra vez.");
    } finally {
      setIsAdopting(false);
    }
  }, [identity, panorama, user, panoramaId]);

  /** Cambia SOLO el voto del propio asistente (RLS: auth_user_id = sesión). */
  const changeMyVote = useCallback(
    async (status: AttendanceStatus) => {
      if (ownAttendee === null || panorama === null) {
        return;
      }
      if (ownAttendee.status === status) {
        return;
      }
      const previousPanorama = panorama;
      setIsBusy(true);
      setPanorama((current) =>
        current === null
          ? current
          : {
              ...current,
              attendees: current.attendees.map((attendee) =>
                attendee.id === ownAttendee.id ? { ...attendee, status } : attendee,
              ),
            },
      );
      try {
        const row = await updateParticipantStatus(
          getSupabaseBrowserClient(),
          ownAttendee.id,
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
        // Espejo Deportivo (RF-7/RF-8): tu propia fila deja VACANTE su asiento
        // al bajar; al subir de suplente hereda la vacante más antigua (FIFO).
        const previousStatus = ownAttendee.status;
        const leavesGoing = previousStatus === "going" && status !== "going";
        const risesToGoing = status === "going" && previousStatus !== "going";
        if (panorama.event.mode === "deportivo" && leavesGoing) {
          try {
            await releaseTeamSeatRow(getSupabaseBrowserClient(), {
              panoramaId: panorama.id,
              playerRef: ownAttendee.id,
            });
            setTeamsRefreshKey((key) => key + 1);
          } catch {
            setError(
              "Tu respuesta se guardó, pero no se pudo dejar vacante tu asiento de equipo. Avisa al organizador.",
            );
          }
        } else if (panorama.event.mode === "deportivo" && risesToGoing) {
          try {
            await claimTeamVacancyRow(getSupabaseBrowserClient(), {
              panoramaId: panorama.id,
              playerRef: ownAttendee.id,
            });
            setTeamsRefreshKey((key) => key + 1);
          } catch {
            setError(
              "Tu respuesta se guardó, pero no se pudo heredar el asiento de equipo. Intenta otra vez.",
            );
          }
        }
      } catch {
        setPanorama(previousPanorama);
        setError("No se pudo actualizar tu respuesta. Intenta otra vez.");
      } finally {
        setIsBusy(false);
      }
    },
    [ownAttendee, panorama],
  );

  /** Marca propia «Ya transferí» (RPC definer; la fila la resuelve auth.uid()). */
  const markSelfTransferred = useCallback(async () => {
    if (panorama === null) {
      return;
    }
    setIsSelfPaymentBusy(true);
    setError(null);
    try {
      await claimSelfTransferRow(getSupabaseBrowserClient(), panorama.id);
      setPaymentsRefreshKey((key) => key + 1);
    } catch (cause) {
      setError(
        getSelfPaymentError(cause, "No se pudo registrar tu marca. Intenta otra vez."),
      );
    } finally {
      setIsSelfPaymentBusy(false);
    }
  }, [panorama]);

  /** Retracto de la marca propia (RPC definer). */
  const retractSelfTransferred = useCallback(async () => {
    if (panorama === null) {
      return;
    }
    setIsSelfPaymentBusy(true);
    setError(null);
    try {
      await retractSelfTransferRow(getSupabaseBrowserClient(), panorama.id);
      setPaymentsRefreshKey((key) => key + 1);
    } catch (cause) {
      setError(
        getSelfPaymentError(cause, "No se pudo retractar tu marca. Intenta otra vez."),
      );
    } finally {
      setIsSelfPaymentBusy(false);
    }
  }, [panorama]);

  if (isInvalid) {
    return MISSING;
  }
  if (panorama === null) {
    if (!isAuthReady) {
      return SPLASH;
    }
    return failedToLoad ? MISSING : user === null ? NEED_LOGIN : SPLASH;
  }

  const { event } = panorama;
  const modeStyle = MODE_STYLES[event.mode];
  const quorumLabel = quorum === null ? null : getQuorumLabel(quorum, missingCount);
  const isOwn = (attendeeId: string) => attendeeId === ownAttendee?.id;

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

      {/* Bienvenida: participa con tu cuenta; el nombre viene del perfil */}
      {flow === "fresh" && ownAttendee === null ? (
        <section className="rounded-2xl border border-ink/15 bg-elev p-4">
          <h2 className="font-display text-lg font-bold tracking-tight text-ink">
            ¿Vas o no vas?
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            Participas con tu cuenta como{" "}
            <span className="font-bold text-ink">{user?.displayName}</span>.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
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
          {error !== null && (
            <p className="mt-2 text-xs font-semibold text-baja" role="alert">
              {error}
            </p>
          )}
        </section>
      ) : null}

      {/* Adopción: la fila anónima legacy de este dispositivo puede ser tuya */}
      {flow === "adoptable" && identity !== null ? (
        <section className="rounded-2xl border border-wait/40 bg-elev p-4">
          <h2 className="font-display text-lg font-bold tracking-tight text-ink">
            Ya habías respondido como {identity.name}
          </h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            En este navegador queda tu respuesta anterior (anónima). Recupérala
            con tu cuenta: sigue siendo tu fila y tus ítems.
          </p>
          <button
            type="button"
            disabled={isAdopting}
            onClick={() => void adoptLegacyRow()}
            className="mt-3 w-full rounded-xl border border-cancha bg-cancha px-4 py-2.5 text-sm font-bold text-elev transition active:scale-[0.99] disabled:opacity-60"
          >
            {isAdopting ? "Recuperando…" : "Recuperar con mi cuenta"}
          </button>
          {error !== null && (
            <p className="mt-2 text-xs font-semibold text-baja" role="alert">
              {error}
            </p>
          )}
        </section>
      ) : null}

      {/* Mi respuesta (cuando ya participo con la cuenta) */}
      {ownAttendee !== null && (
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
          {ownAttendee !== null && error !== null && (
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
          ownParticipantId={ownAttendee?.id ?? null}
          ownStatus={ownAttendee?.status ?? null}
        />
      )}

      {/* ¿Qué hay que llevar? (modo Colaborativo): lista pública con nombres;
          solo "Voy" dentro del cupo añade, toma o libera con su cuenta */}
      {event.mode === "colaborativo" && (
        <GuestContributionList
          panorama={panorama}
          ownParticipantId={ownAttendee?.id ?? null}
          ownStatus={ownAttendee?.status ?? null}
        />
      )}

      {/* Organizador de equipos (modo Deportivo): reparto público, solo lectura */}
      {event.mode === "deportivo" && (
        <GuestTeamOrganizer panorama={panorama} refreshKey={teamsRefreshKey} />
      )}

      {/* Control de pagos: bloque copiable + tablero; la fila propia del
          titular con sesión lleva «Ya transferí» / retractar (RF-11) */}
      <PaymentTreasuryPanel
        panorama={panorama}
        payments={payments}
        selfActions={
          ownAttendee === null
            ? undefined
            : {
                playerRef: ownAttendee.id,
                isTitular:
                  classification?.titulars.some((attendee) => attendee.id === ownAttendee.id) ??
                  false,
                isBusy: isSelfPaymentBusy,
                mark: () => void markSelfTransferred(),
                retract: () => void retractSelfTransferred(),
              }
        }
      />

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
                  isOwn={isOwn(attendee.id)}
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
                  isOwn={isOwn(attendee.id)}
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
                  isOwn={isOwn(attendee.id)}
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
                  isOwn={isOwn(attendee.id)}
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

/**
 * Las RPC de marca llegan con el texto en español encabezado por el nombre
 * de la función («claim_payment_transfer: …»): se muestra solo el mensaje.
 */
function getSelfPaymentError(cause: unknown, fallback: string): string {
  const raw = cause instanceof Error ? cause.message : String(cause);
  if (raw.startsWith("claim_payment_transfer:") || raw.startsWith("retract_payment_transfer:")) {
    return raw.slice(raw.indexOf(":") + 1).trim();
  }
  return fallback;
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
