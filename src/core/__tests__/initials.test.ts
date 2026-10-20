import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { initialsFromName } from "../initials";

describe("initialsFromName", () => {
  test("toma la primera letra de dos palabras", () => {
    assert.equal(initialsFromName("Nicolás Figueroa"), "NF");
  });

  test("una sola palabra devuelve solo su primera letra", () => {
    assert.equal(initialsFromName("Camila"), "C");
  });

  test("más de dos palabras usa primera y última (con tilde)", () => {
    assert.equal(initialsFromName("Ana María de los Ángeles"), "AÁ");
  });

  test("ignora espacios de más al inicio y al final", () => {
    assert.equal(initialsFromName("   Sofia  Bravo   "), "SB");
  });

  test("cadena vacía o solo espacios devuelve cadena vacía", () => {
    assert.equal(initialsFromName(""), "");
    assert.equal(initialsFromName("   "), "");
  });

  test("nombre con tilde mantiene la letra acentuada", () => {
    assert.equal(initialsFromName("Óscar Ibáñez"), "ÓI");
  });
});
