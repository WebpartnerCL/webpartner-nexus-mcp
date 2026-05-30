// ============================================================================
// tools/types.ts — contrato uniforme de las tools del control-plane.
// El dispatcher (index.ts) resuelve cliente → cuota → handler → log de uso.
// ============================================================================
import type { AuthInfo } from "../auth.js";
import type { DbClient } from "../db.js";
import type { Config } from "../config.js";
import type { Cliente, ToolName } from "../types.js";

export type ToolArgs = Record<string, unknown>;

/** Contexto base disponible antes de resolver el tenant. */
export interface BaseContext {
  db: DbClient;
  cfg: Config;
  auth: AuthInfo;
}

/** Contexto que recibe el handler, ya con el tenant resuelto (si aplica). */
export interface ToolContext extends BaseContext {
  clienteId: string | null; // null = tool sin tenant (ej. classify_semaphore)
  cliente: Cliente | null; // cargado por el dispatcher cuando hay clienteId
}

export interface ToolDef {
  name: ToolName;
  description: string;
  /** JSON Schema MCP del input. */
  inputSchema: Record<string, unknown>;
  /**
   * Resuelve el cliente_id servido (para cuota/metering). Devuelve null si la
   * tool es tenant-agnostic (no se mide ni se carga cliente).
   */
  resolveCliente(
    args: ToolArgs,
    ctx: BaseContext
  ): Promise<string | null> | string | null;
  /** Lógica de la tool. Devuelve el objeto que se serializa como resultado. */
  handler(args: ToolArgs, ctx: ToolContext): Promise<unknown>;
}
