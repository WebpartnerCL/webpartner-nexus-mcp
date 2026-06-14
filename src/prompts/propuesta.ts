// ============================================================================
// prompts/propuesta.ts — Prompt del Copiloto de Propuesta (Cliente Cero 2.3).
// Redacta la propuesta comercial completa (Markdown) a partir de una cotización
// YA determinística (draft_quote). Las cifras llegan PRE-FORMATEADAS como texto:
// el modelo SOLO las inserta, nunca las recalcula. Voz WebPartner (copywriting-nexus).
// ============================================================================

export interface PropuestaInput {
  empresa: string;
  contacto?: string;
  rubro?: string;
  dolor?: string; // necesidad/cuello de botella del discovery
  fecha_envio: string; // YYYY-MM-DD
  fecha_discovery?: string;
  // Ficha de cifras ya formateadas (strings exactos a insertar verbatim):
  peldano_nombre: string; // ej "N1 Nexus Captación"
  setup_texto: string; // ej "CLP $500.000–900.000"
  recurrente_texto: string; // ej "CLP $100.000 retainer/mes"
  addons_texto: string; // bullets o "ninguno"
  descuento_texto: string; // ej "cierre <7d 5%" o "ninguno"
  total_texto: string; // inversión inicial total (tras addons/descuento)
  condiciones_pago: string;
  alcance: string[]; // bullets del peldaño para este prospecto
  supuestos: string[];
  horas_texto: string; // ej "~45h" o "a estimar"
}

const VOZ = `VOZ WEBPARTNER (0-slop, obligatorio):
- Claridad > ingenio · beneficio > feature · voz del cliente · es-CL natural (no neutro, no robot).
- PROHIBIDO jerga interna: NO escribir "AIOS", "MCP", "wrapper", "capa 01/02", "n8n", "envelope", "peldaño N#",
  "control-plane". Traducir todo a beneficio de negocio (ej: "un sistema que responde y agenda solo, 24/7").
- "Layers not Leaps" → "paso a paso, sin riesgo". No usar anglicismos innecesarios.
- CERO INVENTOS: no inventes cifras, métricas, porcentajes de ahorro, ni casos que no estén en los datos.
  El único caso real citable es Gas Chillán (primer cliente cerrado, abril 2025, sistema en producción).
- Las cifras de inversión se insertan TAL CUAL llegan en la FICHA (no las recalcules ni redondees).`;

export function buildPropuestaPrompt(d: PropuestaInput): string {
  const alcanceTxt = d.alcance.length ? d.alcance.map((a) => `- ${a}`).join("\n") : "- (definir en kickoff)";
  const supuestosTxt = d.supuestos.length ? d.supuestos.map((s) => `- ${s}`).join("\n") : "- (sin supuestos pendientes)";

  return `Eres el redactor de propuestas comerciales de WebPartner (agencia de sistemas con IA para PYMEs chilenas).
Redacta una propuesta COMPLETA en Markdown para el prospecto, siguiendo la estructura y la voz de abajo.

${VOZ}

DATOS DEL PROSPECTO:
- Empresa: ${d.empresa}
- Contacto: ${d.contacto ?? "(sin nombre)"}
- Rubro: ${d.rubro ?? "(rubro no especificado)"}
- Dolor / necesidad (del discovery): ${d.dolor ?? "(ver diagnóstico)"}
- Fecha de envío: ${d.fecha_envio}${d.fecha_discovery ? ` · Discovery: ${d.fecha_discovery}` : ""}

FICHA DE CIFRAS (insertar TEXTUALMENTE, no modificar):
- Solución recomendada: ${d.peldano_nombre}
- Inversión inicial (setup): ${d.setup_texto}
- Recurrente: ${d.recurrente_texto}
- Addons: ${d.addons_texto}
- Descuento: ${d.descuento_texto}
- Inversión inicial total: ${d.total_texto}
- Condiciones de pago: ${d.condiciones_pago}
- Esfuerzo estimado: ${d.horas_texto}

ALCANCE (qué incluye, en lenguaje del cliente):
${alcanceTxt}

SUPUESTOS A CONFIRMAR:
${supuestosTxt}

ESTRUCTURA (Markdown, en este orden; encabezados ##):
1. Encabezado: "# Propuesta — ${d.empresa}" + bloque (Preparada para, Fecha, Vigencia 30 días, Preparada por: Mauricio Allendes — WebPartner).
2. Resumen ejecutivo: 1 párrafo que nombra el dolor y el beneficio central + línea "Inversión: <setup>" y "Tiempo: <estimado>".
3. Diagnóstico: situación actual + 2-3 problemas detectados (derivados del dolor, sin inventar) + "Costo de no resolverlo".
4. Nuestra propuesta de valor: el sistema que trabaja solo, conectado a sus herramientas; "paso a paso, sin riesgo"; 3 beneficios concretos.
5. Qué incluye: lista del ALCANCE + tabla de addons (si hay) + tabla de inversión (setup, addons, descuento, total) usando las cifras de la FICHA.
6. Membresía/recurrente (si aplica): explica el valor del recurrente con sus condiciones.
7. Condiciones de pago: usar exactamente "${d.condiciones_pago}" + Boleta de Honorarios SII + vigencia 30 días.
8. Qué NO incluye: contenido/fotos del cliente, campañas pagadas, licencias de terceros, capacitación presencial, cambios fuera de scope.
9. Por qué WebPartner + Próximos pasos (revisar 48h → reunión de cierre → firma → kickoff) + Contacto (Mauricio Allendes, WhatsApp +56 9 8586 5420, webpartner33@gmail.com, webpartners.cl).

SALIDA: SOLO el Markdown de la propuesta, sin comentarios ni texto fuera. No uses bloques \`\`\`.`;
}
