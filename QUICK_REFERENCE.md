# Quick Reference Guide

## Common Commands

### Start the Web Server
```bash
node scripts/coach_web_server.js
```
Then open http://127.0.0.1:8080 in your browser.

### Start MCP Server
```bash
node mcp/server.js
```

### Run MCP Demo Client (Python)
```bash
python3 mcp/demo_client.py
```

### Garmin Sync (Latest Data)
```bash
GARMIN_USER="you@example.com" \
GARMIN_PASSWORD="your_password" \
./scripts/garmindb_sync_latest.sh
```

### Garmin Sync (Full History - First Time)
```bash
GARMIN_USER="you@example.com" \
GARMIN_PASSWORD="your_password" \
./scripts/garmindb_sync_all.sh
```

### Import GarminDB to Coach Store
```bash
. .venv-garmin/bin/activate
python scripts/import_garmindb_to_coach.py \
  --profile-id demo-athlete \
  --latest-days 30
```

## Configuration

### LM Studio Setup
In the browser UI:
1. Base URL: `http://127.0.0.1:1234/v1`
2. Model: your loaded chat/instruct model name
3. Click "Save LM Studio config"

### Garmin Credentials
Two options:

**Option 1: Password file (recommended)**
```bash
echo "your_password" > ~/.garmin_password
chmod 600 ~/.garmin_password

GARMIN_USER="you@example.com" \
GARMIN_PASSWORD_FILE="$HOME/.garmin_password" \
./scripts/garmindb_sync_latest.sh
```

**Option 2: Environment variable**
```bash
GARMIN_USER="you@example.com" \
GARMIN_PASSWORD="your_password" \
./scripts/garmindb_sync_latest.sh
```

### MFA Code
If Garmin prompts for email MFA:
```bash
GARMIN_USER="you@example.com" \
GARMIN_PASSWORD="your_password" \
GARMIN_MFA_CODE="123456" \
./scripts/garmindb_sync_latest.sh
```

## Data Locations

- **MCP Store**: `data/coach_mcp_store.json`
- **Garmin DBs**: `data/garmin/HealthData/DBs/`
- **Garmin Config**: `data/garmin/GarminConnectConfig.json`
- **Browser Data**: Browser localStorage (ephemeral)

## Key Files

- `app.js` - Browser UI logic
- `mcp/server.js` - MCP server implementation
- `scripts/coach_web_server.js` - Local web server
- `constants.js` - All thresholds and magic numbers
- `validation.js` - Input validation utilities

## Recovery Score Signals

Score components (see `constants.js` for thresholds):

| Signal | Good (positive) | Bad (negative) |
|--------|----------------|----------------|
| Sleep | ≥7 hours (+1) | <4 hours (-3), <5.5 hours (-2) |
| Readiness | ≥80 (+2) | <25 (-3) |
| HRV | +8% vs baseline (+1) | -15% (-2), -8% (-1) |
| RHR | -3 bpm vs baseline (+1) | +7 bpm (-2), +4 bpm (-1) |
| Pain | 0-3 (neutral) | ≥7 (-4), ≥4 (-2) |
| Hard days (48h) | 0 days (+1) | ≥2 days (-2) |
| Illness | No (neutral) | Yes (-4, forces recover) |

Score interpretation:
- **≤-3**: Recover state → Rest or yoga/mobility
- **-2 to +2**: Maintain state → Easy aerobic or strength
- **≥+3**: Build state → Tempo/threshold or HIIT (if not blocked)

## Gap Detection

Gaps are detected over last 7-14 days:

| Gap Type | Trigger | Severity |
|----------|---------|----------|
| Low aerobic missing | <65% of time in Z1/Z2 | Medium/High |
| Too much intensity | >12% of time in Z4/Z5 | Medium/High |
| No recovery day | ≥7 consecutive active days | Medium |
| No strength/mobility | 0 strength/yoga sessions in 7 days | Low |

## Safety Guardrails

HIIT is blocked if:
- Pain ≥4
- Hard days in last 48h ≥2
- Readiness <50 AND HRV drop >10%

Full recovery (rest) forced if:
- Illness symptoms present
- Pain ≥7
- Sleep <4 hours AND readiness <40

## Recommendation Types

