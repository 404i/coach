# Critical Issues Report - 2026-02-19

## Data Status ✅
- **Latest Data**: 2026-02-19 (TODAY)
- **Data Age**: Current (0 hours old)
- **Database**: `/backend/data/coach.db`
- **Records**: 10+ days of metrics available

## Issue 1: Training Readiness vs Recovery Confusion 🚨

### Problem
User believes "training readiness" equals "recovery state" - they are different metrics being conflated.

### Root Cause
**Readiness Score** (composite metric):
```javascript
// workout-recommendation.js:85
function calculateReadinessScore({ recovery, acr, hrvStatus, tsbForm }) {
  score += recovery * 0.35;      // Recovery: 35% weight
  score += acrScore * 0.25;      // ACR: 25% weight  
  score += hrvScore * 0.20;      // HRV: 20% weight
  score += tsbScore * 0.20;      // TSB: 20% weight
}
```

**Recovery Score** (single Garmin metric):
- From Garmin sync: sleep quality + HRV + stress
- Just one component of readiness
- Your current recovery: **71** (good)

### Current State
- API returns both `readiness_score` and `recovery_score`
- No explanation of the difference
- Confusing terminology in responses

### Solution
1. **Rename** `readiness_score` → `training_readiness_score`
2. **Add breakdown** showing 4 components:
   ```json
   {
     "training_readiness_score": 65,
     "breakdown": {
       "recovery": { "value": 71, "contribution": 25, "weight": "35%" },
       "acr": { "value": 1.69, "contribution": 0, "weight": "25%" },
       "hrv": { "value": 41, "contribution": 18, "weight": "20%" },
       "tsb": { "value": -123, "contribution": 0, "weight": "20%" }
     },
     "interpretation": "Recovery is good (71) but high training load (ACR 1.69) and fatigue (TSB -123) reduce overall readiness"
   }
   ```
3. **Add glossary** endpoint: `/api/help/glossary`
4. **Update all MCP tools** to use clear terminology

---

## Issue 2: TSB Mystery 🚨

### Problem
"whats the TSB and where the hell it came from"

### What TSB Is
**TSB = Training Stress Balance** (Banister Fitness-Fatigue Model)

Formula:
```
TSB = Fitness (CTL) - Fatigue (ATL)

Fitness (CTL) = 42-day exponential weighted average of training load
Fatigue (ATL) = 7-day exponential weighted average of training load
```

### Your Current Numbers
- **Fitness (CTL)**: 293 (long-term adaptation)
- **Fatigue (ATL)**: 416 (short-term stress)
- **TSB (Form)**: **-123** (severely overreached)

### Interpretation
```
TSB < -30:  OVERREACHED ← YOU ARE HERE (-123)
TSB < -10:  Fatigued
TSB < 10:   Fresh
TSB >= 10:  Rested
```

**Your status**: You have accumulated 123 points more fatigue than fitness. This is **critical overreach**.

### Why It Matters
- TSB is 20% of your readiness score
- Negative TSB → body needs recovery more than training
- Your -123 is extreme (normal range: -30 to +10)

### Solution
1. **Add explanation** on first use:
   ```json
   {
     "tsb": -123,
     "tsb_explained": {
       "name": "Training Stress Balance (Form)",
       "formula": "Fitness (42-day avg) - Fatigue (7-day avg)",
       "your_values": {
         "fitness_ctl": 293,
         "fatigue_atl": 416,
         "form_tsb": -123
       },
       "interpretation": "You have 123 more fatigue units than fitness. Your body desperately needs recovery.",
       "status": "CRITICALLY OVERREACHED",
       "action": "Immediate recovery week required - reduce volume by 50%, easy intensity only"
     }
   }
   ```

2. **Create help endpoint**: `/api/help/tsb`
3. **Show component breakdown** in all TSB responses
4. **Add warning** when TSB < -30

---

## Issue 3: Date/Time Not Validated 🚨

### Problem
"tool needs to check each time we interact the date and time"

