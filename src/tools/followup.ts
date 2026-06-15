// ============================================================================
// tools/followup.ts — draft_followup: Seguimiento Autónomo (Cliente Cero 3.3).
// Para una propuesta `enviada` que lleva días sin respuesta, redacta UN follow-up
// con ángulo nuevo (lee los ya usados de `propuestas.notas` para no repetir) y,
// opcionalmente, registra el ángulo usado. La redacción la hace Claude; el precio
// y el estado NO se tocan aquí (eso es close_proposal). Va a una cola HITL en n8n.
// ============================================================================
import type { ToolDef, ToolArgs } from "./types.js";
import { resolveClienteId } from "../metering.js";
import { callBrain } from "../claude.js";
import { buildSeguimientoPrompt, type SeguimientoInput } from "../prompts/seguimiento.js";
import {
  parseFollowupEnvelope,
  priorAnglesFromNotas,
  formatAngleNote,
  diasDesde,
} from "../core/followup.js";
import { asString } from "./shared.js";

function uniqStrings(...lists: (string[] | undefined)[]): string[] {
  const out: string[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const x of list) {
      const v = typeof x === "string" ? x.trim() : "";
      if (v && !out.includes(v)) out.push(v);
    }
  }
  return out;
}

const draftFollowupTool: ToolDef = {
  name: "draft_followup",
  description:
    "Seguimiento autónomo. Para una propuesta `enviada` sin respuesta hace días, redacta UN follow-up con ángulo nuevo (lee de `propuestas.notas` los ángulos ya usados para no repetir) en voz WebPartner. Pasa `id` (uuid de propuestas) y carga solo el contexto; o pasa los campos sueltos. Con `registrar_angulo:true` anexa el ángulo a `notas`. Devuelve {mensaje, angulo, canal, telefono, empresa} para una cola HITL. No cambia estado ni precio.",
  inputSchema: {
    type: "object",
    properties: {
      cliente_id: { type: "string", description: "Tenant (WebPartner). Requerido con llave de servicio." },
      id: { type: "string", description: "uuid de la fila en `propuestas` — carga proyecto/peldaño/alcance/fecha_envio/lead/notas." },
      empresa: { type: "string", description: "Override del nombre de la empresa (si no hay `id`)." },
      contacto: { type: "string", description: "Nombre del contacto (override)." },
      rubro: { type: "string" },
      dolor: { type: "string", description: "Necesidad/cuello de botella del discovery (override)." },
      alcance: { type: "string", description: "Resumen de lo propuesto (override)." },
      dias_sin_respuesta: { type: "number", description: "Override; si hay `id` se calcula de fecha_envio." },
      intentos_previos: { type: "array", items: { type: "string" }, description: "Ángulos ya usados a NO repetir (se suman a los de notas)." },
      canal: { type: "string", description: "whatsapp|email (default whatsapp)." },
      registrar_angulo: { type: "boolean", description: "Si true y hay `id`, anexa el ángulo usado a `propuestas.notas` (rota el ángulo en la próxima corrida)." },
    },
    required: [],
  },
  resolveCliente: (args, ctx) => resolveClienteId(ctx.auth, asString(args.cliente_id)),
  handler: async (args: ToolArgs, ctx) => {
    const cliente = ctx.cliente;
    if (!cliente) throw new Error("draft_followup: cliente no resuelto");

    // Carga de contexto desde la propuesta (si llega `id`).
    let empresa = asString(args.empresa);
    let contacto = asString(args.contacto);
    let dolor = asString(args.dolor);
    let alcance = asString(args.alcance);
    let telefono: string | undefined;
    let dias = typeof args.dias_sin_respuesta === "number" ? args.dias_sin_respuesta : null;
    let anglesFromNotas: string[] = [];
    let notas: string | null = null;

    const propId = asString(args.id);
    if (propId) {
      const { data: prop, error } = await ctx.db
        .from("propuestas")
        .select("id, proyecto, peldano, alcance, fecha_envio, lead_id, notas, estado")
        .eq("cliente_id", cliente.id)
        .eq("id", propId)
        .single();
      if (error) throw new Error(`draft_followup: ${error.message}`);

      notas = prop.notas ?? null;
      anglesFromNotas = priorAnglesFromNotas(notas);
      if (!alcance) alcance = asString(prop.alcance) ?? asString(prop.proyecto);
      if (dias === null) dias = diasDesde(prop.fecha_envio);

      if (prop.lead_id) {
        const { data: lead } = await ctx.db
          .from("leads_central")
          .select("nombre_completo, telefono_whatsapp, necesidad")
          .eq("cliente_id", cliente.id)
          .eq("id_lead", prop.lead_id)
          .single();
        if (lead) {
          if (!empresa) empresa = asString(lead.nombre_completo);
          if (!contacto) contacto = asString(lead.nombre_completo);
          if (!dolor) dolor = asString(lead.necesidad);
          telefono = asString(lead.telefono_whatsapp);
        }
      }
      if (!empresa) empresa = asString(prop.proyecto);
    }

    if (!empresa) throw new Error("draft_followup: falta 'empresa' (o un 'id' de propuesta que la resuelva)");

    const input: SeguimientoInput = {
      empresa,
      contacto,
      rubro: asString(args.rubro),
      dolor,
      peldano: undefined, // interno; el prompt prohíbe nombrarlo
      alcance,
      dias_sin_respuesta: dias ?? 0,
      intentos_previos: uniqStrings(anglesFromNotas, args.intentos_previos as string[] | undefined),
      canal: asString(args.canal),
    };

    const raw = await callBrain({
      system: buildSeguimientoPrompt(input),
      history: [],
      mensaje: "Redacta el follow-up siguiendo las reglas y la voz. Responde SOLO con el JSON.",
      maxTokens: 1024,
    });
    const env = parseFollowupEnvelope(raw);

    // Registra el ángulo en notas (opcional) para que la próxima corrida no lo repita.
    let registrado = false;
    if (args.registrar_angulo === true && propId) {
      const nota = formatAngleNote(env.angulo, new Date().toISOString());
      const nuevasNotas = notas ? `${notas}\n${nota}` : nota;
      const { error: uerr } = await ctx.db
        .from("propuestas")
        .update({ notas: nuevasNotas })
        .eq("cliente_id", cliente.id)
        .eq("id", propId);
      registrado = !uerr;
    }

    return {
      ok: true,
      mensaje: env.mensaje,
      angulo: env.angulo,
      canal: env.canal,
      empresa,
      contacto: contacto ?? null,
      telefono: telefono ?? null,
      propuesta_id: propId ?? null,
      dias_sin_respuesta: input.dias_sin_respuesta,
      intentos_previos: input.intentos_previos,
      angulo_registrado: registrado,
    };
  },
};

export const followupTools: ToolDef[] = [draftFollowupTool];
