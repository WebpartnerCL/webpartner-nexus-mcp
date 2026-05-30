// ============================================================================
// tools/messaging.ts — send_whatsapp (WhatsApp Cloud API).
// ============================================================================
import type { ToolDef } from "./types.js";
import { asString, serviceResolve, clienteIdProp } from "./shared.js";
import { sendWhatsappText, sendWhatsappTemplate } from "../whatsapp.js";

const sendWhatsappTool: ToolDef = {
  name: "send_whatsapp",
  description:
    "Envía WhatsApp (texto o plantilla aprobada) vía WhatsApp Cloud API, usando el wa_phone_number_id del tenant. Dentro de la ventana de 24h usar 'texto'; fuera de ella usar 'template' (aprobada en Meta).",
  inputSchema: {
    type: "object",
    properties: {
      ...clienteIdProp,
      to: { type: "string", description: "Teléfono destino en E.164 (ej. +56912345678)." },
      texto: {
        type: "string",
        description: "Cuerpo del mensaje de texto (solo dentro de la ventana de 24h).",
      },
      template: {
        type: "string",
        description: "Nombre de la plantilla aprobada en Meta (saliente fuera de la ventana de 24h).",
      },
      template_lang: { type: "string", description: "Código de idioma de la plantilla (default 'es')." },
      template_vars: {
        type: "array",
        items: { type: "string" },
        description: "Valores para las variables {{1}},{{2}}... del cuerpo de la plantilla.",
      },
    },
    required: ["to"],
  },
  resolveCliente: serviceResolve,
  handler: async (args, ctx) => {
    const cliente = ctx.cliente;
    if (!cliente) throw new Error("send_whatsapp: cliente no resuelto");
    const phoneId = cliente.wa_phone_number_id;
    if (!phoneId) throw new Error(`tenant sin wa_phone_number_id: ${cliente.id}`);
    const to = asString(args.to);
    if (!to) throw new Error("falta el parámetro requerido: to");

    const texto = asString(args.texto);
    const template = asString(args.template);
    if (!texto && !template) throw new Error("se requiere 'texto' o 'template'");

    const result = template
      ? await sendWhatsappTemplate(
          phoneId,
          to,
          template,
          asString(args.template_lang) ?? "es",
          Array.isArray(args.template_vars)
            ? args.template_vars.filter((v): v is string => typeof v === "string")
            : []
        )
      : await sendWhatsappText(phoneId, to, texto as string);

    return { ok: true, message_id: result.id, to };
  },
};

export const messagingTools: ToolDef[] = [sendWhatsappTool];