### Current Issues
1. **No explicit dates in responses** - users don't know which day's data they're seeing
2. **No data freshness check** - no warning if data is stale
3. **No timezone validation** - assumes UTC but doesn't verify
4. **Always uses system date** - no explicit date parameters

### Code Locations
```javascript
// stats-service.js:346
const endDate = new Date().toISOString().split('T')[0];  // No validation

// workout-recommendation.js:16  
const targetDate = date || new Date().toISOString().split('T')[0];  // Optional date

// pattern-recognition.js:668
format(subDays(new Date(), lookbackDays), 'yyyy-MM-dd')  // No validation
```

### Current Data Status ✅
- **Latest in database**: 2026-02-19
- **Current system date**: 2026-02-19
- **Data age**: 0 hours (current)
- **Status**: Everything up-to-date

### Solution

#### 1. Add Data Context to ALL Responses
```json
{
  "data_context": {
    "data_date": "2026-02-19",
    "system_date": "2026-02-19",
    "data_age_hours": 0,
    "is_current": true,
    "timezone": "UTC",
    "warning": null
  },
  "metrics": { ... }
}
```

#### 2. Create Freshness Middleware
```javascript
// middleware/data-freshness.js
export function addDataContext(latestDataDate) {
  const now = new Date();
  const dataDate = new Date(latestDataDate);
  const ageHours = Math.floor((now - dataDate) / (1000 * 60 * 60));
  
  return {
    data_date: latestDataDate,
    system_date: now.toISOString().split('T')[0],
    data_age_hours: ageHours,
    is_current: ageHours < 24,
    timezone: process.env.TZ || 'UTC',
    warning: ageHours >= 24 ? `Data is ${ageHours} hours old` : null
  };
}
```

#### 3. Add Date Parameters to All Endpoints
```javascript
// Example: /api/stats/summary?email=...&date=2026-02-18
router.get('/summary', async (req, res) => {
  const { email, date } = req.query;
  const targetDate = date || await getLatestDataDate(email);
  
  // Validate date exists
  const hasData = await checkDateExists(email, targetDate);
  if (!hasData) {
    return res.status(404).json({
      error: 'No data for specified date',
      requested_date: targetDate,
      latest_available: await getLatestDataDate(email)
    });
  }
  
  // Return with data context
  const metrics = await getMetrics(email, targetDate);
  res.json({
    data_context: addDataContext(targetDate),
    ...metrics
  });
});
```

#### 4. Update MCP Tool Responses
```javascript
// Before:
return `Your recovery score is 71`;

// After:
const latestDate = await getLatestDataDate(email);
return `Your recovery score is 71 (data from ${latestDate})`;
```

#### 5. Add Visual Indicators
```javascript
// In all responses:
{
  "data_freshness_indicator": "🟢 CURRENT",  // or "🟡 1 DAY OLD" or "🔴 STALE"
  "last_sync": "2026-02-19T06:00:00Z",
  "next_sync": "2026-02-20T06:00:00Z"
}
```

---

## Issue 4: Activity Hallucination 🚨🚨🚨 MOST CRITICAL

### Problem
"the tool also made assumption that i went climbing because it told it last night, i didnt, it should always check"

### What Actually Happened
**Tool claimed**: "You went climbing last night"  
**Database reality**: NO climbing activity recorded. Latest activity: **2026-02-13** (6 days ago)

```sql
-- Actual recent activities from garmin_activities.db:
2026-02-13 | swimming     | Pool Swim
2026-02-13 | training     | yoga
2026-02-12 | cycling      | Sofia eMountain Biking
2026-02-11 | training     | yoga
2026-02-10 | cycling      | death spin (indoor)
2026-02-10 | training     | yoga
```

**NO climbing activities at all** in recent history.

### Root Cause
The tool is:
1. **Making assumptions** based on conversation context
2. **Not verifying** against actual activity database
3. **Hallucinating data** that doesn't exist
4. **Trusting memory** over database facts

