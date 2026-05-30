// ============================================================================
// scripts/onboard-tenant.ts — alta de un cliente (tenant) en UN comando.
// Multi-tenant: NO redespliega nada; solo inserta/actualiza la fila en `clientes`.
// El mismo control-plane + n8n + (Fase 4) Next.js ya lo atienden por cliente_id/slug.
//
// Uso:
//   node --env-file=.env --import tsx scripts/onboard-tenant.ts '{ JSON del cliente }'
// Ejemplo:
//   node --env-file=.env --import tsx scripts/onboard-tenant.ts '{"slug":"carwash-laola","nombre_negocio":"Carwash La Ola","rubro":"lavado de autos","cal_url":"https://cal.com/...","google_review_url":"https://g.page/r/...","wa_phone_number_id":"123456","plan":"pro","politicas_faq":{"servicios":["lavado","encerado"],"precios":"desde $5.000"}}'
// ============================================================================
import { db } from "../src/db.js";

type In = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

async function main(): Promise<void> {
  const raw = process.argv[2];
  if (!raw) {
    throw new Error(
      'Pasa un JSON con al menos {slug, nombre_negocio}. Ej: \'{"slug":"mi-cliente","nombre_negocio":"Mi Cliente"}\''
    );
  }
  let input: In;
  try {
    input = JSON.parse(raw) as In;
  } catch {
    throw new Error("El argumento debe ser JSON válido (entre comillas simples).");
  }

  const slug = str(input.slug);
  const nombre = str(input.nombre_negocio);
  if (!slug || !nombre) throw new Error("Faltan campos requeridos: slug, nombre_negocio.");

  const row = {
    slug,
    nombre_negocio: nombre,
    rubro: str(input.rubro),
    cal_url: str(input.cal_url),
    google_review_url: str(input.google_review_url),
    wa_phone_number_id: str(input.wa_phone_number_id),
    tono: str(input.tono) ?? "cercano y profesional",
    plan: str(input.plan) ?? "free",
    politicas_faq: (input.politicas_faq ?? {}) as object,
    activo: true,
  };

  const { data, error } = await db()
    .from("clientes")
    .upsert(row, { onConflict: "slug" })
    .select("id, slug, nombre_negocio, plan")
    .single();
  if (error) throw new Error(error.message);

  console.log(`\n✅ Tenant onboardeado (sin redeploy):`);
  console.log(`   ${data.nombre_negocio} · slug=${data.slug} · plan=${data.plan}`);
  console.log(`   cliente_id=${data.id}`);
  console.log(`\n   Ya puede recibir leads/campañas vía n8n y mostrar su landing/reseñas por slug.`);
  console.log(`   Falta solo: sus credenciales de canal (Meta WhatsApp, Cal.com, Google) si no se incluyeron.`);
}

main().catch((err) => {
  console.error("ERROR:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
