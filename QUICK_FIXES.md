# 🔧 Quick Fix Guide — Coach MCP Bugs

## TL;DR — Root Cause Summary

All 8 bugs fall into 4 categories:

1. **Data Source Mismatch** (BUG-1, BUG-3): Functions query `db('activities')` directly instead of using the schema mapper
2. **Missing Mapping Table** (BUG-2): Sport type IDs are integers, not decoded to human names
3. **Field Name Mismatch** (BUG-4): Duration field isn't where expected in aggregated metrics
4. **Missing Logic** (BUG-5, BUG-6, BUG-7, BUG-8): Features stubbed out or detection logic not implemented

---

## 🔨 Three Fixes That Solve 3 Bugs

### Fix #1: Use Schema Mapper Everywhere (Fixes BUG-1 and BUG-3)

**File:** `backend/src/services/load-optimization.js`

**Change line ~60:**
```javascript
// ❌ BEFORE:
const activities = await db('activities')
  .where({ user_id })
  .where('date', '>=', startDate)
  .select('*');

// ✅ AFTER:
import { queryActivitiesForProfile } from './activity-analysis.js';
const activities = await queryActivitiesForProfile(email, startDate);
```

**Result:**  
- ✅ `get_sport_distribution` now shows data
- ✅ `get_volume_intensity_balance` now shows intensity metrics

---

### Fix #2: Add Sport Code Decoder (Fixes BUG-2)

**File:** `backend/src/utils/activity-schema-mapper.js`

**Add this mapping table:**
```javascript
const GARMIN_SPORT_TYPE_MAP = {
  0: 'generic',
  1: 'running',
  2: 'cycling',
  5: 'fitness_equipment',
  6: 'swimming',
  10: 'tennis',
  13: 'training',
  15: 'walking',
  17: 'hiking',
  19: 'rowing',
  21: 'indoor_cycling',
  25: 'yoga',
  26: 'strength_training',
  31: 'multi_sport'
};

function mapSportTypeId(sportTypeId) {
  const id = parseInt(sportTypeId);
  return GARMIN_SPORT_TYPE_MAP[id] || 'other';
}
```

**Update mapper function:**
```javascript
export function mapAppActivityToGarminSchema(appActivity) {
  return {
    // ... other fields ...
    sport: mapSportTypeId(appActivity.sport_type),  // ✅ Now decodes to name
    sub_sport: appActivity.activity_type || null,
    // ... rest ...
  };
}
```

**Result:**  
- ✅ All tools now show `"running"` instead of `"1"`

---

### Fix #3: Correct Duration Field (Fixes BUG-4)

**File:** `backend/src/services/diary-service.js`

**Change line ~427:**
```javascript
// ❌ BEFORE:
totalHours += (data.total_duration_seconds || 0) / 3600;

// ✅ AFTER:
totalHours += (data.duration || data.total_duration_seconds || 0) / 3600;
```

