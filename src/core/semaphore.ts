// ============================================================================
// core/semaphore.ts — clasificación semáforo (M3), espejo EXACTO de la función
// SQL public.nexus_semaforo. Lógica pura y testeable (acepta `today` inyectable).
//   verde   : < 6 meses · amarillo : 6-12 meses · rojo : > 12 meses · null sin fecha
// Umbrales con `>` estricto y aritmética de meses calendario (clamp de día),
// igual que PostgreSQL (current_date - interval 'N months').
// ============================================================================
import type { Semaforo } from "../types.js";

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Resta n meses calendario con clamp de día al último día válido (como PostgreSQL). */
function subMonths(base: Date, n: number): Date {
  const target = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - n, 1)
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(base.getUTCDate(), lastDay));
  return target;
}

/** Parsea 'YYYY-MM-DD' (date de Postgres) a Date UTC a medianoche. null si inválido. */
function parseDateUTC(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function classifySemaphore(
  fechaUltimaCompra: string | null,
  today: Date = new Date()
): Semaforo | null {
  if (!fechaUltimaCompra) return null;
  const f = parseDateUTC(fechaUltimaCompra);
  if (!f) return null;
  const base = startOfDayUTC(today);
  if (f.getTime() > subMonths(base, 6).getTime()) return "verde";
  if (f.getTime() > subMonths(base, 12).getTime()) return "amarillo";
  return "rojo";
}
