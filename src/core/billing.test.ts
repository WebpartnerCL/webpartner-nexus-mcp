import { test } from "node:test";
import assert from "node:assert/strict";
import { accesoActivo, resumenMrr, isEstado, isPeldano, isMoneda } from "./billing.js";

test("accesoActivo: prendido salvo suspendida/cancelada", () => {
  assert.equal(accesoActivo("trial"), true);
  assert.equal(accesoActivo("activa"), true);
  assert.equal(accesoActivo("morosa"), true); // gracia
  assert.equal(accesoActivo("suspendida"), false);
  assert.equal(accesoActivo("cancelada"), false);
});

test("validadores de dominio", () => {
  assert.equal(isEstado("activa"), true);
  assert.equal(isEstado("pagada"), false);
  assert.equal(isPeldano("N1"), true);
  assert.equal(isPeldano("N9"), false);
  assert.equal(isMoneda("CLP"), true);
  assert.equal(isMoneda("EUR"), false);
});

test("resumenMrr: solo 'activa' suma al MRR; agrupa por moneda", () => {
  const r = resumenMrr([
    { estado: "activa", moneda: "CLP", base_monto: 90000 },
    { estado: "activa", moneda: "CLP", base_monto: 90000 },
    { estado: "trial", moneda: "CLP", base_monto: 0 },
    { estado: "morosa", moneda: "CLP", base_monto: 90000 },
    { estado: "activa", moneda: "USD", base_monto: 108 },
  ]);
  const clp = r.find((x) => x.moneda === "CLP")!;
  assert.equal(clp.activas, 2);
  assert.equal(clp.trials, 1);
  assert.equal(clp.morosas, 1);
  assert.equal(clp.mrr_base, 180000); // morosa NO suma
  const usd = r.find((x) => x.moneda === "USD")!;
  assert.equal(usd.mrr_base, 108);
});

test("resumenMrr vacío → []", () => {
  assert.deepEqual(resumenMrr([]), []);
});
