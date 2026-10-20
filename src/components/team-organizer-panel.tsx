"use client";

/**
 * Sección "Organizador de equipos" del modo Deportivo (compartida):
 * el CREADOR sortea, mueve a dedo y renombra (RF-2, RF-4, RF-6); el invitado
 * ve el mismo panel en solo lectura (RF-9). Toda la lógica vive en
 * `src/core/team-organizer.ts`; aquí solo presentación.
 */

import { useMemo, useState } from "react";
import {
  MAX_TEAM_NAME_LENGTH,
  createEmptyTeamsState,
  getDrawAvailability,
  getTeamName,
  getTeamOrganizerErrorMessage,
  getTeamsInfo,
  getTeamsRoster,
  type TeamSide,
  type TeamPlayer,
  type TeamsState,
} from "@/core/team-organizer";
import { CREATOR_ATTENDEE_ID } from "@/core/creator-attendee";

/** Paleta de cada equipo: tokens estables del sistema (cancha vs camino). */
const TEAM_STYLES = {
  a: { border: "border-cancha/40", soft: "bg-cancha-soft", text: "text-cancha" },
  b: { border: "border-camino/40", soft: "bg-camino-soft", text: "text-camino" },
} as const;

interface TeamOrganizerPanelProps {
  /** Estado de equipos cargado desde la nube; null mientras carga. */
  teams: TeamsState | null;
  /** Titulares reales en orden de confirmación (con el organizador primero). */
  titularPlayers: TeamPlayer[];
  /** true cuando quien mira es el CREADOR: sortear, mover y renombrar. */
  isOrganizer: boolean;
  /** Solo el creador las recibe; el invitado ve el panel en solo lectura. */
  actions?: {
    drawTeams: () => boolean;
    moveTeamPlayer: (playerRef: string, target: TeamSide | null) => boolean;
    renameTeam: (side: TeamSide, rawName: string) => boolean;
  };
}

