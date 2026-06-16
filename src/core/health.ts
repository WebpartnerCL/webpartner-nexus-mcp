// ============================================================================
// core/health.ts — agregación del panel de salud ejecutivo (N4). Lógica pura.
// Recibe filas crudas (leads, reseñas, uso del mes) y produce el resumen
// operativo + alertas accionables. Sin I/O: testeable en proceso. El tool
// tools/health.ts hace la lectura de Supabase y delega el cálculo aquí.
//   · embudo: conteo por fase_embudo (sembrado con todas las FASES en 0)
//   · semáforo: recencia de compra (verde/amarillo/rojo/sin_dato)
//   · reseñas: positivas 4-5★ vs feedback interno 1-3★ vs pendientes
//   · actividad: unidades de usage_events del mes por tool
// ============================================================================
import { FASES, SEMAFOROS } from "../types.js";

export interface HealthLeadRow {
  fase_embudo: string | null;
  origen: string | null;
  lead_score: number | null;
  cal_event_id: string | null;
  etiqueta_semaforo: string | null;
}

export interface HealthReviewRow {
  calificacion: number | null;
  enviado_a_google: boolean;
}

export interface HealthUsageRow {
  tool: string;
  units: number | null;
}

export interface HealthProposalRow {
  estado: string;
  peldano: string | null;
  moneda: string;
  precio_cotizado: number | null;
  precio_cerrado: number | null;
}

export interface HealthInput {
  leads: HealthLeadRow[];
  reviews: HealthReviewRow[];
  usage: HealthUsageRow[];
  proposals: HealthProposalRow[];
}

export interface HealthReport {
  leads: {
    total: number;
    por_fase: Record<string, number>;
    por_origen: Record<string, number>;
    por_semaforo: Record<string, number>;
    agendados_con_evento: number;
    score_promedio: number;
  };
  reviews: {
    total: number;
    positivas_4_5: number;
    feedback_interno_1_3: number;
    pendientes: number;
    enviadas_a_google: number;
  };
  actividad_mes: {
    total_unidades: number;
    eventos: number;
    por_tool: Record<string, number>;
  };
  propuestas: {
    total: number;
    por_estado: Record<string, number>;
    ganadas: number;
    perdidas: number;
    abiertas: number;
    win_rate_cerradas: number; // % (0-100) sobre propuestas cerradas (ganadas+perdidas)
    por_peldano: Record<string, number>;
    valor_por_moneda: Record<string, { pipeline_abierto: number; ganado: number }>;
  };
  alertas: string[];
}

// Etiquetas del semáforo + el bucket "sin_dato" (lead sin fecha de última compra).
const SEMAFORO_KEYS = [...SEMAFOROS, "sin_dato"] as const;

