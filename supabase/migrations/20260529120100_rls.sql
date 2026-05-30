-- ============================================================================
-- 20260529120100_rls.sql — Row Level Security (postura Fase 1)
-- ----------------------------------------------------------------------------
-- Fase 1 (interno): TODO el acceso pasa por el MCP / n8n usando la SERVICE ROLE
-- key, que OMITE RLS por diseño. Activamos RLS y NO creamos políticas para los
-- roles anon / authenticated → nadie con clave pública puede leer ni escribir.
-- Es deny-by-default: la superficie pública queda cerrada.
--
-- Fase 2 (SaaS público / acceso directo del front): se añadirán políticas por
-- tenant (filtrando por cliente_id vía claim JWT o set_config), por tabla.
-- ============================================================================

alter table public.clientes        enable row level security;
alter table public.leads_central   enable row level security;
alter table public.control_resenas enable row level security;
alter table public.api_keys        enable row level security;
alter table public.usage_events    enable row level security;
alter table public.quotas          enable row level security;

-- (Sin políticas permisivas en Fase 1.)
-- El rol service_role omite RLS y es el único que opera estas tablas.
-- La key anónima (anon) y la de usuario (authenticated) quedan sin acceso.
