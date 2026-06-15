// ============================================================================
// tools/proposal.ts — draft_proposal: Copiloto de Propuesta (Cliente Cero 2.3).
// Toma una cotización YA determinística (resultado de draft_quote) y la redacta
// como propuesta comercial completa (Markdown) en voz WebPartner. Las cifras se
// formatean aquí (deterministas) y se insertan verbatim: el modelo NO recalcula.
// ============================================================================
import type { ToolDef, ToolArgs } from "./types.js";
import { resolveClienteId } from "../metering.js";
import { callBrain } from "../claude.js";
import { buildPropuestaPrompt, type PropuestaInput } from "../prompts/propuesta.js";
import type { PriceBlock } from "../core/pricing.js";
import type { Database } from "../database.types.js";
import { asString } from "./shared.js";

type PropuestaUpdate = Database["public"]["Tables"]["propuestas"]["Update"];
type PropuestaInsert = Database["public"]["Tables"]["propuestas"]["Insert"];

type Ficha = Pick<
  PropuestaInput,
  | "peldano_nombre"
  | "setup_texto"
  | "recurrente_texto"
  | "addons_texto"
  | "descuento_texto"
  | "total_texto"
  | "condiciones_pago"
>;

function n(x: number): string {
  return Math.round(x).toLocaleString("es-CL");
}
function fmtBanda(b: { min: number; max: number }, moneda: string): string {
  const pre = moneda === "USD" ? "USD " : "CLP $";
  return b.min === b.max ? `${pre}${n(b.min)}` : `${pre}${n(b.min)}–${n(b.max)}`;
}

/** Bloque de precio determinístico → ficha de strings exactos para la propuesta. PURA. */
export function fichaFromPrecio(p: PriceBlock): Ficha {
  return {
    peldano_nombre: `${p.peldano} ${p.nombre}`,
    setup_texto: fmtBanda(p.setup, p.moneda_base),
    recurrente_texto: `${fmtBanda(p.recurrente, p.recurrente.moneda)} ${p.recurrente.label}`,
    addons_texto: p.addons.length
      ? p.addons.map((a) => `${a.nombre} (${fmtBanda(a, a.moneda)})`).join("; ")
      : "ninguno",
    descuento_texto: p.descuento ? `${p.descuento.tipo} ${p.descuento.pct}%` : "ninguno",
    total_texto: fmtBanda(p.total_setup, p.moneda_base),
    condiciones_pago: p.condiciones_pago,
  };
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x.trim() : String(x))).filter((x) => x.length > 0);
}

