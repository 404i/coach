# Sync Process Documentation

Complete guide to the Garmin AI Coach sync system.

## Overview

The sync process imports data from Garmin Connect → GarminDB → Coach Store, making it available to Claude Desktop via MCP.

```
Garmin Connect → GarminDB (SQLite) → coach_mcp_store.json → Claude Desktop (MCP)
```

## Quick Start

### First Time Setup

1. **Save credentials** (encrypted, one-time):
   ```bash
   ./scripts/credential-manager.sh save
   ```

2. **Run initial sync**:
   ```bash
   ./scripts/sync-manager.sh
   ```

3. **Check status**:
   ```bash
   ./scripts/sync-status.sh
   ```

### Daily Use

**Manual sync** (recommended while testing):
```bash
./scripts/sync-manager.sh
```

**With MFA** (if Garmin sends email code):
```bash
./scripts/sync-with-mfa.sh
```

**Check what synced**:
```bash
./scripts/sync-status.sh
```

## Sync Scripts

### 1. sync-manager.sh (Main Sync Process)

**Features:**
- ✅ Automatic retry with exponential backoff (3 attempts by default)
- ✅ Comprehensive logging to `data/logs/sync-TIMESTAMP.log`
- ✅ Pre-flight checks (credentials, scripts, Python)
- ✅ Lock file prevents concurrent syncs
- ✅ Post-sync verification (confirms data imported)
- ✅ Status tracking (success/failure rates)
- ✅ MFA detection and handling

**Usage:**
```bash
# Standard sync (last 7 days)
./scripts/sync-manager.sh

# Custom days
SYNC_DAYS=14 ./scripts/sync-manager.sh

# Suppress output (for cron)
AUTO_MODE=true ./scripts/sync-manager.sh
```

**Environment Variables:**
- `SYNC_MAX_RETRIES` - Max retry attempts (default: 3)
- `SYNC_DAYS` - Days to import (default: 7)
- `PROFILE_ID` - Athlete profile (default: test-athlete-1)
- `AUTO_MODE` - Suppress prompts for automation (default: false)

**Exit Codes:**
- `0` - Success
- `1` - Failed (check logs)

### 2. sync-status.sh (Status & History)

View sync status, history, and data store information.

**Usage:**
```bash
./scripts/sync-status.sh
```

**Shows:**
- ✅ Last sync status and timestamp
- ✅ Success/failure statistics
- ✅ Data store summary (entry counts, latest dates)
- ✅ Recent log files
- ✅ Available commands

### 3. sync-with-mfa.sh (Interactive MFA)

Sync with step-by-step MFA guidance. Use when Garmin requires email verification.

**Usage:**
```bash
./scripts/sync-with-mfa.sh
```

**Process:**
1. Loads encrypted credentials
2. Warns about MFA email
3. Runs sync (prompts for code if needed)
4. Imports data
5. Reports success

### 4. setup-auto-sync.sh (Automated Daily Sync)

Configure automated daily syncs.

**Usage:**
```bash
./scripts/setup-auto-sync.sh
```

**Options:**
1. **cron** - Traditional Unix scheduling
2. **launchd** - macOS LaunchAgent (recommended for macOS)
3. **manual** - Show instructions only

**Note:** MFA may prevent fully automated syncs. Test first!

### 5. credential-manager.sh (Credential Storage)

Manage encrypted Garmin credentials.

**Commands:**
```bash
# Save credentials (first time)
./scripts/credential-manager.sh save

# Load credentials (used by sync scripts)
eval "$(./scripts/credential-manager.sh load)"

# Show credentials (masked)
./scripts/credential-manager.sh show

# Test credentials
./scripts/credential-manager.sh test

# Update credentials
./scripts/credential-manager.sh update

# Delete credentials
./scripts/credential-manager.sh delete
```

## Sync Process Flow

### Phase 1: Pre-Flight Checks
```
1. Check for lock file (prevent concurrent syncs)
2. Verify prerequisites (scripts, Python, jq)
3. Load encrypted credentials
4. Export environment variables
```

### Phase 2: Sync GarminDB
```
1. Run garmindb_sync_latest.sh
2. Downloads latest data from Garmin Connect
3. Updates SQLite databases in data/garmin/HealthData/DBs/
4. Detects MFA requirement
5. Prompts for code if needed
6. Retries on failure (exponential backoff)
```

