// ============================================================================
// tools/scheduling.ts — schedule_appointment (Cal.com, Fase 1: registrar).
// La selección de hora ocurre en el enlace/embed de Cal.com del tenant
// (autoservicio). Este tool persiste el resultado — típicamente disparado por el
// webhook 'booking.created' de Cal.com vía n8n.
// (Reserva por API de Cal.com = mejora Fase 2: requiere api_key + eventTypeId por tenant.)
// ============================================================================
import type { ToolDef } from "./types.js";
import type { LeadUpdate } from "../types.js";
import { asString, requireString, serviceResolve, clienteIdProp } from "./shared.js";

const scheduleAppointmentTool: ToolDef = {
  name: "schedule_appointment",
  description:
    "Registra que un lead agendó: marca fase_embudo='agendado' y guarda cal_event_id. La hora se elige en el Cal.com del tenant (autoservicio); normalmente lo dispara el webhook 'booking.created' de Cal.com vía n8n.",
  inputSchema: {
    type: "object",
    properties: {
      ...clienteIdProp,
      id_lead: { type: "string", description: "Lead que agendó." },
      cal_event_id: {
        type: "string",
        description: "ID del evento/booking en Cal.com (del payload del webhook).",
      },
    },
    required: ["id_lead"],
  },
  resolveCliente: serviceResolve,
  handler: async (args, ctx) => {
    const clienteId = ctx.clienteId as string;
    const idLead = requireString(args, "id_lead");

    const patch: LeadUpdate = { fase_embudo: "agendado" };
    const calEventId = asString(args.cal_event_id);
    if (calEventId !== undefined) patch.cal_event_id = calEventId;

    const { data, error } = await ctx.db
      .from("leads_central")
      .update(patch)
      .eq("cliente_id", clienteId)
      .eq("id_lead", idLead)
      .select()
      .single();
    if (error) throw new Error(`schedule_appointment: ${error.message}`);
    return { lead: data };
  },
};

// ── set_booking_show: registra asistencia a la cita (base del fee de performance) ──
const setBookingShowTool: ToolDef = {
  name: "set_booking_show",
  description:
    "Registra si un lead ASISTIÓ a su cita (booking_show): true=asistió, false=no-show. Es la base del fee por performance del retainer (solo se cobra el agendado que asistió). Match por id_lead o teléfono.",
  inputSchema: {
    type: "object",
    properties: {
      ...clienteIdProp,
      id_lead: { type: "string", description: "Lead (uuid). Alternativa a 'telefono'." },
      telefono: { type: "string", description: "Teléfono E.164 del lead. Alternativa a 'id_lead'." },
      asistio: { type: "boolean", description: "true = asistió · false = no-show." },
    },
    required: ["asistio"],
  },
  resolveCliente: serviceResolve,
  handler: async (args, ctx) => {
    const clienteId = ctx.clienteId as string;
    const asistio = args.asistio === true;
    const idLead = asString(args.id_lead);
    const tel = asString(args.telefono);
    if (!idLead && !tel) throw new Error("set_booking_show: falta 'id_lead' o 'telefono'");

    const base = ctx.db.from("leads_central").update({ booking_show: asistio }).eq("cliente_id", clienteId);
    const filtered = idLead ? base.eq("id_lead", idLead) : base.eq("telefono_whatsapp", tel as string);
    const { data, error } = await filtered.select("id_lead, nombre_completo, booking_show").maybeSingle();
    if (error) throw new Error(`set_booking_show: ${error.message}`);
    return { ok: true, lead: data };
  },
};

export const schedulingTools: ToolDef[] = [scheduleAppointmentTool, setBookingShowTool];
