// ============================================================================
// tools/qualify.ts — qualify_lead: el cerebro conversacional (M1/M3).
// Carga el prompt del tenant + historial, llama a Claude y devuelve el envelope
// JSON normalizado. n8n manda envelope.respuesta_cliente y persiste el resto.
// ============================================================================
import type { ToolDef, ToolArgs } from "./types.js";
import type { ChatMessage } from "../types.js";
import { resolveClienteId } from "../metering.js";
import { callBrain } from "../claude.js";
import { parseEnvelope, normalizeFase } from "../core/envelope.js";
import {
  buildVirtualPartnerPrompt,
  buildReactivacionPrompt,
} from "../prompts/index.js";
import { asString } from "./shared.js";

/** Coacciona un Json[] (historial_chat_ia) a ChatMessage[] válido. */
function coerceHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  for (const it of raw) {
    if (it && typeof it === "object") {
      const o = it as Record<string, unknown>;
      const r = o.role;
      const c = o.content;
      if ((r === "user" || r === "assistant") && typeof c === "string") {
        out.push({ role: r, content: c, ts: typeof o.ts === "string" ? o.ts : "" });
      }
    }
  }
  return out;
}

const qualifyLeadTool: ToolDef = {
  name: "qualify_lead",
  description:
    "Cerebro conversacional (M1/M3). Dado un mensaje entrante (+ historial), responde como el agente y devuelve un envelope JSON {respuesta_cliente, intencion, calificado, lead_score, fase_sugerida, escalar_humano}. n8n manda respuesta_cliente al WhatsApp y persiste el resto.",
  inputSchema: {
    type: "object",
    properties: {
      cliente_id: {
        type: "string",
        description: "Tenant. Requerido con llave de servicio; ignorado con llave de tenant.",
      },
      mensaje: { type: "string", description: "Mensaje entrante del lead (turno actual)." },
      id_lead: {
        type: "string",
        description: "Si se entrega y no hay 'historial', carga el historial del lead.",
      },
      historial: {
        type: "array",
        description: "Historial explícito [{role,content}]. Si falta, se usa el del lead (por id_lead).",
        items: {
          type: "object",
          properties: {
            role: { type: "string", enum: ["user", "assistant"] },
            content: { type: "string" },
          },
        },
      },
      persona: {
        type: "string",
        enum: ["m1", "m3"],
        description: "m1 = VirtualPartner (recepción/calificación); m3 = Reactivación. Default m1.",
      },
      color_semaforo: { type: "string", description: "M3: verde | amarillo | rojo." },
      promo_segmento: { type: "string", description: "M3: descripción de la promoción vigente." },
    },
    required: ["mensaje"],
  },
  resolveCliente: (args, ctx) => resolveClienteId(ctx.auth, asString(args.cliente_id)),
  handler: async (args: ToolArgs, ctx) => {
    const cliente = ctx.cliente;
    if (!cliente) throw new Error("qualify_lead: cliente no resuelto");
    const mensaje = asString(args.mensaje);
    if (!mensaje) throw new Error("falta el parámetro requerido: mensaje");

    // Historial: explícito, o cargado del lead por id_lead, o vacío.
    let history: ChatMessage[] = [];
    if (Array.isArray(args.historial)) {
      history = coerceHistory(args.historial);
    } else {
      const idLead = asString(args.id_lead);
      if (idLead) {
        const { data, error } = await ctx.db
          .from("leads_central")
          .select("historial_chat_ia")
          .eq("cliente_id", cliente.id)
          .eq("id_lead", idLead)
          .maybeSingle();
        if (error) throw new Error(`qualify_lead historial: ${error.message}`);
        history = coerceHistory(data?.historial_chat_ia);
      }
    }

    const persona = asString(args.persona) === "m3" ? "m3" : "m1";
    const system =
      persona === "m3"
        ? buildReactivacionPrompt(
            cliente,
            asString(args.color_semaforo) ?? "amarillo",
            asString(args.promo_segmento) ?? "(promoción vigente)"
          )
        : buildVirtualPartnerPrompt(cliente);

    const raw = await callBrain({ system, history, mensaje });
    const envelope = parseEnvelope(raw);
    return {
      envelope,
      fase_normalizada: normalizeFase(envelope.fase_sugerida),
    };
  },
};

export const brainTools: ToolDef[] = [qualifyLeadTool];
