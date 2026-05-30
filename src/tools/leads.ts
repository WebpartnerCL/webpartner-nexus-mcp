// ============================================================================
// tools/leads.ts — tools de leads (M1/M3):
//   classify_semaphore · upsert_lead · get_lead · update_funnel_stage ·
//   append_chat_memory
// Operan sobre leads_central / leads_semaforo_v vía el cliente Supabase tipado.
// ============================================================================
import type { ToolDef } from "./types.js";
import type { LeadInsert, LeadUpdate } from "../types.js";
import type { Json } from "../database.types.js";
import { FASES, ORIGENES } from "../types.js";
import { classifySemaphore } from "../core/semaphore.js";
import {
  asString,
  asNumber,
  requireString,
  serviceResolve,
  clienteIdProp,
} from "./shared.js";

// ── classify_semaphore (tenant-agnostic, no medido) ──────────────────────────
const classifySemaphoreTool: ToolDef = {
  name: "classify_semaphore",
  description:
    "Clasifica por recencia de última compra (M3): verde (<6m), amarillo (6-12m), rojo (>12m), null sin fecha.",
  inputSchema: {
    type: "object",
    properties: {
      fecha_ultima_compra: {
        type: ["string", "null"],
        description: "Fecha 'YYYY-MM-DD' de la última compra, o null.",
      },
    },
    required: ["fecha_ultima_compra"],
  },
  resolveCliente: () => null,
  handler: async (args) => {
    return { semaforo: classifySemaphore(asString(args.fecha_ultima_compra) ?? null) };
  },
};

// ── upsert_lead ───────────────────────────────────────────────────────────────
const upsertLeadTool: ToolDef = {
  name: "upsert_lead",
  description:
    "Crea o actualiza un lead. Con telefono_whatsapp hace upsert por (cliente_id, teléfono); sin él, inserta. Devuelve el lead.",
  inputSchema: {
    type: "object",
    properties: {
      ...clienteIdProp,
      nombre_completo: { type: "string" },
      telefono_whatsapp: { type: "string", description: "E.164, ej. +56912345678" },
      email: { type: "string" },
      origen: { type: "string", enum: [...ORIGENES] },
      necesidad: { type: "string" },
      fecha_ultima_compra: { type: "string", description: "YYYY-MM-DD (alimenta el semáforo)" },
      fase_embudo: { type: "string", enum: [...FASES] },
      lead_score: { type: "number", minimum: 0, maximum: 10 },
    },
    required: [],
  },
  resolveCliente: serviceResolve,
  handler: async (args, ctx) => {
    const clienteId = ctx.clienteId as string;
    const telefono = asString(args.telefono_whatsapp);

    const fields: LeadUpdate = {};
    const nombre = asString(args.nombre_completo);
    if (nombre !== undefined) fields.nombre_completo = nombre;
    const email = asString(args.email);
    if (email !== undefined) fields.email = email;
    const origen = asString(args.origen);
    if (origen !== undefined) fields.origen = origen;
    const necesidad = asString(args.necesidad);
    if (necesidad !== undefined) fields.necesidad = necesidad;
    const fultc = asString(args.fecha_ultima_compra);
    if (fultc !== undefined) fields.fecha_ultima_compra = fultc;
    const fase = asString(args.fase_embudo);
    if (fase !== undefined) fields.fase_embudo = fase;
    const score = asNumber(args.lead_score);
    if (score !== undefined) fields.lead_score = score;
    if (telefono !== undefined) fields.telefono_whatsapp = telefono;

    const sb = ctx.db;
    if (telefono) {
      const { data: existing, error: selErr } = await sb
        .from("leads_central")
        .select("id_lead")
        .eq("cliente_id", clienteId)
        .eq("telefono_whatsapp", telefono)
        .maybeSingle();
      if (selErr) throw new Error(`upsert_lead select: ${selErr.message}`);
      if (existing) {
        const { data, error } = await sb
          .from("leads_central")
          .update(fields)
          .eq("id_lead", existing.id_lead)
          .select()
          .single();
        if (error) throw new Error(`upsert_lead update: ${error.message}`);
        return { lead: data, accion: "actualizado" };
      }
    }

    const insertPayload: LeadInsert = { cliente_id: clienteId, ...fields };
    const { data, error } = await sb
      .from("leads_central")
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw new Error(`upsert_lead insert: ${error.message}`);
    return { lead: data, accion: "creado" };
  },
};

