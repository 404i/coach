# Docker Deployment Guide

## Overview

The Garmin AI Coach application supports two Docker deployment scenarios:

1. **Personal Setup** (`docker-compose.personal.yml`) - For your private use with existing GarminDB data
2. **Shareable Setup** (`docker-compose.shareable.yml`) - Clean installation for sharing with others

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- GarminDB installed and synced (for personal setup)
- 2GB+ free disk space

## Quick Start

### Personal Setup (Your Data)

This setup uses your existing GarminDB data and coach profile:

```bash
# Run the setup script
./docker-setup.sh personal

# Or manually:
docker-compose -f docker-compose.personal.yml up -d
```

**What happens:**
- Mounts your existing `~/HealthData` (GarminDB) as read-only
- Uses your `data/coach_mcp_store.json` profile
- Automatically imports last 30 days of data
- Backend API: http://localhost:8080
- MCP Server: http://localhost:3001

### Shareable Setup (Clean Install)

This setup creates a clean installation for others to use:

```bash
# Run the setup script
./docker-setup.sh shareable

# Or manually:
docker-compose -f docker-compose.shareable.yml up -d
```

**What happens:**
- Creates empty Docker volumes for data storage
- No pre-existing data imported
- Users configure their own GarminDB path
- Backend API: http://localhost:8080
- MCP Server: http://localhost:3001

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# Node environment
NODE_ENV=production

# LM Studio URL (for local LLM)
LM_STUDIO_URL=http://host.docker.internal:1234/v1

# OpenWeather API Key (optional)
OPENWEATHER_API_KEY=your_key_here

# Timezone
TZ=America/New_York

# Profile ID
PROFILE_ID=athlete-1

# GarminDB Path (personal setup only)
GARMINDB_PATH=/path/to/your/HealthData
```

### Personal Setup - Volume Mapping

```yaml
volumes:
  # Your GarminDB data (read-only)
  - ${GARMINDB_PATH}:/app/data/garmin/HealthData:ro
  
  # Your coach data (persisted locally)
  - ./data:/app/data
  
  # Logs
  - ./logs:/app/logs
```

### Shareable Setup - Named Volumes

```yaml
volumes:
  # User's GarminDB data
  garmindb_data:
    driver: local
  
  # Coach profile data
  coach_data:
    driver: local
  
  # Application logs
  coach_logs:
    driver: local
```

## Usage

### Starting Services

```bash
# Personal setup
docker-compose -f docker-compose.personal.yml up -d

# Shareable setup
docker-compose -f docker-compose.shareable.yml up -d
```

### Stopping Services

```bash
# Personal setup
docker-compose -f docker-compose.personal.yml down

# Shareable setup
docker-compose -f docker-compose.shareable.yml down
```

### Viewing Logs

```bash
# All services
docker-compose -f docker-compose.personal.yml logs -f

# Specific service
docker-compose -f docker-compose.personal.yml logs -f coach
docker-compose -f docker-compose.personal.yml logs -f mcp-server
```

### Importing Data

```bash
# Personal setup (done automatically on first run)
docker-compose -f docker-compose.personal.yml exec coach \
  python3 /app/scripts/import_garmindb_to_coach.py \
  --profile-id test-athlete-1 \
  --latest-days 30

# Shareable setup (user runs after mounting their GarminDB)
docker-compose -f docker-compose.shareable.yml exec coach \
  python3 /app/scripts/import_garmindb_to_coach.py \
  --profile-id athlete-1 \
  --latest-days 30
```

### Updating GarminDB Data

```bash
# On host machine, sync latest from Garmin
cd ~/HealthData
python3 -m garmindb --all --download --import --analyze

# In container, import to coach
docker-compose exec coach \
  python3 /app/scripts/import_garmindb_to_coach.py \
  --profile-id YOUR_PROFILE_ID \
  --latest-days 7
```

## Claude Desktop Integration

### Personal Setup

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "coach-mcp-personal": {
      "command": "docker",
      "args": [
        "exec", "-i", 
        "garmin-coach-mcp-personal", 
        "node", "/app/mcp/server.js"
      ]
    }
  }
}
```

### Shareable Setup

```json
{
  "mcpServers": {
    "coach-mcp": {
      "command": "docker",
      "args": [
        "exec", "-i", 
        "garmin-coach-mcp", 
        "node", "/app/mcp/server.js"
      ]
    }
  }
}
```

## API Endpoints

Once running, access these endpoints:

- `GET /api/health` - Health check
- `GET /api/stats/current?email=test@example.com` - Current training stats
- `GET /api/workout/recommendations?email=test@example.com` - Workout recommendations
- `GET /api/help/tsb` - TSB explanation
- `GET /api/help/readiness` - Readiness score breakdown
- Full API docs: See [QUICK_REFERENCE.md](QUICK_REFERENCE.md)

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs coach

