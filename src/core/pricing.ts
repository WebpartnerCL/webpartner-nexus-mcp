// ============================================================================
// core/pricing.ts — motor determinístico de precios (escalera oficial N0–N4).
// Lógica PURA y testeable (no toca red ni DB). Fuente: skill `pricing-aios`
// reference §1–5 (rev 2026-06-11). El copiloto de cotización obtiene los precios
// SOLO de aquí; el modelo Claude elige peldaño/alcance pero NUNCA produce montos.
// ============================================================================

export const PELDANOS = ["N0", "N1", "N2", "N3", "N4"] as const;
export type Peldano = (typeof PELDANOS)[number];

export type Moneda = "CLP" | "USD";
export interface Banda {
  min: number;
  max: number;
}
export interface Recurrente extends Banda {
  label: string;
  moneda: Moneda;
}

interface LadderRung {
  nombre: string;
  monedaSetup: Moneda;
  setup: Banda; // min=max para precios fijos (N0)
  recurrente: Recurrente; // BASE recurrente (piso)
  feeAgendado?: { monto: number; moneda: Moneda }; // fee por agendado-que-asistió (performance, N1+)
  cotizable: boolean;
  motivoNoCotizable?: string;
}

/** Escalera oficial N0–N4. Única fuente de precios base del producto. */
export const LADDER: Record<Peldano, LadderRung> = {
  N0: {
    nombre: "Demo Express Agéntico",
    monedaSetup: "USD",
    setup: { min: 108, max: 108 },
    recurrente: { min: 108, max: 108, label: "mantención/mes", moneda: "USD" },
    cotizable: true,
  },
  N1: {
    nombre: "Nexus Captación",
    monedaSetup: "CLP",
    setup: { min: 500_000, max: 900_000 },
    recurrente: { min: 90_000, max: 90_000, label: "base/mes", moneda: "CLP" },
    feeAgendado: { monto: 12_000, moneda: "CLP" },
    cotizable: true,
  },
  N2: {
    nombre: "Nexus Ciclo Completo",
    monedaSetup: "CLP",
    setup: { min: 1_500_000, max: 2_500_000 },
    recurrente: { min: 497, max: 497, label: "Membresía AIOS/mes", moneda: "USD" },
    feeAgendado: { monto: 15_000, moneda: "CLP" },
    cotizable: true,
  },
  N3: {
    nombre: "Nexus Operaciones",
    monedaSetup: "CLP",
    setup: { min: 2_500_000, max: 4_000_000 },
    recurrente: { min: 497, max: 497, label: "Membresía AIOS/mes", moneda: "USD" },
    feeAgendado: { monto: 20_000, moneda: "CLP" },
    cotizable: false,
    motivoNoCotizable:
      "N3 no se cotiza sin contrato ERP del socio firmado (gate §11.5: eventos, auth+sandbox, idempotencia, SLA). Escalar a Mauricio.",
  },
  N4: {
    nombre: "Nexus Ecosistema",
    monedaSetup: "CLP",
    setup: { min: 3_000_000, max: 6_000_000 },
    recurrente: { min: 497, max: 497, label: "Membresía AIOS/mes", moneda: "USD" },
    feeAgendado: { monto: 25_000, moneda: "CLP" },
    cotizable: true,
  },
};

export interface Addon {
  clave: string;
  nombre: string;
  min: number;
  max: number;
  moneda: Moneda;
}