/** Agrega las filas de la Bóveda Nexus en el panel de salud ejecutivo del tenant. */
export function buildHealthReport(input: HealthInput): HealthReport {
  // Sembrar las fases/semáforos conocidos en 0 para un panel estable entre lecturas.
  const por_fase: Record<string, number> = {};
  for (const f of FASES) por_fase[f] = 0;
  const por_semaforo: Record<string, number> = {};
  for (const s of SEMAFORO_KEYS) por_semaforo[s] = 0;
  const por_origen: Record<string, number> = {};

  let agendados = 0;
  let sumaScore = 0;
  for (const l of input.leads) {
    const fase = l.fase_embudo ?? "desconocido";
    por_fase[fase] = (por_fase[fase] ?? 0) + 1;
    const origen = l.origen ?? "desconocido";
    por_origen[origen] = (por_origen[origen] ?? 0) + 1;
    const sem = l.etiqueta_semaforo ?? "sin_dato";
    por_semaforo[sem] = (por_semaforo[sem] ?? 0) + 1;
    if (l.cal_event_id) agendados += 1;
    sumaScore += l.lead_score ?? 0;
  }
  const totalLeads = input.leads.length;
  const score_promedio =
    totalLeads === 0 ? 0 : Math.round((sumaScore / totalLeads) * 10) / 10;

  let positivas = 0;
  let internas = 0;
  let pendientes = 0;
  let google = 0;
  for (const r of input.reviews) {
    if (r.enviado_a_google) google += 1;
    if (r.calificacion == null) pendientes += 1;
    else if (r.calificacion >= 4) positivas += 1;
    else internas += 1;
  }

  const por_tool: Record<string, number> = {};
  let totalUnidades = 0;
  for (const u of input.usage) {
    const units = u.units ?? 0;
    por_tool[u.tool] = (por_tool[u.tool] ?? 0) + units;
    totalUnidades += units;
  }

  // ── Propuestas (funnel de cotización / aprendizaje F1) ───────────────────────
  const prop_por_estado: Record<string, number> = {};
  const prop_por_peldano: Record<string, number> = {};
  const valor_por_moneda: Record<string, { pipeline_abierto: number; ganado: number }> = {};
  let ganadas = 0;
  let perdidas = 0;
  let abiertas = 0;
  for (const p of input.proposals) {
    const estado = p.estado || "desconocido";
    prop_por_estado[estado] = (prop_por_estado[estado] ?? 0) + 1;
    const peldano = p.peldano ?? "sin_peldano";
    prop_por_peldano[peldano] = (prop_por_peldano[peldano] ?? 0) + 1;

    const moneda = p.moneda || "CLP";
    let bucket = valor_por_moneda[moneda];
    if (!bucket) {
      bucket = { pipeline_abierto: 0, ganado: 0 };
      valor_por_moneda[moneda] = bucket;
    }
    if (estado === "ganada") {
      ganadas += 1;
      bucket.ganado += p.precio_cerrado ?? p.precio_cotizado ?? 0;
    } else if (estado === "perdida") {
      perdidas += 1;
    } else {
      abiertas += 1; // borrador / enviada / negociacion / etc.
      bucket.pipeline_abierto += p.precio_cotizado ?? 0;
    }
  }
  for (const m of Object.keys(valor_por_moneda)) {
    const b = valor_por_moneda[m]!;
    b.pipeline_abierto = Math.round(b.pipeline_abierto);
    b.ganado = Math.round(b.ganado);
  }
  const cerradas = ganadas + perdidas;
  const win_rate_cerradas =
    cerradas === 0 ? 0 : Math.round((ganadas / cerradas) * 1000) / 10;

  // ── Alertas operativas (la "señal de salud", no solo conteos) ────────────────
  const alertas: string[] = [];
  if (totalLeads > 0) {
    const nuevos = por_fase["nuevo"] ?? 0;
    if (agendados === 0) {
      alertas.push(
        "Embudo sin agendamientos: ningún lead tiene evento de Cal.com (cal_event_id). " +
          "Revisa el deploy del workflow Cal.com→fase_embudo."
      );
    }
    if (nuevos / totalLeads > 0.5) {
      alertas.push(
        `${nuevos}/${totalLeads} leads siguen en 'nuevo': el embudo no avanza de fase automáticamente.`
      );
    }
    const rojos = por_semaforo["rojo"] ?? 0;
    if (rojos > 0) {
      alertas.push(
        `${rojos} lead(s) en semáforo rojo (>12m sin compra): candidatos a reactivación.`
      );
    }
  }
  if (pendientes > 0) {
    alertas.push(`${pendientes} reseña(s) con link generado pero sin calificar.`);
  }
  const enviadas = prop_por_estado["enviada"] ?? 0;
  if (enviadas > 0) {
    alertas.push(
      `${enviadas} propuesta(s) enviada(s) esperando respuesta: candidatas a seguimiento.`
    );
  }

  return {
    leads: {
      total: totalLeads,
      por_fase,
      por_origen,
      por_semaforo,
      agendados_con_evento: agendados,
      score_promedio,
    },
    reviews: {
      total: input.reviews.length,
      positivas_4_5: positivas,
      feedback_interno_1_3: internas,
      pendientes,
      enviadas_a_google: google,
    },
    actividad_mes: {
      total_unidades: totalUnidades,
      eventos: input.usage.length,
      por_tool,
    },
    propuestas: {
      total: input.proposals.length,
      por_estado: prop_por_estado,
      ganadas,
      perdidas,
      abiertas,
      win_rate_cerradas,
      por_peldano: prop_por_peldano,
      valor_por_moneda,
    },
    alertas,
  };
}
