# Coach MCP Server

This server exposes the training engine as MCP tools over stdio.

## Run locally

```bash
node mcp/server.js
```

Use LM Studio-backed responses:

```bash
LM_STUDIO_MODEL=qwen2.5-7b-instruct \
LM_STUDIO_BASE_URL=http://127.0.0.1:1234/v1 \
node mcp/server.js
```

Optional store path override:

```bash
COACH_MCP_STORE=/absolute/path/coach_store.json node mcp/server.js
```

By default data is stored in `data/coach_mcp_store.json`.
If `LM_STUDIO_MODEL` is not set, responses fall back to deterministic rule-based templates.

## Tools

- `save_profile`
- `get_profile`
- `start_get_to_know_session`
- `save_get_to_know_answers`
- `save_planned_activities`
- `list_planned_activities`
- `ingest_daily_metrics`
- `import_garmindb_metrics`
- `garmin_login_sync`
- `sync_garmin_and_recommend`
- `recommend_today`
- `list_training_gaps`
- `chat_followup`
- `get_weather_forecast`
- `weekly_suggestions`
- `agent_chat`

## Agent workflow

Recommended sequence:
1. `save_profile` with at least `profile_id` (other fields optional)
2. `start_get_to_know_session` to fetch prioritized intake questions
3. `save_get_to_know_answers` iteratively until intake is mostly complete
4. Daily one-shot option: `sync_garmin_and_recommend` (sync latest Garmin, import, recommend)
5. Manual modular option: `import_garmindb_metrics` (or `ingest_daily_metrics`) + `recommend_today`
6. `save_planned_activities` for races/events/key sessions
7. `weekly_suggestions` for 7-day weather-aware planning
8. `agent_chat` for ongoing coaching conversation and adaptive follow-up intake

If profile location includes `latitude` and `longitude`, weather-aware adjustments are applied automatically.
If LM Studio is unavailable, `agent_chat` falls back to deterministic responses.

One-shot daily flow example:
- Call `sync_garmin_and_recommend` with:
  - `profile_id`
  - `run_sync: true`
  - optional login fields:
    - `garmin_user`
    - `garmin_password` or `garmin_password_file`
    - `garmin_mfa_code`
    - `sync_mode: "latest"` (default) or `"all"`
  - `latest_days: 7` (or `from_date` / `to_date`)
- Output includes sync status, import summary, and the final recommendation payload.

Login/sync only example:
- Use `garmin_login_sync` when you only want to authenticate + download/import/analyze GarminDB without recommendation generation.

Get-to-know flow example:
- `start_get_to_know_session` returns `intake_completion` and `next_questions`.
- Provide answers using `save_get_to_know_answers` with an `answers` object (supports goals, motivations, constraints, sports, access, injuries/conditions, location, and extended `intake.*` fields).
- `agent_chat` also receives onboarding context and will ask focused follow-up questions when intake completion is low.

## Demo script

```bash
python3 mcp/demo_client.py
```

This does:
1. MCP initialize
2. save profile
3. ingest one day of metrics
4. generate recommendation
5. ask follow-up question

## Claude Desktop setup (local stdio MCP)

1. Open Claude Desktop config file:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\\Claude\\claude_desktop_config.json`
2. Merge in `mcp/claude_desktop_config.example.json` from this repo.
3. Restart Claude Desktop.

Example config entry:

```json
{
  "mcpServers": {
    "coach": {
      "command": "node",
      "args": ["/Users/tsochkata/git/coach/mcp/server.js"],
      "env": {
        "COACH_MCP_STORE": "/Users/tsochkata/git/coach/data/coach_mcp_store.json",
        "LM_STUDIO_BASE_URL": "http://127.0.0.1:1234/v1",
        "LM_STUDIO_MODEL": "qwen2.5-7b-instruct"
      }
    }
  }
}
```

## Claude Code setup

Quick add with helper script:

```bash
./mcp/register_claude_code.sh coach local
```

Or direct command:

```bash
claude mcp add --transport stdio --scope local coach -- \
  env COACH_MCP_STORE=/Users/tsochkata/git/coach/data/coach_mcp_store.json \
  env LM_STUDIO_BASE_URL=http://127.0.0.1:1234/v1 \
  env LM_STUDIO_MODEL=qwen2.5-7b-instruct \
  node /Users/tsochkata/git/coach/mcp/server.js
```

Verify:

```bash
claude mcp list
```

## LM Studio setup (stdio MCP)

In LM Studio MCP config (`mcp.json`), add:

```json
{
  "mcpServers": {
    "coach": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/coach/mcp/server.js"],
      "env": {
        "LM_STUDIO_BASE_URL": "http://127.0.0.1:1234/v1",
        "LM_STUDIO_MODEL": "qwen2.5-7b-instruct"
      }
    }
  }
}
```

## OpenCode setup (stdio MCP)

In OpenCode config, add a local MCP entry:

```json
{
  "mcp": {
    "coach": {
      "type": "local",
      "enabled": true,
      "command": ["node", "/ABSOLUTE/PATH/TO/coach/mcp/server.js"],
      "env": {
        "LM_STUDIO_BASE_URL": "http://127.0.0.1:1234/v1",
        "LM_STUDIO_MODEL": "qwen2.5-7b-instruct"
      }
    }
  }
}
```

If your OpenCode version has a slightly different config shape, keep the same command and adapt only the surrounding keys.
