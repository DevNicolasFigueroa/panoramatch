"use client";

/**
 * Módulo de Confirmación Rápida: escribir el nombre de un amigo y marcar
 * su respuesta en un toque. Enter parte en "En duda" (regla del producto).
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
      setError("Escribe el nombre de tu amigo primero.");
      return;
    }
    const accepted = onAddFriend(trimmed, status);
    if (!accepted) {
      setError("Ese nombre ya está en la lista.");
      return;
    }
    setError(null);
    setName("");
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-xl shadow-black/30">
      <h2 className="text-sm font-bold tracking-wide text-slate-200 uppercase">
        Confirmación rápida
      </h2>
      <p className="mt-1 text-xs text-slate-400">
        Escribe el nombre y la marca. Enter lo deja «En duda».
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
          placeholder="Ej: Matías"
          maxLength={40}
          autoFocus
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-base text-slate-100 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
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
        <p className="mt-2 text-xs font-medium text-rose-400" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
