"use client";

/**
 * "Organizador de equipos" del enlace /p/<id> (auth universal): lectura
 * pública del reparto con nombres; SOLO EL CREADOR toca los equipos, así
 * que aquí el panel es de solo lectura (RF-9).
 */

import { useEffect, useMemo, useState } from "react";

import type { SavedPanorama } from "@/core/types";
import { buildTitularPlayers, createEmptyTeamsState, type TeamsState } from "@/core/team-organizer";
import { withCreatorAttendee } from "@/core/creator-attendee";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { fetchTeamsData } from "@/lib/supabase-panorama-repo";
import TeamOrganizerPanel from "@/components/team-organizer-panel";

interface GuestTeamOrganizerProps {
  panorama: SavedPanorama;
  /** Cambia cuando el invitado acaba de bajar/subir: fuerza a releer la nube. */
  refreshKey: number;
}

export default function GuestTeamOrganizer({ panorama, refreshKey }: GuestTeamOrganizerProps) {
  const [teams, setTeams] = useState<TeamsState | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTeams(null);
    const run = async () => {
      try {
        const data = await fetchTeamsData(getSupabaseBrowserClient(), panorama.id);
        if (!cancelled) {
          setTeams({
            teamAName: data.teamAName,
            teamBName: data.teamBName,
            assignments: data.assignments,
            vacancies: data.vacancies,
          });
        }
      } catch {
        // La lista de equipos es accesoria: sin datos se muestra vacía.
        if (!cancelled) {
          setTeams(createEmptyTeamsState());
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [panorama.id, refreshKey]);

  const titularPlayers = useMemo(
    () =>
      buildTitularPlayers(
        withCreatorAttendee(panorama.attendees, panorama.event.creatorName),
        panorama.event.maxCapacity,
      ),
    [panorama],
  );

  return <TeamOrganizerPanel teams={teams} titularPlayers={titularPlayers} isOrganizer={false} />;
}
