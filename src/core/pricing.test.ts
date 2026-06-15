import { test } from "node:test";
import assert from "node:assert/strict";
import { priceForQuote, LADDER, ADDONS } from "./pricing.js";

test("N1 base: bandas de la escalera + cotizable", () => {
  const p = priceForQuote({ peldano: "N1" });
  assert.equal(p.cotizable, true);
  assert.equal(p.moneda_base, "CLP");
  assert.deepEqual(p.setup, { min: 500_000, max: 900_000 });
  assert.equal(p.recurrente.label, "base/mes");
  assert.equal(p.fee_agendado?.monto, 12_000); // performance: fee por agendado-asistió
  assert.equal(p.descuento, null);
  assert.deepEqual(p.total_setup, { min: 500_000, max: 900_000 });
  assert.equal(p.condiciones_pago, "100% al inicio."); // max 900k < 1M
});

test("N0: USD 108 fijo", () => {
  const p = priceForQuote({ peldano: "N0" });
  assert.equal(p.moneda_base, "USD");
  assert.deepEqual(p.setup, { min: 108, max: 108 });
  assert.match(p.condiciones_pago, /Stripe/);
});

test("N3: NO cotizable (gate ERP) con motivo", () => {
  const p = priceForQuote({ peldano: "N3" });
  assert.equal(p.cotizable, false);
  assert.ok(p.motivo_no_cotizable && /contrato ERP/i.test(p.motivo_no_cotizable));
  assert.equal(p.condiciones_pago, "—");
});

test("addons: suma de bandas e ignora claves desconocidas", () => {
  const p = priceForQuote({ peldano: "N1", addons: ["mcp_sii", "whatsapp_api", "no_existe"] });
  assert.equal(p.addons.length, 2);
  // 400k+300k .. 600k+400k
  assert.deepEqual(p.addons_total, { min: 700_000, max: 1_000_000 });
});

test("descuento: elige el MAYOR, no acumulables (referido 10% > cierre 5%)", () => {
  const p = priceForQuote({ peldano: "N1", referido: true, cierreRapido: true });
  assert.equal(p.descuento?.tipo, "referido");
  assert.equal(p.descuento?.pct, 10);
  // subtotal = setup {500k,900k} * 0.9
  assert.deepEqual(p.total_setup, { min: 450_000, max: 810_000 });
});

test("descuento paquete: ≥3 addons → 10% sobre addons", () => {
  const p = priceForQuote({ peldano: "N1", addons: ["mcp_sii", "whatsapp_api", "email_auto"] });
  assert.equal(p.descuento?.tipo, "paquete");
  // addonsTotal {900k,1.2M} *0.9 = {810k,1.08M}; + setup {500k,900k}
  assert.deepEqual(p.total_setup, { min: 1_310_000, max: 1_980_000 });
  assert.equal(p.condiciones_pago, "50% al inicio / 50% contra entrega."); // 1.98M en 1–3M
});

test("referido (sobre total) gana al paquete cuando el setup es grande", () => {
  const p = priceForQuote({ peldano: "N1", referido: true, addons: ["mcp_sii", "whatsapp_api", "email_auto"] });
  // referido 10% sobre subtotal.min (1.4M)=140k > paquete 10% sobre addons.min (900k)=90k
  assert.equal(p.descuento?.tipo, "referido");
  assert.deepEqual(p.total_setup, { min: 1_260_000, max: 1_890_000 });
});

test("N0 + addon CLP: no mezcla monedas, deja nota", () => {
  const p = priceForQuote({ peldano: "N0", addons: ["mcp_sii"] });
  assert.deepEqual(p.total_setup, { min: 108, max: 108 });
  assert.ok(p.total_setup_nota && /USD/.test(p.total_setup_nota));
});

test("condiciones de pago: N4 (>3M) = 40/30/30", () => {
  const p = priceForQuote({ peldano: "N4" });
  assert.equal(p.condiciones_pago, "40% al inicio / 30% a mitad de proyecto / 30% contra entrega.");
});

test("catálogo: todos los peldaños y addons tienen forma válida", () => {
  for (const k of Object.keys(LADDER) as (keyof typeof LADDER)[]) {
    assert.ok(LADDER[k].setup.min <= LADDER[k].setup.max);
  }
  for (const k of Object.keys(ADDONS)) {
    assert.equal(ADDONS[k]!.clave, k);
    assert.ok(ADDONS[k]!.min <= ADDONS[k]!.max);
  }
});
