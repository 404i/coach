# 🚨 Bug Report Summary — Coach MCP Server

**Date:** April 7, 2026  
**Status:** 8 bugs identified, 3 can be fixed with simple code changes today

---

## The Big Picture

Three **architectural issues** are causing 8 user-facing bugs:

1. **Schema Mapper Not Used** → Functions query raw database, get wrong field names
2. **Sport Codes Not Decoded** → Users see `"2"` and `"21"` instead of `"cycling"` and `"yoga"` 
3. **Detection Logic Missing** → Alert thresholds don't check TSB (Training Stress Balance)

---

## Impact on Users

| What's Broken | User Sees | Severity | Status |
|---------------|-----------|----------|--------|
| Sport distribution | "No activity data available" | **HIGH** | Fix ready |
| Activity insights | "Only 1 21 session" (meaningless) | **HIGH** | Fix ready |
| Intensity analysis | All fields `null`, asks to add HR data (but it exists!) | **MED** | Fix ready |
| Weekly summary | `total_hours: 0` despite 2039 training load | **MED** | Fix ready |
| ~~AI workout plans~~ | ~~"LLM service unavailable" fallback~~ | ~~CRITICAL~~ | **Feature deprecated** |
| Safety alerts | **Zero warnings despite TSB -68 (severe overreach)** | **CRITICAL** | Fix ready |
| Pattern detection | Empty results for gaps, nudges, breaks | **MED** | Needs investigation |
| Weather adjustments | Empty modifications despite fetching weather | **LOW** | Needs investigation |

---

## Root Causes (Technical)

### BUG-1 & BUG-3: Schema Mapper Not Applied
**File:** `backend/src/services/load-optimization.js`

```javascript
// ❌ Problem:
const activities = await db('activities').where({ user_id }).select('*');
// Returns raw DB schema: { sport_type: "2", duration: 3600, ... }

// ✅ Fix:
const activities = await queryActivitiesForProfile(email, startDate);
// Returns mapped schema: { sport: "cycling", elapsed_time: 3600, ... }
```

**Fixes:** Sport distribution (BUG-1) + Intensity balance (BUG-3)

---

### BUG-2: No Sport Code Lookup Table
**File:** `backend/src/utils/activity-schema-mapper.js`

```javascript
// ❌ Problem:
sport: appActivity.sport_type  // Returns "2" (integer ID from Garmin)

// ✅ Fix: Add decoder
const SPORT_MAP = { 1: 'running', 2: 'cycling', 21: 'indoor_cycling', ... };
sport: SPORT_MAP[appActivity.sport_type] || 'other'  // Returns "cycling"
```

**Fixes:** All sport name displays (BUG-2)

---

### BUG-4: Wrong Field Name
**File:** `backend/src/services/diary-service.js`

```javascript
// ❌ Problem:
totalHours += (data.total_duration_seconds || 0) / 3600;
// Field doesn't exist in metrics_data

// ✅ Fix:
totalHours += (data.duration || 0) / 3600;  // Correct field
```

**Fixes:** Weekly hours showing 0 (BUG-4)

---

### BUG-6: TSB Not Checked in Alerts
**File:** `backend/src/services/insights-alerts.js`

**Problem:** Alert detection functions check ACR, HRV, recovery score — but **never check TSB**.

**Fix:** Add `detectTSBAlerts()` function:
```javascript
if (tsb < -30) {
  alerts.push({
    severity: 'critical',
    title: '🚨 Severe Overreach',
    message: `TSB is ${tsb}. High injury/illness risk.`,
    recommendation: 'Take 2-3 rest days immediately.'
  });
}
```

**Fixes:** No alerts for tsb: -68 (BUG-6)

---

### BUG-5: LLM Service Down
**Status:** **Requires investigation** — not a code bug, likely infrastructure issue

**Check:**
1. Is Ollama/OpenAI running?
2. Are API keys set correctly?
3. Are there network/firewall issues?
4. Backend logs show the error?

---

### BUG-7 & BUG-8: Features Not Implemented
**Status:** **Requires investigation**

- Pattern detection (BUG-7): Logic may be stubbed or thresholds too high
- Weather adjustments (BUG-8): Rules may not be implemented

---

## Fix Priority

### 🔴 Deploy Today (~2 hours total)
1. ✅ **BUG-1 & BUG-3** — Use schema mapper (5 min)
2. ✅ **BUG-2** — Add sport code decoder (30 min)
3. ✅ **BUG-4** — Fix field name (10 min)
4. ✅ **BUG-6** — Add TSB alert detection (45 min)
5. ✅ **Testing** — Run test suite (15 min)

### ⚠️ Skipped (Feature Being Deprecated)
- ~~**BUG-5** — LLM service~~ → AI-generated plans being removed

### 🟡 Next Sprint (4-8 hours research)
6. 🔍 **BUG-7** — Debug pattern detection (2 hrs)
7. 🔍 **BUG-8** — Implement weather adjustment rules (2 hrs)

---

## Testing Commands

```bash
# Verify fixes work:
curl -s "http://localhost:3000/api/load/distribution?email=test@example.com" | jq '.sport_distribution'
curl -s "http://localhost:3000/api/activity/distribution?email=test@example.com" | jq '.by_sport[0].sport'  # Should show "running" not "1"
curl -s "http://localhost:3000/api/insights?email=test@example.com" | jq '.alerts[] | select(.type=="overreached")'  # Should return alert
```

---

## Files to Edit

| Bug | File | Lines | Effort |
|-----|------|-------|--------|
| BUG-1, 3 | `backend/src/services/load-optimization.js` | ~60 | 1 line |
| BUG-2 | `backend/src/utils/activity-schema-mapper.js` | Add mapping | 20 lines |
| BUG-4 | `backend/src/services/diary-service.js` | ~427 | 1 line |
| BUG-6 | `backend/src/services/insights-alerts.js` | Add function | 40 lines |
| BUG-5 | Infrastructure/config | N/A | Investigation |

---

## Next Steps

1. **Review this summary** with engineering team
2. **Assign BUG-1 through BUG-6** to on-call developer (can ship fixes today)
3. **Assign BUG-5 investigation** to DevOps/infra team
4. **Create tickets** for BUG-7 and BUG-8 (next sprint)
5. **Run test suite** after deploying fixes

---

**Detailed documentation:**
- Full bug report: [`BUG_REPORT.md`](BUG_REPORT.md)
- Quick fix guide: [`QUICK_FIXES.md`](QUICK_FIXES.md)

**Questions?** Contact QA team or refer to detailed docs above.
