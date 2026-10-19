/**
 * Reglas de autenticación universales (sesión obligatoria para participar).
 * Valida los datos del registro/login (correo, contraseña y nombre visible)
 * y el parámetro `next` de la redirección de regreso. Puro: sin React, sin
 * DOM, sin red y sin Supabase.
 */

import { normalizeAttendeeName } from "./quota-manager";

/** Largo mínimo de las contraseñas (aprobado por el dueño). */
export const MIN_PASSWORD_LENGTH = 8;

/** Motivos de rechazo del registro/login (textos de la UI, en español). */
export type AuthValidationError =
  | "empty_email"
  | "invalid_email"
  | "empty_password"
  | "short_password"
  | "empty_name"
  | "too_long_name";

/** Mensaje legible por motivo (presentación, en español). */
export function getAuthValidationErrorMessage(error: AuthValidationError): string {
  switch (error) {
    case "empty_email":
      return "Escribe el correo con el que vas a entrar.";
    case "invalid_email":
      return "El correo no parece válido (ej: tu-nombre@gmail.com).";
    case "empty_password":
      return "Escribe una contraseña.";
    case "short_password":
      return `La contraseña necesita al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    case "empty_name":
      return "Escribe el nombre con el que te van a ver los demás.";
    case "too_long_name":
      return "El nombre es demasiado largo (máximo 40 caracteres).";
    default:
      return "Revisa los datos de acceso.";
  }
}

/** Correo con forma mínima "algo@algo.dominio" (validación dura vive en la base). */
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** El id de un panorama debe ser un uuid v4 con esa forma. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida el correo del acceso por email: recorte y forma mínima. */
export function validateEmailValue(
  rawEmail: string,
): { ok: true; email: string } | { ok: false; error: AuthValidationError } {
  const email = rawEmail.trim();
  if (email === "") {
    return { ok: false, error: "empty_email" };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "invalid_email" };
  }
  return { ok: true, email };
}

/** Valida la contraseña: presente y con el largo mínimo. */
export function validatePasswordValue(
  rawPassword: string,
): { ok: true; password: string } | { ok: false; error: AuthValidationError } {
  if (rawPassword === "") {
    return { ok: false, error: "empty_password" };
  }
  if (rawPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: "short_password" };
  }
  return { ok: true, password: rawPassword };
}

/** Valida el nombre visible del registro: igual regla que asistentes (≤40). */
export function validateDisplayNameValue(
  rawName: string,
): { ok: true; name: string } | { ok: false; error: AuthValidationError } {
  const name = normalizeAttendeeName(rawName);
  if (name === "") {
    return { ok: false, error: "empty_name" };
  }
  if (name.length > 40) {
    return { ok: false, error: "too_long_name" };
  }
  return { ok: true, name };
}

/** Entrada completa del registro con correo + contraseña + nombre. */
export interface SignUpInputValues {
  email: string;
  password: string;
  displayName: string;
}

/** Datos crudos que entrega el formulario antes de validarlos. */
export interface RawSignUpInput {
  email: string;
  password: string;
  displayName: string;
}

/** Valida el registro completo y devuelve los valores listos o un motivo. */
export function validateSignUpInput(
  raw: RawSignUpInput,
): { ok: true; values: SignUpInputValues } | { ok: false; error: AuthValidationError } {
  const email = validateEmailValue(raw.email);
  if (!email.ok) {
    return { ok: false, error: email.error };
  }
  const password = validatePasswordValue(raw.password);
  if (!password.ok) {
    return { ok: false, error: password.error };
  }
  const displayName = validateDisplayNameValue(raw.displayName);
  if (!displayName.ok) {
    return { ok: false, error: displayName.error };
  }
  return {
    ok: true,
    values: { email: email.email, password: password.password, displayName: displayName.name },
  };
}

/**
 * Valida el parámetro de redirección `?next=` SOLO contra rutas internas
 * con nuestra forma ("/" o "/p/<panorama_id>"). Cualquier otra cosa
 * (externa, "//", "\\", carácteres raros) es ignorado y vuelve al inicio.
 */
export function resolveInternalRedirectPath(
  rawNext: string | null | undefined,
): string | null {
  if (rawNext === null || rawNext === undefined) {
    return null;
  }
  const next = rawNext.trim();
  if (next === "/") {
    return "/";
  }
  if (!next.startsWith("/p/") || next.includes("\\") || next.includes("..")) {
    return null;
  }
  const panoramaId = next.slice("/p/".length);
  if (panoramaId === "" || !isPanoramaIdLikeValue(panoramaId)) {
    return null;
  }
  return `/p/${panoramaId}`;
}

/** Forma de uuid (copia local para no acoplar módulos del enlace). */
function isPanoramaIdLikeValue(value: string): boolean {
  return UUID_PATTERN.test(value);
}
