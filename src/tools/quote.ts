// ============================================================================
// tools/quote.ts — draft_quote: Copiloto de Cotización (Cliente Cero 2.2).
// Del discovery de un prospecto → peldaño + alcance + horas (Claude) → precio
// determinístico (core/pricing). El modelo NUNCA produce montos. Devuelve la
// cotización lista para que el Copiloto de Propuesta (2.3) la redacte.
// ============================================================================
import type { ToolDef, ToolArgs } from "./types.js";
import type { DbClient } from "../db.js";
import { resolveClienteId } from "../metering.js";
import { callBrain } from "../claude.js";
import { parseQuoteEnvelope } from "../core/quote.js";
import { priceForQuote, type Peldano } from "../core/pricing.js";
import { computeHorasPriors, type PropuestaHoras } from "../core/priors.js";
import {
  buildCotizarPrompt,
  type DiscoveryContext,
  type HorasPrior,
} from "../prompts/cotizar.js";
import { asString } from "./shared.js";

const CONFIANZA_MINIMA = 0.6;

/** Extrae la última entrada de discovery_form del historial del lead → DiscoveryContext. */
function discoveryFromHistorial(historial: unknown, necesidadLead?: string | null): DiscoveryContext {
  const arr = Array.isArray(historial) ? historial : [];
  let entry: Record<string, unknown> | null = null;
  for (const it of arr) {
    if (it && typeof it === "object" && (it as Record<string, unknown>).type === "discovery_form") {
      entry = it as Record<string, unknown>; // última gana
    }
  }
  if (!entry) return { necesidad: necesidadLead ?? undefined };
  const bant = (entry.bant && typeof entry.bant === "object" ? entry.bant : {}) as Record<string, unknown>;
  const roi = (entry.roi && typeof entry.roi === "object" ? entry.roi : {}) as Record<string, unknown>;
  const nec = Array.isArray(bant.necesidad) ? (bant.necesidad as unknown[]).join(", ") : undefined;
  return {
    empresa: typeof entry.empresa === "string" ? entry.empresa : undefined,
    rubro: typeof entry.rubro === "string" ? entry.rubro : undefined,
    necesidad: nec || (necesidadLead ?? undefined),
    madurez: typeof entry.madurez === "number" ? entry.madurez : null,
    tiempo: typeof bant.tiempo === "string" ? bant.tiempo : undefined,
    presupuesto: typeof bant.presupuesto === "string" ? bant.presupuesto : undefined,
    autoridad: typeof bant.autoridad === "string" ? bant.autoridad : undefined,
    roi: {
      rol: typeof roi.rol === "string" ? roi.rol : undefined,
      valor_hora: typeof roi.valor_hora === "number" ? roi.valor_hora : undefined,
      horas_semana: typeof roi.horas_semana === "number" ? roi.horas_semana : undefined,
      costo_anual: typeof roi.costo_anual === "number" ? roi.costo_anual : undefined,
    },
    integraciones: Array.isArray(entry.integraciones)
      ? (entry.integraciones as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined,
    texto_libre: typeof entry.clarify === "string" ? entry.clarify : undefined,
  };
}

/** Discovery explícito (args.discovery) → DiscoveryContext, con coerción suave. */
function discoveryFromArgs(raw: unknown): DiscoveryContext {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const roi = (d.roi && typeof d.roi === "object" ? d.roi : {}) as Record<string, unknown>;
  return {
    empresa: asString(d.empresa),
    rubro: asString(d.rubro),
    necesidad: asString(d.necesidad),
    madurez: typeof d.madurez === "number" ? d.madurez : null,
    tiempo: asString(d.tiempo),
    presupuesto: asString(d.presupuesto),
    autoridad: asString(d.autoridad),
    roi: {
      valor_hora: typeof roi.valor_hora === "number" ? roi.valor_hora : undefined,
      horas_semana: typeof roi.horas_semana === "number" ? roi.horas_semana : undefined,
      costo_anual: typeof roi.costo_anual === "number" ? roi.costo_anual : undefined,
    },
    integraciones: Array.isArray(d.integraciones)
      ? (d.integraciones as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined,
    texto_libre: asString(d.texto_libre),
  };
}

/** Bandas de horas por peldaño desde `propuestas` (prior vivo; prefiere reales → aprende con cada cierre). */
async function fetchHorasPriors(db: DbClient, clienteId: string): Promise<HorasPrior[]> {
  const { data, error } = await db
    .from("propuestas")
    .select("peldano, horas_estimadas, horas_reales")
    .eq("cliente_id", clienteId);
  if (error) throw new Error(`draft_quote priors: ${error.message}`);
  return computeHorasPriors((data ?? []) as PropuestaHoras[]);
}

const draftQuoteTool: ToolDef = {
  name: "draft_quote",
  description:
    "Copiloto de cotización. Dado el discovery de un prospecto (por id_lead o explícito), elige peldaño N0–N4 + alcance + horas (Claude) y calcula el precio con el motor determinístico (escalera oficial). NUNCA inventa montos. Devuelve {envelope, precio, horas_prior, listo_para_propuesta}.",
  inputSchema: {
    type: "object",
    properties: {
      cliente_id: { type: "string", description: "Tenant (WebPartner). Requerido con llave de servicio." },
      id_lead: { type: "string", description: "Si se entrega, carga el discovery del lead (última entrada discovery_form)." },
      discovery: {
        type: "object",
        description: "Discovery explícito {empresa,rubro,necesidad,madurez,tiempo,presupuesto,autoridad,roi,texto_libre}. Alternativa a id_lead.",
      },
      discovery_texto: { type: "string", description: "Discovery en texto libre (fallback)." },
      referido: { type: "boolean", description: "Aplica descuento referido (10%)." },
      cierre_rapido: { type: "boolean", description: "Aplica descuento cierre <7d (5%)." },
    },
    required: [],
  },
  resolveCliente: (args, ctx) => resolveClienteId(ctx.auth, asString(args.cliente_id)),
  handler: async (args: ToolArgs, ctx) => {
    const cliente = ctx.cliente;
    if (!cliente) throw new Error("draft_quote: cliente no resuelto");

    // 1) Resolver el discovery: id_lead > discovery explícito > texto libre.
    let discovery: DiscoveryContext;
    const idLead = asString(args.id_lead);
    if (idLead) {
      const { data, error } = await ctx.db
        .from("leads_central")
        .select("historial_chat_ia, necesidad")
        .eq("cliente_id", cliente.id)
        .eq("id_lead", idLead)
        .maybeSingle();
      if (error) throw new Error(`draft_quote lead: ${error.message}`);
      if (!data) throw new Error("draft_quote: lead no encontrado");
      discovery = discoveryFromHistorial(data.historial_chat_ia, data.necesidad);
    } else if (args.discovery) {
      discovery = discoveryFromArgs(args.discovery);
    } else {
      const texto = asString(args.discovery_texto);
      if (!texto) throw new Error("draft_quote: falta id_lead, discovery o discovery_texto");
      discovery = { texto_libre: texto };
    }

    // 2) Priors de horas (histórico vivo de propuestas).
    const priors = await fetchHorasPriors(ctx.db, cliente.id);

    // 3) Claude elige peldaño/alcance/horas → envelope validado.
    const raw = await callBrain({
      system: buildCotizarPrompt(discovery, priors),
      history: [],
      mensaje: "Genera la cotización en JSON puro siguiendo el esquema y las reglas. NO incluyas montos.",
      maxTokens: 1200,
    });
    const envelope = parseQuoteEnvelope(raw);

    // 4) Precio determinístico (solo si hay peldaño).
    const peldano = envelope.peldano as Peldano | null;
    const precio = peldano
      ? priceForQuote({
          peldano,
          addons: envelope.addons_sugeridos,
          referido: args.referido === true,
          cierreRapido: args.cierre_rapido === true,
        })
      : null;

    const horas_prior = peldano ? priors.find((p) => p.peldano === peldano) ?? null : null;

    const listo_para_propuesta =
      !!peldano &&
      envelope.confianza >= CONFIANZA_MINIMA &&
      envelope.needs_more_info.length === 0 &&
      precio?.cotizable === true;

    return { envelope, precio, horas_prior, listo_para_propuesta };
  },
};

export const quoteTools: ToolDef[] = [draftQuoteTool];
