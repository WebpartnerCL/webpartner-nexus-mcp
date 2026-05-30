// ============================================================================
// scripts/issue-key.ts — emite una API key para un tenant y guarda solo su hash.
// La clave en claro se muestra UNA vez. Requiere SUPABASE_* en el entorno.
//
// Uso:
//   node --env-file=.env --import tsx scripts/issue-key.ts [slug] [label] [--tenant]
//     slug:   slug del cliente (default: webpartner)
//     label:  etiqueta de la key (default: fecha)
//     --tenant: emite llave de TENANT (acotada); por defecto emite llave de SERVICIO.
// ============================================================================
import { db } from "../src/db.js";
import { generateApiKey } from "../src/core/keys.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isTenant = args.includes("--tenant");
  const positional = args.filter((a) => !a.startsWith("--"));
  const slug = positional[0] ?? "webpartner";
  const label = positional[1] ?? `key ${new Date().toISOString()}`;

  const sb = db();
  const { data: cliente, error: e1 } = await sb
    .from("clientes")
    .select("id, plan, slug, nombre_negocio")
    .eq("slug", slug)
    .maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!cliente) throw new Error(`cliente no encontrado para slug='${slug}'`);

  const { key, hash } = generateApiKey();
  const { error: e2 } = await sb.from("api_keys").insert({
    cliente_id: cliente.id,
    key_hash: hash,
    label,
    plan: cliente.plan,
    is_service: !isTenant,
    revoked: false,
  });
  if (e2) throw new Error(e2.message);

  console.log(
    `\nAPI key emitida para '${cliente.nombre_negocio}' (slug=${slug}, ` +
      `${isTenant ? "tenant" : "servicio"}, plan=${cliente.plan}):\n`
  );
  console.log(`  ${key}\n`);
  console.log("⚠️  Guárdala AHORA — no se vuelve a mostrar (solo se almacenó el hash SHA-256).");
}

main().catch((err) => {
  console.error("ERROR:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
