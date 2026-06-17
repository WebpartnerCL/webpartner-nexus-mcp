// ============================================================================
// core/billing.ts — lógica PURA de cobros/suscripciones (sin I/O, testeable).
//   · Uniones de dominio (estado/peldaño/moneda) + validadores.
//   · accesoActivo: deriva si el agente del tenant debe estar PRENDIDO según el
//     estado de su suscripción (el lazo cobro↔acceso).
//   · resumenMrr: agrega filas de suscripción → MRR base por moneda.
// ============================================================================

export const ESTADOS_SUS = ["trial", "activa", "morosa", "suspendida", "cancelada"] as const;
export type EstadoSuscripcion = (typeof ESTADOS_SUS)[number];

export const PELDANOS = ["N0", "N1", "N2", "N3", "N4"] as const;
export type Peldano = (typeof PELDANOS)[number];

export const MONEDAS = ["CLP", "USD"] as const;
export type Moneda = (typeof MONEDAS)[number];

export function isEstado(v: string): v is EstadoSuscripcion {
  return (ESTADOS_SUS as readonly string[]).includes(v);
}
export function isPeldano(v: string): v is Peldano {
  return (PELDANOS as readonly string[]).includes(v);
}
export function isMoneda(v: string): v is Moneda {
  return (MONEDAS as readonly string[]).includes(v);
}

/**
 * Cobro↔acceso: el agente del tenant queda PRENDIDO mientras la suscripción no
 * esté suspendida ni cancelada. `morosa` mantiene gracia (sigue activo) — la
 * suspensión es una decisión explícita posterior.
 */
export function accesoActivo(estado: EstadoSuscripcion): boolean {
  return estado !== "suspendida" && estado !== "cancelada";
}

export interface SubRow {
  estado: string;
  moneda: string;
  base_monto: number;
}
export interface MrrPorMoneda {
  moneda: string;
  activas: number;
  trials: number;
  morosas: number;
  mrr_base: number;
}

/** Agrega filas de suscripción → MRR base por moneda. Solo 'activa' suma al MRR. */
export function resumenMrr(rows: SubRow[]): MrrPorMoneda[] {
  const map = new Map<string, MrrPorMoneda>();
  for (const r of rows) {
    const m =
      map.get(r.moneda) ?? { moneda: r.moneda, activas: 0, trials: 0, morosas: 0, mrr_base: 0 };
    if (r.estado === "activa") {
      m.activas += 1;
      m.mrr_base += Number(r.base_monto) || 0;
    } else if (r.estado === "trial") {
      m.trials += 1;
    } else if (r.estado === "morosa") {
      m.morosas += 1;
    }
    map.set(r.moneda, m);
  }
  return [...map.values()].sort((a, b) => a.moneda.localeCompare(b.moneda));
}
