import { test } from "node:test";
import assert from "node:assert/strict";
import { computeHorasPriors } from "./priors.js";

test("agrupa por peldaño y calcula banda min/med/max", () => {
  const p = computeHorasPriors([
    { peldano: "N3", horas_estimadas: 100, horas_reales: null },
    { peldano: "N3", horas_estimadas: 120, horas_reales: null },
    { peldano: "N3", horas_estimadas: 160, horas_reales: null },
    { peldano: "N1", horas_estimadas: 45, horas_reales: null },
  ]);
  const n3 = p.find((x) => x.peldano === "N3")!;
  assert.deepEqual([n3.min, n3.med, n3.max, n3.n], [100, 120, 160, 3]);
  assert.equal(p.find((x) => x.peldano === "N1")!.med, 45);
});

test("la matriz APRENDE: prefiere horas_reales sobre estimadas", () => {
  const p = computeHorasPriors([
    { peldano: "N1", horas_estimadas: 45, horas_reales: 60 }, // usa 60 (real)
    { peldano: "N1", horas_estimadas: 50, horas_reales: null }, // usa 50 (no hay real)
  ]);
  const n1 = p.find((x) => x.peldano === "N1")!;
  assert.equal(n1.min, 50);
  assert.equal(n1.max, 60);
  assert.equal(n1.n, 2);
});

test("ignora filas sin peldaño o sin horas", () => {
  const p = computeHorasPriors([
    { peldano: null, horas_estimadas: 99, horas_reales: null },
    { peldano: "N2", horas_estimadas: null, horas_reales: null },
    { peldano: "N2", horas_estimadas: 50, horas_reales: null },
  ]);
  assert.equal(p.length, 1);
  assert.equal(p[0]!.peldano, "N2");
  assert.equal(p[0]!.n, 1);
});
