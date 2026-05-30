# Bóveda Nexus 2.0 — Capa de datos (Supabase)

Fuente de verdad de los 3 módulos de Webpartner Nexus. Consumida por:
- **MCP control-plane** (este repo) — tools `qualify_lead`, `upsert_lead`, etc.
- **n8n VPS** — orquestación + crons + espejo a Google Sheets (la "Bóveda" que ve el cliente).
- **webpartner-site (Next.js)** — `/api/lead`, páginas de reseña `/r/[slug]`.

## Estado del despliegue (2026-05-29)

✅ **Aplicado y verificado en producción** vía MCP oficial de Supabase.
- **Proyecto:** `webpartner-nexus` · **ref:** `banhnvizuzpmlhnchsfn` · región `sa-east-1` (São Paulo) · org `WebpartnerCL` · PostgreSQL 17 · plan Free.
- 6 tablas + vista `leads_semaforo_v` + función `nexus_semaforo` + RLS activa en las 6.
- Seed: 12 cuotas + tenant `webpartner` (plan scale).
- Linter de seguridad: solo INFO `rls_enabled_no_policy` (intencional, Fase 1). WARN de `search_path` ya corregido.
- `.mcp.json` (raíz del vault) acotado a este `project_ref` (least-privilege).

## Archivos y orden de aplicación

| Orden | Archivo | Contenido |
|------|---------|-----------|
| 1 | `migrations/20260529120000_init_nexus.sql` | Tablas, índices, función semáforo, trigger `updated_at`, vista `leads_semaforo_v` |
| 2 | `migrations/20260529120100_rls.sql` | Activa RLS (deny-by-default; service_role la omite) |
| 3 | `migrations/20260529121000_harden_function_search_path.sql` | Fija `search_path=''` en las funciones (cierra WARN 0011 del linter) |
| 4 | `seed.sql` | Cuotas por plan + tenant de dogfooding `webpartner` |

## Cómo aplicar

### Opción A — Dashboard (SQL Editor) — la más simple
1. Supabase → proyecto → **SQL Editor** → New query.
2. Pegar y ejecutar **en orden**: `20260529120000_init_nexus.sql` → `20260529120100_rls.sql` → `20260529121000_harden_function_search_path.sql` → `seed.sql`.
3. Verificar en **Table Editor** que existan las 6 tablas + la vista.

### Opción B — Supabase CLI
```bash
supabase link --project-ref <PROJECT_REF>
supabase db push                 # aplica migrations/ en orden
# seed: pegar seed.sql en el SQL editor, o:
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

### Opción C — Supabase MCP (la usada en este despliegue)
Con el MCP oficial de Supabase conectado vía OAuth (ver `.mcp.json` en la raíz del vault):
las migraciones se aplican con `apply_migration` (DDL) y el seed con `execute_sql` (datos).
Para CI sin navegador se puede usar un Personal Access Token en el header `Authorization: Bearer`.

## Esquema (resumen)

| Tabla / Vista | Rol |
|---|---|
| `clientes` | Tenants. `politicas_faq` (jsonb) = base de conocimiento del agente. `plan` para metering. |
| `leads_central` | Leads de M1/M3. `historial_chat_ia` (jsonb) = memoria. Upsert por `(cliente_id, telefono_whatsapp)`. |
| `control_resenas` | M2. 1-3★ → `feedback_interno`; 4-5★ → `enviado_a_google`. `token_unico` por link. |
| `api_keys` | Metering: solo `key_hash` (SHA-256), nunca la key en claro. |
| `usage_events` | Log de consumo por `(cliente_id, tool)`. |
| `quotas` | Límite mensual por `(plan, tool)`. `-1` = ilimitado. |
| `leads_semaforo_v` | Vista: `leads_central` + `etiqueta_semaforo` calculada. |

## Semáforo (M3)

`nexus_semaforo(fecha_ultima_compra)` → `verde` (<6m) · `amarillo` (6-12m) · `rojo` (>12m) · `NULL` (sin fecha).
No es columna almacenada (depende de la fecha actual) — se expone en `leads_semaforo_v`.

## Seguridad

- **RLS activada** en las 6 tablas, sin políticas públicas (Fase 1). Solo `service_role` (MCP/n8n) accede.
- **`service_role` key**: jamás en el vault, markdown ni commits. Solo en variables de entorno del MCP/n8n
  o en un gestor de secretos (Bitwarden/1Password). Lección carwash: una key compartida en chat hay que rotarla.
- `api_keys` guarda únicamente el hash SHA-256 de cada clave emitida.
- Datos de leads = datos personales (Chile: Ley 19.628 / 21.719). Definir retención/borrado al exponer Fase 2.

## Fase 2 (cuando se exponga el SaaS público)
- Añadir políticas RLS por tenant (filtrar por `cliente_id`).
- Middleware del MCP: validar `api_keys.key_hash` + `quotas` + registrar `usage_events` antes de ejecutar.
