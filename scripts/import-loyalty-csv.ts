// ============================================================================
// scripts/import-loyalty-csv.ts — migra el historial de fidelidad (sellos/compras)
// a leads_central para encender M3 (Semáforo de reactivación). UN comando.
//
// Toma un CSV exportado del sistema de fidelidad (PWA del carwash, planilla, etc.)
// con columnas de teléfono (req), nombre (opc) y fecha de última compra (opc).
// Normaliza el teléfono a E.164 chileno, upsert idempotente por (cliente_id, teléfono),
// origen='reactivacion_db'. La fecha_ultima_compra es la que alimenta el semáforo.
//
// Uso:
//   node --env-file=.env --import tsx scripts/import-loyalty-csv.ts <slug> <archivo.csv> [--dry-run]
// Ejemplo:
//   node --env-file=.env --import tsx scripts/import-loyalty-csv.ts carwash-laola sellos.csv --dry-run
// ============================================================================
import { readFileSync } from "node:fs";
import { db } from "../src/db.js";

// ── helpers ──────────────────────────────────────────────────────────────────
const norm = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[\s_]+/g, "");

const PHONE_KEYS = ["telefono", "phone", "whatsapp", "celular", "fono", "numero", "movil", "cel"];
const NAME_KEYS = ["nombre", "name", "cliente", "nombrecompleto"];
const DATE_KEYS = ["fechaultimacompra", "fecha", "ultimacompra", "lastpurchase", "fechacompra", "date", "ultimavisita"];

/** Teléfono chileno → E.164 (+56XXXXXXXXX) o null si no se puede. */
function toE164CL(raw: string): string | null {
  const d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("56") && d.length === 11) return "+" + d; // 56 9 XXXXXXXX
  if (d.startsWith("56") && d.length >= 10) return "+" + d; // fallback con prefijo país
  if (d.length === 9 && d.startsWith("9")) return "+56" + d; // 9 XXXXXXXX (móvil)
  if (d.length === 8) return "+569" + d; // sin el 9 inicial → asumir móvil
  return null;
}

/** Fecha en varios formatos → YYYY-MM-DD o null. */
function toISODate(raw: string): string | null {
  const s = String(raw).trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s); // DD/MM/YYYY o DD-MM-YYYY
  if (m) {
    const dd = m[1]!.padStart(2, "0");
    const mm = m[2]!.padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/** Parser CSV mínimo (soporta comillas dobles y comas dentro de comillas). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* ignore */ }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function findCol(headers: string[], keys: string[]): number {
  const hn = headers.map(norm);
  for (let i = 0; i < hn.length; i++) if (keys.some((k) => hn[i] === k || hn[i]!.includes(k))) return i;
  return -1;
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const [slug, csvPath] = args.filter((a) => !a.startsWith("--"));
  if (!slug || !csvPath) {
    throw new Error("Uso: import-loyalty-csv.ts <slug> <archivo.csv> [--dry-run]");
  }

  const rows = parseCsv(readFileSync(csvPath, "utf8"));
  if (rows.length < 2) throw new Error("El CSV no tiene filas de datos.");
  const headers = rows[0]!;
  const iPhone = findCol(headers, PHONE_KEYS);
  const iName = findCol(headers, NAME_KEYS);
  const iDate = findCol(headers, DATE_KEYS);
  if (iPhone === -1) throw new Error(`No encontré columna de teléfono. Cabeceras: ${headers.join(", ")}`);
  console.log(`Columnas → teléfono=[${headers[iPhone]}] nombre=[${iName > -1 ? headers[iName] : "—"}] fecha=[${iDate > -1 ? headers[iDate] : "—"}]`);

  // Normalizar filas
  const parsed: { telefono: string; nombre: string | null; fecha: string | null }[] = [];
  let skipNoPhone = 0;
  for (const r of rows.slice(1)) {
    const tel = toE164CL(r[iPhone] ?? "");
    if (!tel) { skipNoPhone++; continue; }
    parsed.push({
      telefono: tel,
      nombre: iName > -1 ? (r[iName]?.trim() || null) : null,
      fecha: iDate > -1 ? toISODate(r[iDate] ?? "") : null,
    });
  }
  // De-dup por teléfono (gana la fecha más reciente)
  const byPhone = new Map<string, { telefono: string; nombre: string | null; fecha: string | null }>();
  for (const p of parsed) {
    const prev = byPhone.get(p.telefono);
    if (!prev || (p.fecha && (!prev.fecha || p.fecha > prev.fecha))) byPhone.set(p.telefono, { ...prev, ...p });
    else if (prev && !prev.nombre && p.nombre) prev.nombre = p.nombre;
  }
  const unique = [...byPhone.values()];
  const conFecha = unique.filter((u) => u.fecha).length;

  console.log(`\nResumen: ${rows.length - 1} filas → ${unique.length} contactos únicos con teléfono válido · ${conFecha} con fecha · ${skipNoPhone} sin teléfono válido (omitidas).`);
  console.log("Muestra:", unique.slice(0, 3));

  if (dryRun) {
    console.log("\n[--dry-run] No se escribió nada. Quita --dry-run para importar.");
    return;
  }

  // Resolver tenant (solo al escribir)
  const { data: cli, error: cerr } = await db().from("clientes").select("id, slug").eq("slug", slug).single();
  if (cerr || !cli) throw new Error(`Tenant no encontrado: ${slug}`);
  const clienteId = cli.id;

  // Upsert por (cliente_id, telefono): existe → update fecha/nombre; si no → insert.
  let inserted = 0, updated = 0, errors = 0;
  for (const u of unique) {
    const { data: ex, error: selErr } = await db()
      .from("leads_central")
      .select("id_lead, nombre_completo, fecha_ultima_compra")
      .eq("cliente_id", clienteId)
      .eq("telefono_whatsapp", u.telefono)
      .maybeSingle();
    if (selErr) { errors++; continue; }
    if (ex) {
      const patch: Record<string, unknown> = {};
      if (u.fecha) patch.fecha_ultima_compra = u.fecha;
      if (u.nombre && !ex.nombre_completo) patch.nombre_completo = u.nombre;
      if (Object.keys(patch).length) {
        const { error } = await db().from("leads_central").update(patch).eq("id_lead", ex.id_lead);
        if (error) errors++; else updated++;
      }
    } else {
      const { error } = await db().from("leads_central").insert({
        cliente_id: clienteId,
        telefono_whatsapp: u.telefono,
        nombre_completo: u.nombre,
        origen: "reactivacion_db",
        fase_embudo: "inactivo",
        fecha_ultima_compra: u.fecha,
      });
      if (error) errors++; else inserted++;
    }
  }
  console.log(`\n✅ Importación: ${inserted} nuevos · ${updated} actualizados · ${errors} errores.`);
  console.log(`   M3 ya puede clasificar por semáforo a los ${conFecha} contactos con fecha de última compra.`);
}

main().catch((err) => {
  console.error("ERROR:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
