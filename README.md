# WebPartner MCP Server

Servidor MCP que expone el backend n8n de WebPartner como herramientas consumibles por agentes de IA (Claude, ChatGPT, Cursor, etc.).

## Herramientas disponibles

| Tool | Descripción |
|---|---|
| `query_webpartner` | Consulta general — servicios, cotización o casos |
| `get_webpartner_services` | Lista completa de servicios con precios |
| `get_case_study` | Caso de éxito por industria con métricas reales |

## Instalación local

```bash
cd 05-Sistema/Scripts/mcp-server-wrapper
npm install
npm run build
```

## Uso en Claude Desktop

Agregar a `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "webpartner": {
      "command": "node",
      "args": ["/ruta/absoluta/mcp-server-wrapper/dist/index.js"],
      "env": {
        "N8N_WEBHOOK_BASE": "https://n8n.srv1105450.hstgr.cloud/webhook"
      }
    }
  }
}
```

## Registro en Smithery

1. Ir a https://smithery.ai/new
2. Conectar el repo GitHub `WebpartnerCL/el-baul` (o crear repo separado `webpartner-mcp`)
3. Apuntar al directorio `05-Sistema/Scripts/mcp-server-wrapper`
4. Smithery detecta el `package.json` y construye automáticamente
5. Configurar variable de entorno `N8N_WEBHOOK_BASE` en el panel de Smithery

## Prerequisitos antes de activar

- [ ] Workflows activos en n8n (activar manualmente desde la UI)
- [ ] Credencial OpenAI conectada en n8n
- [ ] Variables de entorno n8n configuradas: `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- [ ] Para pSEO: base Airtable creada con schema documentado en el JSON

## Variables de entorno

| Variable | Descripción |
|---|---|
| `N8N_WEBHOOK_BASE` | URL base del n8n VPS (sin slash final) |

## Arquitectura

```
Claude / ChatGPT / Cursor
        │ MCP Protocol (stdio)
        ▼
WebPartner MCP Server (este wrapper)
        │ HTTP POST
        ▼
n8n VPS (Hostinger)
  ├── /webhook/venta-mcp       → MCP Sales Agent (GPT-4o + routing)
  └── /webhook/webpartner-knowledge → RAG Knowledge Base
```
