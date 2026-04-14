#!/bin/bash
# Restart OpenCode MCP Server
# Kills the garmin-ai-coach MCP process and lets OpenCode restart it

echo "🔍 Finding OpenCode MCP processes..."
echo ""

# Find Node.js processes running the coach MCP server
MCP_PIDS=$(ps aux | grep -E '/Users/tsochkata/git/coach/mcp/coach-mcp-server.js' | grep -v grep | awk '{print $2}')

if [ -z "$MCP_PIDS" ]; then
  echo "✅ No MCP server process running"
  echo ""
  echo "OpenCode will start it automatically on next tool call."
  echo "Try running sync_garmin_data() or get_training_metrics() again."
  exit 0
fi

echo "Found MCP server process(es):"
ps aux | grep -E '/Users/tsochkata/git/coach/mcp/coach-mcp-server.js' | grep -v grep | head -3
echo ""
echo "PID(s): $MCP_PIDS"
echo ""

read -p "Kill and let OpenCode restart? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  for PID in $MCP_PIDS; do
    echo "Killing process $PID..."
    kill -9 $PID 2>/dev/null
  done
  echo ""
  echo "✅ MCP processes terminated"
  echo ""
  echo "Next steps:"
  echo "  1. OpenCode will auto-restart on next tool call"
  echo "  2. Try: sync_garmin_data() or get_training_metrics(days=7)"
  echo "  3. The new handler code should now be active"
  echo ""
  echo "To verify fixes are loaded, check for:"
  echo "  - get_training_metrics: NO false _missing_data warnings"
  echo "  - get_strava_activities: Real dates/distances (not ?)"
  echo "  - chat_with_coach: Short LLM answer (not context dump)"
else
  echo ""
  echo "Cancelled. To restart manually:"
  echo "  killall -9 node"
  echo "  # Then make any OpenCode MCP tool call to trigger restart"
fi
