// ============================================================================
// tools/report.ts — reporte mensual al cliente (Back-office MVP, módulo D).
//   client_report · resumen del período por tenant (captados/agendados/asistidos
//   /reseñas) + mensaje listo para enviar. Tenant-scoped (respeta el scope de la llave).
// ============================================================================
import type { ToolDef } from "./types.js";
import { asString, clienteIdProp, serviceResolve } from "./shared.js";
import {
  buildClientReport,
  type ReportLead,
  type ReportReview,
  type ReportSub,
} from "../core/report.js";

const ESTADOS_VIVOS = ["trial", "activa", "morosa", "suspendida"] as const;

function monthRange(periodo: string): { start: string; end: string } {
  const [y, m] = periodo.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
    end: new Date(Date.UTC(y, m, 1)).toISOString(),
  };
}

const clientReportTool: ToolDef = {
  name: "client_report",
  description:
    "Reporte mensual para el CLIENTE: cuántas personas escribieron, citas agendadas/asistidas y reseñas del período. Devuelve un mensaje listo para enviar.",
  inputSchema: {
    type: "object",
    properties: {
      ...clienteIdProp,
      periodo: { type: "string", description: "Mes YYYY-MM. Default: mes actual." },
    },
  },
  resolveCliente: serviceResolve,
  handler: async (args, ctx) => {
    const clienteId = ctx.clienteId!;
    const now = new Date();
    const periodo =
      asString(args.periodo) ??
      `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      throw new Error(`periodo inválido: ${periodo} (usa YYYY-MM)`);
    }
    const { start, end } = monthRange(periodo);

    const { data: leads, error: e1 } = await ctx.db
      .from("leads_central")
      .select("fase_embudo, cal_event_id, booking_show")
      .eq("cliente_id", clienteId)
      .gte("created_at", start)
      .lt("created_at", end);
    if (e1) throw new Error(`client_report leads: ${e1.message}`);

    const { data: resenas, error: e2 } = await ctx.db
      .from("control_resenas")
      .select("calificacion")
      .eq("cliente_id", clienteId)
      .gte("created_at", start)
      .lt("created_at", end);
    if (e2) throw new Error(`client_report resenas: ${e2.message}`);

    const { data: sub, error: e3 } = await ctx.db
      .from("suscripciones")
      .select("estado, peldano, base_monto, moneda")
      .eq("cliente_id", clienteId)
      .in("estado", [...ESTADOS_VIVOS])
      .maybeSingle();
    if (e3) throw new Error(`client_report sub: ${e3.message}`);

    return buildClientReport({
      nombreNegocio: ctx.cliente?.nombre_negocio ?? "tu negocio",
      periodo,
      leads: (leads ?? []) as ReportLead[],
      resenas: (resenas ?? []) as ReportReview[],
      suscripcion: (sub ?? null) as ReportSub | null,
    });
  },
};

export const reportTools: ToolDef[] = [clientReportTool];
