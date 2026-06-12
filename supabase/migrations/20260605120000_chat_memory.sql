-- ============================================================================
-- 20260605120000_chat_memory.sql
-- Memoria conversacional del agente M1 (Web Agentic).
--   * chat_sessions: hilo por visitante web anónimo (clave: cliente_id + session_id)
--   * chat_session_append: append seguro de turnos a una sesión web (anon)
--   * lead_append_history: append de turnos a leads_central por teléfono (anon)
-- Patrón de seguridad: tabla con RLS deny-by-default; el único acceso de `anon`
-- es vía estas funciones SECURITY DEFINER (igual que capture_lead). Cap de 80
-- turnos por hilo para acotar crecimiento. Idempotente (IF NOT EXISTS / OR REPLACE).
-- ============================================================================

-- ── chat_sessions (memoria de hilos web; substrato cross-canal) ────────────────
create table if not exists public.chat_sessions (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references public.clientes(id) on delete cascade,
  session_id        text not null,                              -- uuid opaco del browser
  canal             text not null default 'web',
  historial_chat_ia jsonb not null default '[]'::jsonb,         -- [{role,content,ts}]
  telefono          text,                                       -- se setea al identificar al lead
  lead_id           uuid references public.leads_central(id_lead) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (cliente_id, session_id)
);
comment on table public.chat_sessions is 'Memoria del agente web por sesión anónima. RLS deny-by-default: solo accesible vía RPC SECURITY DEFINER.';
create index if not exists chat_sessions_cliente_idx on public.chat_sessions (cliente_id, updated_at desc);

alter table public.chat_sessions enable row level security;  -- sin políticas anon → solo vía RPC

drop trigger if exists trg_chat_sessions_updated_at on public.chat_sessions;
create trigger trg_chat_sessions_updated_at
  before update on public.chat_sessions
  for each row execute function public.set_updated_at();

-- ── Helper: recorta un array jsonb a sus últimos N elementos (orden preservado) ─
create or replace function public.jsonb_tail(arr jsonb, n int)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when arr is null or jsonb_typeof(arr) <> 'array' then '[]'::jsonb
    when jsonb_array_length(arr) <= n then arr
    else (
      select coalesce(jsonb_agg(value order by ord), '[]'::jsonb)
      from jsonb_array_elements(arr) with ordinality e(value, ord)
      where ord > jsonb_array_length(arr) - n
    )
  end;
$$;

-- ── chat_session_append: añade turnos a la sesión web (upsert, cap 80) ─────────
create or replace function public.chat_session_append(
  p_cliente_id uuid,
  p_session_id text,
  p_canal      text,
  p_turns      jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid   text := left(coalesce(p_session_id, ''), 120);
  v_canal text := coalesce(nullif(p_canal, ''), 'web');
  v_turns jsonb := coalesce(p_turns, '[]'::jsonb);
  v_hist  jsonb;
begin
  if p_cliente_id is null or v_sid = '' or jsonb_typeof(v_turns) <> 'array' then
    return;
  end if;
  if not exists (select 1 from public.clientes c where c.id = p_cliente_id and c.activo) then
    return;  -- tenant inexistente/inactivo: no persistimos basura
  end if;

  insert into public.chat_sessions (cliente_id, session_id, canal, historial_chat_ia)
  values (p_cliente_id, v_sid, v_canal, '[]'::jsonb)
  on conflict (cliente_id, session_id) do nothing;

  select historial_chat_ia into v_hist
  from public.chat_sessions
  where cliente_id = p_cliente_id and session_id = v_sid
  for update;

  update public.chat_sessions
  set historial_chat_ia = public.jsonb_tail(coalesce(v_hist, '[]'::jsonb) || v_turns, 80),
      canal = v_canal,
      updated_at = now()
  where cliente_id = p_cliente_id and session_id = v_sid;
end;
$$;

-- ── lead_append_history: añade turnos a leads_central por teléfono (cap 80) ─────
-- Puente cross-canal: el chat web identificado escribe aquí; el agente de
-- WhatsApp lee historial_chat_ia por (cliente_id, telefono) y "recuerda".
create or replace function public.lead_append_history(
  p_cliente_id uuid,
  p_telefono   text,
  p_turns      jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turns jsonb := coalesce(p_turns, '[]'::jsonb);
begin
  if p_cliente_id is null
     or p_telefono is null
     or p_telefono !~ '^\+[1-9]\d{1,14}$'
     or jsonb_typeof(v_turns) <> 'array' then
    return;
  end if;

  update public.leads_central
  set historial_chat_ia = public.jsonb_tail(coalesce(historial_chat_ia, '[]'::jsonb) || v_turns, 80),
      updated_at = now()
  where cliente_id = p_cliente_id and telefono_whatsapp = p_telefono;
end;
$$;

-- ── Grants: anon/authenticated solo pueden EJECUTAR las RPC (no tocar la tabla) ─
revoke all on function public.chat_session_append(uuid, text, text, jsonb) from public;
grant execute on function public.chat_session_append(uuid, text, text, jsonb) to anon, authenticated, service_role;

revoke all on function public.lead_append_history(uuid, text, jsonb) from public;
grant execute on function public.lead_append_history(uuid, text, jsonb) to anon, authenticated, service_role;

-- ── chat_session_promote: enlaza la sesión web a un lead y copia su memoria ─────
-- Puente cross-canal web → WhatsApp. Idempotente: copia el historial web a
-- leads_central SOLO si el lead aún no tiene memoria (no duplica en recapturas).
create or replace function public.chat_session_promote(
  p_cliente_id uuid,
  p_session_id text,
  p_telefono   text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid      text := left(coalesce(p_session_id, ''), 120);
  v_hist     jsonb;
  v_lead     uuid;
  v_existing jsonb;
begin
  if p_cliente_id is null or v_sid = '' or p_telefono is null
     or p_telefono !~ '^\+[1-9]\d{1,14}$' then
    return;
  end if;

  select historial_chat_ia into v_hist
  from public.chat_sessions
  where cliente_id = p_cliente_id and session_id = v_sid;
  if not found then
    return;
  end if;

  select id_lead, historial_chat_ia into v_lead, v_existing
  from public.leads_central
  where cliente_id = p_cliente_id and telefono_whatsapp = p_telefono;
  if v_lead is null then
    return;  -- capture_lead debe crear el lead antes
  end if;

  update public.chat_sessions
  set telefono = p_telefono, lead_id = v_lead, updated_at = now()
  where cliente_id = p_cliente_id and session_id = v_sid;

  if coalesce(jsonb_array_length(v_existing), 0) = 0
     and coalesce(jsonb_array_length(v_hist), 0) > 0 then
    update public.leads_central
    set historial_chat_ia = public.jsonb_tail(v_hist, 80), updated_at = now()
    where id_lead = v_lead;
  end if;
end;
$$;

revoke all on function public.chat_session_promote(uuid, text, text) from public;
grant execute on function public.chat_session_promote(uuid, text, text) to anon, authenticated, service_role;
