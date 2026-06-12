// ============================================================================
// dispatch.ts — registro de tools + pipeline central del control-plane.
// Compartido por ambas superficies (MCP y REST) en index.ts:
//   resolver tenant (scope llave) → cargar cliente → cuota → handler → log de uso.
// Vive separado del servidor HTTP para poder testearse en proceso.
// ============================================================================
import { db } from "./db.js";
import { loadConfig } from "./config.js";
import { loadCliente, assertQuota, logUsage } from "./metering.js";
import type { AuthInfo } from "./auth.js";
import type { Plan, Cliente } from "./types.js";
import type { ToolDef, ToolArgs } from "./tools/types.js";
import { leadTools } from "./tools/leads.js";
import { brainTools } from "./tools/qualify.js";
import { messagingTools } from "./tools/messaging.js";
import { schedulingTools } from "./tools/scheduling.js";
import { reviewTools } from "./tools/reviews.js";
import { landingTools } from "./tools/landing.js";
import { onboardingTools } from "./tools/onboarding.js";

export const ALL_TOOLS: ToolDef[] = [
  ...leadTools,
  ...brainTools,
  ...messagingTools,
  ...schedulingTools,
  ...reviewTools,
  ...landingTools,
  ...onboardingTools,
];

const TOOL_BY_NAME = new Map<string, ToolDef>(ALL_TOOLS.map((t) => [t.name, t]));

export class ToolNotFoundError extends Error {
  constructor(name: string) {
    super(`tool no encontrada: ${name}`);
    this.name = "ToolNotFoundError";
  }
}

/** Ejecuta una tool por el pipeline completo. Lanza ToolNotFoundError / QuotaError / Error. */
export async function executeTool(
  name: string,
  args: ToolArgs,
  auth: AuthInfo
): Promise<unknown> {
  const def = TOOL_BY_NAME.get(name);
  if (!def) throw new ToolNotFoundError(name);

  const baseCtx = { db: db(), cfg: loadConfig(), auth };
  const clienteId = await def.resolveCliente(args, baseCtx);

  let cliente: Cliente | null = null;
  if (clienteId) {
    cliente = await loadCliente(clienteId); // valida existencia + activo
    await assertQuota(clienteId, cliente.plan as Plan, def.name); // lanza QuotaError si agotada
  }

  const result = await def.handler(args, { ...baseCtx, clienteId, cliente });

  if (clienteId) await logUsage(clienteId, def.name); // metering (best-effort)
  return result;
}
