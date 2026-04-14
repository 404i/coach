#!/bin/bash
# MCP Server Restart Script
# Kills running MCP server processes and provides restart instructions

echo "🔍 Checking for running MCP server processes..."
echo ""

# Find Node.js processes running MCP server
MCP_PIDS=$(ps aux | grep -E 'node.*coach-mcp-server' | grep -v grep | awk '{print $2}')

if [ -z "$MCP_PIDS" ]; then
  echo "ℹ️  No standalone MCP server processes found"
  echo ""
  echo "If VS Code is running the MCP server:"
  echo "  1. Restart VS Code (Cmd+Q then reopen)"
  echo "  2. OR: Cmd+Shift+P → 'Developer: Reload Window'"
  echo ""
  echo "If Claude Desktop is running the MCP server:"
  echo "  1. Quit Claude Desktop (Cmd+Q)"
  echo "  2. Reopen Claude Desktop"
  exit 0
fi

echo "Found MCP server process(es):"
ps aux | grep -E 'node.*coach-mcp-server' | grep -v grep
echo ""

read -p "Kill these processes? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  for PID in $MCP_PIDS; do
    echo "Killing process $PID..."
    kill -9 $PID
  done
  echo ""
  echo "✅ MCP processes terminated"
  echo ""
  echo "To restart manually:"
  echo "  cd /Users/tsochkata/git/coach/mcp"
  echo "  node coach-mcp-server.js"
else
  echo "Cancelled"
fi
