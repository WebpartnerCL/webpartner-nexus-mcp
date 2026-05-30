// ============================================================================
// db.ts — cliente Supabase tipado (service_role).
// El service_role OMITE RLS por diseño: el control-plane es el único que opera
// la Bóveda Nexus en Fase 1. Singleton perezoso (no se crea hasta el primer uso).
// ============================================================================
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { WebSocket as WsWebSocket } from "ws";
import type { Database } from "./database.types.js";
import { loadConfig } from "./config.js";

// supabase-js instancia un RealtimeClient que exige WebSocket (nativo solo en Node 22+).
// En Node 20 no existe en global → lo proveemos con 'ws'. No usamos realtime; esto solo
// evita el error "Node.js 20 detected without native WebSocket support" al crear el cliente.
{
  const g = globalThis as unknown as { WebSocket?: unknown };
  if (!g.WebSocket) g.WebSocket = WsWebSocket;
}

export type DbClient = SupabaseClient<Database>;

let _client: DbClient | null = null;

export function db(): DbClient {
  if (_client) return _client;
  const cfg = loadConfig();
  _client = createClient<Database>(
    cfg.supabaseUrl,
    cfg.supabaseServiceRoleKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-application-name": "webpartner-nexus-mcp" } },
    }
  );
  return _client;
}
