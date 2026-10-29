"use client";

/**
 * Vista del panorama compartido (`/p/<id>`):
 * - Sin sesión: muestra la vista previa del panorama (cabecera, quórum,
 *   tablero del modo y lista de asistentes). Al intentar registrar su
 *   asistencia o votar, redirige a `/login?next=/p/<id>`.
 * - Con sesión: el participante confirma con su cuenta (Google o correo) y su
 *   nombre sale del perfil. La fila `participants` queda ligada a su
 *   `auth_user_id` y solo él puede tocarla (RLS la valida con `auth.uid()`).
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
import { buildRestPlayers, buildTitularPlayers } from "@/core/team-organizer";
import {
  getPaymentFlowState,
  createEmptyPaymentsState,
  type PaymentsState,
} from "@/core/payment-treasury";
import {
  attachPostCloseReceipt,
  createEmptyReceiptsState,
  getReceiptErrorMessage,
  getGuestTreasuryView,
  retractOwnClaim,
  submitTransferClaim,
  updateActiveReceipt,
  type GuestTreasuryView as GuestTreasuryViewData,
  type ReceiptUploadPayload,
  type ReceiptsState,
} from "@/core/payment-receipt";
import type { TreasurySummaryMetrics } from "@/core/payment-receipt";
import {
  getGuestParticipationErrorMessage,
  getOwnAttendeeByUserId,
  isPanoramaIdLike,
  resolveGuestFlow,
  validateGuestName,
  type GuestIdentity,
} from "@/core/guest-participation";
import { formatPanoramaStartsAt, getTodayLocalValue } from "@/core/datetime-cl";
import { getGuestQuorumTarget, getQuorumLabel, getQuorumStatus, getMissingToQuorum } from "@/core/quota-manager";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { getGuestIdentity, clearGuestIdentity } from "@/lib/guest-identity";
import { useAuthSession } from "@/lib/use-auth-session";
import {
  attachReceiptPostCloseRow,
  buildReceiptStoragePath,
  fetchGuestTreasuryState,
  fetchPanoramaById,
  getReceiptFileExtension,
  insertParticipantRow,
  mapParticipantRowToAttendee,
  releaseTeamSeatRow,
  claimTeamVacancyRow,
  removeReceiptObjectRow,
  retractSelfTransferRow,
  submitTransferClaimRow,
  updateActiveReceiptRow,
  uploadReceiptObjectRow,
  updateParticipantStatus,
} from "@/lib/supabase-panorama-repo";
import ThemeToggle from "@/components/theme-toggle";
import QuorumSemaphore from "@/components/quorum-semaphore";
import GuestPlaceVote from "@/components/guest-place-vote";
import GuestContributionList from "@/components/guest-contribution-list";
import GuestTeamOrganizer from "@/components/guest-team-organizer";
import GuestPaymentTreasury from "@/components/guest-payment-treasury";
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
  // Estado de tesorería del enlace (privacidad 2A): SOLO lectura propia +
  // métricas anónimas; el tablero completo es cosa del organizador.
  const [payments, setPayments] = useState<PaymentsState | null>(null);
  const [receipts, setReceipts] = useState<ReceiptsState | null>(null);
  const [summary, setSummary] = useState<TreasurySummaryMetrics | null>(null);
  const [paymentsRefreshKey, setPaymentsRefreshKey] = useState(0);
  const [isSelfPaymentBusy, setIsSelfPaymentBusy] = useState(false);
  const [selfPaymentError, setSelfPaymentError] = useState<string | null>(null);

  /** Redirige al login conservando el retorno a este panorama (`/login?next=/p/<id>`). */
  const redirectToLogin = useCallback(() => {
    const target = `/p/${panoramaId}`;
    document.cookie = `panoramatch_next=${encodeURIComponent(target)}; path=/; max-age=300; SameSite=Lax`;
    router.push(`/login?next=${encodeURIComponent(target)}`);
  }, [router, panoramaId]);

  // Carga del panorama: funciona con o sin sesión (vista previa pública).
  useEffect(() => {
    if (!isPanoramaIdLike(panoramaId)) {
      setIsInvalid(true);
      return;
    }
    setIdentity(getGuestIdentity(panoramaId));
    const client = getSupabaseBrowserClient();
    let cancelled = false;
    const run = async () => {
      try {
        const loaded = await fetchPanoramaById(client, panoramaId);
        if (cancelled) {
          return;
        }
        if (loaded === null) {
          setIsInvalid(true);
        } else {
          setPanorama(loaded);
        }
      } catch {
        if (!cancelled) {
          setFailedToLoad(true);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [panoramaId]);

  // Carga del estado de pagos propio (solo con sesión activa; las métricas
  // anónimas del pozo y SU comprobante llegan con los permisos del servidor).
  // Se repite con el bump de la marca propia (tras unirse o adoptar).
  const loadedPanoramaId = panorama?.id ?? null;
  const currentUserId = user?.userId ?? null;
  useEffect(() => {
    if (loadedPanoramaId === null || currentUserId === null) {
      setPayments(null);
      setReceipts(null);
      setSummary(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const loaded = await fetchGuestTreasuryState(getSupabaseBrowserClient(), loadedPanoramaId);
        if (!cancelled) {
          setPayments(loaded.payments);
          setReceipts(loaded.receipts);
          setSummary(loaded.summary);
        }
      } catch {
        if (!cancelled) {
          setPayments(createEmptyPaymentsState());
          setReceipts(createEmptyReceiptsState());
          setSummary(null);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [loadedPanoramaId, currentUserId, paymentsRefreshKey]);

  const flow = resolveGuestFlow(identity, panorama, user?.userId ?? null);
  // El asistente propio: la fila ligada a la cuenta de la sesión.
  const ownAttendee =
    user === null || panorama === null
      ? null
      : getOwnAttendeeByUserId(panorama, user.userId);

  // Piezas del núcleo para la vista del enlace: titulares vigentes (dan la
  // cuota y habilitan la marca) y el resto (ex titulares, suplentes, doubt).
  const titularPlayers = useMemo(
    () =>
      panorama === null
        ? []
        : buildTitularPlayers(
            withCreatorAttendee(panorama.attendees, panorama.event.creatorName),
            panorama.event.maxCapacity,
          ),
    [panorama],
  );
  const restPlayers = useMemo(
    () =>
      panorama === null
        ? []
        : buildRestPlayers(
            withCreatorAttendee(panorama.attendees, panorama.event.creatorName),
            panorama.event.maxCapacity,
          ),
    [panorama],
  );

  /**
   * Vista de 3 capas del núcleo. Las métricas del pozo SIEMPRE vienen del
   * servidor (RPC anónima, `summary`); la copia local solo ve filas propias
   * y jamás se muestra si el servidor respondió.
   */
  const guestView = useMemo<GuestTreasuryViewData | null>(() => {
    if (payments === null || receipts === null) {
      return null;
    }
    const computed = getGuestTreasuryView(
      payments,
      receipts,
      titularPlayers,
      restPlayers,
      panorama?.event.totalCostCLP ?? 0,
      ownAttendee?.id ?? null,
    );
    return summary === null ? computed : { ...computed, summary };
  }, [panorama, payments, receipts, summary, titularPlayers, restPlayers, ownAttendee]);

  const ownReceiptStoragePath = useMemo(() => {
    if (receipts === null || ownAttendee === null) {
      return null;
    }
    return receipts.receipts.find((receipt) => receipt.playerRef === ownAttendee.id)?.storagePath ?? null;
  }, [receipts, ownAttendee]);

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

  /** El usuario entra a la lista con el estado elegido y SU cuenta; sin sesión va a /login. */
  const joinAs = useCallback(
    async (status: AttendanceStatus) => {
      if (panorama === null) {
        return;
      }
      if (user === null) {
        redirectToLogin();
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
    [panorama, user, panoramaId, redirectToLogin],
  );

  /** Adopta la fila anónima legacy de este dispositivo con la sesión actual. */
  const adoptLegacyRow = useCallback(async () => {
    if (identity === null || panorama === null) {
      return;
    }
    if (user === null) {
      redirectToLogin();
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
  }, [identity, panorama, user, panoramaId, redirectToLogin]);

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

  /* ─────────────── Pagos propios con comprobante (005) ─────────────── */

  /**
   * Gesto único de imagen propio (RF-3/RF-4/D4): decide la operación según
   * el flujo vigente (marca nueva / reemplazo en «En revisión» / primer
   * adjunto a una marca legacy sin imagen / respaldo post-cierre) y sube el
   * comprobante ANTES de registrar nada: si algo falla, la marca jamás nace
   * sin imagen y el objeto huérfano de la subida se limpia best-effort.
   */
  const pickReceiptForSelf = useCallback(
    async (file: File) => {
      if (panorama === null || ownAttendee === null) {
        return;
      }
      if (payments === null || receipts === null) {
        setSelfPaymentError("Tus pagos siguen cargando. Intenta en un momento.");
        return;
      }
      const client = getSupabaseBrowserClient();
      const mimeType = file.type === "" ? "image/jpeg" : file.type;
      const now = getTodayLocalValue(new Date());
      const playerRef = ownAttendee.id;
      const hasClaim = payments.claims.some((claim) => claim.playerRef === playerRef);
      const flowState = getPaymentFlowState(payments, playerRef);
      const op: "claim" | "replace" | "attach" = hasClaim
        ? "replace"
        : flowState === "paid"
          ? "attach"
          : "claim";
      // Validación pura del núcleo ANTES de subir nada (ruta provisional).
      const runOp = (receipt: ReceiptUploadPayload) =>
        op === "replace"
          ? updateActiveReceipt(payments, receipts, { playerRef, now, receipt })
          : op === "attach"
            ? attachPostCloseReceipt(payments, receipts, { playerRef, receipt })
            : submitTransferClaim(payments, receipts, {
                playerRef,
                titularPlayers,
                totalCostCLP: panorama.event.totalCostCLP,
                now,
                receipt,
              });
      const preview = runOp({ storagePath: "preview/provisional.jpg", mimeType, byteSize: file.size });
      if (!preview.ok) {
        setSelfPaymentError(getReceiptErrorMessage(preview.reason));
        return;
      }
      setIsSelfPaymentBusy(true);
      setSelfPaymentError(null);
      try {
        // La subida primero: el comprobante y el estado nacen juntos; si la
        // subida falla, el estado queda «Pendiente» sin marca ni imagen.
        const storagePath = buildReceiptStoragePath(
          panorama.id,
          playerRef,
          getReceiptFileExtension(mimeType),
        );
        let uploaded = await uploadReceiptObjectRow(client, { storagePath, file, mimeType });
        try {
          const rpcPayload = {
            panoramaId: panorama.id,
            storagePath: uploaded.storagePath,
            mimeType,
            byteSize: uploaded.byteSize,
          };
          if (op === "claim") {
            await submitTransferClaimRow(client, rpcPayload);
          } else if (op === "replace") {
            await updateActiveReceiptRow(client, rpcPayload);
          } else {
            await attachReceiptPostCloseRow(client, rpcPayload);
          }
        } catch (cause) {
          // La RPC no registró: el objeto recién subido queda huérfano.
          void removeReceiptObjectRow(client, uploaded.storagePath);
          setSelfPaymentError(
            getReceiptFlowError(cause, "No se pudo registrar el comprobante. Intenta otra vez."),
          );
          return;
        }
        // Éxito en la nube: el estado local replica con la ruta real.
        const commit = runOp({
          storagePath: uploaded.storagePath,
          mimeType,
          byteSize: uploaded.byteSize,
        });
        if (commit.ok) {
          setPayments(commit.payments);
          setReceipts(commit.receipts);
          setSelfPaymentError(null);
        } else {
          // Desacuerdo rarísimo tras el éxito del servidor: refresca del origen.
          setPaymentsRefreshKey((key) => key + 1);
        }
      } catch {
        setSelfPaymentError(
          "No se pudo subir el comprobante. Revisa tu conexión e intenta otra vez.",
        );
      } finally {
        setIsSelfPaymentBusy(false);
      }
    },
    [panorama, ownAttendee, payments, receipts, titularPlayers],
  );

  /** Retracto propio (RPC definer): la marca y SU comprobante salen juntos. */
  const retractSelfTransferred = useCallback(async () => {
    if (panorama === null || ownAttendee === null || payments === null || receipts === null) {
      return;
    }
    const client = getSupabaseBrowserClient();
    const previousPayments = payments;
    const previousReceipts = receipts;
    const result = retractOwnClaim(payments, receipts, ownAttendee.id, titularPlayers);
    if (!result.ok) {
      setSelfPaymentError(getReceiptErrorMessage(result.reason));
      return;
    }
    setIsSelfPaymentBusy(true);
    setSelfPaymentError(null);
    setPayments(result.payments);
    setReceipts(result.receipts);
    try {
      await retractSelfTransferRow(client, panorama.id);
      setSelfPaymentError(null);
    } catch (cause) {
      setPayments(previousPayments);
      setReceipts(previousReceipts);
      setSelfPaymentError(
        getReceiptFlowError(cause, "No se pudo retractar tu marca. Intenta otra vez."),
      );
    } finally {
      setIsSelfPaymentBusy(false);
    }
  }, [panorama, ownAttendee, payments, receipts, titularPlayers]);

  if (isInvalid) {
    return MISSING;
  }
  if (panorama === null) {
    return failedToLoad ? MISSING : SPLASH;
  }

  const { event } = panorama;
  const modeStyle = MODE_STYLES[event.mode];
  const quorumLabel = quorum === null ? null : getQuorumLabel(quorum, missingCount);
  const isOwn = (attendeeId: string) => attendeeId === ownAttendee?.id;

  return (
    <div className="flex flex-col gap-4">
      {/* Cabecera */}
      <header className="flex items-center justify-between gap-2 select-none">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-xl font-bold tracking-tight">
            <span className="text-ink">Panora</span>
            <span className="text-cancha">Match</span>
          </h1>
          {isAuthReady && user === null && (
            <span className="rounded-full border border-wait/40 bg-wait-soft px-2.5 py-0.5 text-[11px] font-bold text-wait">
              Vista previa
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAuthReady && user === null && (
            <button
              type="button"
              onClick={redirectToLogin}
              className="rounded-xl border border-cancha bg-cancha px-3 py-1.5 text-xs font-bold text-elev transition hover:bg-cancha-deep active:scale-[0.98]"
            >
              Iniciar sesión
            </button>
          )}
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          {/* Resumen del evento */}
          <section className="rounded-2xl border border-ink/15 bg-elev p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${modeStyle.chipClass}`}>
                {MODE_EMOJI[event.mode]} {modeStyle.label}
              </span>
              <span className="text-xs text-ink-soft">
                {event.maxCapacity !== null ? `Cupo para ${event.maxCapacity}` : "Sin cupo máximo"}
              </span>
            </div>
            <h2 className="mt-3 break-words font-display text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-3xl">
              {event.title}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">{formatPanoramaStartsAt(event.startsAt)}</p>
            {quorum !== null && quorumLabel !== null && (
              <div className="mt-4">
                <QuorumSemaphore
                  status={quorum}
                  label={quorumLabel}
                  vanCount={classification?.titulars.length}
                  maxCapacity={event.maxCapacity}
                />
              </div>
            )}
          </section>

          {/* Bienvenida: participa con tu cuenta; sin sesión muestra vista previa y redirige al login */}
          {flow === "fresh" && ownAttendee === null ? (
            <section className="rounded-2xl border border-ink/15 bg-elev p-4">
              <h2 className="font-display text-lg font-bold tracking-tight text-ink">
                ¿Vas o no vas?
              </h2>
              {user !== null ? (
                <p className="mt-0.5 text-sm text-ink-soft">
                  Participas con tu cuenta como{" "}
                  <span className="font-bold text-ink">{user.displayName}</span>.
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-ink-soft">
                  Estás viendo la vista previa del panorama. Elige tu respuesta o inicia sesión para registrar tu asistencia.
                </p>
              )}
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
              {isAuthReady && user === null && (
                <button
                  type="button"
                  onClick={redirectToLogin}
                  className="mt-3 w-full rounded-xl border border-cancha bg-cancha px-4 py-2.5 text-sm font-bold text-elev transition hover:bg-cancha-deep active:scale-[0.99]"
                >
                  Iniciar sesión para confirmar asistencia
                </button>
              )}
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
        </div>

        <div className="flex flex-col gap-4">
          {/* Pagos del enlace (2A): métricas anónimas + bloque bancario + SU tarjeta. Solo con sesión. */}
          {user !== null && panorama.event.totalCostCLP > 0 && (
            <GuestPaymentTreasury
              view={guestView}
              transferInfo={payments?.transferInfo ?? null}
              receiptStoragePath={ownReceiptStoragePath}
              isBusy={isSelfPaymentBusy}
              error={selfPaymentError}
              onPickReceipt={(file) => void pickReceiptForSelf(file)}
              onRetract={() => void retractSelfTransferred()}
            />
          )}

          {/* Tablero (solo lectura para invitados: nadie toca la fila ajena) */}
          {classification !== null && (
            <section className="flex flex-col gap-4 rounded-2xl border border-ink/15 bg-elev p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
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
        </div>
      </div>

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
 * Las RPC del flujo 005 llegan con el texto en español encabezado por el
 * nombre de la función («submit_transfer_claim: …»): se muestra solo el mensaje.
 */
const RECEIPT_RPC_PREFIXES = [
  "submit_transfer_claim:",
  "update_payment_receipt:",
  "attach_post_close_receipt:",
  "retract_payment_transfer:",
];

function getReceiptFlowError(cause: unknown, fallback: string): string {
  const raw = cause instanceof Error ? cause.message : String(cause);
  const prefix = RECEIPT_RPC_PREFIXES.find((candidate) => raw.startsWith(candidate));
  if (prefix !== undefined) {
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
