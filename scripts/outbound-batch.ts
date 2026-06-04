// ============================================================================
// scripts/outbound-batch.ts — genera demos agénticos en LOTE para outbound.
// Lee un JSON con perfiles de negocio y llama a la tool MCP `generate_landing`
// (vía REST del control-plane, con llave de servicio). Escribe una COLA DE
// REVISIÓN (slug/url/estado) para el gate humano ANTES de enviar a los prospectos.
//
// Uso:
//   $env:NEXUS_MCP_BASE="https://<mcp>"; $env:WPN_SERVICE_KEY="wpn_..."
//   node --import tsx scripts/outbound-batch.ts perfiles.json [cola-salida.json]
//
// perfiles.json = [ { nombre_negocio, rubro, comuna, telefono, direccion,
//                     servicios:[], horarios, web, redes:{}, resenas_resumen, notas } ]
//
// NOTA: requiere que el MCP en producción tenga la tool generate_landing
// (redeploy) y créditos Anthropic. Es la ruta de ESCALA; el piloto 1-a-1 se hace
// con la skill `agentic-landing-generator` (sin créditos).
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";

const base = process.env.NEXUS_MCP_BASE;
const key = process.env.WPN_SERVICE_KEY;

async function main(): Promise<void> {
  if (!base || !key) throw new Error("Faltan NEXUS_MCP_BASE y/o WPN_SERVICE_KEY en el entorno.");
  const inPath = process.argv[2];
  const outPath = process.argv[3] ?? "cola-revision.json";
  if (!inPath) throw new Error("Pasa la ruta del JSON de perfiles. Ej: scripts/outbound-batch.ts perfiles.json");

  const perfiles = JSON.parse(readFileSync(inPath, "utf8")) as Array<Record<string, unknown>>;
  if (!Array.isArray(perfiles)) throw new Error("El archivo debe ser un array JSON de perfiles.");

  const cola: Array<Record<string, unknown>> = [];
  for (const [i, perfil] of perfiles.entries()) {
    const nombre = String(perfil.nombre_negocio ?? `#${i}`);
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/tools/generate_landing`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(perfil),
      });
      const data = (await res.json()) as { ok?: boolean; result?: unknown; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      const r = (data.result ?? data) as { slug?: string; url?: string; estado?: string };
      cola.push({ nombre, slug: r.slug, url: r.url, estado: r.estado ?? "borrador", revisado: false });
      console.log(`✅ ${nombre} → ${r.url}`);
    } catch (e) {
      cola.push({ nombre, error: (e as Error).message, estado: "error" });
      console.error(`❌ ${nombre}: ${(e as Error).message}`);
    }
  }

  writeFileSync(outPath, JSON.stringify(cola, null, 2), "utf8");
  console.log(`\n📋 Cola de revisión escrita en ${outPath} (${cola.length} demos). Revisar (gate humano) ANTES de enviar.`);
}

main().catch((err) => {
  console.error("ERROR:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
