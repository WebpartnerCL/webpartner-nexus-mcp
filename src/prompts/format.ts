// ============================================================================
// prompts/format.ts — helpers de formateo para los prompts maestros.
// ============================================================================

/** Serializa politicas_faq (jsonb) a texto legible para el prompt. */
export function faqToText(faq: unknown): string {
  if (faq === null || faq === undefined) return "(sin información adicional cargada)";
  if (typeof faq === "string") return faq.trim() || "(sin información adicional cargada)";
  try {
    const s = JSON.stringify(faq, null, 2);
    return s === "{}" || s === "[]" ? "(sin información adicional cargada)" : s;
  } catch {
    return String(faq);
  }
}
