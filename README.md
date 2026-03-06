# Garmin AI Coach

[![Docker Build](https://github.com/404i/coach/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/404i/coach/actions/workflows/docker-publish.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker Pulls](https://img.shields.io/docker/pulls/404i/garmin-coach-ai)](https://hub.docker.com/r/404i/garmin-coach-ai)

An AI-powered training coach that integrates with GarminDB to provide personalized workout recommendations, activity verification, and comprehensive training insights.

## Features

- **Training Readiness Analysis**: Composite score combining recovery (35%), acute:chronic ratio (25%), HRV (20%), and TSB (20%)
- **Activity Verification**: Prevents AI hallucinations by verifying all activity claims against GarminDB
- **Data Freshness Tracking**: Shows when data was last synced with transparent age indicators
- **Comprehensive Metrics**: VO2 max, distance, elevation, cadence, heart rate, steps, floors climbed
- **Help Documentation**: On-demand explanations for TSB, readiness scores, and training metrics
- **Claude Desktop Integration**: MCP server for seamless AI coaching conversations
- **Safety Guardrails**: Intelligent recommendations considering pain, illness, sleep, and training load

## ⚠️ Security Notice

**This application is for LOCAL DEVELOPMENT ONLY.** See [SECURITY.md](SECURITY.md) for full security guidelines before any production deployment.

## Quick Start

### Option 1: Docker (Recommended)

**Personal Setup** (with your existing GarminDB data):
```bash
./docker-setup.sh personal
```

**Shareable Setup** (clean installation):
```bash
./docker-setup.sh shareable
```

Access:
- Backend API: http://localhost:8080
- MCP Server: http://localhost:3001

See [DOCKER_QUICKSTART.md](DOCKER_QUICKSTART.md) for details or [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md) for full documentation.

### Option 2: Local Development

Install dependencies:
```bash
npm install
```

## Data Sync

### First Time Setup

Save encrypted Garmin credentials (one-time):
```bash
./scripts/credential-manager.sh save
```

### Sync Your Data

**Standard sync** (last 7 days):
```bash
./scripts/sync-manager.sh
```

**With MFA** (if Garmin sends email code):
```bash
./scripts/sync-with-mfa.sh
```

**Check status**:
```bash
./scripts/sync-status.sh
```

**Setup automated daily sync** (optional):
```bash
./scripts/setup-auto-sync.sh
```

### Sync Features

✅ **Automatic retry** with exponential backoff  
✅ **Complete logging** to `data/logs/`  
✅ **Status tracking** with success/failure rates  
✅ **MFA detection** and interactive prompting  
✅ **Post-sync verification** confirms data imported  
✅ **No restart needed** - Claude picks up new data automatically  

See [SYNC_QUICK_REF.md](SYNC_QUICK_REF.md) for quick reference or [SYNC_PROCESS.md](SYNC_PROCESS.md) for comprehensive documentation.

## Run

Preferred (enables Garmin Sync button in UI):

```bash
node scripts/coach_web_server.js
```

Then open `http://127.0.0.1:8080`.

Static-only mode (no sync button backend):

```bash
python3 -m http.server 8080
```

To enable AI responses in the browser UI, run LM Studio local server and set:
- Base URL: `http://127.0.0.1:1234/v1`
- Model: your loaded chat/instruct model

## Docker Deployment

### Quick Start

```bash
# Personal setup (includes your data)
./docker-setup.sh personal

# Shareable setup (clean installation)
./docker-setup.sh shareable
```

### Manual Docker Commands

```bash
# Personal setup
docker-compose -f docker-compose.personal.yml up -d

# Shareable setup  
docker-compose -f docker-compose.shareable.yml up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Importing Data

```bash
# Import last 30 days from GarminDB
docker-compose exec coach \
  python3 /app/scripts/import_garmindb_to_coach.py \
  --profile-id YOUR_PROFILE \
  --latest-days 30
```

### Claude Desktop Integration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "coach-mcp": {
      "command": "docker",
      "args": ["exec", "-i", "garmin-coach-mcp-personal", "node", "/app/mcp/server.js"]
    }
  }
}
```

**Full Docker documentation:**
- [DOCKER_QUICKSTART.md](DOCKER_QUICKSTART.md) - Quick reference
- [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md) - Comprehensive guide

## Backend API

The coach now includes a full REST API:

**Health & Status:**
- `GET /api/health` - Health check

**Training Stats:**
- `GET /api/stats/current?email=<email>` - Current training statistics
- `GET /api/stats/trends?email=<email>` - Training trends

**Workout Recommendations:**
- `GET /api/workout/recommendations?email=<email>` - Get personalized workout recommendations
- `GET /api/workout/plan?email=<email>` - Generate training plan

**Activity Verification:**
- `GET /api/activity/latest?email=<email>` - Most recent activity
- `GET /api/activity/recent?email=<email>&days=7` - Recent activities
- `POST /api/activity/verify` - Verify activity claim
- `GET /api/activity/context?email=<email>` - Activity context with gaps

**Pattern Recognition:**
- `GET /api/patterns/discovery?email=<email>` - Discover training patterns
- `GET /api/patterns/detection?email=<email>` - Detect pattern anomalies

**Help Documentation:**
- `GET /api/help/tsb` - TSB (Training Stress Balance) explanation
- `GET /api/help/readiness` - Training readiness breakdown
- `GET /api/help/glossary` - Training metrics glossary
- `GET /api/help/metrics` - All metrics documentation

See [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for full API documentation.

## What is implemented

- Athlete intake/profile (sports, access, availability, equipment, injuries/conditions, goals/motivations, HR baselines)
- Structured get-to-know intake session via MCP (`start_get_to_know_session` / `save_get_to_know_answers`)
- Garmin login/sync support in MCP (`garmin_login_sync`) and UI command helper
- Web UI Garmin "Sync latest now" button via local API (`scripts/coach_web_server.js`)
- Sync responses now include `started_at`, `completed_at`, and detected latest Garmin DB timestamp
- Daily check-in with screenshot upload (reference only in v1, no OCR yet)
- Activity entry including HR zone minutes
- Rule-based recovery scoring -> state mapping (`recover` / `maintain` / `build`)
- Safety overrides to block risky recommendations
- Chat-style recommendation output with LM Studio-powered responses (rule fallback)
- Planned event intake (sessions/events/races)
- Weekly suggestions engine based on goals, history trends, and planned events
- Optional weather-aware weekly adjustments (if location lat/lon is set)
- GarminDB import + one-shot sync/import/recommend MCP flow
- Local persistence via browser `localStorage`
- MCP server for LM Studio / OpenCode style tool-calling clients

## MCP server

Run server:

```bash
node mcp/server.js
```

Run end-to-end MCP demo:

```bash
python3 mcp/demo_client.py
```

MCP docs and config snippets are in `mcp/README.md`.
Includes Claude Desktop + Claude Code setup.

## Garmin sync setup

GarminDB is vendored under `vendor/GarminDB` and wired with local helper scripts:

1. Initial setup already prepared:
- local config: `data/garmin/GarminConnectConfig.json`
- Python env: `.venv-garmin` (Python 3.12 recommended for GarminDB compatibility)

2. Run latest sync (recommended for normal updates):

```bash
GARMIN_USER="you@example.com" \
GARMIN_PASSWORD="your_password" \
./scripts/garmindb_sync_latest.sh
```

3. Run full historical sync (first-time import):

```bash
GARMIN_USER="you@example.com" \
GARMIN_PASSWORD="your_password" \
./scripts/garmindb_sync_all.sh
```

4. If a long download run times out, import whatever was already downloaded:

```bash
./scripts/garmindb_import_local.sh
```

5. Load GarminDB days into coach MCP store:

```bash
. .venv-garmin/bin/activate
python scripts/import_garmindb_to_coach.py \
  --profile-id demo-athlete \
  --latest-days 30
```

## Documentation

- **[DOCKER_QUICKSTART.md](DOCKER_QUICKSTART.md)** - Docker quick start guide
- **[DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)** - Comprehensive Docker deployment
- **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - API reference and examples
- **[SECURITY.md](SECURITY.md)** - Security guidelines (READ BEFORE DEPLOYING)
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Contributing guidelines
- **[TODO.md](TODO.md)** - Refactoring roadmap and planned improvements
- **[CHANGELOG.md](CHANGELOG.md)** - Recent bug fixes and changes
- **[mcp/README.md](mcp/README.md)** - MCP server setup and usage

## Project Structure

```
├── backend/
│   ├── src/
│   │   ├── routes/              # API endpoints
│   │   │   ├── activity.js      # Activity verification endpoints
│   │   │   ├── help.js          # Help documentation endpoints
│   │   │   ├── patterns.js      # Pattern recognition endpoints
│   │   │   ├── stats.js         # Training statistics endpoints
│   │   │   └── workout.js       # Workout recommendation endpoints
│   │   ├── services/            # Business logic
│   │   │   ├── activity-verification.js   # Activity verification service
│   │   │   ├── auth-improved.js           # Encrypted authentication
│   │   │   ├── pattern-recognition.js     # Pattern analysis
│   │   │   ├── stats-service.js           # Statistics calculations
│   │   │   └── workout-recommendation.js  # Training recommendations
│   │   ├── middleware/          # Express middleware
│   │   │   └── data-freshness.js          # Data context tracking
│   │   └── server.js            # Express server entry point
│   └── package.json
├── mcp/
│   ├── server.js                # MCP server for Claude Desktop
│   └── README.md                # MCP documentation
├── scripts/
│   ├── coach_web_server.js      # Local web server
│   ├── garmindb_sync_*.sh       # Garmin sync scripts
│   └── import_garmindb_to_coach.py  # GarminDB data importer
├── schemas/                      # JSON schema definitions
│   ├── athlete_profile.v1.json
│   ├── daily_metrics.v1.json
│   └── recommendation.v1.json
├── vendor/GarminDB/             # GarminDB integration
├── Dockerfile                    # Multi-stage Docker build
├── docker-compose.personal.yml  # Personal deployment config
├── docker-compose.shareable.yml # Shareable deployment config
├── docker-setup.sh              # One-command Docker setup
├── .github/
│   └── workflows/
│       └── docker-publish.yml   # CI/CD pipeline
├── app.js                       # Browser UI logic
├── index.html                   # Main UI
├── styles.css                   # Styling
├── constants.js                 # Centralized thresholds
├── validation.js                # Input validation
└── package.json                 # Node.js project config
```

## Recent Improvements (Feb 2026)

### Major Features ✨
- **Activity Verification System**: Prevents AI hallucinations (345 lines, 5 endpoints)
- **Data Freshness Tracking**: All responses include data age and sync timestamps
- **Training Readiness Breakdown**: Composite score with detailed component breakdown
- **Enhanced GarminDB Import**: VO2 max, activity details (distance, elevation, speed, cadence), steps, floors
- **Help Documentation API**: On-demand explanations for TSB, readiness, and metrics
- **Docker Support**: One-command deployment for personal and shareable setups

### Bug Fixes ✅
- Fixed timezone bug in date calculations (UTC enforcement)
- Fixed type coercion in pain scoring (explicit Number conversion)
- Added null/undefined checks to prevent crashes

### Security 🔒
- Enhanced path traversal protection
- Added input validation for Garmin sync
- Added security headers (X-Frame-Options, X-Content-Type-Options)
- Created comprehensive security documentation

### Code Quality 📚
- Created constants.js with all magic numbers
- Added validation utility module
- Added security warnings throughout code
- Improved error handling

See [CHANGELOG.md](CHANGELOG.md) for details.

## Acknowledgments

This project would not be possible without the following open-source projects and communities:

- **[GarminDB](https://github.com/tcgoetz/GarminDB)** — Python toolkit for parsing and managing Garmin health & fitness data from Garmin Connect. Powers our local data pipeline.
- **[garth](https://github.com/matin/garth)** — Lightweight Python library for authenticating with Garmin Connect. Used for secure credential handling and session management.
- **[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)** — Open protocol by Anthropic enabling AI assistants to interact with external tools and data sources. The backbone of our Claude Desktop integration.
- **[LM Studio](https://lmstudio.ai/)** & **[Ollama](https://ollama.ai/)** — Local LLM inference engines that make self-hosted AI coaching possible without cloud dependencies.
- **[Knex.js](https://knexjs.org/)** — SQL query builder for Node.js. Handles all our SQLite database operations and migrations.
- **[Express](https://expressjs.com/)** — Fast, minimal web framework for the backend API.
- **[React](https://react.dev/)** & **[Vite](https://vitejs.dev/)** — Frontend framework and build tooling for the coaching dashboard.
- **[TailwindCSS](https://tailwindcss.com/)** — Utility-first CSS framework for the UI.
- **[Winston](https://github.com/winstonjs/winston)** — Logging library used throughout the backend.

Thank you to all contributors and maintainers of these projects.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Quick contribution steps:**
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly (including Docker builds)
5. Commit (`git commit -m 'feat: add amazing feature'`)
6. Push to your fork (`git push origin feature/amazing-feature`)
7. Open a Pull Request

**⚠️ Never commit personal data, credentials, or database files!**

## Notes and limits (v1)
- You can use `GARMIN_PASSWORD_FILE=/path/to/file` instead of `GARMIN_PASSWORD`.
- If Garmin prompts for email MFA, either enter the code interactively at `MFA code:` or pass `GARMIN_MFA_CODE`:

```bash
GARMIN_USER="you@example.com" \
GARMIN_PASSWORD="your_password" \
GARMIN_MFA_CODE="123456" \
./scripts/garmindb_sync_latest.sh
```

- If first sync is too large/slow, bootstrap with a recent start date:

```bash
GARMIN_USER="you@example.com" \
GARMIN_PASSWORD="your_password" \
GARMIN_START_DATE="01/01/2024" \
./scripts/garmindb_sync_latest.sh
```

- Network tuning env vars are supported for long Garmin runs:
  `GARMINDB_HTTP_TIMEOUT` (default `30`), `GARMINDB_HTTP_RETRIES` (default `6`), `GARMINDB_HTTP_BACKOFF` (default `1.0`).
- Credentials passed via env are written only to a temporary config during execution.
- Downloaded data and DB files are stored under `data/garmin/HealthData`.

## Data schemas

- `schemas/athlete_profile.v1.json`
- `schemas/daily_metrics.v1.json`
- `schemas/recommendation.v1.json`

## Notes and limits

- ✅ **Docker deployment ready** (personal and shareable setups)
- ✅ **REST API** with comprehensive endpoints
- ✅ **Activity verification** prevents AI hallucinations
- ✅ **Data freshness tracking** in all responses
- ✅ **GarminDB integration** with VO2 max, activity details, steps, floors
- ✅ **Claude Desktop MCP integration**
- ⚠️ **Local development only** - not production-ready (see [SECURITY.md](SECURITY.md))
- ⏳ **No OCR extraction yet** - screenshot values must be typed manually
- ⏳ **Rule-based recommendations** - LLM integration for conversational responses only

## Docker Hub

```bash
# Pull from Docker Hub (recommended)
docker pull 404i/garmin-coach-ai:latest

# Or build locally
docker build -t 404i/garmin-coach-ai .
```

## System Requirements

- **Docker**: 20.10+ (for containerized deployment)
- **Node.js**: 18+ (for local development)
- **Python**: 3.8+ (for GarminDB)
- **Disk**: 2GB+ free space
- **Memory**: 1GB+ recommended
- **GarminDB**: Pre-synced with your Garmin data

## Next build steps

1. ✅ ~~Add activity verification to prevent hallucinations~~
2. ✅ ~~Add data freshness tracking~~
3. ✅ ~~Import VO2 max and comprehensive activity metrics~~
4. ✅ ~~Docker containerization~~
5. Add OCR extraction from screenshots into `daily_metrics`
6. Add stronger retry/resume behavior for long Garmin downloads
7. Replace JSON store with Postgres for production readiness
