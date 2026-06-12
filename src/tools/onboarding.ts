// ============================================================================
// tools/onboarding.ts — tools de operaciones de onboarding (solo service key):
//   provision_client · verify_client_setup
// Permiten instanciar y auditar tenants sin intervención manual en Supabase.
// ============================================================================
import type { ToolDef } from "./types.js";
import type { Json } from "../database.types.js";
import { asString, requireString } from "./shared.js";

const CEREBROS = ["gemini", "openai", "anthropic"] as const;

// ── provision_client ──────────────────────────────────────────────────────────
const provisionClientTool: ToolDef = {
  name: "provision_client",
  description:
    "Crea un nuevo tenant en Nexus (INSERT en clientes + usage_events). Solo llave de servicio. Idempotente por slug: lanza si el slug ya existe.",
  inputSchema: {
    type: "object",
    properties: {
      slug: {
        type: "string",
        description: "Identificador único del tenant, e.g. 'carwash-laola'.",
      },
      nombre_negocio: {
        type: "string",
        description: "Nombre comercial del negocio.",
      },
      rubro: {
        type: "string",
        description: "Rubro del negocio, e.g. 'lavado-autos', 'restaurante'.",
      },
      wa_phone_number_id: {
        type: "string",
        description: "Phone Number ID de Meta WABA. Puede actualizarse luego con el ID real.",
      },
      telefono_display: {
        type: "string",
        description: "Teléfono visible para los botones del sitio, e.g. '+56 9 9342 2064'.",
      },
      cerebro: {
        type: "string",
        enum: [...CEREBROS],
        description: "Modelo LLM preferido del tenant. Default: 'gemini'.",
      },
      sitio_contenido: {
        type: "object",
        description: "JSON con secciones, marca, precios, canales y tema. Output de agentic-landing-generator.",
      },
      politicas_faq: {
        type: "object",
        description: "JSON con horarios, formas de pago, FAQs. Puede ser {} si aún no está listo.",
      },
      google_review_url: {
        type: "string",
        description: "URL del perfil GBP para reseñas (M2). Puede agregarse luego.",
      },
      cal_url: {
        type: "string",
        description: "URL de Cal.com para agendamiento (M1), e.g. 'https://cal.com/webpartner/carwash-laola'. Puede agregarse luego.",
      },
    },
    required: ["slug", "nombre_negocio"],
  },
  resolveCliente: () => null,
  handler: async (args, ctx) => {
    if (!ctx.auth.isService) {
      throw new Error("provision_client requiere llave de servicio");
    }

    const slug = requireString(args, "slug");
    const nombre_negocio = requireString(args, "nombre_negocio");
    const rubro = asString(args.rubro) ?? null;
    const wa_phone_number_id = asString(args.wa_phone_number_id) ?? null;
    const telefono_display = asString(args.telefono_display) ?? null;
    const cerebro = asString(args.cerebro) ?? "gemini";
    const google_review_url = asString(args.google_review_url) ?? null;
    const cal_url = asString(args.cal_url) ?? null;

    if (!(CEREBROS as readonly string[]).includes(cerebro)) {
      throw new Error(`cerebro inválido: ${cerebro}. Opciones: ${CEREBROS.join(", ")}`);
    }

    const sitio_contenido =
      args.sitio_contenido && typeof args.sitio_contenido === "object" && !Array.isArray(args.sitio_contenido)
        ? { ...args.sitio_contenido as Record<string, unknown>, telefono_display }
        : { telefono_display };

    const politicas_faq =
      args.politicas_faq && typeof args.politicas_faq === "object" && !Array.isArray(args.politicas_faq)
        ? args.politicas_faq
        : {};

    // Idempotencia: lanzar si el slug ya existe.
    const { data: existing, error: selErr } = await ctx.db
      .from("clientes")
      .select("id, slug")
      .eq("slug", slug)
      .maybeSingle();
    if (selErr) throw new Error(`provision_client select: ${selErr.message}`);
    if (existing) throw new Error(`slug ya existe: '${slug}' (id=${existing.id})`);

    const { data, error } = await ctx.db
      .from("clientes")
      .insert({
        slug,
        nombre_negocio,
        rubro,
        wa_phone_number_id,
        sitio_contenido: sitio_contenido as Json,
        politicas_faq: politicas_faq as Json,
        google_review_url,
        cal_url,
        plan: "free",
        activo: true,
        cerebro,
        tono: "profesional-cercano",
      })
      .select()
      .single();
    if (error) throw new Error(`provision_client insert: ${error.message}`);

    // Registrar evento de creación (best-effort).
    await ctx.db
      .from("usage_events")
      .insert({ cliente_id: data.id, tool: "provision_client", units: 1 });

    return {
      cliente_id: data.id,
      slug: data.slug,
      nombre_negocio: data.nombre_negocio,
      cerebro: data.cerebro,
      status: "provisioned",
    };
  },
};

