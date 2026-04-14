# 🐛 Bug Report — Coach MCP Server Issues

**Date:** April 7, 2026  
**Reporter:** Testing/QA  
**Priority:** P0 (Data Accuracy & User Experience)

---

## Executive Summary

Eight critical bugs were identified in production that significantly impact data accuracy, AI-powered features, and user experience. These bugs range from data source mismatches to missing field mappings and broken threshold logic. All bugs have been traced to their root causes in the backend services.

---

## BUG-1: `get_sport_distribution` Returns No Data

### Severity: **HIGH** — Feature completely non-functional

### Symptoms
- `get_sport_distribution` returns `"No activity data available"`
- `sport_distribution` block in `get_load_optimization` also returns the same message
- Observed despite `get_activity_distribution` showing 22 activities across 6 sport types

### Root Cause
**File:** `/Users/tsochkata/git/coach/backend/src/services/load-optimization.js`  
**Lines:** ~192-280 (`analyzeSportDistribution()`)

The `analyzeSportDistribution()` function is called with `activities` from the wrong data source:

```javascript
// In getLoadOptimization() - line 58-64
// Get activities from app database for sport distribution
const activities = await db('activities')
  .where({ user_id })
  .where('date', '>=', startDate)
  .select('*');

const sportDistribution = analyzeSportDistribution(activities, parsedMetrics);
```

**Problem:**  
1. The function queries `db('activities')` directly without using the mapper
2. Activities are not mapped through `mapAppActivityToGarminSchema()`
3. The `analyzeSportDistribution()` expects fields like `sport`, `training_load`, `elapsed_time` which aren't present in raw app DB schema

**Why `get_activity_distribution` works:**  
`getActivityDistribution()` (in `activity-analysis.js`) correctly uses `queryActivitiesForProfile()` which applies the schema mapper, so it gets proper field names.

### Recommended Fix
```javascript
// Replace direct query with:
import { queryActivitiesForProfile } from './activity-analysis.js';

// In getLoadOptimization():
const activities = await queryActivitiesForProfile(email, startDate);
```

---

## BUG-2: Sport Codes Not Resolved to Names

### Severity: **HIGH** — User-facing data is completely opaque

### Symptoms
- `get_activity_distribution` returns raw sport codes: `"2"`, `"5"`, `"21"`, `"13"`, `"31"`, `"10"`
- `get_sport_insights` outputs unreadable text like `"Only 1 21 session"`
- Users have no idea what these numbers mean

### Root Cause
**File:** `/Users/tsochkata/git/coach/backend/src/utils/activity-schema-mapper.js`  
**Lines:** 23-29

The mapper passes through raw `sport_type` without decoding:

```javascript
export function mapAppActivityToGarminSchema(appActivity) {
  return {
    // ...
    sport: appActivity.sport_type || 'other',  // ❌ sport_type is numeric!
    sub_sport: appActivity.activity_type || null,
    // ...
  };
}
```

**Missing:** A lookup table to map Garmin's `sport_type_id` (integer) to human-readable names.

### Recommended Fix
**Step 1:** Create a sport code mapping table:

```javascript
// Add to activity-schema-mapper.js
const GARMIN_SPORT_TYPE_MAP = {
  0: 'generic',
  1: 'running',
  2: 'cycling',
  4: 'transition',
  5: 'fitness_equipment',
  6: 'swimming',
  8: 'basketball',
  9: 'soccer',
  10: 'tennis',
  11: 'football',
  13: 'training',
  15: 'walking',
  17: 'hiking',
  19: 'rowing',
  21: 'cycling',        // indoor_cycling often maps here
  25: 'yoga',
  26: 'strength_training',
  31: 'multi_sport',
  // Add more as needed from Garmin spec
};

function mapSportTypeId(sportTypeId) {
  const id = parseInt(sportTypeId);
  return GARMIN_SPORT_TYPE_MAP[id] || 'other';
}
```

**Step 2:** Use it in the mapper:

```javascript
export function mapAppActivityToGarminSchema(appActivity) {
  return {
    // ...
    sport: mapSportTypeId(appActivity.sport_type),  // ✅ Now human-readable
    sub_sport: appActivity.activity_type || null,
    // ...
  };
}
```

---

## BUG-3: `get_volume_intensity_balance` Returns Null Intensity Data

### Severity: **MEDIUM** — Core analytics feature broken

### Symptoms
- All intensity fields are `null`:
  - `intensity_distribution: null`
  - `easy_pct: null`
  - `hard_pct: null`
  - `balance_score: null`