export default function TeamOrganizerPanel({
  teams,
  titularPlayers,
  isOrganizer,
  actions,
}: TeamOrganizerPanelProps) {
  const [renamingSide, setRenamingSide] = useState<TeamSide | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const emptyTeams = useMemo(() => createEmptyTeamsState(), []);
  const availability = useMemo(
    () => getDrawAvailability(teams ?? emptyTeams, titularPlayers),
    [teams, emptyTeams, titularPlayers],
  );
  const roster = useMemo(
    () => getTeamsRoster(teams ?? emptyTeams, titularPlayers),
    [teams, emptyTeams, titularPlayers],
  );
  const teamInfo = useMemo(
    () => getTeamsInfo(teams ?? emptyTeams),
    [teams, emptyTeams],
  );

  const isLoading = teams === null;

  /** Fila común de jugador, con los controles solo para el creador. */
  const renderPlayerRow = (player: TeamPlayer, side: TeamSide) => {
    const otherSide: TeamSide = side === "a" ? "b" : "a";
    return (
      <li
        key={player.ref}
        className="flex items-center justify-between gap-2 rounded-lg bg-elev px-2.5 py-1.5"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-bold text-ink">{player.name}</span>
          {player.ref === CREATOR_ATTENDEE_ID && (
            <span className={`shrink-0 rounded-full border border-ink/20 px-1.5 py-px text-[10px] font-semibold text-ink-soft`}>
              Organizador
            </span>
          )}
        </div>
        {isOrganizer && actions !== undefined && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={`Mover a ${player.name} al otro equipo`}
              onClick={() => actions.moveTeamPlayer(player.ref, otherSide)}
              className="rounded-lg border border-ink/15 px-2 py-1 text-xs font-bold text-ink-soft transition hover:border-ink/40 hover:text-ink active:scale-[0.97]"
            >
              ↔
            </button>
            <button
              type="button"
              aria-label={`Sacar a ${player.name} del equipo`}
              onClick={() => actions.moveTeamPlayer(player.ref, null)}
              className="rounded-lg border border-ink/15 px-2 py-1 text-xs font-bold text-ink-soft transition hover:border-baja hover:text-baja active:scale-[0.97]"
            >
              ✕
            </button>
          </div>
        )}
      </li>
    );
  };

  /** Tarjeta de un equipo, con renombrado en línea solo para el creador. */
  const renderTeamCard = (side: TeamSide) => {
    const info = teamInfo.find((team) => team.side === side)!;
    const styles = TEAM_STYLES[side];
    const players = side === "a" ? roster.teamA : roster.teamB;
    const isRenaming = isOrganizer && renamingSide === side;

    return (
      <div key={side} className={`rounded-xl border ${styles.border} ${styles.soft} p-3`}>
        <div className="flex items-center justify-between gap-2">
          {isRenaming && actions !== undefined ? (
            <form
              onSubmit={(formEvent) => {
                formEvent.preventDefault();
                // El mensaje exacto (vacío, largo o repetido) lo emite el store.
                if (actions.renameTeam(side, renameValue)) {
                  setRenamingSide(null);
                }
              }}
              noValidate
              className="min-w-0 flex-1"
            >
              <input
                type="text"
                value={renameValue}
                autoFocus
                onChange={(inputEvent) => setRenameValue(inputEvent.target.value)}
                maxLength={MAX_TEAM_NAME_LENGTH + 10}
                className="min-w-0 w-full rounded-lg border border-ink/20 bg-paper px-2 py-1 text-sm font-bold text-ink outline-none focus:border-ink/50"
              />
            </form>
          ) : (
            <p className={`truncate font-display text-base font-bold tracking-tight ${styles.text}`}>
              {info.name}
            </p>
          )}
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-xs font-semibold text-ink-soft">
              {players.length} {players.length === 1 ? "jugador" : "jugadores"}
            </span>
            {isOrganizer && actions !== undefined && (
              <button
                type="button"
                aria-label={`Renombrar ${info.name}`}
                onClick={() => {
                  setRenamingSide(side);
                  setRenameValue(getTeamName(teams ?? emptyTeams, side));
                }}
                className="rounded-lg border border-ink/15 px-2 py-1 text-xs font-bold text-ink-soft transition hover:border-ink/40 hover:text-ink active:scale-[0.97]"
              >
                ✎
              </button>
            )}
          </div>
        </div>
        <ul className="mt-2 flex flex-col gap-1.5">
          {players.length > 0 ? (
            players.map((player) => renderPlayerRow(player, side))
          ) : (
            <li className="rounded-lg border border-dashed border-ink/20 px-2.5 py-2 text-center text-xs italic text-ink-soft">
              Sin jugadores aún.
            </li>
          )}
        </ul>
      </div>
    );
  };

  return (
    <section className="rounded-2xl border border-ink/15 bg-elev p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold tracking-tight text-ink">
          Organizador de equipos
        </h2>
        {isOrganizer && actions !== undefined && (
          <button
            type="button"
            disabled={isLoading || !availability.available}
            onClick={() => actions.drawTeams()}
            className="shrink-0 rounded-xl border border-cancha/40 bg-cancha-soft px-3 py-2 text-sm font-bold text-cancha transition hover:border-cancha active:scale-[0.97] disabled:opacity-50"
          >
            Sortear equipos
          </button>
        )}
      </div>
      <p className="mt-0.5 text-xs text-ink-soft">
        {isLoading
          ? "Cargando los equipos…"
          : isOrganizer
            ? availability.available
              ? "El sorteo reparte solo los titulares sin equipo; los fijos se mantienen."
              : getTeamOrganizerErrorMessage(availability.reason ?? "nothing_to_draw")
            : "Quién juega en cada equipo lo decide el organizador."}
      </p>

      {!isLoading && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {renderTeamCard("a")}
          {renderTeamCard("b")}
        </div>
      )}

      {/* Titulares sin equipo: se reparten con el sorteo o a dedo (creador). */}
      {!isLoading && roster.unassigned.length > 0 && (
        <div className="mt-3 rounded-xl border border-dashed border-ink/20 bg-paper p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Sin equipo
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {roster.unassigned.map((player) => (
              <li
                key={player.ref}
                className="flex items-center justify-between gap-2 rounded-lg bg-elev px-2.5 py-1.5"
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-bold text-ink">{player.name}</span>
                  {player.ref === CREATOR_ATTENDEE_ID && (
                    <span className="shrink-0 rounded-full border border-ink/20 px-1.5 py-px text-[10px] font-semibold text-ink-soft">
                      Organizador
                    </span>
                  )}
                </div>
                {isOrganizer && actions !== undefined && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => actions.moveTeamPlayer(player.ref, "a")}
                      className="rounded-lg border border-cancha/40 px-2 py-1 text-xs font-bold text-cancha transition hover:bg-cancha-soft active:scale-[0.97]"
                    >
                      → {getTeamName(teams ?? emptyTeams, "a")}
                    </button>
                    <button
                      type="button"
                      onClick={() => actions.moveTeamPlayer(player.ref, "b")}
                      className="rounded-lg border border-camino/40 px-2 py-1 text-xs font-bold text-camino transition hover:bg-camino-soft active:scale-[0.97]"
                    >
                      → {getTeamName(teams ?? emptyTeams, "b")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
