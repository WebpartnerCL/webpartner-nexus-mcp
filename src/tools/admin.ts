// ============================================================================
// tools/admin.ts — mantenedor de tenants (Back-office MVP, módulo B). Service key.
//   list_clients  · lista tenants + su suscripción viva.
//   update_client · edita campos escalares de un tenant (plan, activo, cal_url, ...).
// Reemplaza el editar-Supabase-a-mano. NO toca sitio_contenido (eso es módulo C).
// ============================================================================
import type { ToolArgs, ToolContext, ToolDef } from "./types.js";
import type { TablesUpdate } from "../database.types.js";
import { asString } from "./shared.js";
import { PLANES } from "../types.js";
import {
  CEREBROS,
  mergeClientList,
  pickClientUpdate,
  type ClientRow,
  type SubRow,
} from "../core/admin.js";

const ESTADOS_VIVOS = ["trial", "activa", "morosa", "suspendida"] as const;

/** Resuelve el tenant por cliente_id o slug. Lanza si no existe. */
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

const listClientsTool: ToolDef = {
  name: "list_clients",
  description:
    "Lista todos los tenants con su plan, estado (activo) y suscripción viva. Solo llave de servicio.",
  inputSchema: { type: "object", properties: {} },
  resolveCliente: () => null,
  handler: async (_args, ctx) => {
    if (!ctx.auth.isService) throw new Error("list_clients requiere llave de servicio");
    const { data: clientes, error } = await ctx.db
      .from("clientes")
      .select("id, slug, nombre_negocio, rubro, plan, activo, cal_url")
      .order("created_at", { ascending: true });
    if (error) throw new Error(`list_clients: ${error.message}`);
    const { data: subs, error: e2 } = await ctx.db
      .from("suscripciones")
      .select("cliente_id, estado, peldano, base_monto, moneda")
      .in("estado", [...ESTADOS_VIVOS]);
    if (e2) throw new Error(`list_clients subs: ${e2.message}`);
    const items = mergeClientList((clientes ?? []) as ClientRow[], (subs ?? []) as SubRow[]);
    return { total: items.length, clientes: items };
  },
};

const updateClientTool: ToolDef = {
  name: "update_client",
  description:
    "Edita campos de un tenant (nombre_negocio, rubro, cal_url, wa_phone_number_id, google_review_url, tono, cerebro, plan, activo, wa_template_resena). NO edita el contenido del sitio. Solo llave de servicio.",
  inputSchema: {
    type: "object",
    properties: {
      cliente_id: { type: "string", description: "ID del tenant. Alternativa a slug." },
      slug: { type: "string", description: "Slug del tenant. Alternativa a cliente_id." },
      nombre_negocio: { type: "string" },
      rubro: { type: "string" },
      cal_url: { type: "string" },
      wa_phone_number_id: { type: "string" },
      google_review_url: { type: "string" },
      tono: { type: "string" },
      cerebro: { type: "string", enum: [...CEREBROS] },
      plan: { type: "string", enum: [...PLANES] },
      activo: { type: "boolean" },
      wa_template_resena: { type: "string" },
    },
  },
  resolveCliente: () => null,
  handler: async (args, ctx) => {
    if (!ctx.auth.isService) throw new Error("update_client requiere llave de servicio");
    const tenant = await resolveTenant(args, ctx);
    const { update, error } = pickClientUpdate(args);
    if (error) throw new Error(`update_client: ${error}`);

    const { data, error: upErr } = await ctx.db
      .from("clientes")
      .update(update as TablesUpdate<"clientes">)
      .eq("id", tenant.id)
      .select("id, slug, nombre_negocio, rubro, plan, activo")
      .single();
    if (upErr) throw new Error(`update_client update: ${upErr.message}`);

    await ctx.db
      .from("usage_events")
      .insert({ cliente_id: tenant.id, tool: "update_client", units: 1 });

    return { updated: Object.keys(update), cliente: data };
  },
};

export const adminTools: ToolDef[] = [listClientsTool, updateClientTool];
