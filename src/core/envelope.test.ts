import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnvelope, normalizeFase } from "./envelope.js";

test("parsea JSON limpio", () => {
  const e = parseEnvelope(
    '{"respuesta_cliente":"Hola","intencion":"saludo","calificado":true,"lead_score":3,"fase_sugerida":"dialogando_ia","escalar_humano":false}'
  );
  assert.equal(e.respuesta_cliente, "Hola");
  assert.equal(e.calificado, true);
  assert.equal(e.lead_score, 3);
});

test("tolera code fence ```json y clampa lead_score alto a 10", () => {
  const raw = '```json\n{"respuesta_cliente":"Hi","lead_score":20}\n```';
  const e = parseEnvelope(raw);
  assert.equal(e.respuesta_cliente, "Hi");
  assert.equal(e.lead_score, 10);
});

test("tolera texto alrededor y aplica defaults", () => {
  const e = parseEnvelope('Claro:\n{"respuesta_cliente":"X"}\nfin');
  assert.equal(e.respuesta_cliente, "X");
  assert.equal(e.escalar_humano, false);
  assert.equal(e.intencion, "");
  assert.equal(e.calificado, false);
  assert.equal(e.fase_sugerida, "dialogando_ia");
});

test("lead_score negativo o no numérico → 0", () => {
  assert.equal(parseEnvelope('{"respuesta_cliente":"y","lead_score":-5}').lead_score, 0);
  assert.equal(parseEnvelope('{"respuesta_cliente":"y","lead_score":"x"}').lead_score, 0);
});

test("falta respuesta_cliente → lanza", () => {
  assert.throws(() => parseEnvelope('{"intencion":"x"}'));
  assert.throws(() => parseEnvelope('{"respuesta_cliente":"   "}'));
});

test("JSON inválido → lanza", () => {
  assert.throws(() => parseEnvelope("no soy json"));
});

test("normalizeFase: válidas pasan, resto → dialogando_ia", () => {
  assert.equal(normalizeFase("agendado"), "agendado");
  assert.equal(normalizeFase("cerrado"), "cerrado");
  assert.equal(normalizeFase("escalar_humano"), "dialogando_ia");
  assert.equal(normalizeFase("inventada"), "dialogando_ia");
  assert.equal(normalizeFase(undefined), "dialogando_ia");
});
