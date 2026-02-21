#!/usr/bin/env bash
# =============================================================================
# server-setup.sh — First-time server configuration for Garmin AI Coach
#
# Run ON mithrandir.404i after first deploy:
#   ssh mithrandir.404i
#   cd ~/coach
#   ./scripts/server-setup.sh
#
# Or run remotely from your Mac after deploy.sh:
#   ssh mithrandir.404i 'cd ~/coach && ./scripts/server-setup.sh'
#
# What it does:
#   1. Shows current .env values (redacted)
#   2. Optionally sets timezone and sync time
#   3. Walks through Garmin Credentials setup (MFA-aware)
#   4. Verifies Docker stack health
#   5. Shows Claude Desktop config snippet
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="$REPO_DIR/.env"
SERVER="mithrandir.404i"
MCP_PORT=3001
BACKEND_PORT=8080

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${BLUE}▶ $*${NC}"; }
success() { echo -e "${GREEN}✓ $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $*${NC}"; }
hint()    { echo -e "${CYAN}  $*${NC}"; }
err()     { echo -e "${RED}✗ $*${NC}" >&2; }

cd "$REPO_DIR"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║      Garmin AI Coach — Server First-Time Setup               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Verify we're in the right place ──────────────────────────────────────────
[[ -f "$ENV_FILE" ]] || { err ".env not found at $ENV_FILE — run deploy.sh first"; exit 1; }
[[ -f "docker-compose.yml" ]] || { err "docker-compose.yml not found — are you in the repo root?"; exit 1; }

