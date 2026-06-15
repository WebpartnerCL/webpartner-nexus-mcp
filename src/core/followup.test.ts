import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseFollowupEnvelope,
  normalizeAngulo,
  priorAnglesFromNotas,
  formatAngleNote,
  diasDesde,
} from "./followup.js";

test("parse: JSON limpio → mensaje, ángulo normalizado y canal", () => {
  const e = parseFollowupEnvelope(
    '{"mensaje":"Hola, ¿lo conversamos?","angulo":"Prueba Social","canal":"whatsapp"}'
  );
  assert.equal(e.mensaje, "Hola, ¿lo conversamos?");
  assert.equal(e.angulo, "prueba-social");
  assert.equal(e.canal, "whatsapp");
});

test("parse: tolera fences ```json y texto alrededor; canal default whatsapp", () => {
  const raw = 'Aquí va:\n```json\n{ "mensaje": "Te dejo un recurso", "angulo": "nuevo-recurso" }\n```\nlisto';
  const e = parseFollowupEnvelope(raw);
  assert.equal(e.mensaje, "Te dejo un recurso");
  assert.equal(e.angulo, "nuevo-recurso");
  assert.equal(e.canal, "whatsapp"); // sin canal → default
});

test("parse: canal email se respeta", () => {
  const e = parseFollowupEnvelope('{"mensaje":"x","angulo":"a","canal":"EMAIL"}');
  assert.equal(e.canal, "email");
});

test("parse: sin mensaje lanza", () => {
  assert.throws(() => parseFollowupEnvelope('{"angulo":"a"}'), /no devolvió 'mensaje'/);
});

test("parse: sin JSON lanza", () => {
  assert.throws(() => parseFollowupEnvelope("no hay json aquí"), /no se encontró objeto JSON/);
});

test("normalizeAngulo: acentos, mayúsculas y espacios → kebab-case", () => {
  assert.equal(normalizeAngulo("Costo de NO actuar"), "costo-de-no-actuar");
  assert.equal(normalizeAngulo("urgencia suave"), "urgencia-suave");
  assert.equal(normalizeAngulo("  "), "seguimiento"); // vacío → fallback
});

test("priorAnglesFromNotas: extrae ángulos de las líneas tag, dedupe", () => {
  const notas =
    "Propuesta enviada el 1.\n[seguimiento 2026-06-16] ángulo: recordatorio-de-valor\notra nota\n[seguimiento 2026-06-19] ángulo: prueba-social\n[seguimiento 2026-06-22] ángulo: prueba-social";
  assert.deepEqual(priorAnglesFromNotas(notas), ["recordatorio-de-valor", "prueba-social"]);
});

test("priorAnglesFromNotas: null/sin tags → []", () => {
  assert.deepEqual(priorAnglesFromNotas(null), []);
  assert.deepEqual(priorAnglesFromNotas("solo una nota suelta"), []);
});

test("formatAngleNote: línea tag parseable de vuelta (round-trip)", () => {
  const nota = formatAngleNote("Recordatorio De Valor", "2026-06-16T12:00:00.000Z");
  assert.equal(nota, "[seguimiento 2026-06-16] ángulo: recordatorio-de-valor");
  assert.deepEqual(priorAnglesFromNotas(nota), ["recordatorio-de-valor"]);
});

test("diasDesde: cuenta días enteros; futuro/invalid → 0", () => {
  const ahora = new Date("2026-06-16T10:00:00.000Z");
  assert.equal(diasDesde("2026-06-13T10:00:00.000Z", ahora), 3);
  assert.equal(diasDesde("2026-06-16T09:00:00.000Z", ahora), 0); // <1 día
  assert.equal(diasDesde("2026-06-20T10:00:00.000Z", ahora), 0); // futuro
  assert.equal(diasDesde(null, ahora), 0);
  assert.equal(diasDesde("no-fecha", ahora), 0);
});
