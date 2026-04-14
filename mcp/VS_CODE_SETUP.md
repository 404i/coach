# VS Code MCP Setup - Port Fix

## Problem Fixed

The MCP server was using port 8080 (default) but the deployed backend runs on port 8088.

**Changes**:
- ✅ Updated `mcp/lib/api.js` default: `http://localhost:8080` → `http://localhost:8088`
- ✅ Updated `mcp/coach-mcp-server-monolith.js` default: `http://localhost:8080` → `http://localhost:8088`
- ✅ Updated `claude_desktop_config_example.json` stdio config to use 8088

## VS Code Copilot Configuration

### Option 1: Restart MCP Server (Recommended)

If VS Code Copilot is already configured to use the MCP server, simply **restart VS Code** to pick up the new default port.

The MCP server will now automatically connect to `http://localhost:8088` (the deployed container).

### Option 2: Explicit Configuration

To be explicit about the backend URL, update your VS Code settings to include:

```json
{
  "github.copilot.advanced": {
    "mcp": {
      "servers": {
        "garmin-ai-coach": {
          "command": "node",
          "args": ["/Users/tsochkata/git/coach/mcp/coach-mcp-server.js"],
          "env": {
            "COACH_API_URL": "http://localhost:8088"
          }
        }
      }
    }
  }
}
```

### Option 3: Use Containerized MCP Server (Network Access)

If you want to access the MCP server over the network (e.g., from another machine), use the containerized SSE server:

```json
{
  "github.copilot.advanced": {
    "mcp": {
      "servers": {
        "garmin-ai-coach": {
          "url": "http://localhost:3001/mcp",
          "headers": {
            "Authorization": "Bearer YOUR_MCP_AUTH_TOKEN"
          }
        }
      }
    }
  }
}
```

Get your auth token: `grep MCP_AUTH_TOKEN /Users/tsochkata/git/coach/.env`

## Verification

After restarting VS Code, test that the MCP server is hitting the correct backend:

### Quick Test Commands

```bash
# 1. Verify backend is running on 8088
curl http://localhost:8088/api/health

# 2. Verify MCP server can reach it
node -e "
process.env.COACH_API_URL = 'http://localhost:8088';
import('./mcp/lib/api.js').then(m => 
  m.callAPI('/api/health').then(console.log)
)
"

# 3. In VS Code, ask Copilot:
# "@workspace Tell me about my recent Strava activities"
# Should return real data, not errors about wrong port
```

### Expected Behavior After Fix

All these issues should now be resolved in VS Code:

✅ **Issue #4**: No false "missing data" warnings for zero values  
✅ **Issue #7**: No "?" placeholders in Strava activities  
✅ **Issue #8**: Occasional patterns detected (2-4x/month activities)  
✅ **Issue #1**: Chat returns coherent answers (not context dumps)

### Still Seeing Issues?

If problems persist after restarting VS Code:

1. **Check which port VS Code is actually using**:
   - Look for MCP server logs in VS Code Output panel
   - Search for "COACH_API_URL" or "localhost:" in logs

2. **Verify Docker container is running**:
   ```bash
   docker ps | grep garmin-ai-coach
   # Should show ports 0.0.0.0:8088->8080/tcp
   ```

3. **Test both ports manually**:
   ```bash
   curl http://localhost:8080/api/health  # Should fail
   curl http://localhost:8088/api/health  # Should succeed
   ```

4. **Clear VS Code MCP cache**:
   - Restart VS Code
   - Or: Cmd+Shift+P → "Developer: Reload Window"

## Port Reference

| Service | Internal Port | External Port | URL |
|---------|--------------|---------------|-----|
| Backend API | 8080 | 8088 | http://localhost:8088 |
| MCP Server (SSE) | 3001 | 3001 | http://localhost:3001 |
| Frontend (dev) | 3000 | 3000 | http://localhost:3000 |

**Remember**: When running **inside Docker** (e.g., MCP container), use `http://coach:8080`  
When running **on host machine** (e.g., VS Code stdio), use `http://localhost:8088`
