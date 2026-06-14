// ============================================================================
// core/quote.ts — parseo/validación del envelope de cotización (copiloto 2.2).
// El modelo elige peldaño + alcance + horas + supuestos; aquí se valida y se dan
// defaults seguros. Lógica PURA (no toca red ni DB). El precio lo pone core/pricing.
// ============================================================================
import { PELDANOS, type Peldano } from "./pricing.js";

export interface QuoteEnvelope {
  peldano: Peldano | null; // null = el modelo no pudo decidir (ver needs_more_info)
  confianza: number; // 0–1
  alcance: string[];
  horas_estimadas: number | null;
  supuestos: string[];
  needs_more_info: string[];
  addons_sugeridos: string[];
  razonamiento: string;
}

/** Extrae el primer objeto JSON de un texto (quita fences ```json y texto alrededor). */
function extractJson(raw: string): string {
  let s = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence && fence[1]) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("quote: no se encontró objeto JSON en la salida del modelo");
  }
  return s.slice(start, end + 1);
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x.trim() : String(x))).filter((x) => x.length > 0);
}

function clamp01(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/** Normaliza el peldaño a N0–N4 (tolera 'n1', 'N1 Captación', etc.) o null. */
export function normalizePeldano(v: unknown): Peldano | null {
  if (typeof v !== "string") return null;
  const m = /N[0-4]/i.exec(v);
  if (!m) return null;
  const up = m[0].toUpperCase();
  return (PELDANOS as readonly string[]).includes(up) ? (up as Peldano) : null;
}

function toHoras(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(x) || x <= 0) return null;
  return Math.round(x);
}

export function parseQuoteEnvelope(raw: string): QuoteEnvelope {
  const obj = JSON.parse(extractJson(raw)) as Record<string, unknown>;
  return {
    peldano: normalizePeldano(obj.peldano),
    confianza: clamp01(obj.confianza),
    alcance: toStringArray(obj.alcance),
    horas_estimadas: toHoras(obj.horas_estimadas),
    supuestos: toStringArray(obj.supuestos),
    needs_more_info: toStringArray(obj.needs_more_info),
    addons_sugeridos: toStringArray(obj.addons_sugeridos),
    razonamiento: typeof obj.razonamiento === "string" ? obj.razonamiento : "",
  };
}
