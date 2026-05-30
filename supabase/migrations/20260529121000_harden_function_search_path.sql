-- ============================================================================
-- 20260529121000_harden_function_search_path.sql
-- Fix-forward de seguridad: cierra el WARN 0011 del linter de Supabase
-- (function_search_path_mutable).
-- ----------------------------------------------------------------------------
-- Una función con search_path mutable puede ser vector de inyección de
-- search_path. Fijamos un search_path inmutable y vacío ('') en las dos
-- funciones del esquema. Ambas solo referencian objetos de pg_catalog
-- (now(), current_date, interval), que siguen resolviéndose con search_path
-- vacío (pg_catalog se busca siempre), así que '' es seguro.
--
-- Nota de disciplina de migraciones: las migraciones ya aplicadas (init_nexus,
-- rls_phase1) son INMUTABLES. No se editan retroactivamente; se corrige hacia
-- adelante con esta migración. Aplicar DESPUÉS de 20260529120000_init_nexus.sql.
-- ============================================================================

alter function public.set_updated_at()     set search_path = '';
alter function public.nexus_semaforo(date) set search_path = '';
