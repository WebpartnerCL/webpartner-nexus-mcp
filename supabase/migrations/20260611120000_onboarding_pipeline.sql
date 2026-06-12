-- ============================================================================
-- 20260611120000_onboarding_pipeline.sql
-- Agrega columnas necesarias para el pipeline de onboarding Nexus:
--   · wa_template_resena  — nombre/ID de la plantilla Meta aprobada para M2
--   · cerebro             — modelo LLM preferido del tenant (gemini|openai|anthropic)
-- ============================================================================

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS wa_template_resena TEXT,
  ADD COLUMN IF NOT EXISTS cerebro TEXT NOT NULL DEFAULT 'gemini'
    CHECK (cerebro IN ('gemini', 'openai', 'anthropic'));

COMMENT ON COLUMN clientes.wa_template_resena IS
  'Nombre de la plantilla WhatsApp aprobada por Meta para solicitudes de reseña (M2). NULL = M2 no activo.';

COMMENT ON COLUMN clientes.cerebro IS
  'Modelo LLM preferido para este tenant: gemini (default/free) | openai | anthropic.';