1. **rest** - Full recovery day, 0 min
2. **yoga_mobility** - Recovery session, 25 min
3. **easy_aerobic** - Z1-Z2 cardio, 30-75 min
4. **strength** - Strength/mobility mix, 35 min
5. **tempo_threshold** - Z3-Z4 intervals, 35-70 min
6. **hiit** - Z4-Z5 intervals, 30-60 min

## Troubleshooting

### "Garmin sync failed"
- Check credentials in environment variables
- Verify GarminDB venv exists: `.venv-garmin/bin/activate`
- Check MFA code if required (check email)
- Increase timeout: `GARMINDB_HTTP_TIMEOUT=60`

### "Profile not found"
- Save profile first in browser UI or via `save_profile` MCP tool
- Check profile_id matches: default is "athlete-1"

### "LM Studio not responding"
- Ensure LM Studio is running on port 1234
- Load a chat/instruct model
- Configure model name in UI
- Check firewall/network settings

### "No recommendation generated"
- Need at least 1 day of history
- Check if profile is saved
- Verify daily metrics have required fields

### Browser localStorage cleared
- Data is ephemeral in browser
- Use MCP store (`data/coach_mcp_store.json`) for persistence
- Consider backing up JSON file

## Development

### Run tests (when implemented)
```bash
npm test
```

### Lint/format (when configured)
```bash
npm run lint
npm run format
```

### View logs
```bash
# Web server logs to stdout
node scripts/coach_web_server.js

# Garmin sync logs
tail -f garmindb.log
```

## API Endpoints (coach_web_server.js)

- `GET /` - Serve index.html
- `GET /api/health` - Health check
- `POST /api/garmin/sync` - Trigger Garmin sync

Request body for `/api/garmin/sync`:
```json
{
  "sync_mode": "latest",
  "garmin_user": "you@example.com",
  "garmin_password": "optional",
  "garmin_password_file": "/path/to/password.txt",
  "garmin_mfa_code": "123456",
  "garmindb_http_timeout": 30
}
```

## Useful MCP Tools

- `save_profile` - Create/update athlete profile
- `get_profile` - Retrieve profile
- `ingest_daily_metrics` - Add daily check-in data
- `import_garmindb_metrics` - Import from GarminDB
- `recommend_today` - Generate recommendation
- `garmin_login_sync` - Run Garmin sync
- `sync_garmin_and_recommend` - All-in-one sync + recommend
- `list_training_gaps` - Gap analysis
- `weekly_suggestions` - 7-day plan

See [mcp/README.md](mcp/README.md) for full tool documentation.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COACH_MCP_STORE` | `data/coach_mcp_store.json` | MCP data store path |
| `COACH_WEB_HOST` | `127.0.0.1` | Web server host |
| `COACH_WEB_PORT` | `8080` | Web server port |
| `LM_STUDIO_BASE_URL` | `http://127.0.0.1:1234/v1` | LM Studio API URL |
| `LM_STUDIO_MODEL` | (none) | Model name for LM Studio |
| `LM_STUDIO_TIMEOUT_MS` | `12000` | LM Studio request timeout |
| `OPEN_METEO_BASE_URL` | `https://api.open-meteo.com/v1/forecast` | Weather API |
| `GARMIN_USER` | (none) | Garmin Connect email |
| `GARMIN_PASSWORD` | (none) | Garmin password |
| `GARMIN_PASSWORD_FILE` | (none) | Path to password file |
| `GARMIN_MFA_CODE` | (none) | Email MFA code |
| `GARMIN_START_DATE` | (none) | Bootstrap start date (MM/DD/YYYY) |
| `GARMINDB_HTTP_TIMEOUT` | `30` | HTTP timeout seconds |
| `GARMINDB_HTTP_RETRIES` | `6` | Retry count |
| `GARMINDB_HTTP_BACKOFF` | `1.0` | Retry backoff factor |
| `GARMINDB_CONFIG_DIR` | `data/garmin` | GarminDB config directory |
| `GARMINDB_VENV_DIR` | `.venv-garmin` | Python venv for GarminDB |

## Getting Help

- Read [SECURITY.md](SECURITY.md) for security guidelines
- Check [TODO.md](TODO.md) for known issues and planned features
- Review [CHANGELOG.md](CHANGELOG.md) for recent changes
- See [mcp/README.md](mcp/README.md) for MCP server details
