import { test } from "node:test";
import assert from "node:assert/strict";
import { fichaFromPrecio } from "./proposal.js";
import { priceForQuote } from "../core/pricing.js";

test("ficha N1: strings es-CL y peldaño nombrado", () => {
  const f = fichaFromPrecio(priceForQuote({ peldano: "N1" }));
  assert.equal(f.peldano_nombre, "N1 Nexus Captación");
  assert.equal(f.setup_texto, "CLP $500.000–900.000");
  assert.match(f.recurrente_texto, /retainer\/mes/);
  assert.equal(f.addons_texto, "ninguno");
  assert.equal(f.descuento_texto, "ninguno");
});

test("ficha N2 + addon + cierre rápido: addons, descuento y total exactos", () => {
  const f = fichaFromPrecio(priceForQuote({ peldano: "N2", addons: ["mcp_sii"], cierreRapido: true }));
  assert.match(f.addons_texto, /MCP SII/);
  assert.equal(f.descuento_texto, "cierre_7d 5%");
  assert.equal(f.total_texto, "CLP $1.805.000–2.945.000");
});

test("ficha N0: USD fijo", () => {
  const f = fichaFromPrecio(priceForQuote({ peldano: "N0" }));
  assert.equal(f.setup_texto, "USD 108");
  assert.match(f.recurrente_texto, /USD 108 mantención\/mes/);
});
