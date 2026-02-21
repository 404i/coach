#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# generate-mcp-token.sh
# Generates a cryptographically secure token for the MCP HTTP server and
# optionally writes it to .env.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

TOKEN=$(openssl rand -hex 32)

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           Garmin AI Coach — MCP Auth Token Generator         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Generated token:"
echo ""
echo "  MCP_AUTH_TOKEN=$TOKEN"
echo ""

# Offer to write to .env
if [[ -f "$ENV_FILE" ]]; then
  read -r -p "Write MCP_AUTH_TOKEN to $ENV_FILE? [y/N] " answer
  if [[ "${answer,,}" == "y" ]]; then
    if grep -q "^MCP_AUTH_TOKEN=" "$ENV_FILE"; then
      # Replace existing line
      sed -i.bak "s|^MCP_AUTH_TOKEN=.*|MCP_AUTH_TOKEN=$TOKEN|" "$ENV_FILE"
      rm -f "${ENV_FILE}.bak"
      echo "✓ Updated MCP_AUTH_TOKEN in $ENV_FILE"
    else
      echo "" >> "$ENV_FILE"
      echo "MCP_AUTH_TOKEN=$TOKEN" >> "$ENV_FILE"
      echo "✓ Added MCP_AUTH_TOKEN to $ENV_FILE"
    fi
  fi
else
  echo "No .env found at $ENV_FILE — copy the token above into your .env manually."
fi

echo ""
echo "Next steps:"
echo "  1. Add the token to your .env (if not done above)"
echo "  2. Add to Claude Desktop config:"
echo "     \"Authorization\": \"Bearer $TOKEN\""
echo "  3. Restart the stack: docker compose up -d"
echo ""
