#!/usr/bin/env bash
# ============================================================================
# vps-up.sh — despliega/actualiza el Nexus MCP en el VPS (Docker, red de n8n).
# Uso (una sola línea, robusto, sin pegar bloques ni placeholders):
#   curl -fsSL https://raw.githubusercontent.com/WebpartnerCL/webpartner-nexus-mcp/main/deploy/vps-up.sh | bash
# Pide las 2 keys de forma interactiva, construye y levanta el contenedor.
# ============================================================================
set -euo pipefail

REPO=/opt/webpartner-nexus-mcp
NET=root_default   # red donde corre n8n (n8n lo llamará como http://nexus-mcp:3000)

echo ">> Sincronizando repo..."
if [ -d "$REPO/.git" ]; then
  cd "$REPO"
  git fetch origin main --quiet && git reset --hard origin/main --quiet
else
  rm -rf "$REPO"
  git clone --quiet https://github.com/WebpartnerCL/webpartner-nexus-mcp.git "$REPO"
  cd "$REPO"
fi

# .env: pedir secretos solo si falta o tiene placeholders.
if [ ! -f .env ] || grep -q 'TU_' .env 2>/dev/null; then
  echo ""
  printf ">> Pega tu SUPABASE_SERVICE_ROLE_KEY y presiona Enter: "
  read -rs SRK </dev/tty; echo ""
  printf ">> Pega tu ANTHROPIC_API_KEY y presiona Enter: "
  read -rs AK </dev/tty; echo ""
  cat > .env <<EOF
PORT=3000
SUPABASE_URL=https://banhnvizuzpmlhnchsfn.supabase.co
SUPABASE_SERVICE_ROLE_KEY=$SRK
ANTHROPIC_API_KEY=$AK
CLAUDE_MODEL=claude-sonnet-4-6
PUBLIC_BASE_URL=https://webpartners.cl
EOF
  echo ">> .env creado."
else
  echo ">> .env ya existe con valores. Reusando."
fi

echo ">> Build de la imagen (puede tardar 1-2 min)..."
docker rm -f nexus-mcp >/dev/null 2>&1 || true
docker build -t nexus-mcp "$REPO"

echo ">> Levantando contenedor en la red '$NET'..."
docker run -d --name nexus-mcp --restart unless-stopped --network "$NET" --env-file "$REPO/.env" nexus-mcp >/dev/null
sleep 4

echo ""
echo "=== STATUS ==="
docker ps --filter name=nexus-mcp --format "{{.Names}} {{.Status}}"
echo "=== HEALTH ==="
if docker exec nexus-mcp wget -qO- http://localhost:3000/; then
  echo ""
  echo ">> OK: MCP vivo. n8n lo usará como  http://nexus-mcp:3000"
else
  echo ""
  echo ">> ERROR: el contenedor no respondio. Logs:"
  docker logs nexus-mcp --tail 25
fi
