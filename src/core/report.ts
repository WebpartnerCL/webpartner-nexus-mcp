// ============================================================================
// core/report.ts — reporte mensual al CLIENTE (Back-office MVP, mód. D). Puro.
// Convierte la actividad del período en un mensaje claro, SIN jerga interna
// (copywriting-nexus): nada de "lead/calificar/agéntico"; se habla en es-CL.
// ============================================================================

export interface ReportLead {
  fase_embudo: string;
  cal_event_id: string | null;
  booking_show: boolean | null;
}
export interface ReportReview {
  calificacion: number | null;
}
export interface ReportSub {
  estado: string;
  peldano: string;
  base_monto: number;
  moneda: string;
}
export interface ReportInput {
  nombreNegocio: string;
  periodo: string; // YYYY-MM
  leads: ReportLead[]; // ya filtrados al período por el tool
  resenas: ReportReview[];
  suscripcion: ReportSub | null;
}
export interface ClientReport {
  periodo: string;
  captados: number;
  agendados: number;
  asistidos: number;
  resenas_nuevas: number;
  resenas_buenas: number;
  suscripcion: ReportSub | null;
  mensaje_cliente: string;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function periodoLegible(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number);
  const nombre = MESES[(m ?? 1) - 1] ?? periodo;
  return `${nombre} ${y ?? ""}`.trim();
}

export function buildClientReport(input: ReportInput): ClientReport {
  const captados = input.leads.length;
  const agendados = input.leads.filter((l) => !!l.cal_event_id).length;
  const asistidos = input.leads.filter((l) => l.booking_show === true).length;
  const resenas_nuevas = input.resenas.length;
  const resenas_buenas = input.resenas.filter((r) => (r.calificacion ?? 0) >= 4).length;

  const mes = periodoLegible(input.periodo);
  const partes: string[] = [
    `Resumen de ${mes} para ${input.nombreNegocio}:`,
    `· ${captados} ${captados === 1 ? "persona nueva escribió" : "personas nuevas escribieron"} a tu negocio.`,
    `· ${agendados} ${agendados === 1 ? "cita agendada" : "citas agendadas"}` +
      `${asistidos ? `, ${asistidos} ${asistidos === 1 ? "asistió" : "asistieron"}` : ""}.`,
  ];
  if (resenas_nuevas) {
    partes.push(
      `· ${resenas_nuevas} ${resenas_nuevas === 1 ? "reseña nueva" : "reseñas nuevas"}` +
        ` (${resenas_buenas} de 4-5 estrellas).`
    );
  }

  return {
    periodo: input.periodo,
    captados,
    agendados,
    asistidos,
    resenas_nuevas,
    resenas_buenas,
    suscripcion: input.suscripcion,
    mensaje_cliente: partes.join("\n"),
  };
}
