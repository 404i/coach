# Quick Sync Reference

## Daily Workflow

### Standard Sync
```bash
./scripts/sync-manager.sh
```
**What it does:** Syncs latest 7 days from Garmin Connect, imports to coach, logs everything

### With MFA (if needed)
```bash
./scripts/sync-with-mfa.sh
```
**What it does:** Interactive sync with step-by-step MFA guidance

### Check Status
```bash
./scripts/sync-status.sh
```
**What it does:** Shows last sync time, success rate, data summary

### Setup Auto-Sync (Optional)
```bash
./scripts/setup-auto-sync.sh
```
**What it does:** Configure automated daily syncs via cron or launchd

## First Time Setup

1. **Save credentials** (one-time):
   ```bash
   ./scripts/credential-manager.sh save
   ```

2. **Run sync**:
   ```bash
   ./scripts/sync-manager.sh
   ```

3. **Verify**:
   ```bash
   ./scripts/sync-status.sh
   ```

## Common Commands

| Command | Purpose |
|---------|---------|
| `./scripts/sync-manager.sh` | Run sync now (standard) |
| `./scripts/sync-with-mfa.sh` | Sync with MFA support |
| `./scripts/sync-status.sh` | Check sync status |
| `./scripts/credential-manager.sh save` | Save credentials |
| `./scripts/credential-manager.sh test` | Test credentials |
| `./scripts/setup-auto-sync.sh` | Setup automation |

## Options

### Import More Days
```bash
SYNC_DAYS=14 ./scripts/sync-manager.sh
```

### Use Different Profile
```bash
PROFILE_ID=my-athlete ./scripts/sync-manager.sh
```

### View Logs
```bash
tail -f data/logs/sync-*.log
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Another sync running" | `rm data/.sync.lock` (if no sync actually running) |
| "Credentials not found" | `./scripts/credential-manager.sh save` |
| MFA required | Use `./scripts/sync-with-mfa.sh` |
| Data not in Claude | Wait 10s or restart Claude Desktop |
| Sync failed | Check logs: `tail -50 data/logs/sync-*.log` |

## Key Features

✅ **Automatic retry** - 3 attempts with exponential backoff  
✅ **Complete logging** - Every sync logged to `data/logs/`  
✅ **Status tracking** - Success/failure rates, timestamps  
✅ **Lock files** - Prevents concurrent syncs  
✅ **MFA detection** - Prompts for code when needed  
✅ **Verification** - Confirms data imported successfully  
✅ **No restart needed** - Claude picks up new data automatically

## Files

- **Logs:** `data/logs/sync-TIMESTAMP.log`
- **Status:** `data/.sync-status.json`
- **Credentials:** `~/.garmin-coach-credentials.enc`
- **Data:** `data/coach_mcp_store.json`

## More Info

See [SYNC_PROCESS.md](SYNC_PROCESS.md) for comprehensive documentation.
