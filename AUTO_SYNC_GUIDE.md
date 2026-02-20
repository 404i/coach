# Auto-Sync & Auto-Reauth Guide

## Overview

The system now automatically syncs your Garmin data when Claude queries for activities, eliminating the need for manual sync commands. It also handles session expiration with automatic re-authentication.

## How It Works

### Pull-Based Sync (Lazy Loading)

When you ask Claude about your activities (e.g., "What did I do today?"), the system:

1. **Checks Data Freshness**: Before returning activities, checks if data is current
2. **Auto-Syncs If Stale**: If latest activity is not from today, automatically syncs recent data
3. **Handles Session Expiry**: If session expired, automatically re-authenticates using stored credentials
4. **Returns Updated Data**: After sync completes, returns the requested activities

### Automatic Re-Authentication

When your Garmin session expires:

1. **Detects Expiry**: Recognizes 401/Unauthorized errors during sync
2. **Retrieves Credentials**: Gets your encrypted credentials from database
3. **Re-Authenticates**: Automatically logs back into Garmin Connect
4. **Retries Operation**: Completes the sync with fresh session
5. **MFA Handling**: If MFA is required, prompts for manual authentication

## Usage Examples

### Automatic Sync (Zero Configuration)

```
You: "What activities did I do today?"

System:
  1. Checks latest activity date
  2. Sees no activities from today
  3. Auto-syncs last 3 days
  4. Returns swim activity found
```

### Session Expiration Handling

```
You: "Show me my recent runs"

System:
  1. Tries to fetch activities
  2. Detects session expired (401 error)
  3. Auto-reauths using stored credentials
  4. Retries sync successfully
  5. Returns run activities
```

### Manual Sync (Still Available)

You can still trigger manual sync if needed:

```
Use the sync_garmin_data MCP tool with:
- days: number of days to sync (default: 3)
```

## Configuration

### Backend Environment

```bash
# Required: Encryption key for storing Garmin credentials
ENCRYPTION_KEY=your-32-byte-hex-key

# Backend API URL (default: http://localhost:8080)
COACH_API_URL=http://localhost:8080
```

### Stored Credentials

Your Garmin credentials are encrypted and stored in the database:
- **Algorithm**: AES-256-GCM
- **Storage**: SQLite database (backend/data/coach.db)
- **Table**: `users` table, `encrypted_password` column

To view stored credentials status:

```bash
curl -s 'http://localhost:8080/api/garmin/status?email=your@email.com' | jq
```

## Auto-Sync Logic

### Staleness Detection

Data is considered stale if:
- **No activities exist**: Syncs last 7 days
- **Latest activity not from today**: Syncs last 3 days
- **Days since last activity > 0**: Triggers sync

### Sync Strategy

1. **Initial Query**: No activities → Sync 7 days
2. **Regular Query**: Data is old → Sync 3 days
3. **Fresh Data**: Latest from today → Skip sync

## Authentication Flow

### Initial Authentication (One-Time)

```bash
# Login with credentials (stores encrypted password)
curl -X POST http://localhost:8080/api/garmin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your@email.com",
    "password": "your_password"
  }'

# If MFA required:
curl -X POST http://localhost:8080/api/garmin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your@email.com",
    "password": "your_password",
    "mfa_code": "123456"
  }'
```

### Automatic Re-Authentication

After initial login, the system automatically handles:
- Session expiration
- Token refresh
- Re-authentication with stored credentials

**Note**: If Garmin requires MFA during auto-reauth (rare), you'll need to manually authenticate once.

## MCP Tools Enhanced

### `get_activities`

**Before**: Just fetched stored activities
**Now**: Auto-syncs if data is stale, then fetches activities

```javascript
// Usage in Claude:
"Show me my activities from this week"

// Auto-sync happens transparently if needed
```

### `sync_garmin_data`

**Before**: Synced data, failed if session expired
**Now**: Auto-reauths if session expired, then syncs

```javascript
// Usage in Claude:
"Sync my last 7 days of Garmin data"

// Handles auth expiry automatically
```

## Troubleshooting

### Problem: Data Not Updating

**Check**: Session validity
```bash
curl -s 'http://localhost:8080/api/garmin/status?email=your@email.com'
```

