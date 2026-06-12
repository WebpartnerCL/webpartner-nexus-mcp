// ============================================================================
// types.ts — tipos de dominio de Webpartner Nexus (capa control-plane).
// Las filas se derivan del esquema vivo (database.types.ts) para no duplicar.
// ============================================================================
import type { Database } from "./database.types.js";

// ── Uniones de dominio (reflejan los CHECK del esquema SQL) ──────────────────
// Arrays `const` = única fuente; los tipos se derivan y se reusan para validar
// en runtime y para los enum de los inputSchema de las tools.
export const PLANES = ["free", "pro", "scale"] as const;
export type Plan = (typeof PLANES)[number];

export const ORIGENES = [
  "landing_agentic",
  "meta_ads",
  "reactivacion_db",
  "whatsapp",
  "manual",
] as const;
export type Origen = (typeof ORIGENES)[number];

export const FASES = [
  "nuevo",
  "dialogando_ia",
  "agendado",
  "cerrado",
  "descartado",
  "inactivo",
] as const;
export type FaseEmbudo = (typeof FASES)[number];

export const SEMAFOROS = ["verde", "amarillo", "rojo"] as const;
export type Semaforo = (typeof SEMAFOROS)[number];

// ── Filas/inserts tipados (derivados del esquema vivo) ───────────────────────
export type Cliente = Database["public"]["Tables"]["clientes"]["Row"];
export type Lead = Database["public"]["Tables"]["leads_central"]["Row"];
export type LeadInsert = Database["public"]["Tables"]["leads_central"]["Insert"];
export type LeadUpdate = Database["public"]["Tables"]["leads_central"]["Update"];
export type Review = Database["public"]["Tables"]["control_resenas"]["Row"];
export type ReviewInsert = Database["public"]["Tables"]["control_resenas"]["Insert"];
export type ReviewUpdate = Database["public"]["Tables"]["control_resenas"]["Update"];
export type LeadConSemaforo =
  Database["public"]["Views"]["leads_semaforo_v"]["Row"];

// ── Memoria conversacional persistida en leads_central.historial_chat_ia ─────
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: string; // ISO 8601
}

// ── Nombres de tools del control-plane ───────────────────────────────────────
// Las "facturables" (con fila en quotas) se aplican por cuota; todas se
// registran en usage_events para analítica/metering.
export const TOOL_NAMES = [
  "qualify_lead",
  "upsert_lead",
  "get_lead",
  "update_funnel_stage",
  "append_chat_memory",
  "classify_semaphore",
  "schedule_appointment",
  "send_whatsapp",
  "generate_review_link",
  "route_review",
  "log_review",
  "generate_landing",
  // Onboarding pipeline (solo service key)
  "provision_client",
  "verify_client_setup",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

// ── Envelope del cerebro Claude (salida de qualify_lead) ─────────────────────
// Una sola llamada devuelve respuesta natural + metadata estructurada para que
// n8n enrute/persista. Se valida/normaliza en runtime (ver core/envelope.ts).
export interface QualifyEnvelope {
  respuesta_cliente: string;
  intencion: string;
  calificado: boolean;
  lead_score: number; // 0-10
  fase_sugerida: string; // nuevo|dialogando_ia|agendado|escalar_humano
  escalar_humano: boolean;
}
