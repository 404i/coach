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
- **Smart Goals**: Adaptive goal system — parse free-text goals into structured targets with weekly KPIs, auto-decompose into progressive training blocks, receive on_track/at_risk/off_track weekly progress, and get minimum-effective-dose adaptation when sessions are missed

## ⚠️ Security Notice

**This application is for LOCAL DEVELOPMENT ONLY.** See [SECURITY.md](SECURITY.md) for full security guidelines before any production deployment.

## Prerequisites

### All Platforms

- **Docker** 20.10+ with Compose v2 (recommended) **or** Node.js 18+ for local dev
- **Git** with submodule support — clone with `git clone --recurse-submodules`
- **An AI backend** (at least one):
  - [Claude Desktop](https://claude.ai/download) — MCP-based coaching conversations (recommended for richest experience)
  - [LM Studio](https://lmstudio.ai/) — local LLM, OpenAI-compatible API on port 1234 (best if you want fully offline / private)
  - [Ollama](https://ollama.ai/) — local LLM, native API on port 11434 (lightweight CLI-first option)
  > **Not sure which to pick?** Start with **Claude Desktop** — it gives you natural-language coaching out of the box via MCP. Add LM Studio or Ollama later if you want a fully offline setup.
- **Python 3.8+** (only needed for local dev without Docker — GarminDB sync)
- **OpenWeatherMap API key** (free tier, optional — enables weather-aware coaching)

### macOS

```bash
brew install --cask docker        # Docker Desktop
brew install node                  # Node.js 18+
brew install python3               # Python 3
brew install ollama                # Ollama (optional)
# Claude Desktop & LM Studio — download from their websites
```

### Windows

> **WSL2 is required** for all Garmin sync scripts (they are bash).

```powershell
# In an admin PowerShell — then reboot
wsl --install
```

- **Docker Desktop for Windows** — download from [docker.com](https://www.docker.com/products/docker-desktop/) (enable the WSL2 backend in Settings)
- **Git for Windows** — download from [git-scm.com](https://git-scm.com/) (includes Git Bash)
- **Node.js 18+** — `winget install OpenJS.NodeJS` or download from [nodejs.org](https://nodejs.org/)
- **Python 3** — `winget install Python.Python.3` or download from [python.org](https://www.python.org/)
- **Claude Desktop / LM Studio / Ollama** — download from their respective websites

### Linux

```bash
# Docker + Compose v2 (Debian/Ubuntu example)
sudo apt install docker.io docker-compose-v2
sudo usermod -aG docker $USER   # then log out and back in

# Node.js 18+ (via nodesource or nvm)
# Python 3 (usually pre-installed)
sudo apt install python3 python3-pip python3-venv

# Ollama (optional)
curl -fsSL https://ollama.com/install.sh | sh

# Claude Desktop & LM Studio — download Linux builds from their websites
```

## Quick Start

### Option 1: Docker (Recommended)

```bash
# 1. Clone the repo (includes GarminDB submodule)
git clone --recurse-submodules https://github.com/404i/coach.git
cd coach

# 2. Create your environment file
cp .env.example .env
# Edit .env — at minimum set ENCRYPTION_KEY (see comments inside .env for how to generate one)

# 3. Start the coach
# Personal setup (mounts your existing Garmin data from ~/HealthData):
docker compose -f docker-compose.personal.yml up -d

# OR shareable setup (clean install, no personal data):
# docker compose -f docker-compose.shareable.yml up -d
```

> **Windows users**: open `.env` in Notepad and set `GARMINDB_PATH` to your full Windows path (e.g. `C:\Users\You\HealthData`). Tilde `~` does not expand on Windows.

**Verify it's running:**
```bash
curl http://localhost:8080/api/health
# Expected: {"status":"ok", ...}
```
> On Windows without `curl`, open <http://localhost:8080/api/health> in your browser — you should see a JSON response with `"status":"ok"`.

Access:
- Backend API: http://localhost:8080
- MCP Server: http://localhost:3001

See [DOCKER_QUICKSTART.md](DOCKER_QUICKSTART.md) for details or [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md) for full documentation.

### Option 2: Local Development

```bash
# 1. Clone
git clone --recurse-submodules https://github.com/404i/coach.git
cd coach

# 2. Install backend dependencies
npm install

# 3. Create and edit your environment file
cp .env.example .env
# Edit .env — set at least ENCRYPTION_KEY

# 4. (Optional) Set up Python venv for GarminDB sync
python3 -m venv .venv-garmin
source .venv-garmin/bin/activate   # Windows: .venv-garmin\Scripts\activate
pip install -r vendor/GarminDB/requirements.txt

# 5. Start the server
node scripts/coach_web_server.js
```

Open http://localhost:8080 in your browser.

## Data Sync

> **Windows users**: All sync scripts below are bash. Run them from **WSL2** or **Git Bash**, not PowerShell.

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

See the Data Sync section above for more details and options.

## Run

Preferred (enables Garmin Sync button in UI):

```bash
node scripts/coach_web_server.js
```

Then open `http://127.0.0.1:8080`.

Static-only mode (no sync button backend):

```bash
python3 -m http.server 8080   # Windows: use "python" instead of "python3"
```

To enable AI responses in the browser UI, run LM Studio local server and set:
- Base URL: `http://127.0.0.1:1234/v1`
- Model: your loaded chat/instruct model

## Docker Deployment

### Start Services

```bash
# Personal setup (with your data)
docker compose -f docker-compose.personal.yml up -d

# Shareable setup (clean installation)
docker compose -f docker-compose.shareable.yml up -d

# View logs
docker compose logs -f

# Stop services
docker compose down
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

Open your Claude Desktop config file:

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

**Option A — Stdio (Claude Desktop on same machine as coach):**

```json
{
  "mcpServers": {
    "garmin-ai-coach": {
      "command": "node",
      "args": ["/path/to/coach/mcp/coach-mcp-server.js"],
      "env": {
        "COACH_API_URL": "http://localhost:8080"
      }
    }
  }
}
```

> **Port note**: Use `8080` if you started with `docker-compose.personal.yml` or `docker-compose.shareable.yml`. Use `8088` only if you started with the base `docker-compose.yml`.

**Option B — Docker exec (coach running in Docker):**

```json
{
  "mcpServers": {
    "garmin-ai-coach": {
      "command": "docker",
      "args": ["exec", "-i", "garmin-coach-mcp-personal", "node", "/app/mcp/coach-mcp-server.js"]
    }
  }
}
```

Restart Claude Desktop after saving.

### LM Studio MCP Integration

LM Studio supports MCP servers via its `mcp.json` config file.

| OS | Path |
|----|------|
| macOS | `~/.lmstudio/mcp.json` |
| Windows | `%USERPROFILE%\.lmstudio\mcp.json` |
| Linux | `~/.lmstudio/mcp.json` |

```json
{
  "mcpServers": {
    "coach": {
      "command": "node",
      "args": ["/path/to/coach/mcp/coach-mcp-server.js"],
      "env": {
        "COACH_API_URL": "http://localhost:8088",
        "LM_STUDIO_BASE_URL": "http://127.0.0.1:1234/v1",
        "LM_STUDIO_MODEL": "qwen2.5-7b-instruct"
      }
    }
  }
}
```

> Replace `/path/to/coach` with the absolute path to your clone. Set `LM_STUDIO_MODEL` to whichever chat/instruct model you have loaded. If `LM_STUDIO_MODEL` is not set, the coach falls back to deterministic rule-based responses. Set `COACH_API_URL` to match the port your backend is running on (`8088` for base `docker-compose.yml`, `8080` for personal/shareable compose files or local dev).

**⚠️ Model Compatibility for MCP Tool-Calling:**

LM Studio's MCP implementation requires models that support **OpenAI function-calling format**. Not all models work.

✅ **Compatible models** (tested):
- `NousResearch/Hermes-2-Pro-Mistral-7B` or `Hermes-2-Pro-Llama-3-8B`
- `NousResearch/Hermes-3-Llama-3.1-8B`
- `mistralai/Mistral-7B-Instruct-v0.2`
- `meetkai/functionary-small-v2.5`

❌ **Incompatible models**:
- `openai/gpt-oss-120b` — outputs custom format, not OpenAI function-calling JSON
- `qwen2.5-7b-instruct` — no native function-calling support
- Most base instruct models without function-calling fine-tuning

If tool calls fail with parsing errors, either:
1. Switch to a Hermes or functionary model in LM Studio, **OR**
2. Use **Claude Desktop** instead (native MCP support, config above)

**Full Docker documentation:**
- [DOCKER_QUICKSTART.md](DOCKER_QUICKSTART.md) - Quick reference
- [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md) - Comprehensive guide

### Ollama Integration

Ollama provides a lightweight, CLI-friendly alternative to LM Studio for local AI inference. Unlike LM Studio, Ollama uses a native API (not OpenAI-compatible) and **does not support MCP**. Use Ollama for backend API endpoints and frontend UI only.

**Prerequisites:**

Install Ollama for your platform:

| OS | Installation |
|----|-------------|
| macOS | `brew install ollama` |
| Windows | Download from [ollama.com/download](https://ollama.com/download) |
| Linux | `curl -fsSL https://ollama.com/install.sh \| sh` |

**Local Development Setup:**

```bash
# 1. Start Ollama service
ollama serve

# 2. Pull a recommended model (in a new terminal)
ollama pull llama3.1:8b-instruct-q4_K_M

# 3. Configure coach to use Ollama
cd backend
echo "LLM_PROVIDER=ollama" >> .env
echo "OLLAMA_URL=http://localhost:11434" >> .env

# 4. Start the coach backend
node scripts/coach_web_server.js
```

Verify it's working:
```bash
curl http://localhost:8080/api/health
# Should show: {"status":"healthy","llm_provider":"ollama",...}
```

**Docker Deployment:**

```bash
# 1. Start Ollama on your host machine
ollama serve

# 2. Pull a model
ollama pull llama3.1:8b-instruct-q4_K_M

# 3. Configure coach to use Ollama
echo "LLM_PROVIDER=ollama" >> .env
echo "OLLAMA_URL=http://host.docker.internal:11434" >> .env

# 4. Start coach in Docker
docker-compose -f docker-compose.personal.yml up -d
```

**Linux Note:** If `host.docker.internal` doesn't resolve, try:
- **Option A:** Set `OLLAMA_URL=http://172.17.0.1:11434` in `.env`
- **Option B:** Add to your compose file:
  ```yaml
  extra_hosts:
    - "host.docker.internal:host-gateway"
  ```

**⚠️ Important Limitations:**

- **No MCP Support**: Ollama cannot be used with Claude Desktop's MCP integration. For MCP features, use Claude Desktop (native) or LM Studio.
- **API & UI Only**: Ollama works with the backend REST API and frontend dashboard, but not with MCP tools like `get_weekly_plan` or `set_current_athlete`.

**Recommended Models:**

Unlike LM Studio's MCP (which requires function-calling support), Ollama backend integration uses standard chat completions. **Any instruct-tuned model works**.

**Best for coaching** (balance of quality and speed):
- `llama3.1:8b-instruct-q4_K_M` — Excellent instruction-following, 4-bit quantized (~4.7 GB)
- `mistral:7b-instruct-v0.2` — Fast and sports-aware (~4.1 GB)
- `gemma2:9b-instruct-q5_K_M` — Google's model, strong reasoning (~5.8 GB)

**Lighter/faster** (≤3GB RAM, lower-spec machines):
- `phi3:mini` — Microsoft's 3.8B parameter model (~2.3 GB)
- `mistral:7b-instruct-q4_0` — Aggressive quantization (~3.8 GB)

**Higher quality** (requires GPU or ample RAM):
- `llama3.1:70b-instruct-q4_K_M` — Best reasoning, needs 48GB+ RAM (~40 GB)
- `mixtral:8x7b-instruct-q5_K_M` — Mixture of experts (~26 GB)

**Pull a model:**
```bash
ollama pull llama3.1:8b-instruct-q4_K_M
```

**Switching Back to LM Studio:**

```bash
# Edit .env or backend/.env
LLM_PROVIDER=lmstudio

# Restart coach
docker-compose restart coach  # Docker mode
# OR
node scripts/coach_web_server.js  # Local mode
```

### OpenAI Integration

Use OpenAI's API for high-quality coaching responses powered by GPT-4 or GPT-4 Turbo. This is a cloud-based option that requires an API key and incurs usage costs.

**Prerequisites:**

1. **OpenAI API Key** — Get one from [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. **API Credits** — Add payment method at [platform.openai.com/billing](https://platform.openai.com/billing)

**Local Development Setup:**

```bash
# 1. Get your OpenAI API key from platform.openai.com

# 2. Configure coach to use OpenAI
cd backend
echo "LLM_PROVIDER=openai" >> .env
echo "OPENAI_API_KEY=sk-proj-..." >> .env  # Replace with your actual key
echo "LLM_MODEL=gpt-4o-mini" >> .env       # Or gpt-4o, gpt-4-turbo

# 3. Start the coach backend
node src/server.js
```

Verify it's working:
```bash
curl http://localhost:8080/api/health
# Should show: {"status":"healthy","llm_provider":"openai",...}
```

**Docker Deployment:**

```bash
# 1. Configure coach to use OpenAI
echo "LLM_PROVIDER=openai" >> .env
echo "OPENAI_API_KEY=sk-proj-..." >> .env
echo "LLM_MODEL=gpt-4o-mini" >> .env

# 2. Start coach in Docker
docker-compose -f docker-compose.personal.yml up -d
```

**Recommended Models:**

| Model | Cost (Input/Output) | Best For | Context Window |
|-------|-------------------|----------|----------------|
| `gpt-4o-mini` | $0.15 / $0.60 per 1M tokens | **Best balance** — Fast, affordable, high quality | 128K |
| `gpt-4o` | $2.50 / $10.00 per 1M tokens | Premium quality, complex reasoning | 128K |
| `gpt-4-turbo` | $10.00 / $30.00 per 1M tokens | Legacy option, use gpt-4o instead | 128K |
| `gpt-3.5-turbo` | $0.50 / $1.50 per 1M tokens | Budget option, lower quality | 16K |

> **Recommendation:** Start with **`gpt-4o-mini`** — excellent quality at ~$0.10 per 1,000 coaching requests.

**Cost Estimation:**

Typical coach usage:
- **Weekly plan generation**: ~5,000 tokens → $0.004 with gpt-4o-mini
- **Daily workout recommendation**: ~2,000 tokens → $0.002
- **Monthly cost for active use**: ~$2-5 with gpt-4o-mini

**Advanced Configuration:**

```bash
# Use custom OpenAI-compatible endpoint (e.g., Azure OpenAI)
OPENAI_API_URL=https://your-resource.openai.azure.com/openai/deployments/your-deployment

# Adjust generation parameters
LLM_TEMPERATURE=0.7        # 0.0-2.0 (higher = more creative)
LLM_MAX_TOKENS=2000        # Maximum response length
LLM_TIMEOUT_MS=30000       # Request timeout in milliseconds
```

**⚠️ Important Notes:**

- **Cloud-based**: Unlike Ollama/LM Studio, OpenAI sends data to external servers
- **Requires internet**: No offline mode
- **Usage costs**: Monitor your usage at [platform.openai.com/usage](https://platform.openai.com/usage)
- **Rate limits**: Free tier has lower limits; paid accounts get higher throughput
- **Data privacy**: Review [OpenAI's data usage policy](https://openai.com/policies/api-data-usage-policies)

**MCP Support:**

✅ **Works with MCP** — OpenAI can be used with the coach MCP server for Claude Desktop integration. The MCP server calls the coach backend API, which then uses OpenAI for LLM responses.

**Switching Back to Local Models:**

```bash
# Edit .env or backend/.env
LLM_PROVIDER=lmstudio  # or ollama

# Restart coach
docker-compose restart coach  # Docker mode
# OR
node src/server.js  # Local mode
```

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

**Smart Goals:**
- `POST /api/goals` - Parse and create a new goal (body: `{email, text, confirm}` — omit `confirm` for preview)
- `GET /api/goals?email=<email>` - List active goals (add `include_draft=true` for draft block sub-goals)
- `GET /api/goals/weekly-review?email=<email>&week_start=<YYYY-MM-DD>` - Weekly goal status review
- `GET /api/goals/balance?email=<email>` - Multi-goal balance check with conflict detection
- `GET /api/goals/:id?email=<email>` - Single goal with sub-goals and progress history
- `PUT /api/goals/:id` - Update goal fields
- `DELETE /api/goals/:id?email=<email>` - Soft-delete goal (status → abandoned)
- `GET /api/goals/:id/progress` - Full weekly progress history
- `POST /api/goals/:id/evaluate` - Evaluate goal progress for a week (body: `{email, week_start, completed_sessions, disruptions, recovery_signals}`)
- `POST /api/goals/:id/adapt` - Propose minimum-effective-dose adaptation under disruption

**Help Documentation:**
- `GET /api/help/tsb` - TSB (Training Stress Balance) explanation
- `GET /api/help/readiness` - Training readiness breakdown
- `GET /api/help/glossary` - Training metrics glossary
- `GET /api/help/metrics` - All metrics documentation

See [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for full API documentation.

## Smart Goals

Smart Goals is the adaptive training goal system built into coach. It turns free-text goal descriptions into structured, measurable targets and keeps them aligned with your actual training week after week.

### How it works

Goals are organised in a three-level hierarchy:

| Level | Example | Created by |
|-------|---------|------------|
| `long_term` | "Run a sub-4h marathon in October" | You, via natural language |
| `block` | "8-week threshold block (weeks 1–8)" | Auto-decomposed by LLM on creation |
| `weekly` | "Hit 50 km total this week" | Generated during weekly planning |

When you save a new long-term goal the system immediately triggers an async LLM decomposition that creates all training blocks as `draft` sub-goals. Once you review and activate them they feed directly into weekly plan generation and daily workout recommendations.

### Goal types

| Type | Description |
|------|-------------|
| `performance` | Time/pace/power targets (races, PRs) |
| `consistency` | Habit-based targets (run 4× per week) |
| `health` | Body-composition or wellness outcomes |
| `skill` | Technique or drill mastery |
| `event` | Race/event-specific preparation |

### Creating a goal

1. Open the **Goals** tab in the UI (or call `POST /api/goals` / MCP `create_goal`)
2. Describe your goal in plain English — e.g. *"I want to do an Ironman 70.3 next August, coming from a 5 km running base"*
3. The LLM returns an interpreted preview: title, type, target date, metric, weekly KPIs, assumptions, confidence score, and draft training blocks
4. Review the preview, then confirm to save

### Weekly progress evaluation

Run `POST /api/goals/:id/evaluate` (or the weekly diary) with that week's completed sessions. The LLM returns:
- **status**: `on_track` / `at_risk` / `off_track`
- **metric_value**: measured progress toward the target
- **kpis_snapshot**: pass/fail for each weekly KPI
- **min_effective_alt**: if not on_track, the minimum set of sessions to protect goal intent

### Adaptation under disruption

When life gets in the way, `POST /api/goals/:id/adapt` takes your disruptions (illness, travel, missed sessions) and recovery signals and returns a revised minimal-dose plan that keeps the goal alive without overloading you when you return.

Multi-goal conflict detection is available via `GET /api/goals/balance` — it prioritises goals and flags training load conflicts with concrete weekly-allocation recommendations.

### MCP tools (Claude Desktop)

| Tool | Description |
|------|-------------|
| `get_active_goals` | List active goals with status icons |
| `create_goal` | Parse and optionally save a new goal (preview_only mode available) |
| `adapt_goals` | Propose a minimum-effective-dose plan under disruption |
| `get_weekly_goal_review` | Per-goal weekly status, KPIs, and coaching narrative |

### Context injection

Active goals are automatically injected into every daily and weekly LLM context. The weekly plan marks which sessions serve which goals (`supports_goals`) and includes a `goal_alignment` summary showing projected goal status at week end.

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
node mcp/coach-mcp-server.js
```

Run end-to-end MCP demo:

```bash
python3 mcp/demo_client.py
```

MCP docs and config snippets are in `mcp/README.md`.
Includes Claude Desktop + Claude Code setup.

## Garmin sync setup

[GarminDB](https://github.com/tcgoetz/GarminDB) is an open-source Python toolkit that downloads your health and fitness data from Garmin Connect and stores it in local SQLite databases. The coach reads these databases to generate personalised training insights. GarminDB is included as a Git submodule under `vendor/GarminDB` — if you cloned with `--recurse-submodules` it is already present.

> **First-time users**: You need a free [Garmin Connect](https://connect.garmin.com/) account and a Garmin device that syncs to it. The sync scripts below will download your data and build the local databases automatically.

1. Initial setup already prepared:
- local config: `data/garmin/GarminConnectConfig.json`
- Python env: `.venv-garmin` (Python 3.12 recommended for GarminDB compatibility)

2. Run latest sync (recommended for normal updates):

**macOS / Linux / WSL / Git Bash:**
```bash
GARMIN_USER="you@example.com" \
GARMIN_PASSWORD="your_password" \
./scripts/garmindb_sync_latest.sh
```

**PowerShell (Windows):**
```powershell
$env:GARMIN_USER="you@example.com"
$env:GARMIN_PASSWORD="your_password"
bash ./scripts/garmindb_sync_latest.sh      # requires WSL or Git Bash on PATH
```

3. Run full historical sync (first-time import):

**macOS / Linux / WSL / Git Bash:**
```bash
GARMIN_USER="you@example.com" \
GARMIN_PASSWORD="your_password" \
./scripts/garmindb_sync_all.sh
```

**PowerShell (Windows):**
```powershell
$env:GARMIN_USER="you@example.com"
$env:GARMIN_PASSWORD="your_password"
bash ./scripts/garmindb_sync_all.sh
```

4. If a long download run times out, import whatever was already downloaded:

```bash
./scripts/garmindb_import_local.sh
```

5. Load GarminDB days into coach MCP store:

```bash
# macOS / Linux:
. .venv-garmin/bin/activate
# Windows: .venv-garmin\Scripts\activate

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
- **[CHANGELOG.md](CHANGELOG.md)** - Recent bug fixes and changes
- **[mcp/README.md](mcp/README.md)** - MCP server setup and usage

## Project Structure

```
├── backend/
│   ├── src/
│   │   ├── routes/              # API endpoints
│   │   │   ├── activity.js      # Activity verification endpoints
│   │   │   ├── goals.js         # Smart Goals CRUD + evaluation endpoints
│   │   │   ├── help.js          # Help documentation endpoints
│   │   │   ├── patterns.js      # Pattern recognition endpoints
│   │   │   ├── stats.js         # Training statistics endpoints
│   │   │   └── workout.js       # Workout recommendation endpoints
│   │   ├── services/            # Business logic
│   │   │   ├── activity-verification.js   # Activity verification service
│   │   │   ├── auth-improved.js           # Encrypted authentication
│   │   │   ├── goal-adaptation.js         # Min-effective-dose + multi-goal balance
│   │   │   ├── goal-service.js            # Smart Goals CRUD + LLM evaluation
│   │   │   ├── pattern-recognition.js     # Pattern analysis
│   │   │   ├── stats-service.js           # Statistics calculations
│   │   │   └── workout-recommendation.js  # Training recommendations
│   │   ├── middleware/          # Express middleware
│   │   │   └── data-freshness.js          # Data context tracking
│   │   └── server.js            # Express server entry point
│   └── package.json
├── engine/                       # Business logic modules
│   ├── gap-detection.js         # Training gap detection
│   ├── recovery-scoring.js      # Recovery algorithm
│   └── workout-planning.js      # Workout selection and planning
├── frontend/                     # React/Vite coaching dashboard
│   ├── src/                     # React components
│   ├── index.html
│   └── package.json
├── mcp/
│   ├── coach-mcp-server.js      # MCP server for Claude Desktop
│   ├── lib/                     # Handler modules
│   └── README.md                # MCP documentation
├── scripts/
│   ├── credential-manager.sh    # Encrypted Garmin credentials
│   ├── sync-manager.sh          # Robust sync with retry logic
│   ├── garmindb_sync_*.sh       # Garmin sync scripts
│   └── import_garmindb_to_coach.py  # GarminDB data importer
├── schemas/                      # JSON schema definitions
│   ├── athlete_profile.v1.json
│   ├── daily_metrics.v1.json
│   ├── recommendation.v1.json
│   └── smart_goal.v1.json
├── storage/                      # Storage abstraction layer
├── vendor/GarminDB/             # GarminDB integration (submodule)
├── Dockerfile                    # Docker build
├── docker-compose.yml            # Base compose config
├── docker-compose.personal.yml  # Personal deployment config
├── docker-compose.shareable.yml # Shareable deployment config
├── .github/
│   └── workflows/
│       └── docker-publish.yml   # CI/CD pipeline
└── package.json                 # Node.js project config
```

## Recent Improvements (Apr 2026)

### Major Features ✨
- **Smart Goals**: Adaptive context-aware goal system — free-text → structured targets → weekly KPIs → on_track/at_risk/off_track + min-effective-dose adaptation
  - 3-level hierarchy: long_term → block (auto-decomposed) → weekly
  - Active goals injected into all daily and weekly LLM contexts
  - `/api/goals` REST API (10 endpoints), 4 new MCP tools, Goals tab in UI

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

  **Bash (macOS / Linux / WSL / Git Bash):**
  ```bash
  GARMIN_USER="you@example.com" \
  GARMIN_PASSWORD="your_password" \
  GARMIN_MFA_CODE="123456" \
  ./scripts/garmindb_sync_latest.sh
  ```
  **PowerShell (Windows):**
  ```powershell
  $env:GARMIN_USER="you@example.com"; $env:GARMIN_PASSWORD="your_password"; $env:GARMIN_MFA_CODE="123456"
  bash ./scripts/garmindb_sync_latest.sh
  ```

- If first sync is too large/slow, bootstrap with a recent start date:

  **Bash:**
  ```bash
  GARMIN_USER="you@example.com" \
  GARMIN_PASSWORD="your_password" \
  GARMIN_START_DATE="01/01/2024" \
  ./scripts/garmindb_sync_latest.sh
  ```
  **PowerShell:**
  ```powershell
  $env:GARMIN_USER="you@example.com"; $env:GARMIN_PASSWORD="your_password"; $env:GARMIN_START_DATE="01/01/2024"
  bash ./scripts/garmindb_sync_latest.sh
  ```

- Network tuning env vars are supported for long Garmin runs:
  `GARMINDB_HTTP_TIMEOUT` (default `30`), `GARMINDB_HTTP_RETRIES` (default `6`), `GARMINDB_HTTP_BACKOFF` (default `1.0`).
- Credentials passed via env are written only to a temporary config during execution.
- Downloaded data and DB files are stored under `data/garmin/HealthData`.

## Data schemas

- `schemas/athlete_profile.v1.json`
- `schemas/daily_metrics.v1.json`
- `schemas/recommendation.v1.json`
- `schemas/smart_goal.v1.json`

## Docker Hub

```bash
# Pull from Docker Hub (recommended)
docker pull 404i/garmin-coach-ai:latest

# Or build locally
docker build -t 404i/garmin-coach-ai .
```

## Platform Notes

| Topic | macOS | Windows | Linux |
|-------|-------|---------|-------|
| Docker startup | `docker compose -f ... up -d` | Same — set `GARMINDB_PATH` in `.env` (no `~` expansion; use full path e.g. `C:\Users\You\HealthData`) | Same |
| Sync scripts (bash) | Work natively | Run from **WSL2** terminal or **Git Bash** | Work natively |
| Claude Desktop config | `~/Library/Application Support/Claude/claude_desktop_config.json` | `%APPDATA%\Claude\claude_desktop_config.json` | `~/.config/Claude/claude_desktop_config.json` |
| Python venv activation | `source .venv-garmin/bin/activate` | `.venv-garmin\Scripts\activate` | `source .venv-garmin/bin/activate` |
| LM Studio / Ollama URL in Docker | `host.docker.internal` works | `host.docker.internal` works | `host.docker.internal` may not resolve — use `172.17.0.1` or add `extra_hosts: ["host.docker.internal:host-gateway"]` to your compose override |
| Volume permissions | No issues | No issues | May need `sudo chown $UID:$GID ./data ./logs` before first run |

## System Requirements

- **Docker**: 20.10+ with Compose v2 (for containerized deployment)
- **Node.js**: 18+ (for local development)
- **Python**: 3.8+ (for GarminDB sync)
- **AI Backend**: Claude Desktop, LM Studio, or Ollama (at least one)
- **Disk**: 2GB+ free space
- **Memory**: 1GB+ recommended
- **GarminDB**: Pre-synced with your Garmin data

## Next build steps

1. ✅ ~~Add activity verification to prevent hallucinations~~
2. ✅ ~~Add data freshness tracking~~
3. ✅ ~~Import VO2 max and comprehensive activity metrics~~
4. ✅ ~~Docker containerization~~
5. ✅ ~~Smart Goals: adaptive goal system with weekly KPI tracking and LLM-driven adaptation~~
6. Add OCR extraction from screenshots into `daily_metrics`
7. Add stronger retry/resume behavior for long Garmin downloads
8. Replace JSON store with Postgres for production readiness