**Solution**: Manual re-auth if credentials changed
```bash
curl -X POST http://localhost:8080/api/garmin/login \
  -H "Content-Type: application/json" \
  -d '{"email": "your@email.com", "password": "new_password"}'
```

### Problem: MFA Required During Auto-Reauth

**Symptom**: Error message "MFA Required for Re-authentication"

**Solution**: Manually authenticate with MFA code:
```bash
curl -X POST http://localhost:8080/api/garmin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your@email.com",
    "password": "your_password",
    "mfa_code": "123456"
  }'
```

### Problem: Authentication Failures

**Check**: Backend logs
```bash
tail -f /tmp/coach-backend.log | grep -i auth
```

**Check**: Stored credentials
```bash
sqlite3 backend/data/coach.db \
  "SELECT garmin_email, updated_at, 
   CASE WHEN encrypted_password IS NOT NULL THEN 'stored' ELSE 'missing' END 
   FROM users;"
```

## Security Notes

### Credential Storage

- Passwords encrypted with AES-256-GCM
- Unique IV per encryption
- Authentication tags for integrity
- Key derivation with scrypt
- Stored securely in SQLite database

### Session Management

- Sessions stored with encrypted credentials
- Automatic refresh on expiry
- MFA tokens validated server-side
- OAuth tokens rotated regularly

### Best Practices

1. **Set ENCRYPTION_KEY**: Use a strong, random 32-byte key
2. **Rotate Credentials**: Update Garmin password periodically
3. **Monitor Logs**: Check for auth failures
4. **MFA Enabled**: Keep MFA enabled on Garmin account

## API Endpoints

### `/api/garmin/status` (GET)

Check session validity
```bash
curl 'http://localhost:8080/api/garmin/status?email=your@email.com'
# Response: { "session_valid": true/false }
```

### `/api/garmin/reauth` (POST)

Trigger manual re-authentication
```bash
curl -X POST http://localhost:8080/api/garmin/reauth \
  -H "Content-Type: application/json" \
  -d '{"email": "your@email.com"}'
```

### `/api/garmin/sync` (POST)

Manually sync with auto-reauth
```bash
curl -X POST http://localhost:8080/api/garmin/sync \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your@email.com",
    "start_date": "2026-02-17",
    "end_date": "2026-02-19"
  }'
```

## Architecture

```
┌─────────────┐
│   Claude    │ "Show my swim from today"
└──────┬──────┘
       │
       ↓
┌─────────────────────────────┐
│   MCP Server                │
│  - Checks data freshness    │
│  - Triggers auto-sync       │
│  - Handles auth failures    │
└──────┬──────────────────────┘
       │
       ↓
┌─────────────────────────────┐
│   Backend API               │
│  - Syncs with Garmin        │
│  - Auto-reauths if needed   │
│  - Stores activities in DB  │
└──────┬──────────────────────┘
       │
       ↓
┌─────────────────────────────┐
│   Garmin Connect            │
│  - Authenticates user       │
│  - Returns activities data  │
└─────────────────────────────┘
```

## What's Next

After auto-sync is working:
1. **Containerize**: Docker deployment for production
2. **Scheduled Sync**: Optional daily cron job
3. **Multi-User**: Support multiple athlete profiles
4. **Activity Alerts**: Push notifications for new activities

## Files Modified

- `mcp/coach-mcp-server.js`: Added autoSyncIfNeeded() function and enhanced get_activities/sync_garmin_data
- `backend/src/routes/garmin.js`: Added withAutoReauth wrapper to sync endpoint
- `backend/src/services/auth-improved.js`: Already had attemptAutoReauth and withAutoReauth functions

## Testing

```bash
# 1. Restart Claude Desktop to load updated MCP server
pkill -f Claude # or Cmd+Q
open -a Claude

# 2. Ask Claude about activities
"What activities did I do today?"

# 3. Check logs for auto-sync
tail -f /tmp/coach-backend.log | grep -i sync

# 4. Verify data freshness
curl -s http://localhost:8080/api/garmin/activities?email=your@email.com&limit=1 | jq .
```

---

**Note**: Remember to restart Claude Desktop to pick up the updated MCP server code!
