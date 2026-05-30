import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySemaphore } from "./semaphore.js";

// "Hoy" fijo para tests deterministas: 2026-05-29.
const today = new Date(Date.UTC(2026, 4, 29));

test("sin fecha → null", () => {
  assert.equal(classifySemaphore(null, today), null);
  assert.equal(classifySemaphore("", today), null);
  assert.equal(classifySemaphore("basura", today), null);
});

test("reciente (<6m) → verde", () => {
  assert.equal(classifySemaphore("2026-03-01", today), "verde");
  assert.equal(classifySemaphore("2026-05-29", today), "verde");
});

test("6-12m → amarillo", () => {
  assert.equal(classifySemaphore("2025-09-01", today), "amarillo");
});

test(">12m → rojo", () => {
  assert.equal(classifySemaphore("2024-01-01", today), "rojo");
  assert.equal(classifySemaphore("2025-05-29", today), "rojo"); // exacto 12m: no es > umbral
});

test("borde exacto 6 meses → amarillo; un día después → verde", () => {
  // 2026-05-29 menos 6 meses = 2025-11-29
  assert.equal(classifySemaphore("2025-11-29", today), "amarillo");
  assert.equal(classifySemaphore("2025-11-30", today), "verde");
});
