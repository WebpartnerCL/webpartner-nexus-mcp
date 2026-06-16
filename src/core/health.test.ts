import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHealthReport, type HealthInput } from "./health.js";

const empty: HealthInput = { leads: [], reviews: [], usage: [], proposals: [] };

test("vacío → totales en 0, fases sembradas, sin alertas", () => {
  const r = buildHealthReport(empty);
  assert.equal(r.leads.total, 0);
  assert.equal(r.leads.score_promedio, 0);
  assert.equal(r.leads.por_fase["nuevo"], 0); // sembrada aunque no haya leads
  assert.equal(r.leads.por_semaforo["rojo"], 0);
  assert.equal(r.reviews.total, 0);
  assert.deepEqual(r.alertas, []);
});

test("embudo: cuenta por fase, origen y promedia score", () => {
  const r = buildHealthReport({
    ...empty,
    leads: [
      { fase_embudo: "nuevo", origen: "whatsapp", lead_score: 10, cal_event_id: "evt1", etiqueta_semaforo: "verde" },
      { fase_embudo: "agendado", origen: "whatsapp", lead_score: 6, cal_event_id: "evt2", etiqueta_semaforo: null },
      { fase_embudo: "nuevo", origen: "discovery_form", lead_score: 2, cal_event_id: null, etiqueta_semaforo: "rojo" },
    ],
  });
  assert.equal(r.leads.total, 3);
  assert.equal(r.leads.por_fase["nuevo"], 2);
  assert.equal(r.leads.por_fase["agendado"], 1);
  assert.equal(r.leads.por_origen["whatsapp"], 2);
  assert.equal(r.leads.agendados_con_evento, 2);
  assert.equal(r.leads.score_promedio, 6); // (10+6+2)/3 = 6
  assert.equal(r.leads.por_semaforo["sin_dato"], 1); // etiqueta null
  assert.equal(r.leads.por_semaforo["rojo"], 1);
});

test("reseñas: separa 4-5★, 1-3★ y pendientes (calificacion null)", () => {
  const r = buildHealthReport({
    ...empty,
    reviews: [
      { calificacion: 5, enviado_a_google: true },
      { calificacion: 4, enviado_a_google: true },
      { calificacion: 2, enviado_a_google: false },
      { calificacion: null, enviado_a_google: false },
    ],
  });
  assert.equal(r.reviews.total, 4);
  assert.equal(r.reviews.positivas_4_5, 2);
  assert.equal(r.reviews.feedback_interno_1_3, 1);
  assert.equal(r.reviews.pendientes, 1);
  assert.equal(r.reviews.enviadas_a_google, 2);
});

test("actividad del mes: suma unidades por tool", () => {
  const r = buildHealthReport({
    ...empty,
    usage: [
      { tool: "qualify_lead", units: 1 },
      { tool: "qualify_lead", units: 2 },
      { tool: "send_whatsapp", units: null }, // null cuenta como 0 unidades, pero sí es evento
    ],
  });
  assert.equal(r.actividad_mes.eventos, 3);
  assert.equal(r.actividad_mes.total_unidades, 3);
  assert.equal(r.actividad_mes.por_tool["qualify_lead"], 3);
  assert.equal(r.actividad_mes.por_tool["send_whatsapp"], 0);
});

test("alerta: embudo sin agendamientos (todos cal_event_id null) y >50% en 'nuevo'", () => {
  const r = buildHealthReport({
    ...empty,
    leads: [
      { fase_embudo: "nuevo", origen: "whatsapp", lead_score: 0, cal_event_id: null, etiqueta_semaforo: null },
      { fase_embudo: "nuevo", origen: "whatsapp", lead_score: 0, cal_event_id: null, etiqueta_semaforo: null },
    ],
  });
  assert.ok(r.alertas.some((a) => a.includes("sin agendamientos")));
  assert.ok(r.alertas.some((a) => a.includes("siguen en 'nuevo'")));
});

test("alerta: semáforo rojo y reseña pendiente", () => {
  const r = buildHealthReport({
    leads: [
      { fase_embudo: "agendado", origen: "whatsapp", lead_score: 8, cal_event_id: "evt", etiqueta_semaforo: "rojo" },
    ],
    reviews: [{ calificacion: null, enviado_a_google: false }],
    usage: [],
    proposals: [],
  });
  assert.ok(r.alertas.some((a) => a.includes("rojo")));
  assert.ok(r.alertas.some((a) => a.includes("sin calificar")));
  // con 1 lead agendado, no debe disparar "sin agendamientos"
  assert.ok(!r.alertas.some((a) => a.includes("sin agendamientos")));
});

test("propuestas: funnel, win-rate, pipeline/ganado por moneda, peldaño y alerta de seguimiento", () => {
  const r = buildHealthReport({
    ...empty,
    proposals: [
      { estado: "ganada", peldano: "N3", moneda: "CLP", precio_cotizado: 3000000, precio_cerrado: 2800000 },
      { estado: "perdida", peldano: "N1", moneda: "CLP", precio_cotizado: 500000, precio_cerrado: null },
      { estado: "enviada", peldano: "N2", moneda: "CLP", precio_cotizado: 800000, precio_cerrado: null },
      { estado: "borrador", peldano: null, moneda: "USD", precio_cotizado: 108, precio_cerrado: null },
    ],
  });
  assert.equal(r.propuestas.total, 4);
  assert.equal(r.propuestas.ganadas, 1);
  assert.equal(r.propuestas.perdidas, 1);
  assert.equal(r.propuestas.abiertas, 2); // enviada + borrador
  assert.equal(r.propuestas.win_rate_cerradas, 50); // 1 de 2 cerradas
  assert.equal(r.propuestas.por_estado["enviada"], 1);
  assert.equal(r.propuestas.por_peldano["N3"], 1);
  assert.equal(r.propuestas.por_peldano["sin_peldano"], 1);
  // valor: ganado usa precio_cerrado; pipeline abierto suma cotizado de no-cerradas, por moneda
  assert.equal(r.propuestas.valor_por_moneda["CLP"]!.ganado, 2800000);
  assert.equal(r.propuestas.valor_por_moneda["CLP"]!.pipeline_abierto, 800000); // solo la enviada
  assert.equal(r.propuestas.valor_por_moneda["USD"]!.pipeline_abierto, 108);
  assert.ok(r.alertas.some((a) => a.includes("esperando respuesta")));
});

test("propuestas vacías → win_rate 0, sin alerta de seguimiento", () => {
  const r = buildHealthReport(empty);
  assert.equal(r.propuestas.total, 0);
  assert.equal(r.propuestas.win_rate_cerradas, 0);
  assert.ok(!r.alertas.some((a) => a.includes("esperando respuesta")));
});