# Check if ports are in use
lsof -i :8080
lsof -i :3001
```

### GarminDB path not found

For personal setup, ensure `GARMINDB_PATH` in `.env` points to your actual GarminDB directory:

```bash
# Find your GarminDB path
ls ~/HealthData/DBs/*.db

# Update .env
GARMINDB_PATH=/Users/yourname/HealthData
```

### Data not importing

```bash
# Check if GarminDB databases exist
docker-compose exec coach ls -la /app/data/garmin/HealthData/DBs/

# Try manual import with verbose output
docker-compose exec coach \
  python3 /app/scripts/import_garmindb_to_coach.py \
  --profile-id YOUR_PROFILE_ID \
  --latest-days 7 \
  --dry-run
```

### MCP server not connecting

```bash
# Verify container is running
docker ps | grep mcp

# Check MCP logs
docker-compose logs mcp-server

# Test MCP endpoint
curl http://localhost:3001
```

## Data Persistence

### Personal Setup
- Your GarminDB: Read-only mount from host (`~/HealthData`)
- Coach data: Local directory `./data`
- Logs: Local directory `./logs`

**Advantage:** Direct access to files on host machine

### Shareable Setup
- All data in Docker volumes
- Persists between container restarts
- Isolated from host filesystem

**Advantage:** Clean separation, easier to share

## Backup

### Personal Setup
```bash
# Your data is already on the host
tar -czf coach-backup-$(date +%Y%m%d).tar.gz data/ logs/
```

### Shareable Setup
```bash
# Export Docker volumes
docker run --rm \
  -v garmin-ai-coach_coach_data:/data \
  -v $(pwd):/backup \
  alpine tar -czf /backup/coach-data-$(date +%Y%m%d).tar.gz /data
```

## Sharing the Application

### Creating a Distribution Package

For shareable setup:

```bash
# 1. Build the image
docker-compose -f docker-compose.shareable.yml build

# 2. Save image to file
docker save garmin-ai-coach:latest | gzip > garmin-ai-coach-docker.tar.gz

# 3. Create distribution package
tar -czf garmin-coach-distribution.tar.gz \
  docker-compose.shareable.yml \
  Dockerfile \
  .dockerignore \
  docker-setup.sh \
  DOCKER_DEPLOYMENT.md \
  README.md \
  .env.example

# 4. Share garmin-coach-distribution.tar.gz
```

### For Recipients

```bash
# 1. Extract package
tar -xzf garmin-coach-distribution.tar.gz
cd garmin-ai-coach

# 2. Load Docker image
docker load < garmin-ai-coach-docker.tar.gz

# 3. Configure
cp .env.example .env
# Edit .env with your settings

# 4. Start
./docker-setup.sh shareable
```

## Resource Requirements

- **CPU:** 1-2 cores (2+ recommended)
- **RAM:** 512MB minimum, 1GB recommended
- **Disk:** 
  - Base image: ~500MB
  - GarminDB: ~100-500MB (depends on history)
  - Coach data: ~10-50MB
  - Logs: ~10MB/day

## Security Considerations

### Personal Setup
- GarminDB mounted read-only (`:ro`) to prevent accidental modification
- Coach data writable for profile updates
- No credentials in Docker image

### Shareable Setup
- All volumes isolated in Docker
- No host filesystem access
- Users provide their own credentials

### Both Setups
- No passwords or API keys in images
- Use `.env` file for secrets (never commit!)
- MCP server only accessible on localhost
- Health check doesn't expose sensitive data

## Production Deployment

For production use:

1. **Use environment-specific .env files**
2. **Enable HTTPS** with reverse proxy (nginx/Caddy)
3. **Set up proper logging** (ELK stack, CloudWatch)
4. **Configure backups** (automated daily snapshots)
5. **Monitor health checks** (Prometheus, Datadog)
6. **Restrict network access** (firewall rules)

Example nginx reverse proxy:

```nginx
server {
    listen 443 ssl;
    server_name coach.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Architecture

```
┌─────────────────────────────────────┐
│         Docker Compose              │
├─────────────────┬───────────────────┤
│  Backend API    │   MCP Server      │
│  (Port 8080)    │   (Port 3001)     │
│                 │                   │
│  - Express API  │   - MCP Protocol  │
│  - Stats        │   - Claude Tools  │
│  - Workouts     │   - Store Access  │
│  - Help Docs    │                   │
└────────┬────────┴─────────┬─────────┘
         │                  │
    ┌────▼──────────────────▼────┐
    │    Shared Data Volume      │
    │  - coach_mcp_store.json    │
    │  - Athlete profiles        │
    └────────────────────────────┘
              │
    ┌─────────▼─────────────┐
    │   GarminDB Volume     │
    │   - Activities DB     │
    │   - Summary DB        │
    │   - Attributes DB     │
    └───────────────────────┘
```

## Support

For issues or questions:
1. Check logs: `docker-compose logs -f`
2. Review [QUICK_REFERENCE.md](QUICK_REFERENCE.md)
3. See [TESTING_INSTRUCTIONS.md](TESTING_INSTRUCTIONS.md)
4. Open an issue on GitHub

## License

See [LICENSE](LICENSE) file for details.
