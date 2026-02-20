#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_PATH="$ROOT_DIR/mcp/server.js"
STORE_PATH="$ROOT_DIR/data/coach_mcp_store.json"
NAME="${1:-coach}"
SCOPE="${2:-local}"
LM_BASE_URL="${LM_STUDIO_BASE_URL:-http://127.0.0.1:1234/v1}"
LM_MODEL="${LM_STUDIO_MODEL:-qwen2.5-7b-instruct}"

if ! command -v claude >/dev/null 2>&1; then
  echo "Error: claude CLI not found. Install Claude Code first."
  exit 1
fi

claude mcp add --transport stdio --scope "$SCOPE" "$NAME" -- \
  env COACH_MCP_STORE="$STORE_PATH" \
  env LM_STUDIO_BASE_URL="$LM_BASE_URL" \
  env LM_STUDIO_MODEL="$LM_MODEL" \
  node "$SERVER_PATH"

echo "Added MCP server '$NAME' for Claude Code (scope=$SCOPE)."
echo "Run 'claude mcp list' to verify."
