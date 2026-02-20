# Quick Start: Coach System Prompt & Memory

## What Changed?

### 1. **Coach System Prompt** (`mcp/coach-system-prompt.md`)
A comprehensive 450-line coaching manual that defines:
- Who the coach is (20+ years experience, evidence-based approach)
- How to analyze training data (HRV, RHR, Body Battery, sleep)
- CRITICAL: Rules to prevent hallucination ("NEVER invent data")
- Workout types and weekly structure templates
- Communication style and tone

**How LLMs use it:**
- Available as MCP resource: `prompt://coach-system-prompt`
- Claude can read it and follow its principles
- All coaching tools reference these guidelines

### 2. **Athlete Memory System**
Each athlete gets a persistent memory file with ALL their onboarding data:

**Automatically includes:**
- ✅ Name, email, location
- ✅ Favorite sports
- ✅ Goals, motivations, constraints  
- ✅ Equipment, facilities
- ✅ Days per week, minutes per session
- ✅ Injuries and contraindications
- ✅ Baselines (HRV, RHR, LTHR, Max HR, FTP)
- ✅ Preferences (training time, variety, hard days)

**Plus conversation tracking:**
- Equipment mentioned during chats
- Important coaching notes
- Discussion summaries
- Updated preferences

### 3. **Hallucination Prevention**
The system now explicitly warns LLMs when data is missing:

**Before:**
```json
{"sleep_hours": null}
```
→ Claude invents: "Sleep was 8h 14m with score 85" ❌

**After:**
```
⚠️ WARNING: NO DATA AVAILABLE for sleep_hours
DO NOT invent or estimate this value.
```
→ Claude says: "I don't have sleep data. How did you sleep?" ✅

## How to Test

### 1. Test Memory Initialization (Claude Desktop)

```
User: "What do you know about me?"

Expected: Claude lists your:
- Name
- Favorite sports (from onboarding Step 2)
- Goals (from onboarding Step 3)
- Equipment (from onboarding Step 3)
- Injuries (from onboarding Step 4)
- Preferences (from onboarding Step 4)
```

### 2. Test Hallucination Prevention

```
User: "How was my sleep last night?"

If no sleep data exists:
Expected: "NO DATA AVAILABLE for sleep_hours. How did you sleep?"
NOT: "Your sleep was excellent at 8h 14m" (hallucination)
```

### 3. Test Memory Updates

```
User: "I just bought new Hoka Clifton 9 shoes"
Expected: "✓ Equipment recorded: Hoka Clifton 9"

User: "I prefer evening workouts now"
Expected: "✓ Preference updated: preferred_training_time = evening"
```

## New MCP Tools

### `refresh_athlete_memory`
Re-sync memory from database profile (if you updated your profile).

**Usage:**
```
In Claude: "Can you refresh my profile from the database?"
→ Claude calls refresh_athlete_memory()
```

## Files Created/Modified

### New Files:
1. **`mcp/coach-system-prompt.md`** (450 lines)
   - Complete coaching philosophy
   - Data analysis guidelines
   - Missing data protocol
   - Workout templates

2. **`mcp/MEMORY_SYSTEM.md`** (370 lines)
   - Complete documentation
   - Memory structure explanation
   - Usage examples
   - Troubleshooting guide

### Modified Files:
1. **`mcp/coach-mcp-server.js`**
   - Added system prompt loading
   - Added `initializeMemoryFromProfile()` function
   - Added `refresh_athlete_memory` tool
   - Updated `chat_with_coach` to include memory
   - Enhanced `get_training_metrics` with missing data warnings
   - Added prompt as MCP resource

## What Happens Now?

### First Time an Athlete Uses MCP:
1. They complete onboarding (5 steps in React UI)
2. Profile saved to database: `/api/profile`
3. First MCP tool call (e.g., "How should I train today?")
4. MCP fetches profile from database
5. Creates memory file: `mcp/memories/{email}.json`
6. All future conversations use this memory

### During Conversations:
- Claude reads system prompt for coaching principles
- Claude reads athlete memory for personalization
- Claude references goals, injuries, preferences
- Claude warns about missing data (no hallucination)
- Claude updates memory as athlete mentions new info

## MCP Resources Available

1. **`prompt://coach-system-prompt`**  
   The coach's identity, principles, and guidelines

2. **`memory://{email}`**  
   Athlete's complete profile and conversation history

## Key Features

### ✅ Data Integrity
- Explicit warnings for missing metrics
- Never invents sleep/HRV/training data
- Asks athlete for subjective input when data gaps exist

### ✅ Personalization
- Remembers ALL onboarding answers
- Tracks equipment, injuries, goals
- Respects preferences (training time, hard days/week)
- Avoids contraindicated exercises (e.g., steep downhills if IT band issues)

### ✅ Coaching Quality
- Evidence-based recommendations
- Balances data (HRV, RHR) with subjective feel
- Progressive overload with recovery weeks
- Injury prevention first

## Restart Required

**To activate changes:**
1. Restart Claude Desktop app (Cmd+Q, reopen)
2. Backend must be running: `cd backend && npm start`
3. First MCP interaction will initialize athlete memory

## Verification Checklist

- [ ] `mcp/coach-system-prompt.md` exists (450 lines)
- [ ] `mcp/coach-mcp-server.js` updated (no syntax errors)
- [ ] Backend running on `http://localhost:8080`
- [ ] Claude Desktop config points to MCP server
- [ ] Restart Claude Desktop
- [ ] Test: "What do you know about me?" → Claude lists onboarding data
- [ ] Test: "How was my sleep?" → Claude says "NO DATA" (if no sync)

## Next Steps

1. **Test the system**: Complete onboarding, chat with Claude
2. **Verify memory**: Check `mcp/memories/{your_email}.json` was created
3. **Test hallucination fix**: Ask about metrics when Garmin data is stale
4. **Fix Garmin auth**: Re-authenticate to sync fresh data

## Questions?

See full documentation: `mcp/MEMORY_SYSTEM.md`
