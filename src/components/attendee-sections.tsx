"use client";

/**
 * Lista de Asistentes y Espera.
 * Muestra titulares ("Voy" dentro del cupo), la Lista de Espera (suplentes)
 * y el resto (en duda / no pueden). El ascenso automático de suplentes lo
 * resuelve `core/quota-manager.ts`; aquí solo se clasifica y se pinta.
 */

import type { Attendee, AttendeeClassification } from "@/core/types";
import { initialsFromName } from "@/core/initials";
import { STATUS_OPTIONS } from "@/components/ui-theme";

interface AttendeeSectionsProps {
  classification: AttendeeClassification;
  maxCapacity: number | null;
  onChangeStatus: (attendeeId: string, status: Attendee["status"]) => void;
}

export default function AttendeeSections({
  classification,
  maxCapacity,
  onChangeStatus,
}: AttendeeSectionsProps) {
  const vanCount = classification.titulars.length;
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-ink/15 bg-elev p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold tracking-tight text-ink">
          Confirmados
        </h2>
        <span className="text-xs text-ink-soft">
          {vanCount}
          {maxCapacity !== null ? ` de ${maxCapacity}` : ""} van ·{" "}
          {classification.waitlist.length} en espera
        </span>
      </div>

      {/* Titulares confirmados */}
      {classification.titulars.length > 0 && (
        <Group title="Van" situation="dentro del cupo" textClass="text-cancha">
          {classification.titulars.map((attendee) => (
            <AttendeeRow
              key={attendee.id}
              attendee={attendee}
              // En Social no hay "titulares": la fila del organizador es la
              // única que lleva chip; los demás van limpios.
              badge={
                attendee.isCreator === true
                  ? { label: "Organizador", className: "border-cancha/40 bg-cancha-soft text-cancha" }
                  : undefined
              }
              onChangeStatus={onChangeStatus}
            />
          ))}
        </Group>
      )}

      {/* Estado vacío: invitación a anotar, no un callejón sin salida */}
      {classification.titulars.length === 0 && (
        <p className="text-sm text-ink-soft italic">
          Nadie ha confirmado todavía. Anota a los primeros voluntarios arriba.
        </p>
      )}

      {/* Lista de espera: solo aparece cuando el cupo ya se agotó */}
      {classification.waitlist.length > 0 && (
        <Group
          title="En espera"
          situation="entran si alguien se baja"
          textClass="text-camino"
        >
          {classification.waitlist.map((attendee) => (
            <AttendeeRow
              key={attendee.id}
              attendee={attendee}
              onChangeStatus={onChangeStatus}
            />
          ))}
        </Group>
      )}

      {/* En duda */}
      {classification.maybe.length > 0 && (
        <Group title="En duda" situation="aún no responden" textClass="text-wait">
          {classification.maybe.map((attendee) => (
            <AttendeeRow key={attendee.id} attendee={attendee} onChangeStatus={onChangeStatus} />
          ))}
        </Group>
      )}

      {/* No pueden */}
      {classification.declined.length > 0 && (
        <Group title="No pueden" situation="quedaron fuera" textClass="text-baja">
          {classification.declined.map((attendee) => (
            <AttendeeRow key={attendee.id} attendee={attendee} onChangeStatus={onChangeStatus} />
          ))}
        </Group>
      )}
    </section>
  );
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
        <h3 className={`text-sm font-bold leading-none ${textClass}`}>
          {title}
        </h3>
        <span className="text-xs text-ink-soft">{situation}</span>
      </div>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  );
}

function AttendeeRow({
  attendee,
  badge,
  onChangeStatus,
}: {
  attendee: Attendee;
  badge?: { label: string; className: string };
  onChangeStatus: (attendeeId: string, status: Attendee["status"]) => void;
}) {
  // El organizador es «Voy» implícito: fila informativa, sin botones de estado.
  const isCreatorRow = attendee.isCreator === true;
  return (
    <li className="rounded-xl border border-ink/15 bg-paper p-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full font-display text-[10px] font-bold ${
              isCreatorRow ? "bg-cancha-soft text-cancha" : "bg-ink/10 text-ink-soft"
            }`}
          >
            {initialsFromName(attendee.name)}
          </span>
          <span className="min-w-0 truncate text-sm font-bold text-ink">
            {attendee.name}
          </span>
          {badge !== undefined && (
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>
              {badge.label}
            </span>
          )}
        </div>
        {!isCreatorRow && (
          <div className="grid grid-cols-3 gap-1.5 sm:shrink-0 sm:gap-1">
            {/* Cambio de estado inline: aquí ocurre el flujo titular ↔ suplente */}
            {STATUS_OPTIONS.map((option) => {
              const isActive = attendee.status === option.status;
              return (
                <button
                  key={option.status}
                  type="button"
                  onClick={() => onChangeStatus(attendee.id, option.status)}
                  aria-pressed={isActive}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition active:scale-[0.97] ${
                    isActive ? option.activeClass : option.inactiveClass
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </li>
  );
}
