#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Deploy Garmin AI Coach to mithrandir.404i
#
# Run from your Mac:   ./scripts/deploy.sh
#
# What it does:
#   1. SSH into mithrandir.404i (uses SSH agent forwarding for GitHub access)
#   2. Clone the repo if new, or pull latest changes
#   3. Install MCP npm dependencies
#   4. Create .env from example if missing, generate auth token if unset
#   5. Build and start the Docker stack
# =============================================================================
set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
SERVER="mithrandir.404i"
REMOTE_USER="tsochkata"
REMOTE_DIR="/home/${REMOTE_USER}/coach"
REPO_URL="git@github.com:404i/coach.git"
COMPOSE_CMD="docker compose"   # Docker Compose v2 (already installed)

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${BLUE}▶ $*${NC}"; }
success() { echo -e "${GREEN}✓ $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $*${NC}"; }
err()     { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }

# ─── Pre-flight: SSH agent must be running with a loaded key ─────────────────
if ! ssh-add -l &>/dev/null; then
  err "SSH agent has no keys loaded. Run:  ssh-add ~/.ssh/id_rsa  (or your key)"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Garmin AI Coach — Deploy to mithrandir.404i          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ─── Build the remote script (here-doc runs entirely over one SSH connection) ─
REMOTE_SCRIPT=$(cat <<'REMOTE_EOF'
set -euo pipefail

REMOTE_DIR="__REMOTE_DIR__"
REPO_URL="__REPO_URL__"
COMPOSE_CMD="__COMPOSE_CMD__"
SERVER="__SERVER__"

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${BLUE}▶ $*${NC}"; }
success() { echo -e "${GREEN}✓ $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $*${NC}"; }

# ── 1. Clone or update repo ───────────────────────────────────────────────────
if [[ -d "$REMOTE_DIR/.git" ]]; then
  info "Pulling latest changes..."
  cd "$REMOTE_DIR"
  git pull --recurse-submodules
  git submodule update --init --recursive
  success "Repo updated"
else
  info "Cloning repo to $REMOTE_DIR ..."
  git clone --recurse-submodules "$REPO_URL" "$REMOTE_DIR"
  cd "$REMOTE_DIR"
  success "Repo cloned"
fi

cd "$REMOTE_DIR"

# ── 2. MCP npm dependencies ───────────────────────────────────────────────────
info "Installing MCP npm dependencies..."
cd mcp && npm install --omit=dev --silent && cd ..
success "npm install done"

# ── 3. .env setup ─────────────────────────────────────────────────────────────
if [[ ! -f ".env" ]]; then
  info "Creating .env from .env.example ..."
  cp .env.example .env
  # Use UTC on the server; user can edit later
  sed -i "s|TZ=UTC|TZ=UTC|" .env
  warn ".env created — review it at: $REMOTE_DIR/.env"
fi

# ── 4. Generate MCP auth token if not already set ─────────────────────────────
CURRENT_TOKEN=$(grep "^MCP_AUTH_TOKEN=" .env | cut -d= -f2)
if [[ -z "$CURRENT_TOKEN" ]]; then
  info "Generating MCP auth token..."
  TOKEN=$(openssl rand -hex 32)
  sed -i "s|^MCP_AUTH_TOKEN=.*|MCP_AUTH_TOKEN=${TOKEN}|" .env
  success "MCP_AUTH_TOKEN generated and saved to .env"
  echo ""
  echo "  ┌─────────────────────────────────────────────────────────────┐"
  echo "  │ Add this to Claude Desktop config (claude_desktop_config.json) │"
  echo "  │   \"Authorization\": \"Bearer ${TOKEN}\"  │"
  echo "  └─────────────────────────────────────────────────────────────┘"
  echo ""
else
  success "MCP_AUTH_TOKEN already set"
fi

# ── 5. Encryption key (coach backend) ─────────────────────────────────────────
CURRENT_ENC=$(grep "^ENCRYPTION_KEY=" .env | cut -d= -f2)
if [[ -z "$CURRENT_ENC" ]]; then
  info "Generating ENCRYPTION_KEY..."
  ENC_KEY=$(openssl rand -hex 32)
  sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${ENC_KEY}|" .env
  success "ENCRYPTION_KEY generated"
fi

# ── 6. Create data directories the volumes expect ─────────────────────────────
info "Ensuring data directories exist..."
mkdir -p data/garmin/HealthData/DBs \
         data/garmin/HealthData/FitFiles \
         data/garmin/HealthData/RHR \
         data/garmin/HealthData/Sleep \
         data/garmin/HealthData/Weight \
         backend/data \
         mcp/memories \
         logs
success "Data dirs ready"

# ── 7. Build Docker images ────────────────────────────────────────────────────
info "Building Docker images (this may take a while first time)..."
$COMPOSE_CMD build
success "Images built"

# ── 8. Start / restart the stack ─────────────────────────────────────────────
info "Starting Docker stack..."
$COMPOSE_CMD up -d
success "Stack started"

# ── 9. Health check ───────────────────────────────────────────────────────────
info "Waiting for services to be healthy..."
sleep 8
BACKEND_STATUS=$($COMPOSE_CMD ps --format json 2>/dev/null | python3 -c "
import sys, json
lines = sys.stdin.read().strip().split('\n')
for l in lines:
    try:
        s = json.loads(l)
        name = s.get('Name','')
        state = s.get('State','')
        health = s.get('Health','')
        print(f'  {name}: {state} {health}')
    except: pass
" 2>/dev/null || $COMPOSE_CMD ps)
echo ""
echo "Service status:"
echo "$BACKEND_STATUS"
echo ""

info "Checking MCP health endpoint..."
MCP_HEALTH=$(curl -sf http://localhost:3001/health 2>/dev/null && echo "OK" || echo "NOT YET READY")
echo "  MCP /health → $MCP_HEALTH"
echo ""

success "Deployment complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Backend API : http://${SERVER}:8080/api/health"
echo " MCP SSE     : http://${SERVER}:3001/mcp   (requires auth token)"
echo " MCP health  : http://${SERVER}:3001/health"
echo ""
echo " First time? Run Garmin auth setup:"
echo "   ssh ${SERVER} 'cd ${REMOTE_DIR} && ./scripts/server-setup.sh'"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
REMOTE_EOF
)

# Substitute constants into the here-doc
REMOTE_SCRIPT="${REMOTE_SCRIPT//__REMOTE_DIR__/$REMOTE_DIR}"
REMOTE_SCRIPT="${REMOTE_SCRIPT//__REPO_URL__/$REPO_URL}"
REMOTE_SCRIPT="${REMOTE_SCRIPT//__COMPOSE_CMD__/$COMPOSE_CMD}"
REMOTE_SCRIPT="${REMOTE_SCRIPT//__SERVER__/$SERVER}"

# ─── Execute on server with agent forwarding ─────────────────────────────────
info "Connecting to $SERVER ..."
ssh -A -t "${REMOTE_USER}@${SERVER}" "bash -s" <<< "$REMOTE_SCRIPT"
