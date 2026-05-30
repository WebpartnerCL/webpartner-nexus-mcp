// ============================================================================
// tools/shared.ts — helpers comunes a las tools (parsing de args + scope).
// ============================================================================
import type { ToolArgs, BaseContext } from "./types.js";
import { resolveClienteId } from "../metering.js";

export function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

export function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function requireString(args: ToolArgs, key: string): string {
  const v = asString(args[key]);
  if (!v) throw new Error(`falta el parámetro requerido: ${key}`);
  return v;
}

/** Resolver estándar de tenant: respeta el scope de la llave (servicio vs tenant). */
export const serviceResolve = (args: ToolArgs, ctx: BaseContext): string =>
  resolveClienteId(ctx.auth, asString(args.cliente_id));

/** Propiedad cliente_id reutilizable para los inputSchema. */
export const clienteIdProp = {
  cliente_id: {
    type: "string",
    description:
      "ID del cliente (tenant). Requerido con llave de servicio; ignorado con llave de tenant.",
  },
} as const;
