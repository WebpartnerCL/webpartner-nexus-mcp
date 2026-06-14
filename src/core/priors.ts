// ============================================================================
// core/priors.ts — bandas de horas por peldaño desde el histórico de `propuestas`.
// Es el "prior" que ancla la estimación del copiloto de cotización. Lógica PURA.
// La matriz APRENDE: prefiere `horas_reales` (lo que tomó de verdad) sobre
// `horas_estimadas` cuando existe → cada cierre afina las próximas cotizaciones.
// ============================================================================
import type { HorasPrior } from "../prompts/cotizar.js";

export interface PropuestaHoras {
  peldano: string | null;
  horas_estimadas: number | null;
  horas_reales: number | null;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

/** Agrupa por peldaño y devuelve banda (min/med/max) de horas, prefiriendo reales. */
export function computeHorasPriors(rows: PropuestaHoras[]): HorasPrior[] {
  const byPeldano = new Map<string, number[]>();
  for (const r of rows) {
    const h = r.horas_reales ?? r.horas_estimadas; // la matriz aprende: real > estimado
    if (!r.peldano || h == null) continue;
    const list = byPeldano.get(r.peldano) ?? [];
    list.push(Number(h));
    byPeldano.set(r.peldano, list);
  }
  return Array.from(byPeldano.entries())
    .map(([peldano, hs]) => ({ peldano, min: Math.min(...hs), max: Math.max(...hs), med: median(hs), n: hs.length }))
    .sort((a, b) => a.peldano.localeCompare(b.peldano));
}
