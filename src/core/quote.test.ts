import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuoteEnvelope, normalizePeldano } from "./quote.js";

test("parsea envelope limpio", () => {
  const e = parseQuoteEnvelope(
    '{"peldano":"N1","confianza":0.8,"alcance":["sitio","agente"],"horas_estimadas":45,"supuestos":["1 idioma"],"needs_more_info":[],"addons_sugeridos":["mcp_sii"],"razonamiento":"capta leads"}'
  );
  assert.equal(e.peldano, "N1");
  assert.equal(e.confianza, 0.8);
  assert.deepEqual(e.alcance, ["sitio", "agente"]);
  assert.equal(e.horas_estimadas, 45);
  assert.deepEqual(e.addons_sugeridos, ["mcp_sii"]);
});

test("tolera fences y aplica defaults seguros", () => {
  const e = parseQuoteEnvelope('```json\n{"peldano":"N2"}\n```');
  assert.equal(e.peldano, "N2");
  assert.equal(e.confianza, 0);
  assert.deepEqual(e.alcance, []);
  assert.equal(e.horas_estimadas, null);
  assert.deepEqual(e.needs_more_info, []);
  assert.equal(e.razonamiento, "");
});

test("normalizePeldano: tolerante y seguro", () => {
  assert.equal(normalizePeldano("n2"), "N2");
  assert.equal(normalizePeldano("N1 Captación"), "N1");
  assert.equal(normalizePeldano("N5"), null); // fuera de N0–N4
  assert.equal(normalizePeldano("foo"), null);
  assert.equal(normalizePeldano(null), null);
  assert.equal(normalizePeldano(42), null);
});

test("confianza se clampa a 0–1", () => {
  assert.equal(parseQuoteEnvelope('{"peldano":"N1","confianza":1.5}').confianza, 1);
  assert.equal(parseQuoteEnvelope('{"peldano":"N1","confianza":-3}').confianza, 0);
  assert.equal(parseQuoteEnvelope('{"peldano":"N1","confianza":"x"}').confianza, 0);
});

test("horas_estimadas: positivo entero, o null", () => {
  assert.equal(parseQuoteEnvelope('{"peldano":"N1","horas_estimadas":"45"}').horas_estimadas, 45);
  assert.equal(parseQuoteEnvelope('{"peldano":"N1","horas_estimadas":0}').horas_estimadas, null);
  assert.equal(parseQuoteEnvelope('{"peldano":"N1","horas_estimadas":-3}').horas_estimadas, null);
});

test("peldano nulo cuando el modelo no decide", () => {
  const e = parseQuoteEnvelope('{"needs_more_info":["¿presupuesto?"],"confianza":0.2}');
  assert.equal(e.peldano, null);
  assert.deepEqual(e.needs_more_info, ["¿presupuesto?"]);
});

test("JSON inválido → lanza", () => {
  assert.throws(() => parseQuoteEnvelope("no soy json"));
});
