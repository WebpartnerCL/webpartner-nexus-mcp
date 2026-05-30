-- ============================================================================
-- 20260529120000_init_nexus.sql
-- Bóveda Nexus 2.0 — capa de datos canónica de Webpartner Nexus AIOS
-- Motor: Supabase (PostgreSQL 15+)
-- Fuente de verdad de los 3 módulos:
--   M1 Web Agentic · M2 Reputación/Reseñas · M3 Reactivación/Semáforo
-- Idempotente: seguro de re-ejecutar (IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================================

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- Auto-actualiza updated_at en cada UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Clasificación semáforo por recencia de última compra (M3).
--   Verde  : < 6 meses
--   Amarillo: 6–12 meses
--   Rojo   : > 12 meses
--   NULL   : sin fecha de última compra (no clasificable)
-- STABLE (no IMMUTABLE) porque depende de la fecha actual.
create or replace function public.nexus_semaforo(fecha_ultima_compra date)
returns text
language sql
stable
as $$
  select case
    when fecha_ultima_compra is null                                   then null
    when fecha_ultima_compra >  (current_date - interval '6 months')   then 'verde'
    when fecha_ultima_compra >  (current_date - interval '12 months')  then 'amarillo'
    else 'rojo'
  end;
$$;

-- ── clientes (tenants = clientes de WebPartner) ───────────────────────────────
create table if not exists public.clientes (
  id                 uuid primary key default gen_random_uuid(),
  nombre_negocio     text not null,
  rubro              text,
  slug               text not null unique,                 -- para URLs (Standard-Urls-CasosUso)
  google_review_url  text,                                 -- M2: destino reseña 4-5★
  cal_url            text,                                 -- Cal.com del cliente
  wa_phone_number_id text,                                 -- WhatsApp Cloud API (Meta)
  tono               text not null default 'cercano y profesional',
  politicas_faq      jsonb not null default '{}'::jsonb,   -- base de conocimiento del agente
  plan               text not null default 'free'
                       check (plan in ('free','pro','scale')),
  activo             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table  public.clientes is 'Tenants (clientes de WebPartner). Aíslan sus datos por cliente_id.';
comment on column public.clientes.politicas_faq is 'Base de conocimiento del agente Claude (única fuente de verdad anti-alucinación).';
comment on column public.clientes.plan is 'Plan de metering: free | pro | scale.';

-- ── leads_central ─────────────────────────────────────────────────────────────
create table if not exists public.leads_central (
  id_lead             uuid primary key default gen_random_uuid(),
  cliente_id          uuid not null references public.clientes(id) on delete cascade,
  nombre_completo     text,
  telefono_whatsapp   text
                        check (telefono_whatsapp is null
                               or telefono_whatsapp ~ '^\+[1-9]\d{1,14}$'),   -- E.164
  email               text,
  origen              text not null default 'manual'
                        check (origen in ('landing_agentic','meta_ads','reactivacion_db','whatsapp','manual')),
  necesidad           text,
  fecha_ultima_compra date,                                -- M3 (alimenta el semáforo)
  fase_embudo         text not null default 'nuevo'
                        check (fase_embudo in ('nuevo','dialogando_ia','agendado','cerrado','descartado','inactivo')),
  lead_score          int not null default 0 check (lead_score between 0 and 10),
  historial_chat_ia   jsonb not null default '[]'::jsonb,  -- memoria: [{role,content,ts}]
  cal_event_id        text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table  public.leads_central is 'Leads de todos los módulos. etiqueta_semaforo NO se almacena: se calcula en leads_semaforo_v.';
comment on column public.leads_central.historial_chat_ia is 'Memoria conversacional del agente: array JSON [{role,content,ts}].';

-- Clave natural del lead en WhatsApp → habilita upsert por (cliente_id, teléfono).
create unique index if not exists leads_central_cliente_tel_uidx
  on public.leads_central (cliente_id, telefono_whatsapp)
  where telefono_whatsapp is not null;

create index if not exists leads_central_cliente_fase_idx
  on public.leads_central (cliente_id, fase_embudo);
create index if not exists leads_central_cliente_fultcompra_idx
  on public.leads_central (cliente_id, fecha_ultima_compra);
create index if not exists leads_central_cliente_created_idx
  on public.leads_central (cliente_id, created_at desc);

-- ── control_resenas (M2) ───────────────────────────────────────────────────────
create table if not exists public.control_resenas (
  id_review        uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null references public.clientes(id) on delete cascade,
  id_lead          uuid references public.leads_central(id_lead) on delete set null,  -- nullable: CSV sin lead
  calificacion     int check (calificacion between 1 and 5),
  feedback_interno text,                                   -- solo se persiste para 1-3★
  enviado_a_google boolean not null default false,
  token_unico      text not null unique,                  -- token del link único de reseña
  created_at       timestamptz not null default now()
);
comment on table public.control_resenas is 'M2 Reputación: 1-3★ → feedback interno (fuera de Google) · 4-5★ → Google.';
create index if not exists control_resenas_cliente_idx on public.control_resenas (cliente_id);
create index if not exists control_resenas_lead_idx    on public.control_resenas (id_lead);

-- ── Metering / multi-tenant (visión SaaS pública, Fase 2) ─────────────────────
create table if not exists public.api_keys (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  key_hash    text not null unique,                       -- SHA-256 de la API key (NUNCA la key en claro)
  label       text,
  plan        text not null default 'free' check (plan in ('free','pro','scale')),
  revoked     boolean not null default false,
  created_at  timestamptz not null default now()
);
comment on table public.api_keys is 'Llaves API por tenant. Solo se guarda el hash SHA-256, jamás la clave en claro.';
create index if not exists api_keys_cliente_idx on public.api_keys (cliente_id);

create table if not exists public.usage_events (
  id          bigint generated always as identity primary key,
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  tool        text not null,
  units       int  not null default 1,
  ts          timestamptz not null default now()
);
comment on table public.usage_events is 'Registro de consumo por tenant/tool (metering, cuotas).';
create index if not exists usage_events_cliente_ts_idx      on public.usage_events (cliente_id, ts desc);
create index if not exists usage_events_cliente_tool_ts_idx on public.usage_events (cliente_id, tool, ts desc);

create table if not exists public.quotas (
  plan           text not null,
  tool           text not null,
  limite_mensual int  not null,                            -- -1 = ilimitado
  primary key (plan, tool)
);
comment on table public.quotas is 'Límite mensual por (plan, tool). -1 = ilimitado.';

-- ── Triggers updated_at ────────────────────────────────────────────────────────
drop trigger if exists trg_clientes_updated_at on public.clientes;
create trigger trg_clientes_updated_at
  before update on public.clientes
  for each row execute function public.set_updated_at();

drop trigger if exists trg_leads_updated_at on public.leads_central;
create trigger trg_leads_updated_at
  before update on public.leads_central
  for each row execute function public.set_updated_at();

-- ── Vista semáforo (M3) ─────────────────────────────────────────────────────────
-- etiqueta_semaforo se calcula aquí (no es columna) porque depende de la fecha actual.
-- security_invoker: la vista respeta la RLS del rol que consulta (no la del owner).
create or replace view public.leads_semaforo_v
  with (security_invoker = true)
as
select
  l.*,
  public.nexus_semaforo(l.fecha_ultima_compra) as etiqueta_semaforo
from public.leads_central l;
comment on view public.leads_semaforo_v is 'leads_central + etiqueta_semaforo (verde/amarillo/rojo) para campañas M3.';
