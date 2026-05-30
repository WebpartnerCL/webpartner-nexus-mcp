// ============================================================================
// config.ts — carga y valida la configuración desde variables de entorno.
// 12-factor: ningún secreto vive en el código ni en el vault. Solo env.
// Fail-fast: si falta un secreto crítico, el server no arranca.
// ============================================================================

export interface Config {
  port: number;
  // Supabase (capa de datos). service_role = SECRETO, solo en env.
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  // Claude (cerebro IA). SECRETO.
  anthropicApiKey: string;
  claudeModel: string;
  // n8n (orquestación / espejo a Sheets).
  n8nWebhookBase: string;
  // WhatsApp Cloud API (Meta). token = SECRETO (System User). Opcional hasta Fase 5.
  whatsappToken: string | undefined;
  whatsappApiVersion: string;
  // Base pública para construir links de reseña (M2).
  publicBaseUrl: string;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`[config] Falta la variable de entorno requerida: ${name}`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v : fallback;
}

let _cfg: Config | null = null;

/**
 * Carga (y cachea) la config. Lanza si falta un secreto crítico.
 * Se invoca de forma perezosa (al crear clientes), no al importar,
 * para que la lógica pura sea testeable sin secretos.
 */
export function loadConfig(): Config {
  if (_cfg) return _cfg;
  _cfg = {
    port: parseInt(process.env.PORT ?? "3000", 10),
    supabaseUrl: required("SUPABASE_URL"),
    supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    anthropicApiKey: required("ANTHROPIC_API_KEY"),
    // Modelo por defecto: claude-sonnet-4-6 (Sonnet vigente; balance costo/latencia
    // para el agente de WhatsApp de alto volumen). Override con CLAUDE_MODEL.
    claudeModel: optional("CLAUDE_MODEL", "claude-sonnet-4-6"),
    n8nWebhookBase: optional(
      "N8N_WEBHOOK_BASE",
      "https://n8n.srv1105450.hstgr.cloud/webhook"
    ),
    whatsappToken: process.env.WHATSAPP_TOKEN,
    whatsappApiVersion: optional("WHATSAPP_API_VERSION", "v21.0"),
    publicBaseUrl: optional("PUBLIC_BASE_URL", "https://webpartners.cl"),
  };
  return _cfg;
}