/** Catálogo de addons (SOLO conectores externos / servicios puntuales). CLP. */
export const ADDONS: Record<string, Addon> = {
  mcp_sii: { clave: "mcp_sii", nombre: "MCP SII", min: 400_000, max: 600_000, moneda: "CLP" },
  mcp_transbank: { clave: "mcp_transbank", nombre: "MCP Transbank", min: 400_000, max: 600_000, moneda: "CLP" },
  mcp_erp: { clave: "mcp_erp", nombre: "MCP Defontana / Softland", min: 500_000, max: 700_000, moneda: "CLP" },
  mcp_payroll: { clave: "mcp_payroll", nombre: "MCP Buk / Payroll", min: 400_000, max: 600_000, moneda: "CLP" },
  mcp_custom: { clave: "mcp_custom", nombre: "MCP custom (otro sistema)", min: 500_000, max: 800_000, moneda: "CLP" },
  whatsapp_api: { clave: "whatsapp_api", nombre: "WhatsApp Business API", min: 300_000, max: 400_000, moneda: "CLP" },
  pagos_online: { clave: "pagos_online", nombre: "MercadoPago / Stripe avanzado", min: 200_000, max: 300_000, moneda: "CLP" },
  email_auto: { clave: "email_auto", nombre: "Gmail / Outlook (envío automático)", min: 200_000, max: 200_000, moneda: "CLP" },
  calendario: { clave: "calendario", nombre: "Google Calendar / Cal.com", min: 200_000, max: 200_000, moneda: "CLP" },
  pseo_escala: { clave: "pseo_escala", nombre: "SEO programático a escala (pSEO)", min: 800_000, max: 1_500_000, moneda: "CLP" },
  seo_tecnico: { clave: "seo_tecnico", nombre: "SEO técnico avanzado", min: 400_000, max: 400_000, moneda: "CLP" },
  aeo: { clave: "aeo", nombre: "Contenido AEO (citable por IA)", min: 300_000, max: 300_000, moneda: "CLP" },
  analisis_reuniones: { clave: "analisis_reuniones", nombre: "Análisis de reuniones (STT + insights)", min: 400_000, max: 400_000, moneda: "CLP" },
  roi_leadmagnet: { clave: "roi_leadmagnet", nombre: "Calculadora ROI / lead magnet custom", min: 250_000, max: 250_000, moneda: "CLP" },
  vps: { clave: "vps", nombre: "VPS dedicado (1 año)", min: 150_000, max: 150_000, moneda: "CLP" },
  dominio_correos: { clave: "dominio_correos", nombre: "Dominio + correos profesionales", min: 80_000, max: 80_000, moneda: "CLP" },
};

export type DescuentoTipo = "referido" | "cierre_7d" | "paquete";
export interface DescuentoAplicado {
  tipo: DescuentoTipo;
  pct: number;
  base: "setup_total" | "addons";
}

export interface PriceInput {
  peldano: Peldano;
  addons?: string[]; // claves del catálogo (ignora desconocidas)
  referido?: boolean; // 10% off
  cierreRapido?: boolean; // cierre <7d: 5% off
}

export interface PriceBlock {
  cotizable: boolean;
  motivo_no_cotizable: string | null;
  peldano: Peldano;
  nombre: string;
  moneda_base: Moneda;
  setup: Banda;
  recurrente: Recurrente; // base recurrente
  fee_agendado: { monto: number; moneda: Moneda; label: string } | null; // performance (N1+)
  addons: Addon[];
  addons_total: Banda | null; // CLP
  descuento: DescuentoAplicado | null;
  total_setup: Banda; // tras descuento, en moneda_base
  total_setup_nota: string | null; // si addons en otra moneda no se sumaron
  condiciones_pago: string;
  banda_referencia: string;
}

const REVISION = "rev 2026-06-11";

function sumBandas(bandas: Banda[]): Banda {
  return bandas.reduce<Banda>((acc, b) => ({ min: acc.min + b.min, max: acc.max + b.max }), { min: 0, max: 0 });
}

function applyPct(b: Banda, pct: number): Banda {
  const f = 1 - pct / 100;
  return { min: Math.round(b.min * f), max: Math.round(b.max * f) };
}

/** Condiciones de pago por monto (pricing-aios §4), sobre el techo del setup. */
function condicionesPago(totalMax: number, moneda: Moneda): string {
  if (moneda === "USD") return "100% al inicio (pago instantáneo vía Stripe).";
  if (totalMax < 1_000_000) return "100% al inicio.";
  if (totalMax <= 3_000_000) return "50% al inicio / 50% contra entrega.";
  return "40% al inicio / 30% a mitad de proyecto / 30% contra entrega.";
}

