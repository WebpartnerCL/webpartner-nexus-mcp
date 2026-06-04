// ============================================================================
// tools/landing.ts — generate_landing: genera el sitio_contenido (Web Agentic)
// desde un perfil de negocio y crea/actualiza el tenant (mode=demo, noindex).
// Pensado para outbound masivo: una llamada = un demo vivo en el motor.
// Se mide contra el OPERADOR (dueño de la llave de servicio), no contra el tenant
// creado (el tenant aún no existe al momento de cobrar la cuota).
// ============================================================================
import type { ToolDef, ToolArgs, BaseContext } from "./types.js";
import type { Json } from "../database.types.js";
import { callBrain } from "../claude.js";
import {
  buildLandingPrompt,
  buildPoliticasFaq,
  type BusinessProfile,
} from "../prompts/landing.js";
import { asString } from "./shared.js";

const LANDING_BASE =
  process.env.NEXUS_LANDING_BASE ?? "https://webpartner-nexus-landing.vercel.app";

// ── Helpers locales (slug + extracción JSON) ─────────────────────────────────
function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function categoriaSlug(rubro: string | undefined): string {
  return `demo-${normalizeSlug(rubro ?? "") || "general"}`;
}

function extractJson(raw: string): string {
  let s = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence && fence[1]) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("generate_landing: no se encontró objeto JSON en la salida del modelo");
  }
  return s.slice(start, end + 1);
}

function asStringArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return undefined;
}

function parseProfile(args: ToolArgs): BusinessProfile {
  const nombre = asString(args.nombre_negocio);
  if (!nombre) throw new Error("generate_landing: falta nombre_negocio");
  return {
    nombre_negocio: nombre,
    rubro: asString(args.rubro),
    comuna: asString(args.comuna),
    ciudad: asString(args.ciudad),
    direccion: asString(args.direccion),
    telefono: asString(args.telefono),
    web: asString(args.web),
    redes: (args.redes && typeof args.redes === "object"
      ? (args.redes as Record<string, string>)
      : undefined),
    servicios: asStringArray(args.servicios),
    horarios: asString(args.horarios),
    anos_trayectoria: asString(args.anos_trayectoria) ?? (typeof args.anos_trayectoria === "number" ? args.anos_trayectoria : undefined),
    reseñas_resumen: asString(args.resenas_resumen) ?? asString(args["reseñas_resumen"]),
    rating: asString(args.rating) ?? (typeof args.rating === "number" ? args.rating : undefined),
    notas: asString(args.notas),
  };
}

// ── generate_landing ─────────────────────────────────────────────────────────
const generateLandingTool: ToolDef = {
  name: "generate_landing",
  description:
    "Genera el contenido de una landing agéntica (sitio_contenido) desde un perfil de negocio y crea/actualiza el tenant en modo demo (noindex). Devuelve la URL viva. Para outbound masivo.",
  inputSchema: {
    type: "object",
    properties: {
      nombre_negocio: { type: "string" },
      rubro: { type: "string" },
      comuna: { type: "string" },
      ciudad: { type: "string" },
      direccion: { type: "string" },
      telefono: { type: "string", description: "E.164 del negocio (referencia; el demo enruta a WebPartner)" },
      web: { type: "string" },
      redes: { type: "object", description: "{instagram, facebook, linkedin}" },
      servicios: { type: "array", items: { type: "string" } },
      horarios: { type: "string" },
      anos_trayectoria: { type: ["string", "number"] },
      resenas_resumen: { type: "string", description: "Resumen cualitativo de reseñas reales (sin inventar cifras)" },
      rating: { type: ["string", "number"] },
      notas: { type: "string" },
      slug: { type: "string", description: "Opcional; si no se da, se deriva de nombre+comuna" },
      plan: { type: "string", description: "Plan del tenant creado (free|pro|scale). Default free." },
    },
    required: ["nombre_negocio"],
  },
  // Se mide contra el OPERADOR (dueño de la llave): el tenant creado aún no existe.
  resolveCliente: (_args: ToolArgs, ctx: BaseContext): string => ctx.auth.ownerClienteId,
  handler: async (args, ctx) => {
    const profile = parseProfile(args);

    // 1) Generar el contenido con Claude
    const raw = await callBrain({
      system: buildLandingPrompt(profile),
      history: [],
      mensaje: "Genera el sitio_contenido en JSON puro, siguiendo el esquema y las reglas.",
      maxTokens: 4096,
    });

    let contenido: Record<string, unknown>;
    try {
      contenido = JSON.parse(extractJson(raw)) as Record<string, unknown>;
    } catch (e) {
      throw new Error(`generate_landing: JSON inválido del modelo: ${(e as Error).message}`);
    }
    if (!Array.isArray(contenido.secciones) || contenido.secciones.length === 0) {
      throw new Error("generate_landing: el contenido no tiene 'secciones'");
    }

    // 2) Forzar invariantes de demo (no confiar en el modelo para esto)
    contenido.mode = "demo";
    contenido.noindex = true;

    // 3) Slug + upsert del tenant
    const slug =
      asString(args.slug) ??
      `${normalizeSlug(profile.nombre_negocio)}${profile.comuna ? "-" + normalizeSlug(profile.comuna) : ""}`;
    const plan = asString(args.plan) ?? "free";
    const politicas = buildPoliticasFaq(profile);

    const { data, error } = await ctx.db
      .from("clientes")
      .upsert(
        {
          slug,
          nombre_negocio: profile.nombre_negocio,
          rubro: profile.rubro ?? null,
          tono: "cercano y profesional",
          plan,
          politicas_faq: politicas as Json,
          sitio_contenido: contenido as Json,
          activo: true,
        },
        { onConflict: "slug" },
      )
      .select("id, slug")
      .single();
    if (error) throw new Error(`generate_landing upsert: ${error.message}`);

    const url = `${LANDING_BASE}/sites/${categoriaSlug(profile.rubro)}/${slug}-demo`;
    return { cliente_id: data.id, slug: data.slug, url, estado: "borrador" };
  },
};

export const landingTools: ToolDef[] = [generateLandingTool];
