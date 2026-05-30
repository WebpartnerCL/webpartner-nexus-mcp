// ============================================================================
// whatsapp.ts — cliente mínimo de WhatsApp Cloud API (Meta Graph API).
// Multi-tenant: el phone_number_id viene del tenant (clientes.wa_phone_number_id);
// el token (System User) es global del MCP (env WHATSAPP_TOKEN).
// ============================================================================
import { loadConfig } from "./config.js";

const GRAPH = "https://graph.facebook.com";

/** Normaliza a solo dígitos (Meta acepta el E.164 sin '+'). */
function normalizeTo(to: string): string {
  return to.replace(/[^\d]/g, "");
}

export interface WaSendResult {
  id: string | null;
  raw: Record<string, unknown>;
}

async function postMessage(
  phoneNumberId: string,
  payload: Record<string, unknown>
): Promise<WaSendResult> {
  const cfg = loadConfig();
  if (!cfg.whatsappToken) throw new Error("WHATSAPP_TOKEN no configurado");
  const url = `${GRAPH}/${cfg.whatsappApiVersion}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.whatsappToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { message?: string } | undefined;
    throw new Error(`WhatsApp API ${res.status}: ${err?.message ?? res.statusText}`);
  }
  const messages = json.messages as Array<{ id?: string }> | undefined;
  return { id: messages?.[0]?.id ?? null, raw: json };
}

/** Mensaje de texto (solo válido dentro de la ventana de servicio de 24h). */
export function sendWhatsappText(
  phoneNumberId: string,
  to: string,
  body: string
): Promise<WaSendResult> {
  return postMessage(phoneNumberId, {
    to: normalizeTo(to),
    type: "text",
    text: { preview_url: false, body },
  });
}

/** Plantilla aprobada en Meta (saliente fuera de la ventana de 24h). */
export function sendWhatsappTemplate(
  phoneNumberId: string,
  to: string,
  templateName: string,
  languageCode: string,
  bodyParams: string[]
): Promise<WaSendResult> {
  const components =
    bodyParams.length > 0
      ? [
          {
            type: "body",
            parameters: bodyParams.map((t) => ({ type: "text", text: t })),
          },
        ]
      : [];
  return postMessage(phoneNumberId, {
    to: normalizeTo(to),
    type: "template",
    template: { name: templateName, language: { code: languageCode }, components },
  });
}