// ── verify_client_setup ───────────────────────────────────────────────────────
const verifyClientSetupTool: ToolDef = {
  name: "verify_client_setup",
  description:
    "Audita el estado de setup de un tenant por slug. Retorna qué módulos (M1/M2/M3) están listos y qué blockers quedan.",
  inputSchema: {
    type: "object",
    properties: {
      slug: {
        type: "string",
        description: "Slug del tenant a auditar.",
      },
    },
    required: ["slug"],
  },
  resolveCliente: () => null,
  handler: async (args, ctx) => {
    if (!ctx.auth.isService) {
      throw new Error("verify_client_setup requiere llave de servicio");
    }

    const slug = requireString(args, "slug");

    const { data: cliente, error } = await ctx.db
      .from("clientes")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw new Error(`verify_client_setup: ${error.message}`);

    const clienteEnBd = !!cliente;

    const sc = cliente?.sitio_contenido;
    const sitioContenidoOk =
      !!sc && typeof sc === "object" && !Array.isArray(sc) && Object.keys(sc).length > 0;

    const waId = cliente?.wa_phone_number_id ?? "";
    const waNumberIdReal =
      !!waId && !waId.toLowerCase().includes("test") && waId !== "0" && waId.length > 5;

    const calUrlOk = !!cliente?.cal_url;

    const templateAprobado = !!cliente?.wa_template_resena;
    const gbpLinkExiste = !!cliente?.google_review_url;

    let leadsConFecha = 0;
    if (cliente) {
      const { count } = await ctx.db
        .from("leads_central")
        .select("id_lead", { count: "exact", head: true })
        .eq("cliente_id", cliente.id)
        .not("fecha_ultima_compra", "is", null);
      leadsConFecha = count ?? 0;
    }

    const checks = {
      cliente_en_bd: clienteEnBd,
      sitio_contenido_ok: sitioContenidoOk,
      wa_number_id_real: waNumberIdReal,
      cal_url_ok: calUrlOk,
      template_aprobado: templateAprobado,
      gbp_link_existe: gbpLinkExiste,
      leads_con_fecha: leadsConFecha,
    };

    const ready_for: string[] = [];
    const blockers: string[] = [];

    const m1Ok = clienteEnBd && sitioContenidoOk && waNumberIdReal && calUrlOk;
    if (m1Ok) {
      ready_for.push("M1");
    } else {
      if (!clienteEnBd) blockers.push("cliente_no_registrado");
      if (!sitioContenidoOk) blockers.push("sitio_contenido_vacio");
      if (!waNumberIdReal) blockers.push("wa_phone_number_id_faltante_o_test");
      if (!calUrlOk) blockers.push("cal_url_faltante");
    }

    if (m1Ok) {
      if (templateAprobado && gbpLinkExiste) {
        ready_for.push("M2");
      } else {
        if (!templateAprobado) blockers.push("wa_template_resena_pendiente");
        if (!gbpLinkExiste) blockers.push("google_review_url_faltante");
      }
    }

    if (ready_for.includes("M2")) {
      if (leadsConFecha > 0) {
        ready_for.push("M3");
      } else {
        blockers.push("sin_leads_con_fecha_ultima_compra");
      }
    }

    return {
      slug,
      cliente_id: cliente?.id ?? null,
      checks,
      ready_for,
      blockers,
    };
  },
};

export const onboardingTools: ToolDef[] = [provisionClientTool, verifyClientSetupTool];