# ── 1. Show current .env summary (redacted) ───────────────────────────────────
echo "Current .env values:"
while IFS='=' read -r key val; do
  [[ "$key" =~ ^#.*$ ]] && continue
  [[ -z "$key" ]] && continue
  # Redact secrets
  if [[ "$key" =~ TOKEN|KEY|SECRET|PASSWORD ]]; then
    [[ -n "$val" ]] && display="[SET]" || display="[EMPTY]"
  else
    display="${val:-[empty]}"
  fi
  printf "  %-30s = %s\n" "$key" "$display"
done < "$ENV_FILE"
echo ""

# ── 2. Timezone ───────────────────────────────────────────────────────────────
CURRENT_TZ=$(grep "^TZ=" "$ENV_FILE" | cut -d= -f2)
echo "Current timezone: ${CURRENT_TZ:-UTC}"
read -r -p "Set timezone (e.g. Europe/London, America/New_York) [Enter to keep '$CURRENT_TZ']: " NEW_TZ
if [[ -n "$NEW_TZ" ]]; then
  sed -i "s|^TZ=.*|TZ=${NEW_TZ}|" "$ENV_FILE"
  success "Timezone set to $NEW_TZ"
fi

# ── 3. Daily sync time ────────────────────────────────────────────────────────
CURRENT_SYNC=$(grep "^GARMIN_SYNC_TIME=" "$ENV_FILE" | cut -d= -f2)
read -r -p "Daily Garmin sync time 24h [Enter to keep '${CURRENT_SYNC:-06:00}']: " NEW_SYNC
if [[ -n "$NEW_SYNC" ]]; then
  sed -i "s|^GARMIN_SYNC_TIME=.*|GARMIN_SYNC_TIME=${NEW_SYNC}|" "$ENV_FILE"
  success "Sync time set to $NEW_SYNC"
fi

# ── 4. LM Studio (optional AI) ────────────────────────────────────────────────
echo ""
echo "LM Studio configuration"
echo "  If you have LM Studio running on your Mac (${YELLOW}not required${NC}), set its URL here."
echo "  Leave blank to use rule-based coaching (always works)."
echo ""
CURRENT_LLM=$(grep "^LM_STUDIO_URL=" "$ENV_FILE" | cut -d= -f2)
read -r -p "LM Studio URL [Enter to keep '${CURRENT_LLM}']: " NEW_LLM
if [[ -n "$NEW_LLM" ]]; then
  sed -i "s|^LM_STUDIO_URL=.*|LM_STUDIO_URL=${NEW_LLM}|" "$ENV_FILE"
  success "LM Studio URL updated"
fi

# ── 5. Garmin Credentials setup ───────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Garmin Authentication"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if token already exists
if docker compose exec -T coach ls /app/data/garmin_token.json &>/dev/null 2>&1 \
   || [[ -f "backend/data/garmin_token.json" ]] \
   || docker compose exec -T coach test -f /app/backend/data/garmin_token.json 2>/dev/null; then
  warn "Garmin token already exists in the container."
  read -r -p "Re-authenticate anyway? [y/N] " REAUTH
  [[ "${REAUTH,,}" != "y" ]] && echo "" && info "Skipping Garmin auth." && SKIP_AUTH=true || SKIP_AUTH=false
else
  SKIP_AUTH=false
fi

if [[ "$SKIP_AUTH" == "false" ]]; then
  echo ""
  info "Starting interactive Garmin authentication in the coach container..."
  echo ""
  hint "You'll be prompted for:"
  hint "  1. Garmin Connect email"
  hint "  2. Garmin Connect password"
  hint "  3. MFA code (from Garmin's authenticator app / email)"
  echo ""
  hint "The token is stored in the container's /app/backend/data/ volume."
  hint "It persists across restarts and does not go to GitHub."
  echo ""

  # Run garth login interactively inside the coach container
  docker compose exec coach sh -c "
    python3 -c \"
import garth, os, sys
garth.configure(domain='garmin.com')
print('\\nGarmin Connect Login')
print('--------------------')
email = input('Email: ')
password = input('Password: ')
try:
    garth.login(email, password)
    garth.save('/app/backend/data/.garth')
    print('\\n✓ Garmin authentication successful')
    print('  Token saved to /app/backend/data/.garth/')
except Exception as e:
    if 'MFA' in str(e) or 'TOTP' in str(e) or '2FA' in str(e) or 'factor' in str(e).lower():
        print('MFA required. Check your email or authenticator app.')
        mfa = input('MFA code: ')
        try:
            garth.login(email, password, prompt_mfa=lambda: mfa)
            garth.save('/app/backend/data/.garth')
            print('\\n✓ Garmin authentication successful (MFA)')
        except Exception as e2:
            print(f'ERROR: {e2}')
            sys.exit(1)
    else:
        print(f'ERROR: {e}')
        sys.exit(1)
\"
  " || {
    err "Garmin auth failed. Try manually:"
    hint "  docker compose exec coach sh"
    hint "  python3 -c \"import garth; garth.login('email','pass'); garth.save('/app/backend/data/.garth')\""
  }
fi

# ── 6. Trigger initial Garmin data sync ───────────────────────────────────────
echo ""
info "Triggering initial Garmin data sync (background)..."
docker compose exec -d coach sh -c "
  cd /app/vendor/GarminDB && \
  python3 -m garmindb.garmindb --all --download --import --analyze \
  --config_dir /app/data/garmin/GarminConnectConfig.json 2>/dev/null || true
" && success "Sync started in background — may take a few minutes" \
  || warn "Sync trigger failed — sync will run at the scheduled time"

# ── 7. Stack health check ─────────────────────────────────────────────────────
echo ""
info "Checking service health..."
sleep 3
docker compose ps
echo ""

BACKEND_HEALTH=$(curl -sf "http://localhost:${BACKEND_PORT}/api/health" 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f\"  status: {d.get('status','unknown')}  |  profile: {d.get('profile_id','?')}  |  last_sync: {d.get('last_sync','never')}\")
" 2>/dev/null || echo "  (not ready yet — check: docker compose logs coach)")
echo "Backend health: $BACKEND_HEALTH"

MCP_HEALTH=$(curl -sf "http://localhost:${MCP_PORT}/health" 2>/dev/null \
  && echo "  OK" || echo "  (not ready — check: docker compose logs mcp)")
echo "MCP health:     $MCP_HEALTH"

# ── 8. Show Claude Desktop config ────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Claude Desktop Configuration (on your Mac)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
MCP_TOKEN=$(grep "^MCP_AUTH_TOKEN=" "$ENV_FILE" | cut -d= -f2)
cat << CONFIG
Add this to:  ~/Library/Application Support/Claude/claude_desktop_config.json

{
  "mcpServers": {
    "garmin-ai-coach": {
      "url": "http://${SERVER}:${MCP_PORT}/mcp",
      "headers": {
        "Authorization": "Bearer ${MCP_TOKEN}"
      }
    }
  }
}

CONFIG

success "Setup complete!"
echo ""
echo "  Backend API : http://${SERVER}:${BACKEND_PORT}/api/health"
echo "  MCP SSE     : http://${SERVER}:${MCP_PORT}/mcp"
echo "  MCP health  : http://${SERVER}:${MCP_PORT}/health"
echo ""
echo "  Logs        : docker compose logs -f [coach|mcp]"
echo "  Restart     : docker compose restart"
echo "  Update      : ./scripts/deploy.sh  (from your Mac)"
echo ""