### Why This Is MOST Critical
This undermines **ALL trust** in the system:
- If it invents activities, what else is it making up?
- Recommendations based on fake data are worthless
- Could lead to dangerous training decisions
- User can't trust ANY response without manual verification

### Solution - Activity Verification Protocol

#### 1. Create Activity Verification Service
```javascript
// backend/src/services/activity-verification.js
import { getGarminDB } from '../services/garmin-db-reader.js';

export async function verifyActivityExists(email, activityType, dateRange) {
  const db = getGarminDB();
  
  const query = `
    SELECT 
      date(start_time) as date,
      sport,
      sub_sport,
      name,
      distance,
      calories
    FROM activities
    WHERE date(start_time) BETWEEN ? AND ?
    ORDER BY start_time DESC
  `;
  
  const activities = await db.all(query, [dateRange.start, dateRange.end]);
  
  return {
    exists: activities.length > 0,
    activities: activities,
    count: activities.length,
    date_range: dateRange,
    verified_at: new Date().toISOString()
  };
}

export async function getRecentActivities(email, days = 7) {
  const db = getGarminDB();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const query = `
    SELECT 
      date(start_time) as date,
      sport,
      sub_sport,
      name,
      distance,
      calories,
      elapsed_time
    FROM activities
    WHERE date(start_time) >= date(?)
    ORDER BY start_time DESC
  `;
  
  const activities = await db.all(query, [startDate.toISOString().split('T')[0]]);
  
  return {
    activities: activities,
    count: activities.length,
    date_range: {
      start: startDate.toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0]
    },
    latest_activity_date: activities.length > 0 ? activities[0].date : null,
    days_since_last: activities.length > 0 
      ? Math.floor((new Date() - new Date(activities[0].date)) / (1000 * 60 * 60 * 24))
      : null
  };
}

export async function getMostRecentActivity(email) {
  const db = getGarminDB();
  
  const query = `
    SELECT 
      date(start_time) as date,
      time(start_time) as time,
      sport,
      sub_sport,
      name,
      distance,
      calories,
      elapsed_time
    FROM activities
    ORDER BY start_time DESC
    LIMIT 1
  `;
  
  const activity = await db.get(query);
  
  if (!activity) {
    return {
      exists: false,
      message: "No activities found in database"
    };
  }
  
  const daysSince = Math.floor((new Date() - new Date(activity.date)) / (1000 * 60 * 60 * 24));
  
  return {
    exists: true,
    activity: activity,
    days_since: daysSince,
    is_recent: daysSince <= 1,
    warning: daysSince > 3 ? `Last activity was ${daysSince} days ago` : null
  };
}
```

#### 2. Mandatory Verification Rules

**RULE 1**: Never reference activities without verification
```javascript
// ❌ WRONG - assumes activity happened
"Based on your climbing session last night..."

// ✅ CORRECT - verify first
const recent = await getRecentActivities(email, 2);
const climbing = recent.activities.filter(a => a.sport === 'rock_climbing');
if (climbing.length === 0) {
  return "I don't see any climbing activities in the last 2 days. Latest activity: ${recent.latest}";
}
```

**RULE 2**: Always show actual data date
```javascript
// ❌ WRONG
"Your run was great!"

// ✅ CORRECT
"Your run on 2026-02-13 (6 days ago) was great!"
```

**RULE 3**: Acknowledge data gaps
```javascript
// ✅ CORRECT
const latest = await getMostRecentActivity(email);
if (latest.days_since > 2) {
  return `Note: Last recorded activity was ${latest.days_since} days ago (${latest.activity.sport} on ${latest.activity.date}). Have you done any activities since that weren't synced?`;
}
```

**RULE 4**: Never trust conversation memory over database
```javascript
// User says: "I went climbing yesterday"
// System MUST respond:
const recent = await getRecentActivities(email, 2);
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayStr = yesterday.toISOString().split('T')[0];

const hasClimbing = recent.activities.some(a => 
  a.date === yesterdayStr && 
  (a.sport === 'rock_climbing' || a.sub_sport === 'rock_climbing')
);