**Alternative (if metrics don't have duration):**
```javascript
// Query activities directly for duration:
const activities = await db('activities')
  .where({ user_id: userId })
  .whereBetween('date', [weekStart, weekEnd]);

const totalHours = activities.reduce((sum, a) => sum + (a.duration || 0), 0) / 3600;
```

**Result:**  
- ✅ Weekly summary shows correct hours

---

## � Investigation Needed

### BUG-7: Pattern Detection Empty Results

**File:** `backend/src/services/insights-alerts.js`

**Add new detection function:**
```javascript
/**
 * Detect TSB-based fatigue/freshness alerts
 */
async function detectTSBAlerts(userId) {
  const latestMetric = await db('daily_metrics')
    .where({ user_id: userId })
    .orderBy('date', 'desc')
    .first();
  
  if (!latestMetric) return [];
  
  const data = typeof latestMetric.metrics_data === 'string' 
    ? JSON.parse(latestMetric.metrics_data) 
    : latestMetric.metrics_data;
  
  const tsb = data.tsb;
  if (tsb == null) return [];
  
  const alerts = [];
  
  // Critical overreach
  if (tsb < -30) {
    alerts.push({
      type: 'overreached',
      severity: tsb < -50 ? 'critical' : 'high',
      title: '🚨 Severe Overreach',
      message: `TSB is ${tsb} (severe fatigue). High injury/illness risk.`,
      recommendation: 'Take 2-3 complete rest days immediately.',
      data: { tsb, date: latestMetric.date }
    });
  }
  // Moderate fatigue
  else if (tsb < -15) {
    alerts.push({
      type: 'fatigued',
      severity: 'medium',
      title: '⚠️ High Fatigue',
      message: `TSB is ${tsb}. Recovery needed.`,
      recommendation: 'Reduce intensity. Add easy/recovery days.',
      data: { tsb, date: latestMetric.date }
    });
  }
  // Detraining risk
  else if (tsb > 25) {
    alerts.push({
      type: 'undertrained',
      severity: 'low',
      title: '📉 Very Fresh',
      message: `TSB is ${tsb}. Risk of losing fitness.`,
      recommendation: 'Increase training load gradually.',
      data: { tsb, date: latestMetric.date }
    });
  }
  
  return alerts;
}
```

**Add to main function:**
```javascript
export async function getInsightsAndAlerts(email) {
  // ... existing code ...
  
  const alerts = [
    ...detectInjuryRisk(parsedMetrics),
    ...detectOvertraining(parsedMetrics),
    ...detectRecoveryIssues(parsedMetrics),
    ...detectHrvAnomalies(parsedMetrics),
    ...await detectTSBAlerts(userId)  // ✅ Add TSB detection
  ];
  
  // ... rest ...
}
```

**Result:**  
- ✅ Alerts fire when TSB < -15 or TSB > 25

---

## 🔍 Investigation Needed

### BUG-7: Pattern Detection Empty Results

**Debug steps:**

1. **Add logging to pattern functions:**
```javascript
// In backend/src/services/pattern-recognition.js

export async function analyzePerformanceGaps(email) {
  const activities = await queryActivitiesForProfile(email, startDate);
  
  logger.info(`[Performance Gaps] Total activities: ${activities.length}`);
  logger.info(`[Performance Gaps] Sports: ${[...new Set(activities.map(a => a.sport))].join(', ')}`);
  logger.info(`[Performance Gaps] Date range: ${activities[0]?.date} to ${activities[activities.length-1]?.date}`);
  
  // ... existing logic ...
}
```

2. **Check minimum data requirements:**
   - Verify athlete has 30+ days of history
   - Verify athlete has 3+ different sports logged

3. **Reduce thresholds temporarily:**
   - Gap detection: 14 days → 7 days
   - Pattern window: 60 days → 30 days

---

### BUG-8: Weather Adjustments Empty

**Find the adjustment logic:**
```bash
grep -r "indoor_alternative\|timing_recommendation" backend/src/services/
```

**Check if rules exist:**
- Temperature extremes (< 0°C or > 35°C) should suggest indoor
- High wind (> 25 km/h) should modify pace targets
- Rain (> 50% precipitation) should add gear recommendations

**If missing, implement basic rules:**
```javascript
// In backend/src/services/weather-aware.js

function generateAdjustments(weather, sport, duration) {
  const adjustments = {
    modifications: [],
    indoor_alternative: null,
    timing_recommendation: null,
    gear_recommendations: []
  };
  
  // Temperature
  if (weather.temperature < 0 || weather.temperature > 35) {
    adjustments.indoor_alternative = `${sport} on indoor equipment for ${duration} min`;
    adjustments.modifications.push('Extreme temperature - consider moving indoors');
  }
  
  // Wind
  if (weather.windSpeed > 25) {
    adjustments.modifications.push('Strong winds - reduce target pace/power by 5-10%');
  }
  
  // Precipitation
  if (weather.precipitation > 50) {
    adjustments.gear_recommendations.push('Waterproof jacket', 'Cap/visor');
    adjustments.timing_recommendation = 'Check hourly forecast for drier window';
  }
  
  return adjustments;
}
```

---

## 📋 Testing Checklist

After applying fixes, verify:

```bash
# ✅ BUG-1: Sport distribution has data
curl "http://localhost:3000/api/load/distribution?email=test@example.com&weeks=12" | jq '.sport_distribution'

# ✅ BUG-2: Sport names are readable (not numbers)
curl "http://localhost:3000/api/activity/distribution?email=test@example.com&days=30" | jq '.by_sport[].sport'

# ✅ BUG-3: Intensity data populated
curl "http://localhost:3000/api/load/volume-intensity?email=test@example.com&weeks=12" | jq '.intensity_distribution'

# ✅ BUG-4: Total hours not zero
curl "http://localhost:3000/api/diary/weekly-summary?email=test@example.com&week_start=2026-04-07" | jq '.week_stats.total_hours'

# ✅ BUG-5: LLM returns workout (not fallback)
curl -X POST http://localhost:3000/api/recommend -d '{"profile_id":1,"date":"2026-04-07"}' | jq '.recommendation.plan_a'

# ✅ BUG-6: TSB alerts present
curl "http://localhost:3000/api/insights?email=test@example.com" | jq '.alerts[] | select(.type=="overreached" or .type=="fatigued")'

# ✅ BUG-7: Pattern breaks detected
curl "http://localhost:3000/api/patterns/breaks?email=test@example.com" | jq

# ✅ BUG-8: Weather adjustments populated
curl "http://localhost:3000/api/weather/adjustment-preview?lat=37.7749&lon=-122.4194&sport=cycling&duration=60" | jq '.adjustments.modifications'
```

---

## 🎯 Priority Order

### Ship Today (P0 — ~2 hours)
1. Fix #1 — Schema mapper (BUG-1, BUG-3)
2. Fix #4 — TSB alerts (BUG-6) — **SAFETY CRITICAL**
3. Fix #2 — Sport code mapping (BUG-2)
4. Fix #3 — Duration field (BUG-4)

### Next Sprint (P1 — ~4 hours)
5. Investigate BUG-7 (pattern detection)
6. Investigate BUG-8 (weather adjustments)

### Skipped
- ~~BUG-5~~ (LLM feature deprecated)

---

**Questions?** See full details in `BUG_REPORT.md`