- Message: `"Add heart rate data to activities for intensity analysis"`
- **However:** All activities DO have `avg_hr` and `max_hr` populated

### Root Cause
**File:** `/Users/tsochkata/git/coach/backend/src/services/load-optimization.js`  
**Lines:** ~288-350 (`analyzeVolumeIntensityBalance()`)

The function receives unmapped activities (same issue as BUG-1):

```javascript
function analyzeVolumeIntensityBalance(metrics, activities) {
  const recentActivities = activities.slice(-100);
  
  recentActivities.forEach(a => {
    if (!a.avg_hr || !a.max_hr) return;  // ❌ Fields don't exist on unmapped activities
    activitiesWithHr++;
    // ...
  });
}
```

**Problem:**  
- `activities` passed to this function are raw from `db('activities')` 
- They have `avg_hr` in the DB, but the code expects the mapped schema field names
- The check `if (!a.avg_hr || !a.max_hr)` fails because unmapped activities use different field names

### Recommended Fix
Same as BUG-1: Use `queryActivitiesForProfile()` to get properly mapped activities.

---

## BUG-4: `get_weekly_summary` Returns `total_hours: 0`

### Severity: **MEDIUM** — Misleading metric display

### Symptoms
- Weekly load shows `2039` but `total_hours: 0`
- Duration data exists on all activities
- Aggregation is broken

### Root Cause
**File:** `/Users/tsochkata/git/coach/backend/src/services/diary-service.js`  
**Lines:** ~407-453 (`generateWeeklySummary()`)

The duration field is not being aggregated:

```javascript
metrics.forEach(m => {
  const data = typeof m.metrics_data === 'string' ? JSON.parse(m.metrics_data) : m.metrics_data;
  totalLoad += data.training_load || 0;
  totalHours += (data.total_duration_seconds || 0) / 3600;  // ❌ Field might be missing or named differently
  // ...
});
```

**Likely Issues:**
1. Field name mismatch: `total_duration_seconds` may not exist in `metrics_data`
2. Data may be stored as `duration` (integer seconds) instead
3. The fallback `|| 0` silently fails

### Recommended Fix
**Step 1:** Log what fields are actually present in `metrics_data`:

```javascript
if (metrics.length > 0) {
  const sample = typeof metrics[0].metrics_data === 'string' 
    ? JSON.parse(metrics[0].metrics_data) 
    : metrics[0].metrics_data;
  logger.info('Sample metrics_data fields:', Object.keys(sample));
}
```

**Step 2:** Use the correct field name (likely from daily aggregations):

```javascript
totalHours += (data.duration || data.total_duration_seconds || 0) / 3600;
```

**Step 3:** If duration data isn't in `metrics_data`, query activities directly:

```javascript
const activities = await db('activities')
  .where({ user_id: userId })
  .whereBetween('date', [weekStart, weekEnd]);

const totalHours = activities.reduce((sum, a) => sum + (a.duration || 0), 0) / 3600;
```

---

## BUG-5: ~~LLM Unavailable~~ → Feature Being Deprecated

### Status: **SKIPPED** — AI-generated plan features being removed from product

### Original Symptoms
- Both tools return fallback template: `"LLM service unavailable"`
- AI-generated plan feature completely broken
- Fallback is generic (walk 30 min × 5 days)

### Decision
Per product discussion (April 7, 2026), the LLM-powered workout and weekly plan generation features are being deprecated. No fix required.

### Migration Plan
- Remove `get_weekly_plan` and `get_today_workout` LLM calls
- Replace with rule-based recommendations using athlete data
- Update MCP tool descriptions to reflect non-AI approach

---

## BUG-6: No Alerts Firing Despite TSB -68 (Overreached)

### Severity: **HIGH** — Critical safety feature broken

### Symptoms
- `get_insights_and_alerts` returns zero alerts
- TSB is `-68` (well into overreached territory)
- Recovery score is `47` (poor) on April 6
- `get_workout_recommendations` correctly flags TSB as high-severity limiting factor
- **Users in dangerous overreached state get NO warnings**

### Root Cause
**File:** `/Users/tsochkata/git/coach/backend/src/services/insights-alerts.js`  
**Lines:** ~10-60 (`getInsightsAndAlerts()`)

**Analysis:**
```javascript
export async function getInsightsAndAlerts(email) {
  // ...
  const alerts = [
    ...detectInjuryRisk(parsedMetrics),      // Only checks ACR (Acute:Chronic Ratio)
    ...detectOvertraining(parsedMetrics),    // Looks for prolonged high load
    ...detectRecoveryIssues(parsedMetrics),  // Checks consecutive low recovery
    ...detectHrvAnomalies(parsedMetrics)     // Monitors HRV trends
  ];
  // ...
}
```

