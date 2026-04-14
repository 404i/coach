# 🔧 Bug Fix Work Plan — Coach MCP Server

**Date:** April 7, 2026  
**Sprint:** Current  
**Note:** LLM-related issues (BUG-5) excluded from plan per decision to deprecate LLM features

---

## 📊 Work Breakdown

| Task | Priority | Effort | Files | Impact |
|------|----------|--------|-------|--------|
| **Task 1** | P0 | 5 min | `load-optimization.js` | Fixes BUG-1 + BUG-3 |
| **Task 2** | P0 | 30 min | `activity-schema-mapper.js` | Fixes BUG-2 |
| **Task 3** | P0 | 10 min | `diary-service.js` | Fixes BUG-4 |
| **Task 4** | P0 | 45 min | `insights-alerts.js` | Fixes BUG-6 (safety) |
| **Task 5** | P0 | 15 min | Testing | Verify all fixes |
| **Task 6** | P1 | 2 hrs | `pattern-recognition.js` | Fixes BUG-7 |
| **Task 7** | P2 | 2 hrs | `weather-aware.js` | Fixes BUG-8 |

**Total P0 Work:** ~2 hours  
**Total P1 Work:** 2 hours  
**Total P2 Work:** 2 hours

---

## 🚀 Phase 1: Critical Fixes (Deploy Today)

### Task 1: Fix Schema Mapper Usage (BUG-1 + BUG-3)
**Time:** 5 minutes  
**Difficulty:** Easy  
**Impact:** Fixes sport distribution AND intensity balance

#### Steps:
1. Open `backend/src/services/load-optimization.js`
2. Find line ~60 in `getLoadOptimization()` function
3. Replace:
   ```javascript
   // ❌ Remove this:
   const activities = await db('activities')
     .where({ user_id })
     .where('date', '>=', startDate)
     .select('*');
   ```
   
   With:
   ```javascript
   // ✅ Add this:
   import { queryActivitiesForProfile } from './activity-analysis.js';
   
   // ... in function:
   const activities = await queryActivitiesForProfile(email, startDate);
   ```

4. Update function signature to accept `email` instead of/in addition to `user_id`

#### Test:
```bash
curl -s "http://localhost:3000/api/load/distribution?email=test@example.com&weeks=12" | jq '.sport_distribution'
# Should return data, not "No activity data available"

curl -s "http://localhost:3000/api/load/volume-intensity?email=test@example.com&weeks=12" | jq '.intensity_distribution'
# Should return percentages, not null
```

---

### Task 2: Add Sport Code Decoder (BUG-2)
**Time:** 30 minutes  
**Difficulty:** Easy  
**Impact:** Makes all sport data human-readable

#### Steps:
1. Open `backend/src/utils/activity-schema-mapper.js`

2. Add Garmin sport code mapping table (after imports):
   ```javascript
   /**
    * Garmin Sport Type ID to Human-Readable Name Mapping
    * Source: Garmin Connect API, GarminDB schema
    */
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
     11: 'american_football',
     13: 'training',
     15: 'walking',
     17: 'hiking',
     19: 'rowing',
     20: 'mountaineering',
     21: 'indoor_cycling',
     22: 'track_cycling',
     25: 'yoga',
     26: 'strength_training',
     27: 'warm_up',
     28: 'match',
     29: 'exercise',
     30: 'climbing',
     31: 'multi_sport',
     // Add more as discovered in data
   };
   
   /**
    * Map Garmin sport_type_id (integer) to human-readable name
    */
   function mapSportTypeId(sportTypeId) {
     if (!sportTypeId) return 'other';
     const id = parseInt(sportTypeId);
     return GARMIN_SPORT_TYPE_MAP[id] || `unknown_${id}`;
   }
   ```

3. Update `mapAppActivityToGarminSchema()` function:
   ```javascript
   export function mapAppActivityToGarminSchema(appActivity) {
     if (!appActivity) return null;
     
     return {
       // Core fields
       name: appActivity.activity_name,
       sub_sport: appActivity.activity_type || null,
       sport: mapSportTypeId(appActivity.sport_type),  // ✅ Now decodes to name
       // ... rest unchanged ...
     };
   }
   ```

4. Export the mapping function for use elsewhere:
   ```javascript
   export { mapSportTypeId };
   ```

#### Test:
```bash
curl -s "http://localhost:3000/api/activity/distribution?email=test@example.com&days=30" | jq '.by_sport[].sport'
# Should return: "running", "cycling", "yoga", etc. (not "1", "2", "25")

curl -s "http://localhost:3000/api/activity/insights?email=test@example.com&days=30" | jq
# Should show readable sport names in insights
```

---

### Task 3: Fix Weekly Summary Duration (BUG-4)
**Time:** 10 minutes  
**Difficulty:** Easy  
**Impact:** Correct hours display in weekly summaries

