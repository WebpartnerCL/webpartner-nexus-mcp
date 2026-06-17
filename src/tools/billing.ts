// ============================================================================
// tools/billing.ts — cobros/suscripciones (Back-office MVP, módulo A).
//   record_subscription     · crea/actualiza la suscripción VIVA del tenant.
//   set_subscription_status · cambia el estado (lifecycle) y sincroniza acceso.
// Solo llave de servicio. Cierra el lazo cobro↔acceso: el estado de la
// suscripción prende/apaga clientes.activo (el MCP ya cortaba por plan/cuota).
// ============================================================================
import type { ToolArgs, ToolContext, ToolDef } from "./types.js";
import { asNumber, asString, requireString } from "./shared.js";
import {
  accesoActivo,
  ESTADOS_SUS,
  isEstado,
  isMoneda,
  isPeldano,
  MONEDAS,
  PELDANOS,
  type EstadoSuscripcion,
} from "../core/billing.js";

// Estados en los que una suscripción se considera "viva" (no terminada).
const ESTADOS_VIVOS = ["trial", "activa", "morosa", "suspendida"] as const;

/** Resuelve el tenant por cliente_id o slug. Lanza si no se encuentra. */
async function resolveTenant(
  args: ToolArgs,
  ctx: ToolContext
): Promise<{ id: string; slug: string }> {
  const clienteId = asString(args.cliente_id);
  const slug = asString(args.slug);
  if (!clienteId && !slug) throw new Error("se requiere cliente_id o slug");
  const base = ctx.db.from("clientes").select("id, slug");
  const { data, error } = clienteId
    ? await base.eq("id", clienteId).maybeSingle()
    : await base.eq("slug", slug!).maybeSingle();
  if (error) throw new Error(`tenant: ${error.message}`);
  if (!data) throw new Error(`tenant no encontrado (${clienteId ?? slug})`);
  return data;
}

/** Sincroniza clientes.activo según el estado de la suscripción (cobro↔acceso). */
async function syncAcceso(
  ctx: ToolContext,
  clienteId: string,
  estado: EstadoSuscripcion
): Promise<boolean> {
  const activo = accesoActivo(estado);
  const { error } = await ctx.db.from("clientes").update({ activo }).eq("id", clienteId);
  if (error) throw new Error(`sync acceso: ${error.message}`);
  return activo;
}