### Phase 3: Import to Coach
```
1. Run import_garmindb_to_coach.py
2. Reads GarminDB SQLite (activities, monitoring, sleep)
3. Transforms to coach schema
4. Updates data/coach_mcp_store.json
5. Reports activities imported
```

### Phase 4: Verification
```
1. Check coach_mcp_store.json exists
2. Verify today's date present
3. Find latest activity date
4. Log summary statistics
```

### Phase 5: Status Update
```
1. Update .sync-status.json with:
   - Last sync timestamp
   - Success/failure status
   - Duration
   - Cumulative statistics
2. Release lock file
3. Print summary
```

## File Structure

```
data/
├── coach_mcp_store.json        # Main data store (read by MCP)
├── logs/                        # Sync logs
│   ├── sync-YYYYMMDD-HHMMSS.log
│   └── auto-sync.log           # Cron job logs
├── .sync-status.json           # Last sync status & stats
├── .sync.lock                  # Prevents concurrent syncs
└── .auto-sync-cron.sh          # Generated cron script

~/.garmin-coach-credentials.enc  # Encrypted credentials (600)
```

## Logging

All sync operations are logged to `data/logs/sync-TIMESTAMP.log`.

**Log Format:**
```
[YYYY-MM-DD HH:MM:SS] [LEVEL] message
```

**Levels:**
- `INFO` - Normal operation
- `WARN` - Non-fatal issues
- `ERROR` - Failures
- `SUCCESS` - Milestones

**View Latest Log:**
```bash
tail -f data/logs/sync-$(ls -t data/logs/sync-*.log | head -1)
```

**Or from status:**
```bash
./scripts/sync-status.sh  # Shows log path
```

## Status Tracking

Sync statistics are stored in `data/.sync-status.json`:

```json
{
  "last_sync": {
    "timestamp": "2026-02-19T14:30:00Z",
    "status": "success",
    "log_file": "data/logs/sync-20260219-143000.log",
    "duration_seconds": 45
  },
  "total_syncs": 10,
  "success_count": 9,
  "failed_count": 1,
  "success_rate": 90.00
}
```

## Troubleshooting

### Issue: "Another sync is already running"

**Cause:** Lock file exists from previous sync

**Solution:**
```bash
# Check if process actually running
ps aux | grep sync-manager

# If not running, remove stale lock
rm data/.sync.lock
```

### Issue: "MFA required but running in auto mode"

**Cause:** Garmin requires MFA, but sync is automated (no user to enter code)

**Solution:**
- Use `./scripts/sync-with-mfa.sh` for manual sync with MFA
- Authenticate in browser to reduce MFA frequency
- Consider disabling auto-sync if MFA required often

### Issue: "Credentials not found"

**Cause:** Encrypted credential file doesn't exist

**Solution:**
```bash
./scripts/credential-manager.sh save
```

### Issue: "GarminDB sync failed"

**Causes:**
- Network connectivity
- Garmin Connect API issues
- Invalid credentials
- MFA required

**Solution:**
1. Check network: `curl https://connect.garmin.com`
2. Verify credentials: `./scripts/credential-manager.sh test`
3. Check logs: `tail -f data/logs/sync-*.log`
4. Try with MFA: `./scripts/sync-with-mfa.sh`

### Issue: "Import failed"

**Causes:**
- GarminDB databases corrupted
- Python environment issues
- Invalid profile ID

**Solution:**
1. Check Python: `python3 --version`
2. Verify GarminDB: `ls data/garmin/HealthData/DBs/*.db`
3. Check profile: `echo $PROFILE_ID`
4. Review import logs in sync log file

### Issue: "Data not showing in Claude"

**Cause:** Claude Desktop MCP cache not refreshed

**Solution:**
1. Verify data imported: `./scripts/sync-status.sh`
2. Check store: `jq '.daily["test-athlete-1"][-1]' data/coach_mcp_store.json`
3. Wait 10 seconds (MCP reads fresh)
4. If still not showing, restart Claude Desktop

### Issue: Sync seems slow

**Causes:**
- Large date range
- Many activities
- Network speed
- Garmin API rate limiting

**Solution:**
- Reduce days: `SYNC_DAYS=3 ./scripts/sync-manager.sh`
- Be patient with first sync (imports historical data)
- Subsequent syncs are faster (incremental)

## Best Practices

### 1. Start with Manual Syncs

Test the sync process manually before automating:
```bash
./scripts/sync-manager.sh
./scripts/sync-status.sh
```

### 2. Check Logs After Failed Syncs

Logs contain detailed error information:
```bash
tail -50 data/logs/sync-*.log | grep ERROR
```

