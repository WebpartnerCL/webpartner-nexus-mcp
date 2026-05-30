// ============================================================================
// index.ts — WebPartner Nexus MCP (control-plane): servidor HTTP.
// Dos superficies sobre el MISMO pipeline (en dispatch.ts):
//   · POST /mcp          → protocolo MCP (Streamable HTTP, stateless) para Claude.
//   · POST /tools/<name> → REST simple para consumidores deterministas (n8n, Next.js).
//   · GET  /             → health check (sin auth/config).
// ============================================================================
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";

import { resolveAuth, type AuthInfo } from "./auth.js";
import { QuotaError } from "./metering.js";
import type { ToolArgs } from "./tools/types.js";
import { ALL_TOOLS, executeTool, ToolNotFoundError } from "./dispatch.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const JSON_HEADERS = { "Content-Type": "application/json" } as const;

// ── MCP server (uno por request, con la auth resuelta del header) ──────────────
function createMCPServer(auth: AuthInfo): Server {
  const server = new Server(
    { name: "webpartner-nexus-mcp", version: "2.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Tool["inputSchema"],
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as ToolArgs;
    try {
      const result = await executeTool(name, args, auth);
      const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      return { content: [{ type: "text", text }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
  });

  return server;
}

// ── HTTP helpers ────────────────────────────────────────────────────────────--
async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function bearer(req: IncomingMessage): string | null {
  const h = req.headers["authorization"];
  if (!h) return null;
  const value = Array.isArray(h) ? h[0] ?? "" : h;
  const m = /^Bearer\s+(.+)$/i.exec(value);
  return m ? m[1]!.trim() : null;
}

/** Resuelve la auth desde el header. null si falta/ inválida; lanza en error de infra. */
async function authFromHeader(req: IncomingMessage): Promise<AuthInfo | null> {
  const key = bearer(req);
  return key ? await resolveAuth(key) : null;
}

// ── Servidor HTTP ───────────────────────────────────────────────────────────--
const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // Health check — sin auth ni config (para el healthcheck del contenedor).
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, JSON_HEADERS);
    res.end(
      JSON.stringify({ status: "ok", server: "webpartner-nexus-mcp", version: "2.0.0" })
    );
    return;
  }

  // REST para consumidores deterministas (n8n, Next.js): POST /tools/<name>, body = args JSON.
  const restMatch =
    req.method === "POST" ? /^\/tools\/([A-Za-z0-9_]+)$/.exec(url.pathname) : null;
  if (restMatch) {
    const name = restMatch[1]!;
    let auth: AuthInfo | null = null;
    try {
      auth = await authFromHeader(req);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ ok: false, error: `auth_error: ${message}` }));
      return;
    }
    if (!auth) {
      res.writeHead(401, JSON_HEADERS);
      res.end(JSON.stringify({ ok: false, error: "unauthorized: Authorization: Bearer <api_key>" }));
      return;
    }

    let args: ToolArgs;
    try {
      const raw = (await readBody(req)).trim();
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("el body debe ser un objeto JSON");
      }
      args = parsed as ToolArgs;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ ok: false, error: `body inválido: ${message}` }));
      return;
    }

    try {
      const result = await executeTool(name, args, auth);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ ok: true, result }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status =
        err instanceof QuotaError ? 429 : err instanceof ToolNotFoundError ? 404 : 400;
      res.writeHead(status, JSON_HEADERS);
      res.end(JSON.stringify({ ok: false, error: message }));
    }
    return;
  }

  // Protocolo MCP (para Claude y clientes MCP-nativos).
  if (url.pathname === "/mcp") {
    let auth: AuthInfo | null = null;
    try {
      auth = await authFromHeader(req);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: "auth_error", detail: message }));
      return;
    }
    if (!auth) {
      res.writeHead(401, JSON_HEADERS);
      res.end(
        JSON.stringify({
          error: "unauthorized",
          detail: "API key inválida o ausente (Authorization: Bearer <key>)",
        })
      );
      return;
    }

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = createMCPServer(auth);
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, await readBody(req));
    return;
  }

  res.writeHead(404, JSON_HEADERS);
  res.end(JSON.stringify({ error: "not_found" }));
});

httpServer.listen(PORT, () => {
  console.log(`WebPartner Nexus MCP escuchando en el puerto ${PORT}`);
  console.log(`  health: GET  http://localhost:${PORT}/`);
  console.log(`  mcp:    POST http://localhost:${PORT}/mcp          (Authorization: Bearer <api_key>)`);
  console.log(`  rest:   POST http://localhost:${PORT}/tools/<name> (Authorization: Bearer <api_key>)`);
});
