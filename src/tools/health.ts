// ============================================================================
// tools/health.ts — nexus_health: panel de salud ejecutivo (N4) por tenant.
// Read-only. Agrega embudo, semáforo, reseñas y actividad del mes desde la
// Bóveda Nexus y devuelve un resumen + alertas operativas. Scoped por la API
// key: servicio → cualquier tenant (vía cliente_id); tenant → solo el suyo.
// El cálculo vive en core/health.ts (puro/testeable); aquí solo se hace I/O.
// ============================================================================
import type { ToolDef } from "./types.js";
import { serviceResolve, clienteIdProp } from "./shared.js";
import { monthStartISO } from "../core/quota.js";
import { buildHealthReport } from "../core/health.js";

const nexusHealthTool: ToolDef = {
  name: "nexus_health",
  description:
    "Panel de salud ejecutivo del tenant (read-only): embudo por fase, semáforo de recencia, " +
    "reseñas y actividad del mes, con alertas operativas. Con llave de servicio requiere cliente_id.",
  inputSchema: {
    type: "object",
    properties: { ...clienteIdProp },
    required: [],
  },
  resolveCliente: serviceResolve,
  handler: async (_args, ctx) => {
    const clienteId = ctx.clienteId as string;
    const sb = ctx.db;

    const { data: leads, error: lErr } = await sb
      .from("leads_semaforo_v")
      .select("fase_embudo, origen, lead_score, cal_event_id, etiqueta_semaforo")
      .eq("cliente_id", clienteId);
    if (lErr) throw new Error(`nexus_health leads: ${lErr.message}`);

    const { data: reviews, error: rErr } = await sb
      .from("control_resenas")
      .select("calificacion, enviado_a_google")
      .eq("cliente_id", clienteId);
    if (rErr) throw new Error(`nexus_health reviews: ${rErr.message}`);

    const { data: usage, error: uErr } = await sb
      .from("usage_events")
      .select("tool, units")
      .eq("cliente_id", clienteId)
      .gte("ts", monthStartISO());
    if (uErr) throw new Error(`nexus_health usage: ${uErr.message}`);

    const { data: proposals, error: pErr } = await sb
      .from("propuestas")
      .select("estado, peldano, moneda, precio_cotizado, precio_cerrado")
      .eq("cliente_id", clienteId);
    if (pErr) throw new Error(`nexus_health propuestas: ${pErr.message}`);

    const report = buildHealthReport({
      leads: leads ?? [],
      reviews: reviews ?? [],
      usage: usage ?? [],
      proposals: proposals ?? [],
    });

    return {
      cliente: ctx.cliente?.slug ?? clienteId,
      generado_en: new Date().toISOString(),
      ...report,
    };
  },
};

export const healthTools: ToolDef[] = [nexusHealthTool];