### 3. Monitor Success Rate

Keep an eye on sync reliability:
```bash
./scripts/sync-status.sh  # Shows success rate
```

### 4. Handle MFA Properly

If Garmin requires MFA:
- Use `sync-with-mfa.sh` instead of `sync-manager.sh`
- Don't automate if MFA required frequently
- Consider longer session durations

### 5. Sync After Activities

Run sync shortly after completing activities:
```bash
# After morning workout
./scripts/sync-manager.sh

# Check it appeared
./scripts/sync-status.sh
```

### 6. Regular Credential Testing

Verify credentials periodically:
```bash
./scripts/credential-manager.sh test
```

## Automated Sync Considerations

### Pros
- ✅ Always up-to-date data
- ✅ No manual intervention
- ✅ Consistent schedule

### Cons
- ⚠️ May fail if MFA required
- ⚠️ Network issues can accumulate failures
- ⚠️ Harder to debug without manual observation

### Recommendations

1. **Test extensively** - Run manual syncs for a week
2. **Check MFA frequency** - Note how often Garmin requires MFA
3. **Monitor logs** - Set up log rotation
4. **Have fallback** - Keep manual sync option available

## Integration with Claude Desktop

### Data Flow

1. **Sync runs** → Updates `coach_mcp_store.json`
2. **MCP server** → Reads file on each tool call (no caching)
3. **Claude** → Accesses data via MCP tools

### No Restart Required

The MCP server (`mcp/server.js`) loads data fresh from disk on every tool invocation, so **Claude Desktop does not need to be restarted** after syncs.

**Exception:** If Claude shows stale data, wait 10-15 seconds or restart as a last resort.

### Testing Data Availability

```bash
# 1. Run sync
./scripts/sync-manager.sh

# 2. Verify in store
jq '.daily["test-athlete-1"][-1] | {date, activities: .activities | map(.sport)}' \
  data/coach_mcp_store.json

# 3. Ask Claude
# "What activities did I do today?"
```

## Security Notes

### Encrypted Credentials
- Stored in `~/.garmin-coach-credentials.enc`
- AES-256-CBC encryption
- PBKDF2 with 100,000 iterations
- Master password never stored
- File permissions: 600 (user read/write only)

### Log Security
- Logs may contain email addresses
- Do NOT commit logs to git (gitignored)
- Rotate/delete old logs periodically

### Status Files
- `.sync-status.json` - No sensitive data
- `.sync.lock` - Only contains PID
- Both safe to commit (but gitignored for cleanliness)

## Advanced Usage

### Custom Profile ID

```bash
PROFILE_ID=my-athlete ./scripts/sync-manager.sh
```

### Import More Days

```bash
SYNC_DAYS=30 ./scripts/sync-manager.sh
```

### Maximum Retries

```bash
SYNC_MAX_RETRIES=5 ./scripts/sync-manager.sh
```

### Quiet Mode (for Cron)

```bash
AUTO_MODE=true ./scripts/sync-manager.sh
```

### Check Specific Date

```bash
jq '.daily["test-athlete-1"][] | select(.date == "2026-02-19")' \
  data/coach_mcp_store.json
```

### Count Activities

```bash
jq '.daily["test-athlete-1"] | map(.activities | length) | add' \
  data/coach_mcp_store.json
```

## Migration from Old Scripts

If you were using `quick-sync.sh` before:

**Old command:**
```bash
./scripts/quick-sync.sh
```

**New command:**
```bash
./scripts/sync-manager.sh
```

**Changes:**
- ✅ Better error handling and retries
- ✅ Comprehensive logging
- ✅ Status tracking
- ✅ Lock file prevents conflicts
- ✅ Post-sync verification
- ✅ More informative output

**quick-sync.sh** still works but is superseded by the new sync system.

## Future Enhancements

Potential improvements (not yet implemented):

- 📱 Push notifications on sync completion
- 🔔 Alerts for sync failures
- 📊 Web dashboard for sync history
- 🤖 Intelligent MFA handling
- ☁️ Cloud backup of data store
- 📈 Performance metrics and trends

## Summary

The sync process is designed to be:
- **Reliable** - Retry logic, error handling
- **Observable** - Comprehensive logging, status tracking
- **Secure** - Encrypted credentials, no plain text passwords
- **Flexible** - Manual or automated, configurable parameters
- **Integrated** - Works seamlessly with Claude Desktop MCP

Start with manual syncs to understand the process, then optionally automate as needed.