const draftProposalTool: ToolDef = {
  name: "draft_proposal",
  description:
    "Copiloto de propuesta. Dada una cotización determinística (resultado de draft_quote) + datos del prospecto, redacta la propuesta comercial completa en Markdown (voz WebPartner, 0-slop). Las cifras se insertan verbatim, no se recalculan. Devuelve {propuesta_md, peldano, empresa}. Rechaza cotizaciones no cotizables (ej. N3).",
  inputSchema: {
    type: "object",
    properties: {
      cliente_id: { type: "string", description: "Tenant (WebPartner). Requerido con llave de servicio." },
      cotizacion: {
        type: "object",
        description: "Resultado de draft_quote: {envelope:{alcance,supuestos,horas_estimadas,...}, precio:{...}}.",
      },
      prospecto: {
        type: "object",
        description: "{empresa (req), contacto, rubro, dolor, fecha_discovery}.",
      },
    },
    required: ["cotizacion"],
  },
  resolveCliente: (args, ctx) => resolveClienteId(ctx.auth, asString(args.cliente_id)),
  handler: async (args: ToolArgs, ctx) => {
    void ctx; // redacción pura; el tenant se resuelve solo para metering
    const cot = args.cotizacion && typeof args.cotizacion === "object" ? (args.cotizacion as Record<string, unknown>) : null;
    if (!cot) throw new Error("draft_proposal: falta 'cotizacion' (resultado de draft_quote)");

    const precio = cot.precio as PriceBlock | null | undefined;
    if (!precio || precio.cotizable !== true) {
      return {
        ok: false,
        redactado: false,
        motivo: precio?.motivo_no_cotizable ?? "La cotización no es cotizable o no fue provista; no se redacta propuesta.",
      };
    }

    const envelope = (cot.envelope && typeof cot.envelope === "object" ? cot.envelope : {}) as Record<string, unknown>;
    const prospecto = (args.prospecto && typeof args.prospecto === "object" ? args.prospecto : {}) as Record<string, unknown>;
    const empresa = asString(prospecto.empresa);
    if (!empresa) throw new Error("draft_proposal: falta prospecto.empresa");

    const horas = typeof envelope.horas_estimadas === "number" ? envelope.horas_estimadas : null;
    const input: PropuestaInput = {
      empresa,
      contacto: asString(prospecto.contacto),
      rubro: asString(prospecto.rubro),
      dolor: asString(prospecto.dolor),
      fecha_envio: new Date().toISOString().slice(0, 10),
      fecha_discovery: asString(prospecto.fecha_discovery),
      alcance: toStringArray(envelope.alcance),
      supuestos: toStringArray(envelope.supuestos),
      horas_texto: horas ? `~${horas}h` : "a estimar en kickoff",
      ...fichaFromPrecio(precio),
    };

    const propuesta_md = await callBrain({
      system: buildPropuestaPrompt(input),
      history: [],
      mensaje: "Redacta la propuesta completa en Markdown puro, siguiendo la estructura y la voz. Inserta las cifras de la FICHA textualmente.",
      maxTokens: 4096,
    });

    return { ok: true, redactado: true, propuesta_md: propuesta_md.trim(), peldano: precio.peldano, empresa };
  },
};

// ── close_proposal: cierra el bucle de aprendizaje (Cliente Cero 3.4) ──────────
const closeProposalTool: ToolDef = {
  name: "close_proposal",
  description:
    "Cierra una propuesta (ganada/perdida) con su motivo y horas/precio reales. Actualiza la matriz `propuestas` — los `horas_reales` afinan el prior de las próximas cotizaciones — y mueve el lead vinculado a cerrado/descartado.",
  inputSchema: {
    type: "object",
    properties: {
      cliente_id: { type: "string", description: "Tenant. Requerido con llave de servicio." },
      id: { type: "string", description: "id (uuid) de la fila en `propuestas`." },
      resultado: { type: "string", enum: ["ganada", "perdida"], description: "Desenlace del cierre." },
      motivo: { type: "string", description: "Motivo del cierre (texto libre)." },
      horas_reales: { type: "number", description: "Horas reales que tomó el proyecto (alimenta el prior de cotización)." },
      precio_cerrado: { type: "number", description: "Monto realmente cerrado." },
    },
    required: ["id", "resultado"],
  },
  resolveCliente: (args, ctx) => resolveClienteId(ctx.auth, asString(args.cliente_id)),
  handler: async (args: ToolArgs, ctx) => {
    const cliente = ctx.cliente;
    if (!cliente) throw new Error("close_proposal: cliente no resuelto");
    const id = asString(args.id);
    if (!id) throw new Error("close_proposal: falta 'id' de la propuesta");
    const resultado = asString(args.resultado);
    if (resultado !== "ganada" && resultado !== "perdida") {
      throw new Error("close_proposal: 'resultado' debe ser 'ganada' o 'perdida'");
    }

    const patch: PropuestaUpdate = {
      estado: resultado,
      fecha_cierre: new Date().toISOString(),
    };
    const motivo = asString(args.motivo);
    if (motivo) patch.motivo_cierre = motivo;
    if (typeof args.horas_reales === "number") patch.horas_reales = args.horas_reales;
    if (typeof args.precio_cerrado === "number") patch.precio_cerrado = args.precio_cerrado;

    const { data: prop, error } = await ctx.db
      .from("propuestas")
      .update(patch)
      .eq("cliente_id", cliente.id)
      .eq("id", id)
      .select("id, lead_id, estado, peldano, horas_reales, precio_cerrado")
      .single();
    if (error) throw new Error(`close_proposal: ${error.message}`);

    // Mueve el lead vinculado de etapa (cerrado si ganada, descartado si perdida).
    let lead_actualizado = false;
    if (prop.lead_id) {
      const fase = resultado === "ganada" ? "cerrado" : "descartado";
      const { error: lerr } = await ctx.db
        .from("leads_central")
        .update({ fase_embudo: fase })
        .eq("cliente_id", cliente.id)
        .eq("id_lead", prop.lead_id);
      lead_actualizado = !lerr;
    }

    return { ok: true, propuesta: prop, lead_actualizado };
  },
};