#### Steps:
1. Open `backend/src/services/diary-service.js`
2. Find `generateWeeklySummary()` function (~line 407)
3. Locate the duration calculation in the metrics loop (~line 427)

4. **Option A:** Fix field name (if duration exists in metrics_data):
   ```javascript
   metrics.forEach(m => {
     const data = typeof m.metrics_data === 'string' ? JSON.parse(m.metrics_data) : m.metrics_data;
     totalLoad += data.training_load || 0;
     totalHours += (data.duration || data.total_duration_seconds || 0) / 3600;  // ✅ Try 'duration' first
     // ... rest ...
   });
   ```

5. **Option B:** Query activities directly (if metrics don't have duration):
   ```javascript
   // After getting metrics, add:
   const activities = await db('activities')
     .where({ user_id: userId })
     .whereBetween('date', [weekStart, weekEnd]);
   
   const totalHours = activities.reduce((sum, a) => sum + (a.duration || 0), 0) / 3600;
   
   const weekStats = {
     days_tracked: metrics.length,
     total_training_load: Math.round(totalLoad),
     total_hours: parseFloat(totalHours.toFixed(1)),  // ✅ Use calculated value
     // ... rest ...
   };
   ```

6. Add logging to debug (temporary):
   ```javascript
   // Before the loop:
   logger.info('Sample metrics_data fields:', 
     Object.keys(typeof metrics[0].metrics_data === 'string' 
       ? JSON.parse(metrics[0].metrics_data) 
       : metrics[0].metrics_data
     )
   );
   ```

#### Test:
```bash
curl -s "http://localhost:3000/api/diary/weekly-summary?email=test@example.com&week_start=2026-04-07" | jq '.week_stats'
# total_hours should be > 0 if there's training load
```

---

### Task 4: Add TSB Alert Detection (BUG-6) — SAFETY CRITICAL
**Time:** 45 minutes  
**Difficulty:** Medium  
**Impact:** Prevents injury/illness from overtraining

#### Steps:
1. Open `backend/src/services/insights-alerts.js`

2. Add new detection function (after existing detection functions):
   ```javascript
   /**
    * Detect TSB (Training Stress Balance) based fatigue/freshness alerts
    * TSB = CTL - ATL (Form = Fitness - Fatigue)
    * 
    * Zones:
    * - TSB < -30: Severe overreach (critical injury risk)
    * - TSB -30 to -15: High fatigue (recovery needed)
    * - TSB -15 to -5: Productive training zone
    * - TSB -5 to +5: Freshness/maintenance
    * - TSB +5 to +25: Fresh/rested
    * - TSB > +25: Very fresh (detraining risk)
    */
   async function detectTSBAlerts(userId) {
     const alerts = [];
     
     // Get latest metrics with TSB
     const latestMetric = await db('daily_metrics')
       .where({ user_id: userId })
       .orderBy('date', 'desc')
       .first();
     
     if (!latestMetric) return alerts;
     
     const data = typeof latestMetric.metrics_data === 'string' 
       ? JSON.parse(latestMetric.metrics_data) 
       : latestMetric.metrics_data;
     
     const tsb = data.tsb;
     const ctl = data.ctl; // Chronic Training Load (fitness)
     const atl = data.atl; // Acute Training Load (fatigue)
     
     if (tsb == null) return alerts;
     
     // Critical overreach: TSB < -30
     if (tsb < -30) {
       alerts.push({
         type: 'overreached',
         severity: tsb < -50 ? 'critical' : 'high',
         title: '🚨 Severe Overreach Detected',
         message: `Your Training Stress Balance is ${tsb} (severe overreach). You are at high risk of injury or illness.`,
         recommendation: 'Take at least 2-3 complete rest days immediately. Focus on recovery: sleep 8+ hours, nutrition, hydration. Consider medical consultation if you experience persistent fatigue, irritability, or poor sleep.',
         data: { 
           tsb, 
           ctl: Math.round(ctl || 0), 
           atl: Math.round(atl || 0), 
           date: latestMetric.date 
         }
       });
     }
     // High fatigue: TSB -30 to -15
     else if (tsb < -15) {
       alerts.push({
         type: 'fatigued',
         severity: 'medium',
         title: '⚠️ High Fatigue Load',
         message: `Your TSB is ${tsb} (fatigued state). You are carrying significant accumulated fatigue.`,
         recommendation: 'Reduce training intensity by 20-30%. Schedule 1-2 easy/recovery days this week. Monitor sleep quality and recovery metrics closely.',
         data: { 
           tsb, 
           ctl: Math.round(ctl || 0), 
           atl: Math.round(atl || 0), 
           date: latestMetric.date 
         }
       });
     }
     // Very fresh (detraining risk): TSB > +25
     else if (tsb > 25) {
       alerts.push({
         type: 'undertrained',
         severity: 'low',
         title: '📉 Very Fresh — Risk of Detraining',
         message: `Your TSB is ${tsb} (very fresh/rested). Extended rest may lead to fitness loss.`,
         recommendation: 'Increase training load gradually. Add 1-2 quality sessions this week. Consider if you\'re recovering from injury or illness before ramping up.',
         data: { 
           tsb, 
           ctl: Math.round(ctl || 0), 
           atl: Math.round(atl || 0), 
           date: latestMetric.date 
         }
       });
     }
     
     return alerts;
   }
   ```

3. Update `getInsightsAndAlerts()` to include TSB detection:
   ```javascript
   export async function getInsightsAndAlerts(email) {
     try {
       const userId = await getUserIdFromEmail(email);
       
       // Get recent metrics (last 30 days)
       const metrics = await db('daily_metrics')
         .where({ user_id: userId })
         .where('date', '>=', db.raw("date('now', '-30 days')"))
         .orderBy('date', 'desc');
       
       if (metrics.length === 0) {
         return {
           alerts: [],
           insights: [],
           milestones: []
         };
       }
       
       // Parse metrics data
       const parsedMetrics = metrics.map(m => ({
         date: m.date,
         ...( typeof m.metrics_data === 'string' ? JSON.parse(m.metrics_data) : m.metrics_data)
       }));
       
       // Run all detection algorithms
       const alerts = [
         ...detectInjuryRisk(parsedMetrics),
         ...detectOvertraining(parsedMetrics),
         ...detectRecoveryIssues(parsedMetrics),
         ...detectHrvAnomalies(parsedMetrics),
         ...await detectTSBAlerts(userId)  // ✅ Add TSB detection
       ];
       
       // ... rest unchanged ...
     }
   }
   ```

#### Test:
```bash
# Test with athlete who has TSB < -30
curl -s "http://localhost:3000/api/insights?email=test@example.com" | jq '.alerts[] | select(.type=="overreached" or .type=="fatigued")'
# Should return TSB-based alerts

# Verify alert severity is correct
curl -s "http://localhost:3000/api/insights?email=test@example.com" | jq '.alerts | map(select(.type=="overreached")) | .[0]'
```

---

### Task 5: Test All Fixes
**Time:** 15 minutes  
**Difficulty:** Easy

#### Run full test suite:
```bash
# 1. Sport distribution has data (BUG-1)
curl -s "http://localhost:3000/api/load/distribution?email=test@example.com&weeks=12" | jq '.sport_distribution | length'
# Should be > 0

# 2. Sport names readable (BUG-2)
curl -s "http://localhost:3000/api/activity/distribution?email=test@example.com&days=30" | jq '.by_sport[].sport'
# Should show words, not numbers

# 3. Intensity data populated (BUG-3)
curl -s "http://localhost:3000/api/load/volume-intensity?email=test@example.com&weeks=12" | jq '.intensity_distribution'
# Should not be null

# 4. Total hours correct (BUG-4)
curl -s "http://localhost:3000/api/diary/weekly-summary?email=test@example.com&week_start=2026-04-07" | jq '.week_stats.total_hours'
# Should be > 0

# 5. TSB alerts firing (BUG-6)
curl -s "http://localhost:3000/api/insights?email=test@example.com" | jq '.alerts | length'
# Should have alerts if TSB is outside normal range

# 6. MCP tools work
cd mcp && node test-all-fixes.js
```

---

## 📅 Phase 2: Investigation & Enhancement (Next Week)

### Task 6: Investigate Pattern Detection (BUG-7)
**Time:** 2 hours  
**Difficulty:** Medium  
**Files:** `backend/src/services/pattern-recognition.js`

#### Diagnostic Steps:
1. Add debug logging to each pattern function:
   ```javascript
   export async function analyzePerformanceGaps(email) {
     const activities = await queryActivitiesForProfile(email, startDate);
     
     logger.info(`[Performance Gaps] Email: ${email}`);
     logger.info(`[Performance Gaps] Total activities: ${activities.length}`);
     logger.info(`[Performance Gaps] Sports found: ${[...new Set(activities.map(a => a.sport))].join(', ')}`);
     logger.info(`[Performance Gaps] Date range: ${activities[0]?.date} to ${activities[activities.length-1]?.date}`);
     
     // ... existing logic ...
   }
   ```

2. Test with known data:
   ```bash
   curl -s "http://localhost:3000/api/patterns/performance/gaps?email=test@example.com" | jq
   # Check backend logs for debug output
   tail -f backend/logs/combined.log | grep "Performance Gaps"
   ```

3. Check minimum data requirements:
   - Verify athlete has 30+ days of history
   - Verify 3+ different sports logged
   - Check if sport code mapping (from BUG-2 fix) resolved the issue

4. Review threshold values:
   - Gap detection: currently 14 days?
   - Pattern window: currently 60 days?
   - Reduce to 7 days / 30 days for testing

#### Likely Fixes:
- Same schema mapper issue (now fixed by Task 1)
- Sport code mapping (now fixed by Task 2)
- Thresholds too conservative

---

### Task 7: Implement Weather Adjustments (BUG-8)
**Time:** 2 hours  
**Difficulty:** Medium  
**Files:** `backend/src/services/weather-aware.js`

#### Implementation Steps:
1. Locate the adjustment generation code
2. Implement basic rules:
   ```javascript
   function generateAdjustments(weather, sport, duration) {
     const adjustments = {
       modifications: [],
       indoor_alternative: null,
       timing_recommendation: null,
       gear_recommendations: []
     };
     
     // Temperature extremes
     if (weather.temperature < 0) {
       adjustments.indoor_alternative = `${sport} on indoor equipment for ${duration} min`;
       adjustments.modifications.push('Freezing conditions - moving indoors recommended');
       adjustments.gear_recommendations.push('If outdoors: multiple layers, thermal gloves, face protection');
     } else if (weather.temperature > 35) {
       adjustments.indoor_alternative = `${sport} on indoor equipment for ${duration} min (air conditioned)`;
       adjustments.modifications.push('Extreme heat - high heat illness risk outdoors');
       adjustments.timing_recommendation = 'If outdoors, train before 8am or after 7pm';
     }
     
     // Wind
     if (weather.windSpeed > 25) {
       adjustments.modifications.push('Strong winds - reduce target pace/power by 5-10%');
       if (sport === 'cycling') {
         adjustments.modifications.push('Consider indoor trainer or route with wind protection');
       }
     }
     
     // Precipitation
     if (weather.precipitation > 70) {
       adjustments.gear_recommendations.push('Waterproof jacket', 'Cap/visor', 'Ziplock for phone');
       adjustments.timing_recommendation = 'Check hourly forecast for lighter rain window';
     } else if (weather.precipitation > 30) {
       adjustments.gear_recommendations.push('Light rain jacket', 'Cap');
     }
     
     // Air quality (if available)
     if (weather.aqi && weather.aqi > 150) {
       adjustments.indoor_alternative = `${sport} indoors to avoid poor air quality`;
       adjustments.modifications.push('Unhealthy air quality - reduce intensity or move indoors');
     }
     
     return adjustments;
   }
   ```

3. Test with different weather conditions:
   ```bash
   # Hot weather
   curl -s "http://localhost:3000/api/weather/adjustment-preview?lat=33.4&lon=-112.0&sport=running&duration=60" | jq '.adjustments'
   
   # Cold weather
   curl -s "http://localhost:3000/api/weather/adjustment-preview?lat=64.8&lon=-147.7&sport=cycling&duration=90" | jq '.adjustments'
   ```

---

## 📊 Progress Tracking

Update this checklist as you complete tasks:

- [ ] **Task 1:** Schema mapper fix deployed
- [ ] **Task 2:** Sport code decoder deployed
- [ ] **Task 3:** Duration field fix deployed
- [ ] **Task 4:** TSB alerts deployed
- [ ] **Task 5:** All tests passing
- [ ] **Task 6:** Pattern detection debugged
- [ ] **Task 7:** Weather adjustments implemented

---

## 🚀 Deployment Plan

### Before Deploying:
1. Run full test suite (`npm test`)
2. Check backend logs for errors
3. Verify database migrations (if any)
4. Test MCP tools with Claude Desktop

### Deploy Sequence:
```bash
# 1. Commit fixes
git add backend/src/services/load-optimization.js
git add backend/src/utils/activity-schema-mapper.js
git add backend/src/services/diary-service.js
git add backend/src/services/insights-alerts.js
git commit -m "Fix BUG-1 through BUG-6: Schema mapping, sport codes, TSB alerts"

# 2. Test locally
npm run test:backend

# 3. Restart backend
pm2 restart coach-backend

# 4. Test MCP tools
cd mcp && npm test

# 5. Deploy to production
git push origin main
```

### Post-Deployment:
1. Monitor logs for errors
2. Test with real user data
3. Verify alerts are firing correctly
4. Check that no new bugs introduced

---

## 📝 Notes

- **LLM deprecation:** BUG-5 excluded per decision to remove AI-generated plans
- **Safety priority:** BUG-6 (TSB alerts) is most critical due to injury risk
- **Quick wins:** Tasks 1-4 can all be done in ~1.5 hours total
- **Data quality:** BUG-2 fix (sport codes) will likely resolve BUG-7 issues

---

**Questions or blockers?** Update this doc with findings and decisions.
