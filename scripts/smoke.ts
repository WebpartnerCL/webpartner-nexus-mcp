// ============================================================================
// scripts/smoke.ts — smoke E2E del control-plane contra Supabase + Claude reales.
// Ejecuta los HANDLERS REALES de las tools por el mismo pipeline que el dispatcher
// (resolver tenant → cuota → handler → log), sin HTTP. Limpia los datos de prueba.
//
// Uso:  node --env-file=.env --import tsx scripts/smoke.ts
// ============================================================================
import { db } from "../src/db.js";
import { loadConfig } from "../src/config.js";
import { loadCliente, assertQuota, logUsage } from "../src/metering.js";
import type { AuthInfo } from "../src/auth.js";
import type { Plan } from "../src/types.js";
import type { ToolDef, ToolArgs } from "../src/tools/types.js";
import { leadTools } from "../src/tools/leads.js";
import { brainTools } from "../src/tools/qualify.js";
import { reviewTools } from "../src/tools/reviews.js";

const TOOLS = new Map<string, ToolDef>(
  [...leadTools, ...brainTools, ...reviewTools].map((t) => [t.name, t])
);
// Llave de servicio simulada (cross-tenant) — el dispatcher real la deriva del header.
const auth: AuthInfo = { apiKeyId: "smoke", ownerClienteId: "", plan: "scale", isService: true };

async function dispatch(name: string, args: ToolArgs): Promise<Record<string, unknown>> {
  const def = TOOLS.get(name);
  if (!def) throw new Error(`tool no encontrada: ${name}`);
  const baseCtx = { db: db(), cfg: loadConfig(), auth };
  const clienteId = await def.resolveCliente(args, baseCtx);
  const cliente = clienteId ? await loadCliente(clienteId) : null;
  if (clienteId && cliente) await assertQuota(clienteId, cliente.plan as Plan, def.name);
  const result = await def.handler(args, { ...baseCtx, clienteId, cliente });
  if (clienteId) await logUsage(clienteId, def.name);
  return result as Record<string, unknown>;
}

async function main(): Promise<void> {
  console.log("== Smoke E2E — WebPartner Nexus MCP ==\n");

  const { data: c, error } = await db()
    .from("clientes")
    .select("id, google_review_url")
    .eq("slug", "webpartner")
    .maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  if (!c) throw new Error("Falta el tenant 'webpartner' (¿se aplicó seed.sql?)");
  const clienteId = c.id;
  console.log(`tenant webpartner: ${clienteId}\n`);

  const tel = "+56900000001";
  const noClaude = process.argv.includes("--no-claude");
  let idLead: string | undefined;
  let token: string | undefined;
  let leadScore = 8;

  try {
    if (noClaude) {
      console.log("1) qualify_lead — OMITIDO (--no-claude); usando lead_score=8\n");
    } else {
      console.log("1) qualify_lead (Claude)...");
      const q = await dispatch("qualify_lead", {
        cliente_id: clienteId,
        mensaje: "Hola, vi su web. ¿Hacen lavado de motor y cuánto cuesta?",
      });
      const env = q.envelope as Record<string, unknown>;
      leadScore = Number(env.lead_score) || 0;
      console.log(
        `   lead_score=${env.lead_score} fase=${q.fase_normalizada} escalar=${env.escalar_humano}`
      );
      console.log(`   respuesta: ${String(env.respuesta_cliente).slice(0, 180)}\n`);
    }

    console.log("2) upsert_lead (escritura DB)...");
    const u = await dispatch("upsert_lead", {
      cliente_id: clienteId,
      telefono_whatsapp: tel,
      nombre_completo: "Smoke Test",
      origen: "manual",
      necesidad: "lavado motor",
      fase_embudo: "dialogando_ia",
      lead_score: leadScore,
    });
    idLead = (u.lead as Record<string, unknown>).id_lead as string;
    console.log(`   ${u.accion} id_lead=${idLead}\n`);

    console.log("3) get_lead (lectura DB + semáforo)...");
    const g = await dispatch("get_lead", { cliente_id: clienteId, telefono_whatsapp: tel });
    const lead = g.lead as Record<string, unknown>;
    console.log(
      `   nombre=${lead.nombre_completo} fase=${lead.fase_embudo} semaforo=${lead.etiqueta_semaforo}\n`
    );

    console.log("4) generate_review_link (M2)...");
    const r = await dispatch("generate_review_link", { cliente_id: clienteId, id_lead: idLead });
    token = r.token as string;
    console.log(`   url=${r.url}\n`);

    console.log("5) route_review (5★ → Google)...");
    const rr = await dispatch("route_review", { token, rating: 5 });
    console.log(`   action=${rr.action} redirect_url=${rr.redirect_url}\n`);

    console.log("✅ Smoke OK — auth/tenant/cuota/DB/Claude/metering operativos.");
  } finally {
    console.log("\nlimpiando datos de prueba...");
    if (token) await db().from("control_resenas").delete().eq("token_unico", token);
    await db().from("leads_central").delete().eq("cliente_id", clienteId).eq("telefono_whatsapp", tel);
    console.log("listo.");
  }
}

main().catch((err) => {
  console.error("\n❌ Smoke FALLÓ:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