// ── record_subscription ─────────────────────────────────────────────────────
const recordSubscriptionTool: ToolDef = {
  name: "record_subscription",
  description:
    "Crea o actualiza la suscripción VIVA de un tenant (base + fee performance). Solo llave de servicio. Sincroniza clientes.activo según el estado (cobro↔acceso).",
  inputSchema: {
    type: "object",
    properties: {
      cliente_id: { type: "string", description: "ID del tenant. Alternativa a slug." },
      slug: { type: "string", description: "Slug del tenant. Alternativa a cliente_id." },
      peldano: { type: "string", enum: [...PELDANOS], description: "Peldaño comercial N0-N4." },
      estado: {
        type: "string",
        enum: [...ESTADOS_SUS],
        description: "Estado de la suscripción. Default 'trial'.",
      },
      base_monto: { type: "number", description: "Mensualidad fija. Default 0." },
      fee_unitario: {
        type: "number",
        description: "Fee por cita agendada-asistida. Default 0.",
      },
      moneda: { type: "string", enum: [...MONEDAS], description: "Moneda. Default 'CLP'." },
      inicio: { type: "string", description: "Fecha de inicio YYYY-MM-DD. Default hoy." },
      proximo_cobro: { type: "string", description: "Fecha próximo cobro YYYY-MM-DD." },
      stripe_customer_id: { type: "string" },
      stripe_subscription_id: { type: "string" },
    },
    required: ["peldano"],
  },
  resolveCliente: () => null,
  handler: async (args, ctx) => {
    if (!ctx.auth.isService) throw new Error("record_subscription requiere llave de servicio");
    const tenant = await resolveTenant(args, ctx);

    const peldano = requireString(args, "peldano");
    if (!isPeldano(peldano)) throw new Error(`peldano inválido: ${peldano}`);
    const estado = asString(args.estado) ?? "trial";
    if (!isEstado(estado)) throw new Error(`estado inválido: ${estado}`);
    const moneda = asString(args.moneda) ?? "CLP";
    if (!isMoneda(moneda)) throw new Error(`moneda inválida: ${moneda}`);

    const fields = {
      peldano,
      estado,
      base_monto: asNumber(args.base_monto) ?? 0,
      fee_unitario: asNumber(args.fee_unitario) ?? 0,
      moneda,
      stripe_customer_id: asString(args.stripe_customer_id) ?? null,
      stripe_subscription_id: asString(args.stripe_subscription_id) ?? null,
      cancelada_en: estado === "cancelada" ? new Date().toISOString() : null,
      ...(asString(args.inicio) ? { inicio: asString(args.inicio)! } : {}),
      ...(asString(args.proximo_cobro) ? { proximo_cobro: asString(args.proximo_cobro)! } : {}),
    };

    // La unique parcial garantiza ≤1 suscripción viva por tenant.
    const { data: viva, error: selErr } = await ctx.db
      .from("suscripciones")
      .select("id")
      .eq("cliente_id", tenant.id)
      .in("estado", [...ESTADOS_VIVOS])
      .maybeSingle();
    if (selErr) throw new Error(`record_subscription select: ${selErr.message}`);

    let suscripcionId: string;
    if (viva) {
      const { data, error } = await ctx.db
        .from("suscripciones")
        .update(fields)
        .eq("id", viva.id)
        .select("id")
        .single();
      if (error) throw new Error(`record_subscription update: ${error.message}`);
      suscripcionId = data.id;
    } else {
      const { data, error } = await ctx.db
        .from("suscripciones")
        .insert({ cliente_id: tenant.id, ...fields })
        .select("id")
        .single();
      if (error) throw new Error(`record_subscription insert: ${error.message}`);
      suscripcionId = data.id;
    }

    const acceso_activo = await syncAcceso(ctx, tenant.id, estado);
    await ctx.db
      .from("usage_events")
      .insert({ cliente_id: tenant.id, tool: "record_subscription", units: 1 });

    return {
      suscripcion_id: suscripcionId,
      cliente_id: tenant.id,
      slug: tenant.slug,
      peldano,
      estado,
      base_monto: fields.base_monto,
      moneda,
      acceso_activo,
    };
  },
};

// ── set_subscription_status ───────────────────────────────────────────────────
const setSubscriptionStatusTool: ToolDef = {
  name: "set_subscription_status",
  description:
    "Cambia el estado de la suscripción viva de un tenant (trial→activa→morosa→suspendida→cancelada) y sincroniza clientes.activo. Solo llave de servicio.",
  inputSchema: {
    type: "object",
    properties: {
      cliente_id: { type: "string", description: "ID del tenant. Alternativa a slug." },
      slug: { type: "string", description: "Slug del tenant. Alternativa a cliente_id." },
      estado: { type: "string", enum: [...ESTADOS_SUS], description: "Nuevo estado." },
    },
    required: ["estado"],
  },
  resolveCliente: () => null,
  handler: async (args, ctx) => {
    if (!ctx.auth.isService) {
      throw new Error("set_subscription_status requiere llave de servicio");
    }
    const tenant = await resolveTenant(args, ctx);
    const estado = requireString(args, "estado");
    if (!isEstado(estado)) throw new Error(`estado inválido: ${estado}`);

    const { data: viva, error: selErr } = await ctx.db
      .from("suscripciones")
      .select("id")
      .eq("cliente_id", tenant.id)
      .in("estado", [...ESTADOS_VIVOS])
      .maybeSingle();
    if (selErr) throw new Error(`set_subscription_status select: ${selErr.message}`);
    if (!viva) throw new Error(`el tenant no tiene suscripción viva (${tenant.slug})`);

    const { data, error } = await ctx.db
      .from("suscripciones")
      .update({
        estado,
        cancelada_en: estado === "cancelada" ? new Date().toISOString() : null,
      })
      .eq("id", viva.id)
      .select("id")
      .single();
    if (error) throw new Error(`set_subscription_status update: ${error.message}`);

    const acceso_activo = await syncAcceso(ctx, tenant.id, estado);
    return {
      suscripcion_id: data.id,
      cliente_id: tenant.id,
      slug: tenant.slug,
      estado,
      acceso_activo,
    };
  },
};

export const billingTools: ToolDef[] = [recordSubscriptionTool, setSubscriptionStatusTool];
