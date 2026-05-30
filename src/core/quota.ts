// ============================================================================
// core/quota.ts — aritmética de cuotas/metering. Lógica pura.
// quotas.limite_mensual = -1 → ilimitado. Ventana de conteo = mes calendario UTC.
// ============================================================================

/** -1 (o cualquier negativo) = ilimitado. */
export function isUnlimited(limit: number): boolean {
  return limit < 0;
}

/** ¿Se alcanzó/superó el límite mensual? (used >= limit). Ilimitado nunca excede. */
export function quotaExceeded(used: number, limit: number): boolean {
  if (isUnlimited(limit)) return false;
  return used >= limit;
}

/** Primer instante (UTC) del mes actual — inicio de la ventana de cuota. */
export function monthStartUTC(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function monthStartISO(now: Date = new Date()): string {
  return monthStartUTC(now).toISOString();
}
