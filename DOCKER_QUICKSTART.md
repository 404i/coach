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
# One command setup
./docker-setup.sh personal

# Or manually
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
# One command setup
./docker-setup.sh shareable

# Or manually
docker-compose -f docker-compose.shareable.yml up -d
```

**Access:**
- Backend API: http://localhost:8080
- MCP Server: http://localhost:3001
- Data persisted in Docker volumes (not local files)

---

## Distribution Package

To share the application:

```bash
# 1. Build shareable image
docker-compose -f docker-compose.shareable.yml build

# 2. Export image
docker save garmin-ai-coach:latest | gzip > garmin-coach-image.tar.gz

# 3. Create distribution package
tar -czf garmin-coach-v1.0.tar.gz \
  garmin-coach-image.tar.gz \
  docker-compose.shareable.yml \
  docker-setup.sh \
  DOCKER_DEPLOYMENT.md \
  README.md \
  .env.example

# 4. Share garmin-coach-v1.0.tar.gz (no personal data included!)
```

## For Recipients

When someone receives your distribution:

```bash
# 1. Extract
tar -xzf garmin-coach-v1.0.tar.gz

# 2. Load image
docker load < garmin-coach-image.tar.gz

# 3. Configure
cp .env.example .env
nano .env  # Set GARMINDB_PATH to your GarminDB location

# 4. Run
./docker-setup.sh shareable

# 5. Import your data
docker-compose -f docker-compose.shareable.yml exec coach \
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
      "args": ["exec", "-i", "garmin-coach-mcp-personal", "node", "/app/mcp/server.js"]
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
      "args": ["exec", "-i", "garmin-coach-mcp", "node", "/app/mcp/server.js"]
    }
  }
}
```

---

**Ready to containerize!** 🐳
