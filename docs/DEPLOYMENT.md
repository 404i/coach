# Coach Backend - Deployment Guide

## ⚠️ CRITICAL: Pre-Deployment Checklist

### 1. Backup Database
**MANDATORY** before running any migrations or updates:

```bash
# Create timestamped backup
cp ./data/coach.db ./data/coach.db.backup-$(date +%Y%m%d-%H%M%S)

# Verify backup exists
ls -lh ./data/coach.db*
```

### 2. Regenerate Package Lock Files

The package-lock.json files need to be regenerated due to version inconsistencies:

```bash
# Backend packages
cd backend
rm -f package-lock.json
npm install
cd ..

# Frontend packages (if using)
cd frontend  
rm -f package-lock.json
npm install
cd ..

# Commit the regenerated lock files
git add backend/package-lock.json frontend/package-lock.json
git commit -m "chore: regenerate package-lock.json with clean dependencies"
```

### 3. Run User Consolidation Script

If duplicate users exist, consolidate them before migration:

```bash
# This will keep user ID 1 and delete user ID 2
node backend/scripts/migrate-duplicate-users.js

# Expected output:
# ✓ Deleted User ID 2 (tscochev.ivan@gmail.com)
# ✓ All data preserved and linked to User ID 1
```

### 4. Rebuild Docker Container

After code changes and package updates:

```bash
# Stop existing containers
docker compose down

# Rebuild with latest code
docker compose build coach

# Start containers
docker compose up -d

# Verify containers are healthy
docker compose ps
docker logs garmin-ai-coach --tail=50
```

### 5. Verify Migration Success

Check that the database schema migration completed:

```bash
# Connect to container
docker exec -it garmin-ai-coach sh

# Check foreign keys enabled
sqlite3 /app/data/coach.db "PRAGMA foreign_keys;"
# Expected: 1

# Check activities table schema
sqlite3 /app/data/coach.db "PRAGMA table_info(activities);" | grep user_id
# Expected: See user_id column (not profile_id)

# Check data integrity
sqlite3 /app/data/coach.db "SELECT COUNT(*) FROM activities a LEFT JOIN users u ON a.user_id = u.id WHERE u.id IS NULL;"
# Expected: 0 (no orphaned records)

exit
```

### 6. Test Health Endpoint

```bash
curl http://localhost:8088/api/health | jq '.'

# Expected response:
# {
#   "status": "healthy",
#   "database": {
#     "foreign_keys_enabled": true,
#     "integrity_checks": {
#       "all_passed": true
#     }
#   }
# }
```

### 7. Test API Functionality

```bash
# Get recent activities (replace with your email)
curl -s "http://localhost:8088/api/activity/recent?email=tsochev.ivan@gmail.com&days=7" | jq '.count'

# Expected: Returns count > 0, no "stale" warnings
```

---

## Deployment Architecture

### Single Source of Truth

**IMPORTANT**: Docker Compose is the **ONLY** supported deployment method.

- ✅ **Correct**: `docker compose up -d`
- ❌ **Wrong**: `npm start` or `node src/server.js` (development only)

### Data Persistence

All data is stored in Docker volumes mounted from the host:

- **Database**: `./data/coach.db` (host) → `/app/data/coach.db` (container)
- **Logs**: `./logs/` (host) → `/app/logs/` (container)
- **Garmin Data**: `./data/garmin/` (host) → `/app/data/garmin/` (container)

**Never commit** `./data/` or `./logs/` directories to git.

### Configuration

All configuration is via environment variables in `.env` file:

```bash
# Copy example
cp .env.example .env

# Required variables
ENCRYPTION_KEY=your-encryption-key-here
BACKEND_API_KEY=your-api-key-here
MCP_AUTH_TOKEN=your-mcp-token-here

# Optional LLM configuration
LLM_PROVIDER=lmstudio
LM_STUDIO_URL=http://host.docker.internal:1234/v1
```

### Port Mapping

- **Backend API**: Port 8088 (host) → 8080 (container)
- **MCP Server**: Port 3001 (host) → 3001 (container)

---

## Rollback Procedure

If migration fails or causes issues:

### 1. Stop Containers
```bash
docker compose down
```

### 2. Restore Database Backup
```bash
# Find your backup
ls -lh ./data/coach.db*

# Restore (replace timestamp)
cp ./data/coach.db.backup-20260403-120000 ./data/coach.db
```

### 3. Revert Code Changes
```bash
# If you committed changes
git log --oneline  # Find commit before migration
git reset --hard <commit-hash>

# Or restore specific files
git checkout HEAD~1 backend/src/db/migrations/20260403_fix_profile_id_foreign_keys.js
```

### 4. Rebuild and Restart
```bash
docker compose build coach
docker compose up -d
```

---

## Monitoring & Maintenance

### Health Checks

Docker automatically runs health checks every 30 seconds:

```bash
# View health status
docker compose ps

# Check health endpoint
curl http://localhost:8088/api/health
```

### Log Monitoring

```bash
# View live logs
docker compose logs -f coach

# View last 100 lines
docker compose logs --tail=100 coach

# Search for errors
docker compose logs coach | grep -i error
```

### Database Maintenance

```bash
# Vacuum database to reclaim space
docker exec garmin-ai-coach sqlite3 /app/data/coach.db "VACUUM;"

# Check database size
docker exec garmin-ai-coach ls -lh /app/data/coach.db

# Run integrity checks manually
curl http://localhost:8088/api/health | jq '.database.integrity_checks'
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs for errors
docker compose logs coach

# Common issues:
# - Missing environment variables → Check .env file
# - Database locked → Stop all containers, restart
# - Port already in use → Check for other processes on 8088
```

### Foreign Key Errors

```bash
# Check if foreign keys are enabled
docker exec garmin-ai-coach sqlite3 /app/data/coach.db "PRAGMA foreign_keys;"

# If disabled, container needs rebuild
docker compose down
docker compose build coach
docker compose up -d
```

### Orphaned Data

```bash
# Run integrity checks
curl http://localhost:8088/api/health | jq '.database.integrity_checks'

# If orphaned_activities > 0, restore from backup
# This indicates data corruption - DO NOT PROCEED
```

### Package Installation Fails

```bash
# If npm ci fails during build
cd backend
rm -rf node_modules package-lock.json
npm install
cd ..

# Rebuild container
docker compose build coach --no-cache
```

---

## Security Notes

### Environment Variables

Never commit these to git:
- `ENCRYPTION_KEY` - Used for encrypting Garmin credentials
- `BACKEND_API_KEY` - API authentication
- `MCP_AUTH_TOKEN` - MCP server authentication
- Any `*_CLIENT_SECRET` values

### Database Encryption

Garmin session tokens are encrypted in the database using the `ENCRYPTION_KEY`. If you lose this key, users must re-authenticate.

### Network Security

- Backend API binds to `0.0.0.0:8088` (accessible on network)
- MCP binds to `127.0.0.1:3001` (localhost only by default)
- Use firewall rules to restrict access in production

---

## Support

### Issues Detected During Deployment?

1. Check logs: `docker compose logs coach --tail=200`
2. Verify health: `curl http://localhost:8088/api/health`
3. Restore backup if needed (see Rollback Procedure above)

### Database Corruption?

If integrity checks fail:

```bash
# Stop containers
docker compose down

# Restore from backup
cp ./data/coach.db.backup-<timestamp> ./data/coach.db

# Restart
docker compose up -d
```

### Code Changes Not Applied?

Docker containers use cached images. Always rebuild:

```bash
docker compose build coach --no-cache
docker compose up -d --force-recreate
```
