// ============================================================================
// claude.ts — cerebro conversacional (Anthropic SDK / Messages API).
// System prompt CACHEADO (cache_control ephemeral): instrucciones del tenant +
// politicas_faq son estables por cliente → bajan costo/latencia en cada turno.
// Devuelve el texto crudo del modelo; el parseo/normalización vive en core/envelope.
// ============================================================================
import Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "./config.js";
import type { ChatMessage } from "./types.js";

let _client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: loadConfig().anthropicApiKey });
  return _client;
}

export interface BrainInput {
  system: string; // prompt del tenant (instrucciones + politicas_faq)
  history: ChatMessage[]; // turnos previos (memoria)
  mensaje: string; // mensaje entrante del lead (turno actual)
  model?: string; // override puntual; default = cfg.claudeModel
  maxTokens?: number; // default 1024; subir para generación de contenido (ej. landing JSON)
}

/** Llama al modelo y devuelve el texto del/los bloque(s) de respuesta. */
export async function callBrain(input: BrainInput): Promise<string> {
  const cfg = loadConfig();

  // Construir turnos; la Messages API exige que el primero sea 'user'.
  const turns: Anthropic.MessageParam[] = input.history.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  while (turns.length > 0 && turns[0]!.role === "assistant") turns.shift();
  turns.push({ role: "user", content: input.mensaje });

  const res = await anthropic().messages.create({
    model: input.model ?? cfg.claudeModel,
    max_tokens: input.maxTokens ?? 1024,
    system: [
      {
        type: "text",
        text: input.system,
        cache_control: { type: "ephemeral" }, // cachea el prefijo estable del tenant
      },
    ],
    messages: turns,
  });

  return res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
}
