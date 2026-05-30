-- ============================================================================
-- 20260529122000_add_api_keys_is_service.sql
-- Scope de llaves API para el control-plane multi-tenant.
-- ----------------------------------------------------------------------------
-- is_service = true  → llave de SERVICIO (WebPartner/n8n): puede operar sobre
--                      cualquier cliente_id (lo pasa en los args de la tool).
-- is_service = false → llave de TENANT (Fase 2, SaaS): acotada a su propio
--                      cliente_id; el dispatcher rechaza args de otro tenant.
-- Aplicar después de 20260529120000_init_nexus.sql.
-- ============================================================================
alter table public.api_keys
  add column if not exists is_service boolean not null default false;

comment on column public.api_keys.is_service is
  'true = llave de servicio (cross-tenant, ej. WebPartner/n8n). false = llave de tenant (acotada a su cliente_id).';
