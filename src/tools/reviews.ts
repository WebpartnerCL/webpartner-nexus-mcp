// ============================================================================
// tools/reviews.ts — Reputación (M2): generate_review_link · route_review · log_review.
// Interceptor de reseñas: 1-3★ → feedback interno (fuera de Google); 4-5★ → Google.
// ============================================================================
import type { ToolDef, ToolArgs } from "./types.js";
import type { BaseContext } from "./types.js";
import type { ReviewUpdate } from "../types.js";
import { asString, asNumber, requireString, serviceResolve, clienteIdProp } from "./shared.js";
import { generateReviewToken } from "../core/keys.js";

/** Resuelve el cliente_id (para metering) a partir del token de la reseña. */
async function resolveClienteByToken(args: ToolArgs, ctx: BaseContext): Promise<string> {
  const token = asString(args.token);
  if (!token) throw new Error("falta el parámetro requerido: token");
  const { data, error } = await ctx.db
    .from("control_resenas")
    .select("cliente_id")
    .eq("token_unico", token)
    .maybeSingle();
  if (error) throw new Error(`reseña: ${error.message}`);
  if (!data) throw new Error("token de reseña inválido");
  return data.cliente_id;
}

// ── generate_review_link ──────────────────────────────────────────────────────
const generateReviewLinkTool: ToolDef = {
  name: "generate_review_link",
  description:
    "Crea un link único de reseña (M2) para un cliente/lead. Devuelve {url, token}. La landing /r/{slug}?t={token} enruta: 1-3★ → feedback interno; 4-5★ → Google.",
  inputSchema: {
    type: "object",
    properties: {
      ...clienteIdProp,
      id_lead: { type: "string", description: "Lead asociado (opcional; CSV puede no traerlo)." },
    },
    required: [],
  },
  resolveCliente: serviceResolve,
  handler: async (args, ctx) => {
    const cliente = ctx.cliente;
    if (!cliente) throw new Error("generate_review_link: cliente no resuelto");
    const token = generateReviewToken();
    const idLead = asString(args.id_lead) ?? null;

    const { error } = await ctx.db.from("control_resenas").insert({
      cliente_id: cliente.id,
      id_lead: idLead,
      token_unico: token,
      enviado_a_google: false,
    });
    if (error) throw new Error(`generate_review_link: ${error.message}`);

    const base = ctx.cfg.publicBaseUrl.replace(/\/+$/, "");
    return { url: `${base}/r/${cliente.slug}?t=${token}`, token };
  },
};

// ── route_review ────────────────────────────────────────────────────────────--
const routeReviewTool: ToolDef = {
  name: "route_review",
  description:
    "Registra la calificación de una reseña por token y devuelve el enrutamiento: 4-5★ → {action:'google', redirect_url}; 1-3★ → {action:'feedback'} (queda fuera de Google).",
  inputSchema: {
    type: "object",
    properties: {
      token: { type: "string" },
      rating: { type: "integer", minimum: 1, maximum: 5 },
    },
    required: ["token", "rating"],
  },
  resolveCliente: resolveClienteByToken,
  handler: async (args, ctx) => {
    const cliente = ctx.cliente;
    if (!cliente) throw new Error("route_review: cliente no resuelto");
    const token = requireString(args, "token");
    const rating = asNumber(args.rating);
    if (rating === undefined || rating < 1 || rating > 5) {
      throw new Error("rating debe ser un entero entre 1 y 5");
    }
    const calificacion = Math.round(rating);
    const aGoogle = calificacion >= 4;

    const { error } = await ctx.db
      .from("control_resenas")
      .update({ calificacion, enviado_a_google: aGoogle })
      .eq("token_unico", token);
    if (error) throw new Error(`route_review: ${error.message}`);

    return aGoogle
      ? { action: "google", redirect_url: cliente.google_review_url ?? null, calificacion }
      : { action: "feedback", redirect_url: null, calificacion };
  },
};

// ── log_review ────────────────────────────────────────────────────────────────
const logReviewTool: ToolDef = {
  name: "log_review",
  description:
    "Adjunta el feedback interno (caso 1-3★) a una reseña por token y/o ajusta enviado_a_google. Mantiene lo negativo fuera de Google.",
  inputSchema: {
    type: "object",
    properties: {
      token: { type: "string" },
      feedback_interno: {
        type: "string",
        description: "Texto del cliente sobre qué mejorar (solo 1-3★).",
      },
      enviado_a_google: { type: "boolean", description: "Override opcional del flag." },
    },
    required: ["token"],
  },
  resolveCliente: resolveClienteByToken,
  handler: async (args, ctx) => {
    const token = requireString(args, "token");
    const patch: ReviewUpdate = {};
    const fb = asString(args.feedback_interno);
    if (fb !== undefined) patch.feedback_interno = fb;
    if (typeof args.enviado_a_google === "boolean") {
      patch.enviado_a_google = args.enviado_a_google;
    }
    if (Object.keys(patch).length === 0) {
      throw new Error("nada que actualizar (envía feedback_interno o enviado_a_google)");
    }
    const { data, error } = await ctx.db
      .from("control_resenas")
      .update(patch)
      .eq("token_unico", token)
      .select("id_review, calificacion, enviado_a_google, feedback_interno")
      .single();
    if (error) throw new Error(`log_review: ${error.message}`);
    return { review: data };
  },
};

export const reviewTools: ToolDef[] = [
  generateReviewLinkTool,
  routeReviewTool,
  logReviewTool,
];
