// ============================================================================
// metering.ts — multi-tenancy + cuotas + registro de consumo.
//  · resolveClienteId: aplica el scope de la llave (servicio vs tenant).
//  · loadCliente:      carga el tenant servido (valida que exista y esté activo).
//  · assertQuota:      enforce de cuota mensual por (plan, tool).
//  · logUsage:         registra usage_events (best-effort).
// ============================================================================
import type { AuthInfo } from "./auth.js";
import type { Cliente, Plan, ToolName } from "./types.js";
import { db } from "./db.js";
import { quotaExceeded, monthStartISO } from "./core/quota.js";

/** Resuelve el cliente_id servido respetando el scope de la API key. */
export function resolveClienteId(
  auth: AuthInfo,
  argClienteId?: string | null
): string {
  if (auth.isService) {
    if (!argClienteId) {
      throw new Error("se requiere cliente_id (llave de servicio)");
    }
    return argClienteId;
  }
  // Llave de tenant: acotada a su propio cliente_id.
  if (argClienteId && argClienteId !== auth.ownerClienteId) {
    throw new Error("no autorizado: cliente_id no corresponde a la API key");
  }
  return auth.ownerClienteId;
}

/** Carga un cliente activo. Lanza si no existe o está inactivo. */
export async function loadCliente(clienteId: string): Promise<Cliente> {
  const { data, error } = await db()
    .from("clientes")
    .select("*")
    .eq("id", clienteId)
    .maybeSingle();
  if (error) throw new Error(`cliente: ${error.message}`);
  if (!data) throw new Error(`cliente no encontrado: ${clienteId}`);
  if (!data.activo) throw new Error(`cliente inactivo: ${clienteId}`);
  return data;
}

export class QuotaError extends Error {
  constructor(
    public readonly tool: string,
    public readonly plan: string,
    public readonly limit: number
  ) {
    super(`cuota mensual agotada: ${tool} (plan ${plan}, límite ${limit})`);
    this.name = "QuotaError";
  }
}

/**
 * Verifica la cuota mensual del (plan, tool). Lanza QuotaError si está agotada.
 * Sin fila en quotas → tool no facturable (ilimitada). limite_mensual -1 → ilimitada.
 */
export async function assertQuota(
  clienteId: string,
  plan: Plan,
  tool: ToolName
): Promise<void> {
  const { data: q, error } = await db()
    .from("quotas")
    .select("limite_mensual")
    .eq("plan", plan)
    .eq("tool", tool)
    .maybeSingle();
  if (error) throw new Error(`quota: ${error.message}`);
  if (!q || q.limite_mensual < 0) return;

  const { count, error: cErr } = await db()
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("cliente_id", clienteId)
    .eq("tool", tool)
    .gte("ts", monthStartISO());
  if (cErr) throw new Error(`usage count: ${cErr.message}`);
  if (quotaExceeded(count ?? 0, q.limite_mensual)) {
    throw new QuotaError(tool, plan, q.limite_mensual);
  }
}

/** Registra un evento de consumo. Best-effort: no rompe la respuesta de la tool. */
export async function logUsage(
  clienteId: string,
  tool: ToolName,
  units = 1
): Promise<void> {
  const { error } = await db()
    .from("usage_events")
    .insert({ cliente_id: clienteId, tool, units });
  if (error) {
    console.error(`[metering] no se pudo registrar usage_event: ${error.message}`);
  }
}
