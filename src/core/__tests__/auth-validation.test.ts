import test from "node:test";
import assert from "node:assert/strict";

import {
  MIN_PASSWORD_LENGTH,
  getAuthValidationErrorMessage,
  validateEmailValue,
  validatePasswordValue,
  validateDisplayNameValue,
  validateSignUpInput,
  resolveInternalRedirectPath,
} from "../auth-validation";

/* ─────────────── Contraseña ─────────────── */

test("contraseña vacía es rechazada", () => {
  assert.equal(validatePasswordValue("").ok, false);
});

test(`contraseña con menos de ${MIN_PASSWORD_LENGTH} caracteres es rechazada`, () => {
  assert.equal(validatePasswordValue("").ok, false);
});

test(`contraseña con exactamente ${MIN_PASSWORD_LENGTH} caracteres es aceptada`, () => {
  const result = validatePasswordValue("a".repeat(MIN_PASSWORD_LENGTH));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.password, "a".repeat(MIN_PASSWORD_LENGTH));
});

test("la contraseña conserva los caracteres tal cual (sin recortes)", () => {
  const result = validatePasswordValue("clavesecreta ");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.password, "clavesecreta ");
});

/* ─────────────── Correo ─────────────── */

test("correo vacío o con solo espacios es rechazado", () => {
  assert.equal(validateEmailValue("").ok, false);
  assert.equal(validateEmailValue("   ").ok, false);
});

test("correo con espacios internos o sin dominio es rechazado", () => {
  assert.equal(validateEmailValue("pep e@gmail.com").ok, false);
  assert.equal(validateEmailValue("pepegmail.com").ok, false);
  assert.equal(validateEmailValue("pepe@").ok, false);
});

test("correo válido se recorta y se acepta", () => {
  const result = validateEmailValue("  Pepe.Orozco@Gmail.com  ");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.email, "Pepe.Orozco@Gmail.com");
});

/* ─────────────── Nombre visible ─────────────── */

test("nombre vacío o con solo espacios es rechazado", () => {
  assert.equal(validateDisplayNameValue("").ok, false);
  assert.equal(validateDisplayNameValue("   ").ok, false);
});

test("nombre con más de 40 caracteres es rechazado", () => {
  assert.equal(validateDisplayNameValue("a".repeat(41)).ok, false);
});

test("nombre se recorta y se acepta con tilde", () => {
  const result = validateDisplayNameValue("  Nicolás Figueroa  ");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.name, "Nicolás Figueroa");
});

/* ─────────────── Registro completo ─────────────── */

test("registro completo con todo válido pasa los tres valores", () => {
  const result = validateSignUpInput({
    email: " pepe@gmail.com ",
    password: "asado1234",
    displayName: " Pepe ",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.values.email, "pepe@gmail.com");
    assert.equal(result.values.password, "asado1234");
    assert.equal(result.values.displayName, "Pepe");
  }
});

test("registro con contraseña corta es rechazado con short_password", () => {
  const result = validateSignUpInput({
    email: "pepe@gmail.com",
    password: "123",
    displayName: "Pepe",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "short_password");
});

test("registro con nombre largo es rechazado con too_long_name", () => {
  const result = validateSignUpInput({
    email: "pepe@gmail.com",
    password: "asado1234",
    displayName: "a".repeat(41),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "too_long_name");
});

/* ─────────────── Redirección ?next= ─────────────── */

test("next vacío o externo resuelve a null", () => {
  assert.equal(resolveInternalRedirectPath(null), null);
  assert.equal(resolveInternalRedirectPath(""), null);
  assert.equal(resolveInternalRedirectPath("https://malicioso.com"), null);
  assert.equal(resolveInternalRedirectPath("//evil.com"), null);
  assert.equal(resolveInternalRedirectPath("/\\evil.com"), null);
  assert.equal(resolveInternalRedirectPath("/p/../../etc"), null);
});

test("next al inicio se acepta", () => {
  assert.equal(resolveInternalRedirectPath("/"), "/");
});

test("next con id de panorama válido se acepta intacto", () => {
  assert.equal(
    resolveInternalRedirectPath("/p/b1000000-0000-4000-8000-000000030301"),
    "/p/b1000000-0000-4000-8000-000000030301",
  );
});

test("next con id con forma inválida resuelve a null", () => {
  assert.equal(resolveInternalRedirectPath("/p/no-es-uuid"), null);
  assert.equal(resolveInternalRedirectPath("/p/"), null);
});

/* ─────────────── Mensajes ─────────────── */

test("cada motivo tiene mensaje en español no vacío", () => {
  const motivos = [
    "empty_email",
    "invalid_email",
    "empty_password",
    "short_password",
    "empty_name",
    "too_long_name",
  ] as const;
  for (const motivo of motivos) {
    const message = getAuthValidationErrorMessage(motivo);
    assert.equal(typeof message, "string");
    assert.ok(message.length > 5);
  }
});
