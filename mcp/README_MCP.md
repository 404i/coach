# Garmin AI Coach MCP Server

Chat with your AI training coach through Claude Desktop! This MCP server gives Claude access to your training data, workout plans, Garmin metrics, and **remembers your conversations**.

## Features

- 🏃 **Get Today's Workout** - 4 personalized options (A/B/C/D plans)
- 📅 **Weekly Training Plan** - Full 7-day periodized schedule
- 📊 **Training Metrics** - HRV, resting HR, sleep, activity data
- 👤 **Athlete Profile** - Goals, sports, baselines, injuries, preferences
- 🔄 **Garmin Sync** - Trigger data import from Garmin Connect
- 💬 **Natural Coaching** - Ask questions, get advice, discuss training
- 🧠 **Persistent Memory** - Remembers equipment, preferences, conversations, and coaching notes (NEW!)

## Installation

1. **Install dependencies:**
   ```bash
   cd /Users/tsochkata/git/coach/mcp
   npm install
   ```

2. **Make executable:**
   ```bash
   chmod +x coach-mcp-server.js
   ```

3. **Start your backend API** (must be running):
   ```bash
   cd /Users/tsochkata/git/coach/backend
   node src/server.js
   ```

## Configure Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "garmin-ai-coach": {
      "command": "node",
      "args": [
        "/Users/tsochkata/git/coach/mcp/coach-mcp-server.js"
      ],
      "env": {
        "COACH_API_URL": "http://localhost:8080"
      }
    }
  }
}
```

**Restart Claude Desktop** after adding the config.

## Usage Examples

### Get Your Profile
```
Show me my athlete profile
```

### Today's Workout
```
What workouts do you recommend for today?
```

### Weekly Plan
```
Can you show me my training plan for this week starting 2026-02-17?
```

### Check Recovery Status
```
How has my HRV been trending over the last 7 days?
```

### Sync Garmin Data
```
Sync my Garmin data for the last 3 days
```

### Coaching Conversation
```
I'm feeling really tired today but have a long ride scheduled. 
Should I adjust my workout?
```

```
What's the best way to improve my cycling FTP?
```

```
I have a century ride in 8 weeks. How should I structure my training?
```

### Memory & Personalization (NEW!)

The coach **remembers** your conversations! Just naturally mention things:

```
I have a Garmin Forerunner 945 and prefer morning workouts
```

```
I bought new Hoka Clifton 9 shoes last week
```

```
I notice my left knee hurts after back-to-back hard days
```

```
I'm training for a marathon in June - that's my main goal this year
```

The coach will automatically remember:
- ✓ Equipment you mention
- ✓ Preferences (workout times, training style)
- ✓ Conversations and topics discussed
- ✓ Important notes and restrictions

**View Your Memories:**
```
What do you remember about my training preferences?
```

Memories persist across conversations, so the coach gets smarter over time!

## Available Tools

**Session Management:**
1. **set_current_athlete** - Set your email once per session (no need to repeat)

**Training & Data:**
2. **get_athlete_profile** - Full profile with goals, sports, baselines, injuries
3. **get_today_workout** - 4 workout options for today
4. **get_weekly_plan** - 7-day training schedule
5. **get_training_metrics** - Garmin data (HRV, HR, sleep, steps)
6. **sync_garmin_data** - Import latest Garmin Connect data

**Coaching & Conversation:**
7. **chat_with_coach** - Natural coaching conversation

**Memory & Personalization (NEW!):**
8. **add_equipment** - Record equipment mentioned (auto-called by Claude)
9. **update_preferences** - Store preferences learned (auto-called by Claude)
10. **add_conversation_note** - Log conversation topics (auto-called by Claude)
11. **add_important_note** - Remember key coaching notes (auto-called by Claude)

**Memory Resources:**
- Claude can read your memory files directly through MCP Resources
- Format: `memory://{email}` - JSON with equipment, preferences, conversation history, important notes

## Requirements

- Node.js 18+
- Backend API running on `localhost:8080`
- Valid athlete profile in database
- Claude Desktop (for MCP usage)

## Troubleshooting

### Tools not showing in Claude
- Restart Claude Desktop after config changes
- Check config file path: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Verify backend is running: `curl http://localhost:8080/health`

### API connection errors
- Ensure backend server is running
- Check `COACH_API_URL` environment variable
- Verify profile exists: `curl http://localhost:8080/api/profile?email=your@email.com`

### MCP server crashes
- Check backend logs for API errors
- Verify MCP SDK version: `npm list @modelcontextprotocol/sdk`
- Run directly to see errors: `node coach-mcp-server.js`

## Development

Test the MCP server directly:
```bash
node coach-mcp-server.js
```

The server communicates over stdio, so you'll need an MCP client (like Claude Desktop) to interact with it.

## Architecture

```
Claude Desktop
    ↓ (MCP Protocol)
coach-mcp-server.js
    ↓ (REST API)
Backend API (localhost:8080)
    ↓
- SQLite Database
- LM Studio / Ollama (LLM)
- Garmin Sync Scripts
```

## Memory System

**Memory files stored at:** `/Users/tsochkata/git/coach/mcp/memories/{email}.json`

**Memory structure:**
```json
{
  "email": "your@email.com",
  "created_at": "2026-02-18T10:00:00Z",
  "updated_at": "2026-02-18T14:30:00Z",
  "equipment": [
    "Garmin Forerunner 945",
    "road bike",
    "Hoka Clifton 9"
  ],
  "preferences": {
    "workout_time": "morning",
    "training_style": "prefers structured intervals",
    "motivation": "preparing for marathon in June"
  },
  "conversation_history": [
    {
      "timestamp": "2026-02-15T09:00:00Z",
      "topic": "tapering strategy",
      "summary": "discussed 2-week taper before race"
    }
  ],
  "important_notes": [
    "Avoid back-to-back hard days",
    "Left knee sensitive to impact"
  ],
  "training_philosophy": [],
  "goals_discussed": [],
  "injuries_history": []
}
```

**How it works:**
1. Set your email once with `set_current_athlete`
2. Chat naturally - Claude automatically records important details
3. Memories persist across conversations
4. Coach gets smarter and more personalized over time
5. You can ask "What do you remember about me?" anytime

## Next Steps

Once configured, you can:
- Ask Claude to analyze your training trends
- Request workout modifications based on how you feel
- Get advice on race preparation
- Discuss nutrition and recovery strategies
- Review progress toward your goals

Claude will automatically use the MCP tools to access your real training data and provide personalized coaching!
