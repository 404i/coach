# MCP Memory & Coach System

## Overview

The Garmin AI Coach MCP server now includes a comprehensive memory system and coaching philosophy that persists athlete information across conversations.

## Coach System Prompt

**Location:** `mcp/coach-system-prompt.md`

This file contains the complete coaching philosophy, principles, and instructions for the AI coach. It defines:

- **Coach Identity**: 20+ years endurance coaching experience, evidence-based approach
- **Core Principles**: Data-driven but human-centered, progressive overload, individualization
- **Data Analysis Guidelines**: How to interpret HRV, RHR, Body Battery, sleep, training load
- **Missing Data Protocol**: CRITICAL rules to prevent hallucination - always state "NO DATA AVAILABLE"
- **Workout Types**: Easy/recovery, long runs, tempo, intervals, hill repeats, strength
- **Communication Style**: Encouraging, evidence-based, pragmatic, honest

### How It's Used

1. **As an MCP Resource**: Available at `prompt://coach-system-prompt`
2. **LLMs can read it**: Claude/other LLMs can access via Resources API
3. **Referenced in tools**: All coaching tools reference these principles

### Updating the Prompt

Simply edit `mcp/coach-system-prompt.md` and restart the MCP server. Changes take effect immediately.

## Athlete Memory System

### Memory Structure

Each athlete has a JSON memory file at `mcp/memories/{email}.json` containing:

```json
{
  "email": "athlete@example.com",
  "name": "John Smith",
  "created_at": "2026-02-18T10:00:00Z",
  "updated_at": "2026-02-18T10:00:00Z",
  
  // From Onboarding
  "favorite_sports": ["run", "bike"],
  "goals": ["Qualify for Boston Marathon", "Sub-3 hour marathon"],
  "motivations": ["Health", "Competition"],
  "constraints": ["Limited to morning workouts", "Work travel 2 weeks/month"],
  "location": {
    "label": "Boston, MA",
    "latitude": 42.3601,
    "longitude": -71.0589,
    "timezone": "America/New_York"
  },
  
  // Training Access
  "equipment": ["Garmin Forerunner 955", "Road bike", "Treadmill"],
  "facilities": ["Gym", "Track"],
  "days_per_week": 5,
  "minutes_per_session": 60,
  
  // Health
  "injuries_conditions": [
    {
      "name": "IT band syndrome",
      "status": "resolved",
      "severity_0_10": 3,
      "contraindications": ["steep downhills"]
    }
  ],
  "injuries_history": [
    {
      "timestamp": "2026-01-15T00:00:00Z",
      "injury": "IT band syndrome",
      "status": "resolved",
      "severity": 3
    }
  ],
  
  // Physiological Data
  "baselines": {
    "resting_hr_bpm_14d": 52,
    "hrv_ms_7d": 45,
    "lthr_bpm": 165,
    "max_hr_bpm": 185,
    "ftp_watts": null
  },
  
  // Preferences
  "preferences": {
    "max_hard_days_per_week": 2,
    "preferred_training_time": "morning",
    "likes_variety": true
  },
  
  // Conversation Tracking
  "conversation_history": [
    {
      "timestamp": "2026-02-18T10:30:00Z",
      "topic": "Marathon taper strategy",
      "summary": "Discussed reducing volume 3 weeks out, maintaining intensity"
    }
  ],
  "important_notes": [
    "Prefers interval workouts on track",
    "Dislikes swimming in cold water"
  ],
  "goals_discussed": [
    {
      "timestamp": "2026-02-18T10:00:00Z",
      "goal": "Qualify for Boston Marathon"
    }
  ],
  
  // Metadata
  "profile_id": "athlete_example",
  "profile_created_at": "2026-02-01T00:00:00Z",
  "last_synced_from_db": "2026-02-18T10:00:00Z"
}
```

### How Memory is Initialized

1. **First MCP Tool Call**: When an athlete first uses any MCP tool (e.g., `chat_with_coach`, `get_training_metrics`)
2. **Automatic Profile Sync**: The MCP fetches their complete profile from `/api/profile?email=...`
3. **Memory Creation**: All onboarding data is automatically stored in `mcp/memories/{email}.json`
4. **Includes**:
   - Name, email, location
   - Favorite sports
   - Goals, motivations, constraints
   - Equipment, facilities, availability
   - Injuries and contraindications
   - Baselines (HRV, RHR, LTHR, Max HR, FTP)
   - Preferences (training time, variety, hard days/week)

### MCP Tools for Memory Management

#### 1. `set_current_athlete`
Sets the active athlete for the session. Call this first.

```
set_current_athlete(email="athlete@example.com")
```

#### 2. `chat_with_coach`
Natural conversation with the coach. Automatically loads profile + memory.

```
chat_with_coach(message="How should I adjust training if my HRV is low?")
```

#### 3. `add_equipment`
Record new gear mentioned by athlete.

```
add_equipment(equipment="Hoka Clifton 9")
```

#### 4. `update_preferences`
Update training preferences.

```
update_preferences(preference_key="preferred_training_time", preference_value="evening")
```

#### 5. `add_conversation_note`
Log important discussion topics.

```
add_conversation_note(
  topic="Nutrition strategy", 
  summary="Discussed pre-race fueling, 30g carbs/hour during race"
)
```

#### 6. `add_important_note`
Record critical information.

```
add_important_note(note="Allergic to ibuprofen - use Tylenol for inflammation")
```

#### 7. `refresh_athlete_memory` ⭐ NEW
Re-sync memory from database profile (if profile was updated).

```
refresh_athlete_memory()
```

### MCP Resources

#### 1. `prompt://coach-system-prompt`
Complete coaching philosophy and instructions.

