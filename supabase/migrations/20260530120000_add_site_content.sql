-- ============================================================================
-- 20260530120000_add_site_content.sql
-- Fase 4 (Web Agentic M1) — capa de CONTENIDO del sitio agéntico.
--
-- Objetivo del servicio productizado: onboarding de un cliente = "cargar su
-- información", cero código nuevo. Para eso falta modelar el branding/copys del
-- sitio (la tabla `clientes` solo tenía integraciones + config del agente).
--
-- Añade:
--   1) clientes.sitio_contenido (jsonb) — todo el contenido editable del sitio.
--   2) vista site_config_v (security_invoker) — subconjunto DISPLAY-SAFE de tenants activos.
--   3) lectura pública (anon) ACOTADA por política RLS + grants POR-COLUMNA.
--      anon SOLO ve 7 columnas safe de tenants activos. Nunca expone
--      tono, politicas_faq, wa_phone_number_id, plan, ni leads.
--
-- Nota de implementación: con security_invoker, anon necesita SELECT sobre TODAS
-- las columnas que la vista referencia, incluida `activo` del WHERE. Por eso se
-- concede SELECT sobre las 7 columnas de salida + `activo`. Se REVOCA el SELECT
-- de tabla (default de Supabase) para que el grant por-columna sea efectivo;
-- de lo contrario el grant de tabla expondría TODAS las columnas.
--
-- Idempotente: seguro de re-ejecutar.
-- ============================================================================

-- ── 1) Columna de contenido ───────────────────────────────────────────────────
alter table public.clientes
  add column if not exists sitio_contenido jsonb not null default '{}'::jsonb;

comment on column public.clientes.sitio_contenido is
  'Contenido editable del sitio agéntico (mode, tema, marca, canales públicos, secciones, BANT, legal). Lo consume el frontend vía site_config_v. Validado con Zod en el front.';

-- ── 2) Vista display-safe (el CONTRATO de lectura del frontend) ────────────────
create or replace view public.site_config_v
  with (security_invoker = true)
as
select
  c.id,
  c.slug,
  c.nombre_negocio,
  c.rubro,
  c.cal_url,
  c.google_review_url,
  c.sitio_contenido
from public.clientes c
where c.activo = true;

comment on view public.site_config_v is
  'Proyección display-safe de clientes activos (Web Agentic M1). security_invoker: respeta RLS/grants de anon. Solo 7 columnas safe + activo (para el filtro).';

-- ── 3) Lectura pública acotada (política + grants por-columna) ─────────────────
drop policy if exists clientes_anon_read_active on public.clientes;
create policy clientes_anon_read_active
  on public.clientes for select to anon
  using (activo = true);

-- Revocar el SELECT de TABLA (default de Supabase) para que el grant por-columna
-- sea la única superficie; si no, anon vería todas las columnas.
revoke select on public.clientes from anon;
grant select
  (id, slug, nombre_negocio, rubro, cal_url, google_review_url, sitio_contenido, activo)
  on public.clientes to anon;

grant select on public.site_config_v to anon;
