-- Matriz de costos viva (roadmap Cliente Cero 2026-06, tarea 1.4).
-- Cada fila = una propuesta/cotización con su desenlace. Alimenta el copiloto de
-- cotización (bandas horas/precio por tipo de proyecto) y el bucle de aprendizaje F1:
-- al cerrar ganada/perdida, la próxima estimación sale de datos reales, no de memoria.
-- Multi-tenant por diseño: hoy la usa el tenant webpartner (Cliente Cero); mañana es
-- feature vendible N2+ (mismo patrón que leads_central).

create table if not exists public.propuestas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  lead_id uuid references public.leads_central(id_lead) on delete set null,
  proyecto text not null,
  peldano text,                          -- N0..N4 | addon | custom
  alcance text,
  horas_estimadas numeric(7,1),
  horas_reales numeric(7,1),
  precio_cotizado numeric(12,0),
  precio_cerrado numeric(12,0),
  moneda text not null default 'CLP',
  estado text not null default 'borrador'
    check (estado in ('borrador','enviada','ganada','perdida','expirada')),
  motivo_cierre text,
  fecha_envio timestamptz,
  fecha_cierre timestamptz,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.propuestas is
  'Matriz de costos viva: propuestas/cotizaciones por tenant con desenlace (estado + motivo_cierre). Alimenta el copiloto de cotización y el aprendizaje F1. RLS deny-by-default: solo service-role.';

create index if not exists propuestas_cliente_estado_idx
  on public.propuestas (cliente_id, estado);

alter table public.propuestas enable row level security;
-- deny-by-default: sin policies (patrón agent_logs / shadow_runs) — acceso solo service-role.
