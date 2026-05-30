// ============================================================================
// scripts/smoke-rest.ts — verifica resolveAuth + executeTool (la lógica de la
// superficie REST/MCP) contra la DB real, EN PROCESO (sin levantar servidor).
//   node --import tsx scripts/smoke-rest.ts
// ============================================================================
import { db } from "../src/db.js";
import { generateApiKey } from "../src/core/keys.js";
import { resolveAuth } from "../src/auth.js";
import { executeTool, ToolNotFoundError } from "../src/dispatch.js";

async function main(): Promise<void> {
  console.log("== Smoke REST (resolveAuth + executeTool, en proceso) ==\n");

  const { data: c, error } = await db()
    .from("clientes")
    .select("id, plan")
    .eq("slug", "webpartner")
    .maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  if (!c) throw new Error("Falta el tenant 'webpartner'");
  console.log(`tenant webpartner: ${c.id} (plan ${c.plan})\n`);

  const { key, hash } = generateApiKey();
  await db().from("api_keys").insert({
    cliente_id: c.id,
    key_hash: hash,
    label: "smoke-rest",
    plan: c.plan,
    is_service: true,
  });

  try {
    console.log("1) resolveAuth(key válida)...");
    const auth = await resolveAuth(key);
    if (!auth) throw new Error("resolveAuth devolvió null para una key válida");
    console.log(`   OK cliente=${auth.ownerClienteId} plan=${auth.plan} service=${auth.isService}`);

    console.log("2) resolveAuth(key inválida) → null...");
    const bad = await resolveAuth("wpn_no_existe_zzz");
    console.log(`   ${bad === null ? "OK (null)" : "❌ debió ser null"}`);

    console.log("3) executeTool('get_lead', tel inexistente) → lead:null...");
    const r = (await executeTool(
      "get_lead",
      { cliente_id: c.id, telefono_whatsapp: "+56900000999" },
      auth
    )) as Record<string, unknown>;
    console.log(`   OK lead=${JSON.stringify(r.lead)}`);

    console.log("4) executeTool('no_existe') → ToolNotFoundError...");
    try {
      await executeTool("no_existe", {}, auth);
      console.log("   ❌ no lanzó");
    } catch (e) {
      console.log(`   ${e instanceof ToolNotFoundError ? "OK (ToolNotFoundError)" : "❌ otro error: " + (e as Error).message}`);
    }

    console.log("5) executeTool con cliente_id inexistente → rechazo...");
    try {
      await executeTool(
        "get_lead",
        { cliente_id: "00000000-0000-0000-0000-000000000000", telefono_whatsapp: "+56900000999" },
        auth
      );
      console.log("   ❌ no lanzó");
    } catch (e) {
      console.log(`   OK (rechazó): ${(e as Error).message}`);
    }

    console.log("\n✅ Smoke REST OK — auth + pipeline operativos.");
  } finally {
    await db().from("api_keys").delete().eq("key_hash", hash);
    console.log("key de prueba borrada.");
  }
}

main().catch((err) => {
  console.error("ERROR:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