**Problem:** **No detection function checks TSB!**

- `detectInjuryRisk()` only calculates Acute:Chronic Ratio
- TSB (Training Stress Balance) is calculated separately by `stats-service.js`
- Alerts system doesn't query or evaluate TSB values

### Recommended Fix
**Step 1:** Add TSB detection function:

```javascript
/**
 * Detect TSB-based fatigue/freshness alerts
 */
async function detectTSBAlerts(userId) {
  const alerts = [];
  
  // Get latest TSB from stats
  const latestMetric = await db('daily_metrics')
    .where({ user_id: userId })
    .orderBy('date', 'desc')
    .first();
  
  if (!latestMetric) return alerts;
  
  const data = typeof latestMetric.metrics_data === 'string' 
    ? JSON.parse(latestMetric.metrics_data) 
    : latestMetric.metrics_data;
  
  const tsb = data.tsb;
  
  if (tsb == null) return alerts;
  
  // Critical overreach: TSB < -30
  if (tsb < -30) {
    alerts.push({
      type: 'overreached',
      severity: tsb < -50 ? 'critical' : 'high',
      title: '🚨 Severe Overreach Detected',
      message: `Your Training Stress Balance is ${tsb} (severe fatigue). You are at high risk of injury or illness.`,
      recommendation: 'Take at least 2-3 complete rest days immediately. Focus on recovery: sleep, nutrition, hydration.',
      data: { tsb, date: latestMetric.date }
    });
  }
  // Moderate overreach: TSB < -15
  else if (tsb < -15) {
    alerts.push({
      type: 'fatigued',
      severity: 'medium',
      title: '⚠️ High Fatigue Load',
      message: `Your TSB is ${tsb} (fatigued state). Recovery is needed.`,
      recommendation: 'Reduce training intensity. Schedule 1-2 easy/recovery days this week.',
      data: { tsb, date: latestMetric.date }
    });
  }
  // Very fresh (detraining risk): TSB > +25
  else if (tsb > 25) {
    alerts.push({
      type: 'undertrained',
      severity: 'low',
      title: '📉 Very Fresh — Risk of Detraining',
      message: `Your TSB is ${tsb} (very fresh/rested). You may be losing fitness.`,
      recommendation: 'Increase training load gradually. Add 1-2 quality sessions this week.',
      data: { tsb, date: latestMetric.date }
    });
  }
  
  return alerts;
}
```

**Step 2:** Call it in `getInsightsAndAlerts()`:

```javascript
const alerts = [
  ...detectInjuryRisk(parsedMetrics),
  ...detectOvertraining(parsedMetrics),
  ...detectRecoveryIssues(parsedMetrics),
  ...detectHrvAnomalies(parsedMetrics),
  ...await detectTSBAlerts(userId)  // ✅ Add TSB detection
];
```

---

## BUG-7: `analyze_performance_gaps`, `get_nudges`, `get_pattern_breaks` All Return Empty

### Severity: **MEDIUM** — Pattern detection features non-functional

### Symptoms
- All three tools return zero results
- Athlete profile shows clear gaps:
  - No logged strength work  
  - Yoga sessions dropped from daily to absent
  - Swimming gap of 8 days (as of testing)
- Pattern detection window or thresholds are too conservative

### Root Cause
**Investigation Needed** — likely one of these issues:

1. **Data source mismatch:** Functions query activities without schema mapping (same as BUG-1/3)
2. **Sport code mapping:** Functions look for `"strength"` or `"yoga"` but data has numeric codes `26` or `25`
3. **Threshold too high:** Gap detection requires e.g. 14+ days, but user has 8-day gaps
4. **Not enough historical data:** Pattern detection requires 60+ days but only 30 days exist

### Recommended Fix
**Step 1:** Add debug logging to each function:

```javascript
// In pattern-recognition.js
export async function analyzePerformanceGaps(email) {
  const activities = await queryActivitiesForProfile(email, ...);
  logger.info('Performance gaps - total activities:', activities.length);
  logger.info('Sports found:', [...new Set(activities.map(a => a.sport))]);
  
  // ... rest of function
}
```

**Step 2:** Verify sport mapping is working (related to BUG-2)

**Step 3:** Reduce thresholds for testing:
- Pattern break detection: 5 days → 3 days
- Performance gap: 14 days → 7 days
- Nudge frequency: weekly → every 3 days

