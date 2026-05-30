// ============================================================================
// core/envelope.ts — parseo/validación del envelope JSON del cerebro Claude.
// Tolera code fences y texto alrededor; clampa lead_score 0-10; defaults seguros.
// Lógica pura y testeable (no toca red ni DB).
// ============================================================================
import { FASES, type QualifyEnvelope, type FaseEmbudo } from "../types.js";

/** Mapea la fase sugerida por el modelo a una FaseEmbudo válida para persistir. */
export function normalizeFase(fase: string | undefined): FaseEmbudo {
  const f = (fase ?? "").trim();
  if ((FASES as readonly string[]).includes(f)) return f as FaseEmbudo;
  // 'escalar_humano' u otros: sigue en conversación; el flag escalar_humano hace el resto.
  return "dialogando_ia";
}

function clampScore(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(10, Math.round(x)));
}

/** Extrae el primer objeto JSON de un texto (quita fences ```json y texto alrededor). */
function extractJson(raw: string): string {
  let s = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence && fence[1]) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("envelope: no se encontró objeto JSON en la salida del modelo");
  }
  return s.slice(start, end + 1);
}

export function parseEnvelope(raw: string): QualifyEnvelope {
  const obj = JSON.parse(extractJson(raw)) as Record<string, unknown>;
  const respuesta = obj.respuesta_cliente;
  if (typeof respuesta !== "string" || respuesta.trim() === "") {
    throw new Error("envelope: falta respuesta_cliente");
  }
  return {
    respuesta_cliente: respuesta,
    intencion: typeof obj.intencion === "string" ? obj.intencion : "",
    calificado: obj.calificado === true,
    lead_score: clampScore(obj.lead_score),
    fase_sugerida:
      typeof obj.fase_sugerida === "string" ? obj.fase_sugerida : "dialogando_ia",
    escalar_humano: obj.escalar_humano === true,
  };
}
