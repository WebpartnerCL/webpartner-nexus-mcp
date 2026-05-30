-- ============================================================================
-- seed.sql — datos semilla (cuotas + tenant de dogfooding WebPartner)
-- Idempotente (upsert / on conflict do nothing).
-- Aplicar DESPUÉS de las migraciones.
-- ============================================================================

-- ── Cuotas por (plan, tool). -1 = ilimitado. Ajustables según costos reales. ──
insert into public.quotas (plan, tool, limite_mensual) values
  ('free',  'qualify_lead',           100),
  ('free',  'send_whatsapp',          100),
  ('free',  'schedule_appointment',    50),
  ('free',  'generate_review_link',   100),
  ('pro',   'qualify_lead',          2000),
  ('pro',   'send_whatsapp',         2000),
  ('pro',   'schedule_appointment',  1000),
  ('pro',   'generate_review_link',  2000),
  ('scale', 'qualify_lead',            -1),
  ('scale', 'send_whatsapp',           -1),
  ('scale', 'schedule_appointment',    -1),
  ('scale', 'generate_review_link',    -1)
on conflict (plan, tool) do update
  set limite_mensual = excluded.limite_mensual;

-- ── Tenant de dogfooding: WebPartner mismo (plan scale = ilimitado). ──────────
insert into public.clientes (slug, nombre_negocio, rubro, cal_url, tono, plan, politicas_faq)
values (
  'webpartner',
  'WebPartner',
  'agencia-software',
  'https://cal.com/mauricio-allendes-us6mik/45min',
  'cercano y profesional',
  'scale',
  '{}'::jsonb
)
on conflict (slug) do nothing;
