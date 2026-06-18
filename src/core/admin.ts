// ============================================================================
// core/admin.ts — lógica PURA del mantenedor de tenants (Back-office MVP, mód. B).
//   · pickClientUpdate: whitelist de campos editables + validación de enums.
//   · mergeClientList:  une cada tenant con su suscripción viva.
// NO incluye sitio_contenido/politicas_faq (eso es el editor de contenido, mód. C).
// ============================================================================
import { PLANES } from "../types.js";

export const CEREBROS = ["gemini", "openai", "anthropic"] as const;

// Campos escalares que el admin puede editar (resto se ignora).
export const EDITABLE_FIELDS = [
  "nombre_negocio",
  "rubro",
  "cal_url",
  "wa_phone_number_id",
  "google_review_url",
  "tono",
  "cerebro",
  "plan",
  "activo",
  "wa_template_resena",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export interface ClientUpdateResult {
  update: Record<string, unknown>;
  error?: string;
}

/** Construye el update con whitelist + validación. Pura (sin I/O). */
export function pickClientUpdate(args: Record<string, unknown>): ClientUpdateResult {
  const update: Record<string, unknown> = {};
  for (const f of EDITABLE_FIELDS) {
    if (!(f in args) || args[f] === undefined) continue;
    const v = args[f];
    if (f === "activo") {
      if (typeof v !== "boolean") return { update: {}, error: "activo debe ser boolean" };
      update[f] = v;
    } else if (f === "plan") {
      if (!(PLANES as readonly string[]).includes(String(v))) {
        return { update: {}, error: `plan inválido: ${String(v)}` };
      }
      update[f] = v;
    } else if (f === "cerebro") {
      if (!(CEREBROS as readonly string[]).includes(String(v))) {
        return { update: {}, error: `cerebro inválido: ${String(v)}` };
      }
      update[f] = v;
    } else if (v === null || typeof v === "string") {
      update[f] = v; // strings; null permitido en los campos nullable
    } else {
      return { update: {}, error: `${f} debe ser texto o null` };
    }
  }
  if (Object.keys(update).length === 0) return { update: {}, error: "nada que actualizar" };
  return { update };
}

export interface ClientRow {
  id: string;
  slug: string;
  nombre_negocio: string;
  rubro: string | null;
  plan: string;
  activo: boolean;
  cal_url: string | null;
}
export interface SubRow {
  cliente_id: string;
  estado: string;
  peldano: string;
  base_monto: number;
  moneda: string;
}
export interface ClientListItem extends ClientRow {
  suscripcion: { estado: string; peldano: string; base_monto: number; moneda: string } | null;
}

/** Une clientes con su suscripción viva (≤1 por tenant). Pura. */
export function mergeClientList(clientes: ClientRow[], subs: SubRow[]): ClientListItem[] {
  const bySub = new Map<string, SubRow>();
  for (const s of subs) bySub.set(s.cliente_id, s);
  return clientes.map((c) => {
    const s = bySub.get(c.id);
    return {
      ...c,
      suscripcion: s
        ? { estado: s.estado, peldano: s.peldano, base_monto: s.base_monto, moneda: s.moneda }
        : null,
    };
  });
}
