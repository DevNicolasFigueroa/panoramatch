"use client";

/**
 * Módulo de Confirmación Rápida: escribir el nombre de un amigo y marcar
 * su respuesta en un toque. Enter lo deja en "En duda" (regla del producto).
 */

import { useState } from "react";
import type { AttendanceStatus } from "@/core/types";
import { STATUS_OPTIONS } from "@/components/ui-theme";

export default function AddFriendForm({
  onAddFriend,
}: {
  /** Devuelve false si el nombre se repite (para mostrar el error aquí mismo). */
  onAddFriend: (name: string, status: AttendanceStatus) => boolean;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addWith = (status: AttendanceStatus) => {
    const trimmed = name.trim();
    if (trimmed === "") {
      setError("Primero escribe el nombre de tu amigo.");
      return;
    }
    const accepted = onAddFriend(trimmed, status);
    if (!accepted) {
      setError("Ese nombre ya está anotado.");
      return;
    }
    setError(null);
    setName("");
  };

  return (
    <section className="rounded-2xl border border-ink/15 bg-elev p-4">
      <h2 className="font-display text-lg font-bold tracking-tight text-ink">
        Anota a un amigo
      </h2>
      <p className="mt-0.5 text-sm text-ink-soft">
        Escribe el nombre y su respuesta; Enter lo deja en duda.
      </p>

      <form
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          addWith("maybe");
        }}
        noValidate
        className="mt-3 flex flex-col gap-2.5"
      >
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder="Nombre"
          maxLength={40}
          autoFocus
          className="w-full rounded-xl border border-ink/20 bg-paper px-3.5 py-2.5 text-base text-ink outline-none transition focus:border-cancha"
        />
        <div className="grid grid-cols-3 gap-2">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.status}
              type="button"
              onClick={() => addWith(option.status)}
              className={`rounded-xl border px-2 py-2 text-sm font-bold transition active:scale-[0.97] ${option.inactiveClass}`}
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
  );
}