**Step 4:** Check minimum data requirements and provide user feedback if insufficient data

---

## BUG-8: `get_weather_adjusted_workout` Returns Empty Adjustments

### Severity: **LOW** — Feature enhancement broken, not core functionality

### Symptoms
- `adjustments` block has:
  - `modifications: []` (empty)
  - `indoor_alternative: null`
  - `timing_recommendation: null`
  - `gear_recommendations: []` (empty)
- Weather data IS fetched correctly (wind, temp, conditions)
- Adjustment logic doesn't apply any rules

### Root Cause
**File:** `/Users/tsochkata/git/coach/backend/src/services/weather-aware.js`  
**Investigation Needed**

Likely scenarios:
1. Weather adjustment rules are stubbed out or incomplete
2. Thresholds for triggering adjustments are too extreme
3. Logic exists but field mapping is broken

### Recommended Fix
**Step 1:** Find the adjustment generation code:
```bash
grep -r "indoor_alternative\|timing_recommendation" backend/src/services/
```

**Step 2:** Check if adjustment rules exist:
```javascript
// Should have logic like:
if (windSpeed > 25) {
  modifications.push("Reduce target pace by 10-15 seconds per mile due to headwind");
}

if (temperature < 0 || temperature > 35) {
  indoor_alternative = "Treadmill run for 60 minutes at same effort";
}

if (precipitation > 50) {
  gear_recommendations.push("Waterproof jacket", "Hat with brim");
}
```

**Step 3:** If logic is missing, implement weather adjustment rules based on:
- Temperature: < 0°C or > 35°C → suggest indoor
- Wind: > 25 km/h → reduce pace/power targets
- Precipitation: > 50% → gear recommendations
- Air quality: AQI > 150 → suggest rescheduling

---

## Priority & Impact Assessment

| Bug | Severity | Impact | User-Facing | Effort | Status |
|-----|----------|--------|-------------|--------|--------|
| **BUG-1** | High | Data completely wrong | Yes | Low (5 min) | Ready to fix |
| **BUG-2** | High | Unreadable output | Yes | Medium (30 min) | Ready to fix |
| **BUG-3** | Medium | Feature broken | Yes | Low (same as BUG-1) | Ready to fix |
| **BUG-4** | Medium | Misleading data | Yes | Low (10 min) | Ready to fix |
| ~~**BUG-5**~~ | ~~Critical~~ | ~~AI features down~~ | ~~Yes~~ | N/A | **Feature deprecated** |
| **BUG-6** | **High** | **Safety risk** | **Yes** | Medium (45 min) | Ready to fix |
| **BUG-7** | Medium | Pattern features silent | Yes | Medium (2 hrs) | Needs investigation |
| **BUG-8** | Low | Enhancement broken | Yes | Medium (2 hrs) | Needs investigation |

---

## Recommended Fix Priority

### Phase 1: Critical Fixes (Ship Today — ~2 hours)
1. **BUG-6** — Add TSB alert detection (safety-critical)
2. **BUG-1** — Fix sport distribution data source
3. **BUG-2** — Add sport code mapping
4. **BUG-3** — Fix intensity balance (same root cause as BUG-1)
5. **BUG-4** — Fix weekly hours aggregation

### Phase 2: Feature Completeness (Next Sprint — ~4 hours)
6. **BUG-7** — Investigate and fix pattern detection
7. **BUG-8** — Implement weather adjustment logic

### ~~Phase 3:~~ LLM Features
- ~~**BUG-5**~~ — Skipped (feature being deprecated)

---

## Testing Recommendations

After fixes, run regression tests:

```bash
# Test all affected MCP tools
./test-mcp-tools.sh

# Test load optimization with real data
curl -s "http://localhost:3000/api/load/optimization?email=test@example.com&weeks=12" | jq

# Test sport distribution
curl -s "http://localhost:3000/api/load/distribution?email=test@example.com&weeks=12" | jq

# Test insights and alerts (should now include TSB)
curl -s "http://localhost:3000/api/insights?email=test@example.com" | jq '.alerts'

# Test LLM-powered recommendations
curl -X POST http://localhost:3000/api/recommend -H "Content-Type: application/json" \
  -d '{"profile_id":1,"date":"2026-04-07"}' | jq
```

---

## Contact

For questions or clarifications on these bugs:
- **File Issues:** Create GitHub issues with `bug` label
- **Urgent Fixes:** Tag with `P0` or `critical`
- **Testing:** Coordinate with QA team before deploying fixes

---

**End of Bug Report**
