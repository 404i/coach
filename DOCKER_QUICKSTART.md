# Docker Containerization - Quick Start

## Two Deployment Options

### 1. Personal Setup (Your Private Use)

**Use Case:** You want to run the coach with your existing GarminDB data

**What You Get:**
- Your GarminDB data (`~/HealthData`) mounted read-only  
- Your athlete profile (`data/coach_mcp_store.json`) persisted locally
- Automatic import of last 30 days on first run
- Full access to your training history

**Quick Start:**
```bash
# Personal setup
docker compose -f docker-compose.personal.yml up -d

# Or with docker-compose (v1)
docker-compose -f docker-compose.personal.yml up -d
```

**Access:**
- Backend API: http://localhost:8080
- MCP Server: http://localhost:3001 (for Claude Desktop)
- Your data: `./data/coach_mcp_store.json`
- Logs: `./logs/`

---

### 2. Shareable Setup (Distribution to Others)

**Use Case:** Share the coach with friends/community without your personal data

**What You Get:**
- Clean installation with Docker volumes
- No pre-existing data included
- Users mount their own GarminDB path
- Isolated data storage

**Quick Start:**
```bash
# Shareable setup
docker compose -f docker-compose.shareable.yml up -d

# Or with docker-compose (v1)
docker-compose -f docker-compose.shareable.yml up -d
```

**Access:**
- Backend API: http://localhost:8080
- MCP Server: http://localhost:3001
- Data persisted in Docker volumes (not local files)

---

## Distribution

The image is published on Docker Hub — recipients just need:

```bash
# 1. Pull the image
docker pull 404i/garmin-coach-ai:latest

# 2. Configure
cp .env.example .env
nano .env  # Set GARMINDB_PATH to your GarminDB location

# 3. Run
docker-compose -f docker-compose.shareable.yml up -d
```

Docker Hub: https://hub.docker.com/r/404i/garmin-coach-ai

## For New Users

Getting started without cloning the repo:

```bash
# 1. Download the compose file
curl -O https://raw.githubusercontent.com/404i/coach/main/docker-compose.shareable.yml
curl -O https://raw.githubusercontent.com/404i/coach/main/.env.example

# 2. Configure
cp .env.example .env
nano .env  # Set GARMINDB_PATH to your GarminDB location

# 3. Pull and run (no build needed)
docker compose -f docker-compose.shareable.yml pull
docker compose -f docker-compose.shareable.yml up -d

# 4. Import your data
docker compose -f docker-compose.shareable.yml exec coach \
  python3 /app/scripts/import_garmindb_to_coach.py \
  --profile-id YOUR-NAME --latest-days 30
```

## Comparison

| Feature | Personal Setup | Shareable Setup |
|---------|---------------|-----------------|
| **Your Data** | ✅ Included | ❌ Not included |
| **GarminDB Mount** | Host directory (`~/HealthData`) | Docker volume |
| **Data Access** | Direct file access | Docker volumes only |
| **Auto-import** | ✅ On first run | ❌ Manual |
| **Distribution** | ⚠️ Contains your data! | ✅ Clean, no data |
| **Use Case** | Daily personal use | Sharing with others |

## Next Steps

See [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md) for:
- Full configuration options
- Claude Desktop integration
- Troubleshooting
- Production deployment
- Backup strategies

## Commands Reference

### Personal Setup
```bash
# Start
docker-compose -f docker-compose.personal.yml up -d

# Stop  
docker-compose -f docker-compose.personal.yml down

# Logs
docker-compose -f docker-compose.personal.yml logs -f

# Import latest data
docker-compose -f docker-compose.personal.yml exec coach \
  python3 /app/scripts/import_garmindb_to_coach.py \
  --profile-id test-athlete-1 --latest-days 7
```

### Shareable Setup
```bash
# Start
docker-compose -f docker-compose.shareable.yml up -d

# Stop
docker-compose -f docker-compose.shareable.yml down

# Logs
docker-compose -f docker-compose.shareable.yml logs -f

# Import data (after user configures GarminDB)
docker-compose -f docker-compose.shareable.yml exec coach \
  python3 /app/scripts/import_garmindb_to_coach.py \
  --profile-id athlete-1 --latest-days 30
```

## Claude Desktop Integration

### Personal
```json
{
  "mcpServers": {
    "coach-mcp-personal": {
      "command": "docker",
      "args": ["exec", "-i", "garmin-coach-mcp-personal", "node", "/app/mcp/coach-mcp-server.js"]
    }
  }
}
```

### Shareable
```json
{
  "mcpServers": {
    "coach-mcp": {
      "command": "docker",
      "args": ["exec", "-i", "garmin-coach-mcp", "node", "/app/mcp/coach-mcp-server.js"]
    }
  }
}
```

---

**Ready to containerize!** 🐳
