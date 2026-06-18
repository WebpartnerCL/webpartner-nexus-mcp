import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClientReport, periodoLegible } from "./report.js";

test("periodoLegible: YYYY-MM → mes en es-CL", () => {
  assert.equal(periodoLegible("2026-06"), "junio 2026");
});

test("buildClientReport: cuenta captados/agendados/asistidos/reseñas", () => {
  const r = buildClientReport({
    nombreNegocio: "Car Wash La Ola",
    periodo: "2026-06",
    leads: [
      { fase_embudo: "agendado", cal_event_id: "e1", booking_show: true },
      { fase_embudo: "nuevo", cal_event_id: null, booking_show: null },
      { fase_embudo: "agendado", cal_event_id: "e2", booking_show: false },
    ],
    resenas: [{ calificacion: 5 }, { calificacion: 2 }],
    suscripcion: { estado: "activa", peldano: "N1", base_monto: 90000, moneda: "CLP" },
  });
  assert.equal(r.captados, 3);
  assert.equal(r.agendados, 2);
  assert.equal(r.asistidos, 1);
  assert.equal(r.resenas_nuevas, 2);
  assert.equal(r.resenas_buenas, 1);
  assert.match(r.mensaje_cliente, /Car Wash La Ola/);
  assert.match(r.mensaje_cliente, /junio 2026/);
});

test("buildClientReport vacío: sin línea de reseñas y sin jerga", () => {
  const r = buildClientReport({
    nombreNegocio: "X", periodo: "2026-06", leads: [], resenas: [], suscripcion: null,
  });
  assert.equal(r.captados, 0);
  assert.doesNotMatch(r.mensaje_cliente, /reseñas?/i);
  assert.doesNotMatch(r.mensaje_cliente, /lead|calificar|agéntico/i);
});
