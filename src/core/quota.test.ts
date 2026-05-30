import { test } from "node:test";
import assert from "node:assert/strict";
import { quotaExceeded, isUnlimited, monthStartISO } from "./quota.js";

test("ilimitado (-1) nunca excede", () => {
  assert.equal(isUnlimited(-1), true);
  assert.equal(quotaExceeded(99999, -1), false);
});

test("límite finito: used >= limit excede", () => {
  assert.equal(quotaExceeded(99, 100), false);
  assert.equal(quotaExceeded(100, 100), true);
  assert.equal(quotaExceeded(101, 100), true);
});

test("límite 0 excede siempre", () => {
  assert.equal(quotaExceeded(0, 0), true);
});

test("monthStartISO: primer día del mes a medianoche UTC", () => {
  assert.equal(
    monthStartISO(new Date(Date.UTC(2026, 4, 29, 15, 30, 45))),
    "2026-05-01T00:00:00.000Z"
  );
});