// ── get_lead ──────────────────────────────────────────────────────────────────
const getLeadTool: ToolDef = {
  name: "get_lead",
  description:
    "Obtiene un lead por id_lead o por telefono_whatsapp (incluye etiqueta_semaforo). Devuelve null si no existe.",
  inputSchema: {
    type: "object",
    properties: {
      ...clienteIdProp,
      id_lead: { type: "string" },
      telefono_whatsapp: { type: "string" },
    },
    required: [],
  },
  resolveCliente: serviceResolve,
  handler: async (args, ctx) => {
    const clienteId = ctx.clienteId as string;
    const idLead = asString(args.id_lead);
    const telefono = asString(args.telefono_whatsapp);
    if (!idLead && !telefono) {
      throw new Error("se requiere id_lead o telefono_whatsapp");
    }
    const base = ctx.db
      .from("leads_semaforo_v")
      .select("*")
      .eq("cliente_id", clienteId);
    const { data, error } = await (idLead
      ? base.eq("id_lead", idLead)
      : base.eq("telefono_whatsapp", telefono as string)
    ).maybeSingle();
    if (error) throw new Error(`get_lead: ${error.message}`);
    return { lead: data };
  },
};

// ── update_funnel_stage ───────────────────────────────────────────────────────
const updateFunnelStageTool: ToolDef = {
  name: "update_funnel_stage",
  description:
    "Actualiza la fase del embudo de un lead. fase_embudo ∈ {nuevo,dialogando_ia,agendado,cerrado,descartado,inactivo}.",
  inputSchema: {
    type: "object",
    properties: {
      ...clienteIdProp,
      id_lead: { type: "string" },
      fase_embudo: { type: "string", enum: [...FASES] },
    },
    required: ["id_lead", "fase_embudo"],
  },
  resolveCliente: serviceResolve,
  handler: async (args, ctx) => {
    const clienteId = ctx.clienteId as string;
    const idLead = requireString(args, "id_lead");
    const fase = requireString(args, "fase_embudo");
    if (!(FASES as readonly string[]).includes(fase)) {
      throw new Error(`fase_embudo inválida: ${fase}`);
    }
    const { data, error } = await ctx.db
      .from("leads_central")
      .update({ fase_embudo: fase })
      .eq("cliente_id", clienteId)
      .eq("id_lead", idLead)
      .select()
      .single();
    if (error) throw new Error(`update_funnel_stage: ${error.message}`);
    return { lead: data };
  },
};

// ── append_chat_memory ────────────────────────────────────────────────────────
const appendChatMemoryTool: ToolDef = {
  name: "append_chat_memory",
  description:
    "Agrega un turno {role,content,ts} a la memoria conversacional del lead (historial_chat_ia).",
  inputSchema: {
    type: "object",
    properties: {
      ...clienteIdProp,
      id_lead: { type: "string" },
      role: { type: "string", enum: ["user", "assistant"] },
      content: { type: "string" },
    },
    required: ["id_lead", "role", "content"],
  },
  resolveCliente: serviceResolve,
  handler: async (args, ctx) => {
    const clienteId = ctx.clienteId as string;
    const idLead = requireString(args, "id_lead");
    const role = requireString(args, "role");
    if (role !== "user" && role !== "assistant") {
      throw new Error(`role inválido: ${role}`);
    }
    const content = requireString(args, "content");

    const { data: cur, error: selErr } = await ctx.db
      .from("leads_central")
      .select("historial_chat_ia")
      .eq("cliente_id", clienteId)
      .eq("id_lead", idLead)
      .maybeSingle();
    if (selErr) throw new Error(`append_chat_memory select: ${selErr.message}`);
    if (!cur) throw new Error(`lead no encontrado: ${idLead}`);

    const historial: Json[] = Array.isArray(cur.historial_chat_ia)
      ? (cur.historial_chat_ia as Json[])
      : [];
    historial.push({ role, content, ts: new Date().toISOString() } as Json);

    const { data, error } = await ctx.db
      .from("leads_central")
      .update({ historial_chat_ia: historial })
      .eq("cliente_id", clienteId)
      .eq("id_lead", idLead)
      .select("id_lead, historial_chat_ia")
      .single();
    if (error) throw new Error(`append_chat_memory update: ${error.message}`);
    const turnos = Array.isArray(data.historial_chat_ia)
      ? data.historial_chat_ia.length
      : 0;
    return { id_lead: data.id_lead, turnos };
  },
};

export const leadTools: ToolDef[] = [
  classifySemaphoreTool,
  upsertLeadTool,
  getLeadTool,
  updateFunnelStageTool,
  appendChatMemoryTool,
];