/**
 * Calcula el bloque de precio determinístico para una cotización.
 * Si el peldaño no es cotizable (N3 sin contrato ERP), devuelve `cotizable:false`
 * con el motivo y sin montos de venta (la escalera se reporta solo de referencia).
 */
export function priceForQuote(input: PriceInput): PriceBlock {
  const rung = LADDER[input.peldano];

  // Addons válidos (de-dup, ignora claves desconocidas).
  const claves = Array.from(new Set(input.addons ?? []));
  const addons = claves.map((k) => ADDONS[k]).filter((a): a is Addon => Boolean(a));
  const addonsTotal = addons.length ? sumBandas(addons) : null;

  const banda_referencia = `${input.peldano} ${rung.nombre} — escalera oficial pricing-aios (${REVISION})`;
  const fee_agendado = rung.feeAgendado
    ? { monto: rung.feeAgendado.monto, moneda: rung.feeAgendado.moneda, label: "por agendado que asistió" }
    : null;

  if (!rung.cotizable) {
    return {
      cotizable: false,
      motivo_no_cotizable: rung.motivoNoCotizable ?? "Peldaño no cotizable.",
      peldano: input.peldano,
      nombre: rung.nombre,
      moneda_base: rung.monedaSetup,
      setup: rung.setup,
      recurrente: rung.recurrente,
      fee_agendado,
      addons,
      addons_total: addonsTotal,
      descuento: null,
      total_setup: rung.setup,
      total_setup_nota: null,
      condiciones_pago: "—",
      banda_referencia,
    };
  }

  // Subtotal sobre el que aplica el descuento global (referido/cierre):
  // setup + addons solo si comparten moneda (addons son CLP).
  const mismaMoneda = rung.monedaSetup === "CLP";
  const subtotal: Banda = mismaMoneda && addonsTotal ? sumBandas([rung.setup, addonsTotal]) : { ...rung.setup };
  const total_setup_nota =
    !mismaMoneda && addonsTotal
      ? "Setup en USD; los addons (CLP) se cotizan por separado, no se suman al total."
      : null;

  // Descuento: candidatos no acumulables → elegir el de mayor valor (sobre el mínimo).
  const candidatos: { d: DescuentoAplicado; valor: number }[] = [];
  if (input.referido) candidatos.push({ d: { tipo: "referido", pct: 10, base: "setup_total" }, valor: subtotal.min * 0.1 });
  if (input.cierreRapido) candidatos.push({ d: { tipo: "cierre_7d", pct: 5, base: "setup_total" }, valor: subtotal.min * 0.05 });
  if (addons.length >= 3 && addonsTotal) candidatos.push({ d: { tipo: "paquete", pct: 10, base: "addons" }, valor: addonsTotal.min * 0.1 });
  candidatos.sort((a, b) => b.valor - a.valor);
  const descuento = candidatos.length ? candidatos[0]!.d : null;

  // total_setup: aplica el descuento elegido sobre su base.
  let total_setup: Banda = subtotal;
  if (descuento?.base === "setup_total") {
    total_setup = applyPct(subtotal, descuento.pct);
  } else if (descuento?.base === "addons" && addonsTotal) {
    const addonsDesc = applyPct(addonsTotal, descuento.pct);
    total_setup = mismaMoneda ? sumBandas([rung.setup, addonsDesc]) : { ...rung.setup };
  }

  return {
    cotizable: true,
    motivo_no_cotizable: null,
    peldano: input.peldano,
    nombre: rung.nombre,
    moneda_base: rung.monedaSetup,
    setup: rung.setup,
    recurrente: rung.recurrente,
    fee_agendado,
    addons,
    addons_total: addonsTotal,
    descuento,
    total_setup,
    total_setup_nota,
    condiciones_pago: condicionesPago(total_setup.max, rung.monedaSetup),
    banda_referencia,
  };
}
