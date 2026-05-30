import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVirtualPartnerPrompt, buildReactivacionPrompt } from "./index.js";
import type { Cliente } from "../types.js";

const cliente: Cliente = {
  id: "c1",
  nombre_negocio: "Carwash La Ola",
  rubro: "lavado de autos",
  slug: "carwash-laola",
  google_review_url: null,
  cal_url: "https://cal.com/x/15min",
  wa_phone_number_id: null,
  tono: "cercano y profesional",
  politicas_faq: { servicios: ["lavado básico", "encerado premium"] },
  plan: "pro",
  activo: true,
  created_at: "",
  updated_at: "",
};

test("VirtualPartner interpola empresa, rubro, cal y FAQ; declara el envelope", () => {
  const p = buildVirtualPartnerPrompt(cliente);
  assert.match(p, /Carwash La Ola/);
  assert.match(p, /lavado de autos/);
  assert.match(p, /cal\.com\/x\/15min/);
  assert.match(p, /encerado premium/); // FAQ serializada
  assert.match(p, /respuesta_cliente/); // contrato de salida JSON
  assert.match(p, /cercano y profesional/);
});

test("Reactivación incluye color de semáforo y promoción", () => {
  const p = buildReactivacionPrompt(cliente, "amarillo", "10% en tu próximo lavado");
  assert.match(p, /amarillo/);
  assert.match(p, /10% en tu próximo lavado/);
  assert.match(p, /Carwash La Ola/);
  assert.match(p, /respuesta_cliente/);
});

test("FAQ vacía no rompe la interpolación", () => {
  const sinFaq = { ...cliente, politicas_faq: {} };
  const p = buildVirtualPartnerPrompt(sinFaq);
  assert.match(p, /sin información adicional/);
});