```
Read resource: prompt://coach-system-prompt
```

#### 2. `memory://{email}`
Athlete's complete profile and memory.

```
Read resource: memory://athlete_example_com
```

## Preventing Hallucination

### The Problem
LLMs will invent plausible-sounding data when given incomplete information. Example:
- **Database**: `{"sleep_hours": null, "hrv": 42}`
- **Claude sees**: Partial data
- **Claude says**: "Your sleep was excellent at 8h 14m with a score of 85" ← **HALLUCINATION**

### The Solution

1. **System Prompt** explicitly instructs: "NEVER invent data. State 'NO DATA AVAILABLE'"
2. **Tool Responses** prepend warnings when nulls detected:
   ```
   ⚠️ WARNING: The following metrics are NOT AVAILABLE and show null values:
   sleep_hours, sleep_score

   **DO NOT invent or estimate these values.**
   ```
3. **Tool Descriptions** include: "NEVER invent or hallucinate data"
4. **Example Good Response**:
   > "I don't have sleep data for last night. How did you sleep? Based on your HRV of 42..."

## Usage Example

### Claude Desktop Conversation

```
User: "How am I doing today?"

Claude (behind the scenes):
1. Calls: set_current_athlete(email="user@example.com")
2. Calls: get_training_metrics(days=7)
3. Reads: memory://user_example_com
4. Reads: prompt://coach-system-prompt

Claude (to user):
"Looking at your metrics:
- HRV: 42 (slightly below your baseline of 45)
- RHR: 54 (normal for you)
- Body Battery: 50 (moderate energy)
- Sleep: NO DATA AVAILABLE from Garmin - how did you sleep last night?

Given your goal to qualify for Boston Marathon (from your profile), and your preference 
for morning workouts, I recommend an easy 40-minute recovery run today. You mentioned 
you have a history of IT band issues, so let's avoid steep downhills."
```

## Onboarding Flow Integration

### Frontend → Backend → MCP

1. **User completes onboarding** (5 steps in React UI)
2. **Frontend calls** `POST /api/profile` with all data
3. **Backend saves** profile to `athlete_profiles` table
4. **First MCP interaction** triggers memory initialization
5. **MCP reads** `/api/profile?email=...` and creates memory file
6. **Future conversations** use cached memory + periodic refreshes

### What Gets Stored

From the onboarding form:
- ✅ Step 1: Name, email, location
- ✅ Step 2: Favorite sports, goals
- ✅ Step 3: Equipment, facilities, availability, constraints
- ✅ Step 4: Baselines (HR, HRV), injuries, preferences
- ✅ Step 5: Garmin credentials (stored separately, not in memory)

## Testing

### Test Memory Initialization
```bash
# 1. Complete onboarding in UI
# 2. In Claude Desktop (with MCP configured):

User: "What do you know about me?"

# Claude should respond with your complete profile from onboarding
```

### Test Hallucination Prevention
```bash
# 1. Ensure sleep data is missing (no recent Garmin sync)
# 2. Ask Claude: "How was my sleep last night?"
# Expected: "NO DATA AVAILABLE for sleep_hours" (not invented data)
```

### Test Memory Tools
```bash
# In Claude Desktop:
User: "I just got new Hoka Clifton 9 shoes"
# Claude calls: add_equipment(equipment="Hoka Clifton 9")

User: "I prefer evening workouts now"
# Claude calls: update_preferences(preference_key="preferred_training_time", value="evening")
```

## Configuration

### Claude Desktop Config
`~/.config/Claude/claude_desktop_config.json` (Linux/Mac) or  
`%APPDATA%\Claude\claude_desktop_config.json` (Windows)

```json
{
  "mcpServers": {
    "garmin-coach": {
      "command": "node",
      "args": ["/path/to/coach/mcp/coach-mcp-server.js"],
      "env": {
        "COACH_API_URL": "http://localhost:8080"
      }
    }
  }
}
```

### Environment Variables
- `COACH_API_URL`: Backend API endpoint (default: `http://localhost:8080`)

## Troubleshooting

### Memory Not Initializing
1. Check backend is running: `curl http://localhost:8080/api/profile?email=your@email.com`
2. Check MCP server logs (stdout/stderr in Claude Desktop)
3. Manually create memory: Use `refresh_athlete_memory` tool

### Hallucination Still Occurring
1. Verify system prompt is loading: Check MCP resources list
2. Check tool responses include "⚠️ WARNING" when data is null
3. Update Claude Desktop to latest version (may have better prompt adherence)

### Profile Updates Not Reflecting
1. Use `refresh_athlete_memory` tool to re-sync from database
2. Or delete `mcp/memories/{email}.json` and let it re-initialize

## Development

### Adding New Memory Fields
1. Edit `initializeMemoryFromProfile()` in `mcp/coach-mcp-server.js`
2. Add field extraction from profile API response
3. Update memory structure documentation

### Updating Coach Prompt
1. Edit `mcp/coach-system-prompt.md`
2. Restart MCP server (restart Claude Desktop)
3. Changes take effect immediately

## Security Notes

- Memory files contain sensitive athlete data (health, injuries, goals)
- Store in `mcp/memories/` (gitignored by default)
- Do NOT commit memory files to version control
- Consider encrypting memory files in production

## Next Steps

1. ✅ System prompt defined
2. ✅ Memory auto-initialization from profiles
3. ✅ Hallucination prevention mechanisms
4. ✅ Memory management tools
5. 🔄 Test with real athletes
6. 🔄 Add memory backup/restore
7. 🔄 Implement memory expiration (old data cleanup)
8. 🔄 Add privacy controls (user-initiated memory wipe)