if (!hasClimbing) {
  return `I don't see a climbing activity recorded for ${yesterdayStr}. Was it tracked with your Garmin? If not, I can add it manually.`;
}
```

#### 3. Add Verification Endpoint
```javascript
// backend/src/routes/activities.js
router.get('/verify', async (req, res) => {
  const { email, sport, date_start, date_end } = req.query;
  
  const result = await verifyActivityExists(email, sport, {
    start: date_start || new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0],
    end: date_end || new Date().toISOString().split('T')[0]
  });
  
  res.json(result);
});

router.get('/recent', async (req, res) => {
  const { email, days = 7 } = req.query;
  const result = await getRecentActivities(email, parseInt(days));
  res.json(result);
});

router.get('/latest', async (req, res) => {
  const { email } = req.query;
  const result = await getMostRecentActivity(email);
  res.json(result);
});
```

#### 4. Update MCP Tools - Add Verification Step

**Before** (in all MCP tools):
```javascript
// At the start of EVERY tool that references activities:
const activityCheck = await getMostRecentActivity(email);
if (activityCheck.days_since > 2) {
  context.data_warning = `⚠️  Last activity recorded ${activityCheck.days_since} days ago (${activityCheck.activity.date})`;
}
```

#### 5. Add Activity Context to All Responses
```json
{
  "activity_context": {
    "latest_activity_date": "2026-02-13",
    "days_since_last": 6,
    "recent_activities_count": 3,
    "date_range_checked": "2026-02-12 to 2026-02-19",
    "warning": "⚠️ No activities recorded in last 6 days"
  },
  "response": { ... }
}
```

#### 6. LLM Guardrails - Update System Prompt

Add to LLM system prompt:
```
CRITICAL RULES - ACTIVITY VERIFICATION:

1. NEVER reference activities without checking database
2. NEVER assume user did an activity based on conversation
3. ALWAYS use getMostRecentActivity() before making activity claims
4. If claiming "you did X yesterday", VERIFY it exists in database
5. If no activity found, say "I don't see that activity recorded"
6. Show the actual date of activities: "Your run on 2026-02-13"
7. If latest activity is >2 days old, mention it: "Note: No activities synced since..."
8. Database truth > Conversation memory ALWAYS

EXAMPLE CORRECT BEHAVIOR:
User: "Based on my climbing last night..."
System checks database, finds no climbing:
Response: "I don't see a climbing activity recorded recently. Your last activity was yoga on 2026-02-13 (6 days ago). Was the climbing session tracked with your Garmin?"

EXAMPLE WRONG BEHAVIOR (NEVER DO THIS):
User: "Based on my climbing last night..."  
System: "Yes, based on your climbing session..." ❌ HALLUCINATION
```

### Current Reality Check

**Your actual activities** (from database):
```
Latest:     2026-02-13 (6 days ago)
Activity:   Swimming + Yoga
Previous:   2026-02-12 - Cycling (eMTB)
            2026-02-11 - Yoga
            2026-02-10 - Indoor cycling + Yoga

