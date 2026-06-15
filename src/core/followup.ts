// ============================================================================
// core/followup.ts — parseo/validación del follow-up + memoria de ángulos.
// Lógica PURA (no toca red ni DB): la usa tools/followup.ts (Cliente Cero 3.3).
// El modelo redacta el mensaje y elige un ángulo; aquí se valida y se persiste
// el ángulo en `propuestas.notas` como una línea tag para no repetirlo mañana.
// ============================================================================

export interface FollowupEnvelope {
  mensaje: string;
  angulo: string;
  canal: "whatsapp" | "email";
}

/** Extrae el primer objeto JSON de un texto (quita fences ```json y texto alrededor). */
function extractJson(raw: string): string {
  let s = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence && fence[1]) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("followup: no se encontró objeto JSON en la salida del modelo");
  }
  return s.slice(start, end + 1);
}

function asTrimmed(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Normaliza el ángulo a un slug kebab-case corto (defensivo). */
export function normalizeAngulo(v: unknown): string {
  const s = asTrimmed(v)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "seguimiento";
}

export function parseFollowupEnvelope(raw: string): FollowupEnvelope {
  const obj = JSON.parse(extractJson(raw)) as Record<string, unknown>;
  const mensaje = asTrimmed(obj.mensaje);
  if (!mensaje) throw new Error("followup: el modelo no devolvió 'mensaje'");
  const canal = asTrimmed(obj.canal).toLowerCase() === "email" ? "email" : "whatsapp";
  return { mensaje, angulo: normalizeAngulo(obj.angulo), canal };
}

const ANGLE_TAG = "[seguimiento";

/** Línea tag que se anexa a `propuestas.notas` para registrar un ángulo usado. */
export function formatAngleNote(angulo: string, fechaISO: string): string {
  const dia = fechaISO.slice(0, 10);
  return `${ANGLE_TAG} ${dia}] ángulo: ${normalizeAngulo(angulo)}`;
}

/** Lee de `notas` los ángulos ya usados (líneas tag) → para no repetirlos. PURA. */
export function priorAnglesFromNotas(notas: string | null | undefined): string[] {
  if (!notas) return [];
  const out: string[] = [];
  const re = /\[seguimiento[^\]]*\]\s*ángulo:\s*([a-z0-9-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(notas)) !== null) {
    const a = normalizeAngulo(m[1]);
    if (!out.includes(a)) out.push(a);
  }
  return out;
}

/** Días enteros transcurridos desde una fecha ISO hasta `ahora` (≥0). PURA. */
export function diasDesde(fechaISO: string | null | undefined, ahora: Date = new Date()): number {
  if (!fechaISO) return 0;
  const t = Date.parse(fechaISO);
  if (!Number.isFinite(t)) return 0;
  const ms = ahora.getTime() - t;
  return ms <= 0 ? 0 : Math.floor(ms / 86_400_000);
}