// ── log_proposal: registra una propuesta enviada (Cliente Cero 3.2) ───────────
// Crea la fila en `propuestas` (estado 'enviada' por defecto). Devuelve el id para
// que luego `close_proposal` la cierre. Es el otro extremo del ciclo de la matriz.
const logProposalTool: ToolDef = {
  name: "log_proposal",
  description:
    "Registra una propuesta en la matriz `propuestas` (por defecto estado 'enviada' con fecha_envio=hoy). Devuelve su id para cerrarla luego con close_proposal. Es el inicio del ciclo de aprendizaje de la cotización.",
  inputSchema: {
    type: "object",
    properties: {
      cliente_id: { type: "string", description: "Tenant. Requerido con llave de servicio." },
      proyecto: { type: "string", description: "Nombre del proyecto/propuesta (ej. 'El Secano — N1 Captación')." },
      lead_id: { type: "string", description: "Lead vinculado (uuid) — opcional pero recomendado." },
      peldano: { type: "string", description: "N0–N4." },
      alcance: { type: "string", description: "Resumen del alcance (texto)." },
      horas_estimadas: { type: "number" },
      precio_cotizado: { type: "number" },
      moneda: { type: "string", description: "CLP|USD (default CLP)." },
      estado: { type: "string", description: "borrador|enviada|ganada|perdida (default enviada)." },
      notas: { type: "string" },
    },
    required: ["proyecto"],
  },
  resolveCliente: (args, ctx) => resolveClienteId(ctx.auth, asString(args.cliente_id)),
  handler: async (args: ToolArgs, ctx) => {
    const cliente = ctx.cliente;
    if (!cliente) throw new Error("log_proposal: cliente no resuelto");
    const proyecto = asString(args.proyecto);
    if (!proyecto) throw new Error("log_proposal: falta 'proyecto'");
    const estado = asString(args.estado) ?? "enviada";

    const row: PropuestaInsert = {
      cliente_id: cliente.id,
      proyecto,
      estado,
      moneda: asString(args.moneda) ?? "CLP",
    };
    const leadId = asString(args.lead_id);
    if (leadId) row.lead_id = leadId;
    const peldano = asString(args.peldano);
    if (peldano) row.peldano = peldano;
    const alcance = asString(args.alcance);
    if (alcance) row.alcance = alcance;
    if (typeof args.horas_estimadas === "number") row.horas_estimadas = args.horas_estimadas;
    if (typeof args.precio_cotizado === "number") row.precio_cotizado = args.precio_cotizado;
    const notas = asString(args.notas);
    if (notas) row.notas = notas;
    if (estado === "enviada") row.fecha_envio = new Date().toISOString();

    const { data, error } = await ctx.db
      .from("propuestas")
      .insert(row)
      .select("id, proyecto, peldano, estado, fecha_envio")
      .single();
    if (error) throw new Error(`log_proposal: ${error.message}`);
    return { ok: true, propuesta: data };
  },
};

export const proposalTools: ToolDef[] = [draftProposalTool, closeProposalTool, logProposalTool];