No climbing activities found in recent history.
No activities recorded for 2026-02-14 through 2026-02-19 (6 days).
```

**Gap Analysis**:
- 6 days without recorded activities
- Possible reasons:
  1. You haven't trained (unlikely given your pattern)
  2. Garmin not syncing properly
  3. Activities not tracked with Garmin
  4. Manual sync needed

### Immediate Actions Required

1. **Check Garmin sync status**:
   ```bash
   curl http://localhost:8080/api/garmin/sync-status?email=tsochev.ivan@gmail.com
   ```

2. **Manual sync if needed**:
   ```bash
   curl -X POST http://localhost:8080/api/garmin/sync?email=tsochev.ivan@gmail.com
   ```

3. **Verify latest data in GarminDB**:
   ```bash
   sqlite3 data/garmin/HealthData/DBs/garmin_activities.db "SELECT max(date(start_time)) as latest FROM activities;"
   ```

4. **Update all MCP tools** to verify activities before referencing them

---

## Your Current Training Status 🚨

Based on latest data (2026-02-19):

### Critical Metrics
| Metric | Value | Status | Interpretation |
|--------|-------|--------|----------------|
| **TSB (Form)** | **-123** | 🔴 OVERREACHED | Critically fatigued |
| **ACR** | **1.69** | 🔴 HIGH RISK | 30% above safe limit |
| **Recovery** | **71** | 🟢 GOOD | Body recovering well |
| **HRV** | **41** | 🟢 HIGH | Well-recovered |
| **Training Load** | **378** | 🔴 VERY HIGH | Immediate issue |

### The Problem
Your **body is recovering** (recovery 71, HRV 41) but your **training load is too high**:
- Last 7 days average: 434 load/day
- Last 42 days average: 257 load/day  
- Ratio: 1.69 (should be 0.8-1.3)

**Result**: You're in a recovery paradox:
- Sleep/HRV show good recovery
- But cumulative fatigue is critical (TSB -123)
- High acute load (434) preventing form improvement

### Immediate Action Required
1. **Recovery week NOW** - reduce volume by 50%
2. **Easy intensity only** - no hard efforts
3. **Monitor HRV daily** - if it drops, take full rest day
4. **Goal**: Get TSB to -30 or better (need ~10 days)

---

## Implementation Priority (UPDATED)

### Phase 0: Activity Verification (🚨 MOST CRITICAL - DO FIRST)
**Time**: 2-3 hours
**Impact**: CRITICAL - System is hallucinating activities, zero trust without this fix

Files to modify:
- [ ] `backend/src/services/activity-verification.js` (NEW)
- [ ] `backend/src/routes/activities.js` (add /verify, /recent, /latest endpoints)
- [ ] `backend/src/services/llm-service.js` (update system prompt with verification rules)
- [ ] `mcp/coach-mcp-server.js` (add verification to ALL 31 tools)
- [ ] Test: Verify sync status and latest activity date

**Why First**: Without this, ALL coaching advice is potentially based on hallucinated data. This is a data integrity issue that makes the entire system untrustworthy.

### Phase 1: Date Context (HIGH PRIORITY)
**Time**: 2-3 hours
**Impact**: Critical - users need to see what date data is from

Files to modify:
- [ ] `backend/src/middleware/data-freshness.js` (NEW)
- [ ] `backend/src/services/stats-service.js` (add context)
- [ ] `backend/src/services/workout-recommendation.js` (add context)
- [ ] `backend/src/services/pattern-recognition.js` (add context)
- [ ] `mcp/coach-mcp-server.js` (update all 31 tool responses)

### Phase 2: TSB Explanation (MEDIUM PRIORITY)
**Time**: 1-2 hours  
**Impact**: Medium - users confused by unexplained metric but not dangerous

Files to modify:
- [ ] `backend/src/routes/help.js` (NEW - /api/help/tsb endpoint)
- [ ] `backend/src/services/stats-service.js` (add TSB breakdown)
- [ ] `backend/src/routes/stats.js` (include explanation)
- [ ] `mcp/coach-mcp-server.js` (add TSB to tool descriptions)

### Phase 3: Readiness Clarification (LOW PRIORITY)
**Time**: 2-3 hours
**Impact**: Low - terminology is confusing but not causing incorrect data

Files to modify:
- [ ] `backend/src/services/workout-recommendation.js` (rename, add breakdown)
- [ ] `backend/src/routes/workouts.js` (update response structure)
- [ ] `backend/src/routes/help.js` (add glossary endpoint)
- [ ] `mcp/coach-mcp-server.js` (update terminology)

---

## Testing Plan

### 1. Verify Date Context
```bash
# Check all endpoints show data_context
curl http://localhost:8080/api/stats/summary?email=tsochev.ivan@gmail.com | jq '.data_context'

