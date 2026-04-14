#!/bin/bash
# Switch from local to containerized MCP server
# This script automates the migration to Docker-based MCP deployment

set -e

echo "════════════════════════════════════════════════════════════════"
echo "Switching to Containerized MCP Server"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Step 1: Get MCP auth token
echo "Step 1: Getting MCP auth token..."
MCP_TOKEN=$(grep MCP_AUTH_TOKEN /Users/tsochkata/git/coach/.env 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" | xargs)

if [ -z "$MCP_TOKEN" ]; then
  echo "⚠️  No MCP_AUTH_TOKEN found in .env file"
  echo ""
  echo "Generate one with:"
  echo "  echo \"MCP_AUTH_TOKEN=\$(openssl rand -hex 32)\" >> /Users/tsochkata/git/coach/.env"
  exit 1
fi

echo "✅ Token found: ${MCP_TOKEN:0:8}...${MCP_TOKEN: -8}"
echo ""

# Step 2: Kill local MCP processes
echo "Step 2: Stopping local MCP processes..."
LOCAL_PIDS=$(ps aux | grep 'coach/mcp/coach-mcp-server.js' | grep -v grep | awk '{print $2}')

if [ -n "$LOCAL_PIDS" ]; then
  echo "Found local MCP process(es): $LOCAL_PIDS"
  for PID in $LOCAL_PIDS; do
    kill -9 $PID 2>/dev/null && echo "  Killed PID $PID"
  done
  echo "✅ Local processes stopped"
else
  echo "ℹ️  No local MCP processes running"
fi
echo ""

# Step 3: Rebuild MCP container with latest code
echo "Step 3: Rebuilding MCP container with updated handlers..."
cd /Users/tsochkata/git/coach
docker compose build mcp

if [ $? -ne 0 ]; then
  echo "❌ Docker build failed"
  exit 1
fi

echo "✅ MCP container rebuilt"
echo ""

# Step 4: Start MCP container
echo "Step 4: Starting MCP container..."
docker compose up -d mcp

if [ $? -ne 0 ]; then
  echo "❌ Failed to start MCP container"
  exit 1
fi

sleep 3
echo "✅ MCP container started"
echo ""

# Step 5: Verify container health
echo "Step 5: Verifying container health..."
CONTAINER_STATUS=$(docker ps --filter "name=garmin-ai-coach-mcp" --format "{{.Status}}")

if [ -z "$CONTAINER_STATUS" ]; then
  echo "❌ MCP container not running"
  docker logs garmin-ai-coach-mcp --tail 20
  exit 1
fi

echo "✅ Container status: $CONTAINER_STATUS"
echo ""

# Step 6: Test health endpoint
echo "Step 6: Testing MCP health endpoint..."
HEALTH_RESPONSE=$(curl -s -H "Authorization: Bearer $MCP_TOKEN" http://localhost:3001/health 2>&1)

if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
  echo "✅ MCP server healthy"
else
  echo "⚠️  Health check response: $HEALTH_RESPONSE"
fi
echo ""

# Step 7: Update OpenCode config
echo "Step 7: Updating OpenCode configuration..."
OPENCODE_CONFIG="/Users/tsochkata/.config/opencode/opencode.json"

if [ ! -f "$OPENCODE_CONFIG" ]; then
  echo "⚠️  OpenCode config not found at $OPENCODE_CONFIG"
  echo ""
  echo "Create it manually with this content:"
  echo ""
  cat << EOF
{
  "mcpServers": {
    "garmin-ai-coach": {
      "type": "sse",
      "url": "http://localhost:3001/mcp",
      "headers": {
        "Authorization": "Bearer $MCP_TOKEN"
      },
      "enabled": true
    }
  }
}
EOF
  echo ""
else
  # Backup existing config
  cp "$OPENCODE_CONFIG" "$OPENCODE_CONFIG.backup.$(date +%Y%m%d-%H%M%S)"
  echo "✅ Backed up existing config"
  
  # Create temporary config with updated MCP settings
  cat > /tmp/opencode-mcp-update.json << EOF
{
  "type": "sse",
  "url": "http://localhost:3001/mcp",
  "headers": {
    "Authorization": "Bearer $MCP_TOKEN"
  },
  "enabled": true
}
EOF
  
  echo ""
  echo "Manual config update required:"
  echo "  1. Open: $OPENCODE_CONFIG"
  echo "  2. Find the 'garmin-ai-coach' entry"
  echo "  3. Replace it with the content from: /tmp/opencode-mcp-update.json"
  echo ""
  echo "Or run this command:"
  echo "  jq '.mcpServers.\"garmin-ai-coach\" = $(cat /tmp/opencode-mcp-update.json)' $OPENCODE_CONFIG > /tmp/opencode-new.json && mv /tmp/opencode-new.json $OPENCODE_CONFIG"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ Migration Complete"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Update OpenCode config (see above)"
echo "  2. Restart OpenCode or reload MCP servers"
echo "  3. Test with: sync_garmin_data() or get_training_metrics()"
echo ""
echo "Container logs: docker logs -f garmin-ai-coach-mcp"
echo "Container status: docker ps | grep garmin-ai-coach-mcp"
echo ""
