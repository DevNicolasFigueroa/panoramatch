"use client";

/**
 * Lista de Asistentes y Espera.
 * Muestra titulares ("Voy" dentro del cupo), la Lista de Espera (suplentes)
 * y el resto (en duda / no pueden). El ascenso automático de suplentes lo
 * resuelve `core/quota-manager.ts`; aquí solo se clasifica y se pinta.
 */

import type { Attendee } from "@/core/types";
import type { AttendeeClassification } from "@/core/types";
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
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-xl shadow-black/30">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold tracking-wide text-slate-200 uppercase">
          Asistentes
        </h2>
        <span className="text-xs text-slate-400">
          {classification.titulars.length}
          {maxCapacity !== null ? ` / ${maxCapacity} cupo` : " confirmados"} ·{" "}
          {classification.waitlist.length} suplentes
        </span>
      </div>

      {/* Titulares confirmados */}
      <Group title="Voy" subtitle="Titulares" countLabel={maxCapacity !== null ? `cupo ${classification.titulars.length}/${maxCapacity}` : undefined}>
        {classification.titulars.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            Aún sin confirmaciones. Suma a los primeros voluntarios 👆
          </p>
        ) : (
          classification.titulars.map((attendee) => (
            <AttendeeRow key={attendee.id} attendee={attendee} badge={{ label: "Titular", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" }} onChangeStatus={onChangeStatus} />
          ))
        )}
      </Group>

      {/* Lista de espera: solo aparece cuando el cupo ya se agotó */}
      {classification.waitlist.length > 0 && (
        <Group
          title="Lista de Espera"
          subtitle="Suplentes"
          countLabel={`${classification.waitlist.length}`}
          hint="Suben automáticamente si un titular se baja."
          variant="waitlist"
        >
          {classification.waitlist.map((attendee, index) => (
            <AttendeeRow
              key={attendee.id}
              attendee={attendee}
              badge={{
                label: `Suplente ${index + 1}`,
                className: "border-sky-500/40 bg-sky-500/10 text-sky-300",
              }}
              onChangeStatus={onChangeStatus}
            />
          ))}
        </Group>
      )}

      {/* En duda */}
      {classification.maybe.length > 0 && (
        <Group title="En duda" variant="maybe">
          {classification.maybe.map((attendee) => (
            <AttendeeRow key={attendee.id} attendee={attendee} onChangeStatus={onChangeStatus} />
          ))}
        </Group>
      )}

      {/* No pueden */}
      {classification.declined.length > 0 && (
        <Group title="No pueden" variant="declined">
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
  subtitle?: string;
  countLabel?: string;
  hint?: string;
  variant?: "going" | "waitlist" | "maybe" | "declined";
  children: React.ReactNode;
}

const GROUP_HEADLINE = {
  going: "text-emerald-300",
  waitlist: "text-sky-300",
  maybe: "text-amber-300",
  declined: "text-rose-300",
} as const;

function Group({ title, subtitle, countLabel, hint, variant = "going", children }: GroupProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={`text-xs font-bold tracking-wide uppercase ${GROUP_HEADLINE[variant]}`}>
          {title}
          {subtitle !== undefined && (
            <span className="ml-1.5 font-medium text-slate-500 normal-case">{subtitle}</span>
          )}
        </h3>
        {countLabel !== undefined && (
          <span className="text-xs text-slate-500">{countLabel}</span>
        )}
      </div>
      {hint !== undefined && (
        <p className="text-xs text-slate-500">{hint}</p>
      )}
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
  return (
    <li className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-slate-100">{attendee.name}</span>
        {badge !== undefined && (
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${badge.className}`}>
            {badge.label}
          </span>
        )}
      </div>
      {/* Cambio de estado inline: aquí ocurre el flujo titular ↔ suplente */}
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {STATUS_OPTIONS.map((option) => {
          const isActive = attendee.status === option.status;
          return (
            <button
              key={option.status}
              type="button"
              onClick={() => onChangeStatus(attendee.id, option.status)}
              aria-pressed={isActive}
              className={`rounded-lg border px-1.5 py-1.5 text-xs font-bold transition active:scale-[0.97] ${
                isActive ? option.activeClass : option.inactiveClass
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </li>
  );
}
