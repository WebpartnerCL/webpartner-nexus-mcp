-- ============================================================================
-- 20260617120000_billing_mvp.sql
-- Back-office MVP — Módulo A: Cobros & Facturación (la columna vertebral de ingresos).
--
-- Objetivo: que WebPartner (Cliente Cero) tenga MRR REAL y medible, y que el
-- acceso del agente quede atado al pago. Antes `clientes.plan` se seteaba a mano y
-- no había tabla que registrara ingreso recurrente → MRR registrado = $0.
--
-- Añade:
--   1) suscripciones — el contrato recurrente por tenant (base + fee performance).
--   2) facturas      — cada cobro emitido (boleta/factura SII + estado de pago).
--   3) vista mrr_v   — el número: MRR base por moneda + activas/morosas.
--
-- Postura RLS = Fase 1 (igual que init/rls): deny-by-default, solo service_role.
-- Idempotente. Reusa public.set_updated_at() (definido en init_nexus).
-- ============================================================================

create table if not exists public.suscripciones (
  id                     uuid primary key default gen_random_uuid(),
  cliente_id             uuid not null references public.clientes(id) on delete cascade,
  peldano                text not null check (peldano in ('N0','N1','N2','N3','N4')),
  estado                 text not null default 'trial'
                           check (estado in ('trial','activa','morosa','suspendida','cancelada')),
  base_monto             numeric not null default 0,
  fee_unitario           numeric not null default 0,
  moneda                 text not null default 'CLP' check (moneda in ('CLP','USD')),
  stripe_customer_id     text,
  stripe_subscription_id text unique,
  inicio                 date not null default current_date,
  proximo_cobro          date,
  cancelada_en           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
comment on table public.suscripciones is 'Contrato recurrente por tenant (base + fee performance). Fuente del MRR.';

-- Una sola suscripción VIVA por tenant.
create unique index if not exists suscripciones_cliente_viva_uidx
  on public.suscripciones (cliente_id)
  where estado in ('trial','activa','morosa','suspendida');
create index if not exists suscripciones_estado_idx on public.suscripciones (estado);

create table if not exists public.facturas (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references public.clientes(id) on delete cascade,
  suscripcion_id    uuid references public.suscripciones(id) on delete set null,
  periodo           text not null,
  monto_base        numeric not null default 0,
  citas_asistidas   int not null default 0,
  monto_variable    numeric not null default 0,
  monto_total       numeric not null default 0,
  moneda            text not null default 'CLP' check (moneda in ('CLP','USD')),
  tipo              text check (tipo in ('boleta','factura')),
  folio_sii         text,
  url               text,
  estado            text not null default 'pendiente'
                      check (estado in ('pendiente','pagada','fallida','anulada')),
  stripe_invoice_id text unique,
  emitida_en        timestamptz,
  pagada_en         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.facturas is 'Cobros emitidos por período (boleta/factura SII + estado de pago). Un cobro por (cliente, periodo).';

create unique index if not exists facturas_cliente_periodo_uidx on public.facturas (cliente_id, periodo);
create index if not exists facturas_estado_idx on public.facturas (estado);

drop trigger if exists trg_suscripciones_updated_at on public.suscripciones;
create trigger trg_suscripciones_updated_at
  before update on public.suscripciones
  for each row execute function public.set_updated_at();

drop trigger if exists trg_facturas_updated_at on public.facturas;
create trigger trg_facturas_updated_at
  before update on public.facturas
  for each row execute function public.set_updated_at();

alter table public.suscripciones enable row level security;
alter table public.facturas      enable row level security;

create or replace view public.mrr_v
  with (security_invoker = true)
as
select
  moneda,
  count(*) filter (where estado = 'activa')                     as suscripciones_activas,
  count(*) filter (where estado = 'morosa')                     as morosas,
  coalesce(sum(base_monto) filter (where estado = 'activa'), 0) as mrr_base
from public.suscripciones
group by moneda;
comment on view public.mrr_v is 'MRR base por moneda + conteo de suscripciones activas/morosas (Cliente Cero).';
