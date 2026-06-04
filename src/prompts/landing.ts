// ============================================================================
// prompts/landing.ts — prompt de generación de `sitio_contenido` (Web Agentic).
// Espeja el schema SiteConfig del motor (webpartner-nexus-landing/src/lib/site-config.ts).
// Reglas de calidad para DEMOS de outbound (noindex): SOLO datos reales del
// perfil, cero invención de cifras/claims, contexto local tejido, CTA a la acción.
// ============================================================================

/** Perfil de negocio que alimenta la generación (salida del enriquecimiento). */
export interface BusinessProfile {
  nombre_negocio: string;
  rubro?: string;
  comuna?: string;
  ciudad?: string;
  direccion?: string;
  telefono?: string;
  web?: string;
  redes?: Record<string, string>; // {instagram, facebook, linkedin}
  servicios?: string[];
  horarios?: string;
  anos_trayectoria?: number | string;
  reseñas_resumen?: string; // resumen cualitativo de reseñas públicas (sin inventar cifras)
  rating?: number | string; // si proviene de fuente real (Maps)
  notas?: string; // contexto adicional verificado
}

const SCHEMA_SPEC = `
ESQUEMA de "sitio_contenido" (devuelve EXACTAMENTE esta forma, JSON válido):
{
  "mode": "demo",
  "tema": { "brand": "#hex", "brandFg": "#hex", "bg": "#ffffff", "fg": "#0b0b0f", "muted": "#6e6e73", "surface": "#f5f5f7", "border": "#e6e6eb" },
  "marca": { "logoAlt": "<nombre>" },
  "seo": { "title": "<≤60c>", "description": "<≤155c>" },
  "bantLite": [ { "id": "interes", "label": "<pregunta>", "tipo": "select", "opciones": ["..."], "requerida": false } ],
  "secciones": [
    { "tipo": "hero", "titulo": "<gancho>", "subtitulo": "<promesa>", "ctaPrimario": { "label": "<...>", "accion": { "tipo": "form" } }, "ctaSecundario": { "label": "WhatsApp", "accion": { "tipo": "whatsapp" } } },
    { "tipo": "trustbar", "items": ["<4 señales reales>"] },
    { "tipo": "servicios", "titulo": "<...>", "subtitulo": "<...>", "items": [ { "titulo": "<...>", "descripcion": "<...>" } ] },
    { "tipo": "testimonios", "titulo": "<...>", "items": [ { "nombre": "<...>", "texto": "<...>", "rating": 5 } ] },
    { "tipo": "faq", "titulo": "Preguntas frecuentes", "items": [ { "pregunta": "<...>", "respuesta": "<...>" } ] },
    { "tipo": "formulario", "titulo": "<...>", "subtitulo": "<...>" },
    { "tipo": "ctaFinal", "titulo": "<...>", "subtitulo": "<...>", "cta": { "label": "<...>", "accion": { "tipo": "whatsapp" } } }
  ],
  "legal": { "empresa": "<nombre>", "direccion": "<dirección si se conoce>" }
}
Tipos de sección válidos: hero, trustbar, servicios, galeria, testimonios, faq, formulario, ctaFinal.
Acciones de CTA válidas: {"tipo":"form"} | {"tipo":"whatsapp"} | {"tipo":"llamar"} | {"tipo":"agendar"} | {"tipo":"url","href":"..."}.
NO incluyas la sección "testimonios" si no hay reseñas reales en el perfil.`;

const REGLAS = `
REGLAS (obligatorias):
1. Español de Chile, cercano y profesional. Tono de vendedor experto, no robótico.
2. SOLO datos reales del perfil. CERO cifras inventadas, CERO claims no verificados (premios, años, "los #1", integraciones). Si no hay dato, usa lenguaje cualitativo.
3. Teje el contexto local (comuna/ciudad/rubro) de forma natural en hero, servicios y FAQ — sin "guía turística" (máx 1-2 lugares).
4. Servicios: deriva de los servicios reales del perfil; descripciones orientadas a beneficio.
5. FAQ: preguntas que un cliente real del rubro haría (ubicación, horarios, cómo agendar/contactar, formas de pago si se conoce). Sin definiciones genéricas.
6. trustbar: 4 señales verdaderas (ej. años si se conocen, atención por WhatsApp, ubicación, especialidad). Si no hay años reales, no los inventes.
7. CTA siempre hacia la acción: formulario o WhatsApp. El subtítulo del hero promete respuesta rápida.
8. tema: elige una paleta acorde al rubro (brand = color principal en hex).
9. Devuelve ÚNICAMENTE el objeto JSON. Sin texto antes/después, sin code fences.`;

export function buildLandingPrompt(profile: BusinessProfile): string {
  return [
    "Eres un copywriter de conversión y diseñador de WebPartner, experto en sitios web agénticos para negocios locales de Chile.",
    "Tu tarea: generar el contenido (sitio_contenido) de una landing de alta conversión para el siguiente negocio, a partir de información REAL ya recopilada.",
    "",
    "PERFIL DEL NEGOCIO (datos verificados):",
    JSON.stringify(profile, null, 2),
    "",
    SCHEMA_SPEC,
    "",
    REGLAS,
  ].join("\n");
}

/** Construye politicas_faq (KB del agente runtime) desde el perfil verificado. */
export function buildPoliticasFaq(
  profile: BusinessProfile,
): Record<string, unknown> {
  const faq: Record<string, unknown> = {};
  if (profile.servicios?.length) faq.servicios = profile.servicios;
  if (profile.horarios) faq.horarios = profile.horarios;
  if (profile.direccion) faq.direccion = profile.direccion;
  if (profile.comuna || profile.ciudad)
    faq.ubicacion = [profile.comuna, profile.ciudad].filter(Boolean).join(", ");
  if (profile.telefono) faq.telefono = profile.telefono;
  if (profile.web) faq.web = profile.web;
  if (profile.anos_trayectoria) faq.trayectoria = profile.anos_trayectoria;
  if (profile.reseñas_resumen) faq.reputacion = profile.reseñas_resumen;
  return faq;
}