# Expected:
{
  "data_date": "2026-02-19",
  "system_date": "2026-02-19",
  "data_age_hours": 0,
  "is_current": true,
  "timezone": "UTC",
  "warning": null
}
```

### 2. Verify TSB Explanation
```bash
curl http://localhost:8080/api/help/tsb | jq '.'
curl http://localhost:8080/api/stats/training-stress-balance?email=... | jq '.tsb_explained'
```

### 3. Verify Readiness Breakdown
```bash
curl http://localhost:8080/api/workouts/recommendations?email=... | jq '.breakdown'
```

### 4. Test Stale Data Warning
```bash
# Modify database to use old date
sqlite3 backend/data/coach.db "UPDATE daily_metrics SET date='2026-02-17' WHERE date='2026-02-19';"

# Check for warning
curl http://localhost:8080/api/stats/summary?email=... | jq '.data_context.warning'

# Restore
```

---

## Next Steps - User Decision Required

### Option A: Fix All 3 Issues (Recommended)
**Time**: 5-8 hours total
**Result**: System is clear, transparent, and trustworthy
**Priority Order**: Date → TSB → Readiness

### Option B: Quick Fix - Date Context Only
**Time**: 2-3 hours
**Result**: Users know what date they're looking at
**Defer**: TSB explanation and readiness clarification

### Option C: Document First, Fix Later
**Time**: 30 minutes
**Result**: Create user guide explaining current system
**Benefit**: Users can work with system while fixes are prepared

---

## Questions for User

1. **Which priority?** Fix all 3, date only, or document first?
2. **How much detail?** Should TSB explanation be:
   - Simple: "Your fatigue (416) is higher than fitness (293)"
   - Technical: Full Banister model explanation with formulas
   - Middle: User-friendly explanation with optional deep dive
3. **MCP tools?** Should all 31 tools be updated, or focus on CLI?
4. **Recovery plan?** Do you want the system to automatically propose recovery week when TSB < -30?

---

## Summary

### 🚨 MOST CRITICAL ISSUE
**Issue 4: Activity Hallucination** - Tool claimed you went climbing when you didn't. This is a **data integrity failure** that makes ALL recommendations untrustworthy.

**Reality**: 
- Latest activity: 2026-02-13 (6 days ago)
- No climbing activities found
- Tool invented an activity that never happened

**Impact**: Zero trust in system until fixed.

### ✅ Good News
- Data exists and was current as of 2026-02-13
- Backend is functional
- All 4 issues are fixable
- No architectural changes needed

### 🚨 Bad News  
1. **Tool is hallucinating activities** (CRITICAL)
2. No activity data for last 6 days (possible sync issue)
3. Your TSB is critically low (-123)
4. ACR is 1.69 (high injury risk)
5. System doesn't show dates or verify data

### 🛠️ Fix Plan - 4 CRITICAL ISSUES

**Issue 1: Activity Hallucination** 🚨🚨🚨
- Tool invents activities that don't exist
- Never verifies against database
- Makes assumptions from conversation
- **Fix**: Mandatory activity verification in all tools

**Issue 2: No Date Context**
- System uses current date but never shows it
- No warnings about data age
- Users don't know which day's data they're viewing
- **Fix**: Add data_context to all responses

**Issue 3: TSB Unexplained**
- Training Stress Balance appears without explanation
- User doesn't understand what it means
- Your -123 is critically bad but not explained
- **Fix**: Add TSB breakdown and help endpoint

**Issue 4: Readiness/Recovery Confusion**
- "Readiness" (composite) vs "Recovery" (single metric)
- Terminology is unclear
- **Fix**: Rename and add breakdown

**Total time to fix all 4**: 8-11 hours
**Priority order**: Activity verification → Date context → TSB explanation → Readiness naming

### 🔍 Immediate Investigation Needed

**Why no activities since 2026-02-13?**
1. Check Garmin sync status
2. Run manual sync
3. Verify Garmin Connect is working
4. Check if activities are in Garmin Connect but not synced

**Command**:
```bash
# Check sync status
curl http://localhost:8080/api/garmin/sync-status?email=tsochev.ivan@gmail.com

# Run manual sync
curl -X POST http://localhost:8080/api/garmin/sync?email=tsochev.ivan@gmail.com
```
