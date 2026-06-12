-- ============================================================================
-- 20260610120000_shadow_mode.sql — F0 del Nexus Data Flywheel (§10.1).
-- Registra, en paralelo y SIN servir, qué habría respondido qualify_lead frente
-- a lo que sirvió el brain de producción (Gemini). Riesgo de usuario cero:
-- solo escritura observacional desde el server (service-role).
-- Patrón de seguridad = agent_logs: RLS deny-all (sin políticas) → únicamente
-- accesible con service-role. PII: mensaje_user/resp_produccion son dato personal
-- (Ley 19.628 / 21.719); este corpus alimenta F0.5 y se anonimiza en F2.
-- Idempotente (IF NOT EXISTS).
-- ============================================================================
create table if not exists public.shadow_runs (
  id              bigint generated always as identity primary key,
  cliente_id      uuid not null references public.clientes(id) on delete cascade,
  session_id      text,
  turno_idx       int,
  mensaje_user    text,
  resp_produccion text,          -- lo que sirvió el brain de producción (Gemini)
  envelope_shadow jsonb,         -- envelope devuelto por qualify_lead (sin servir)
  modelo_shadow   text,
  latencia_ms     int,
  ts              timestamptz not null default now()
);
comment on table public.shadow_runs is 'F0 shadow mode: respuesta de produccion vs envelope de qualify_lead, sin servir. RLS deny-all (solo service-role). PII; anonimizar en F2.';

create index if not exists shadow_runs_cliente_ts_idx on public.shadow_runs (cliente_id, ts desc);

alter table public.shadow_runs enable row level security;  -- sin políticas → deny-all; service-role bypassa
revoke all on public.shadow_runs from anon, authenticated;
