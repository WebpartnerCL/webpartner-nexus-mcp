-- Performance fee del retainer: medir asistencia a la cita (booking_show).
-- cal_event_at = fecha/hora de la cita (de Cal.com booking.created).
-- booking_show  = true asistió · false no-show · null desconocido. Base del fee.
alter table leads_central
  add column if not exists cal_event_at timestamptz,
  add column if not exists booking_show boolean;

comment on column leads_central.cal_event_at is 'Fecha/hora de la cita agendada (de Cal.com booking.created).';
comment on column leads_central.booking_show is 'Asistió a la cita: true=sí, false=no-show, null=desconocido. Base del fee por performance.';
