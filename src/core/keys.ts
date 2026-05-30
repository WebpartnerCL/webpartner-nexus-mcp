// ============================================================================
// core/keys.ts — hashing y generación de API keys / tokens. Lógica pura.
// Solo se persiste el hash SHA-256; la key en claro se muestra UNA vez al emitir.
// ============================================================================
import { createHash, randomBytes } from "node:crypto";

/** SHA-256 hex de una API key (lo único que se guarda en api_keys.key_hash). */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** Genera una API key nueva y su hash. La key en claro se entrega una sola vez. */
export function generateApiKey(prefix = "wpn"): { key: string; hash: string } {
  const secret = randomBytes(24).toString("base64url");
  const key = `${prefix}_${secret}`;
  return { key, hash: hashApiKey(key) };
}

/** Token url-safe para el link único de reseña (M2). */
export function generateReviewToken(): string {
  return randomBytes(18).toString("base64url");
}
