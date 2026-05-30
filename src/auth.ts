// ============================================================================
// auth.ts — autenticación por API key (header Authorization: Bearer <key>).
// Solo se compara el hash SHA-256 contra api_keys.key_hash. Nunca la key en claro.
// ============================================================================
import type { Plan } from "./types.js";
import { db } from "./db.js";
import { hashApiKey } from "./core/keys.js";

export interface AuthInfo {
  apiKeyId: string;
  ownerClienteId: string; // tenant dueño de la llave
  plan: Plan; // plan de la llave (para Fase 2 self-serve)
  isService: boolean; // true = puede operar cross-tenant
}

/**
 * Valida una API key. Devuelve null si no existe o está revocada.
 * Lanza solo ante error de infraestructura (no por key inválida).
 */
export async function resolveAuth(apiKey: string): Promise<AuthInfo | null> {
  const keyHash = hashApiKey(apiKey.trim());
  const { data, error } = await db()
    .from("api_keys")
    .select("id, cliente_id, plan, revoked, is_service")
    .eq("key_hash", keyHash)
    .maybeSingle();
  if (error) throw new Error(`auth: ${error.message}`);
  if (!data || data.revoked) return null;
  return {
    apiKeyId: data.id,
    ownerClienteId: data.cliente_id,
    plan: (data.plan as Plan) ?? "free",
    isService: data.is_service === true,
  };
}
