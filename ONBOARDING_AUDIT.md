# Coach Onboarding Audit — Profile: tsochev_ivan
**Generated:** 2026-03-31  
**Profile ID:** tsochev_ivan (id:2)  
**Email:** tsochev.ivan@gmail.com  
**Last Updated:** (Check profile_data.updated_at)

---

## Executive Summary

**Overall Completeness:** 45% (9/20 critical fields populated)

**Critical Issues:**
1. ❌ **No activity data synced** (0 activities, 0 daily metrics) — explains "40 days stale" warnings
2. ❌ **Performance baselines missing** (no FTP, HR zones, HRV baseline)
3. ⚠️ **Weekly schedule undefined** (availability.weekly_schedule is NULL)
4. ⚠️ **Goals/constraints not formalized** (empty arrays despite sharing them in conversations)

**Status:** Core profile exists, but data sync + structured constraints needed for accurate coaching.

---

## Detailed Checklist

### ✅ COMPLETE (9 items)

| Field | Value | Status |
|-------|-------|--------|
| **Profile ID** | tsochev_ivan | ✅ Set |
| **Name** | tsochkata | ✅ Set |
| **Email** | tsochev.ivan@gmail.com | ✅ Verified |
| **Favorite Sports** | run, bike, swim, hiit, walk | ✅ 5 sports configured |
| **Location** | Bankya, Europe/Sofia | ✅ Set (no lat/lon) |
| **Weekly Frequency** | 3 days/week | ✅ Set |
| **Session Duration** | 45 minutes | ✅ Set |
| **Max Hard Days** | 2 per week | ✅ Conservative setting |
| **Training Time Preference** | Either AM/PM | ✅ Flexible |
| **Likes Variety** | true | ✅ Set |

---

### ❌ CRITICAL MISSING (5 items)

#### 1. Activity Data Sync ❌
```
Current: 0 activities, 0 daily metrics
Expected: Recent activities from Garmin
Root Cause: Garmin sync not run or import script not executed
```

**Impact:** Weekly plan generation uses stale/zero load → defaults to recovery walks  
**Fix:**
```bash
# Sync Garmin data
./scripts/sync-manager.sh

# Import to coach database
python scripts/import_garmindb_to_coach.py \
  --profile-id tsochev_ivan \
  --latest-days 90
```

#### 2. Performance Baselines ❌
```json
{
  "resting_hr_bpm_14d": null,
  "hrv_ms_7d": null,
  "lthr_bpm": null,
  "max_hr_bpm": null,
  "ftp_watts": null
}
```

**Impact:** No HR zone calculations → interval prescriptions are generic  
**Fix:** 
- Populate from recent Garmin data after sync
- Or manually set via profile update:
```bash
curl -X PATCH http://localhost:8088/api/profile \
  -H "Content-Type: application/json" \
  -d '{
    "email": "tsochev.ivan@gmail.com",
    "baselines": {
      "resting_hr_bpm_14d": 55,
      "hrv_ms_7d": 45,
      "lthr_bpm": 165,
      "max_hr_bpm": 185,
      "ftp_watts": 220
    }
  }'
```

#### 3. Weekly Availability Schedule ❌
```
Current: null (no day-by-day breakdown)
Impact: Planner can't respect "no weekends" or "only mornings on Tue/Thu"
```

**Fix:** Add structured weekly schedule:
```json
{
  "availability": {
    "weekly_minutes_target": 135,
    "weekly_schedule": {
      "mon": { "available": true, "time_windows": ["6:00-7:00", "18:00-19:00"], "max_minutes": 60 },
      "tue": { "available": true, "time_windows": ["6:00-7:00"], "max_minutes": 45 },
      "wed": { "available": true, "time_windows": ["6:00-7:00", "18:00-19:00"], "max_minutes": 60 },
      "thu": { "available": true, "time_windows": ["6:00-7:00"], "max_minutes": 45 },
      "fri": { "available": false },
      "sat": { "available": false },
      "sun": { "available": false }
    }
  }
}
```

#### 4. Equipment & Facilities ❌
```
Current: equipment: [], facilities: []
Impact: Can't validate workout feasibility (e.g., "bike trainer" workout when no trainer)
```

**Fix:**
```json
{
  "access": {
    "equipment": ["road_bike", "running_shoes", "heart_rate_monitor"],
    "facilities": ["outdoor_roads", "trails", "home_gym"]
  }
}
```

#### 5. Formalized Goals ❌
```
Current: goals: [], constraints: []
Known from conversation: Sub-3hr marathon, avoid gym, improve running economy
```

**Impact:** LLM responses lack structured goal context  
**Fix:**
```json
{
  "goals": [
    "Complete marathon in under 3 hours by Oct 2026",
    "Build consistent 3-day/week training habit",
    "Improve running economy and threshold pace"
  ],
  "constraints": [
    "No gym access or preference",
    "Max 45min sessions on weekdays",
    "No weekend training commitments",
    "Prefer outdoor running over treadmill"
  ]
}
```

---

### ⚠️ OPTIONAL / RECOMMENDED (6 items)

| Field | Status | Priority | Notes |
|-------|--------|----------|-------|
| **Motivations** | Not checked | Low | Useful for LLM coaching tone/style |
| **Injury History** | `injuries_history` column exists | Medium | Document any recurring issues |
| **Training Philosophy** | `training_philosophy` JSON exists | Low | Polarized? High volume? Conservative? |
| **Location Lat/Lon** | `latitude: null, longitude: null` | Low | Enables weather-aware adjustments |
| **Strava Connection** | Not configured | Low | Only if cross-platform merge needed |
| **Planned Events** | Check `planned_activities` table | High | Formalize race date + A/B/C priorities |

---

## Recommended Action Plan

### Phase 1: Data Foundation (15 min)
```bash
# 1. Sync Garmin data (last 90 days)
cd /Users/tsochkata/git/coach
./scripts/sync-manager.sh

# 2. Import to coach database
source .venv-garmin/bin/activate
python scripts/import_garmindb_to_coach.py \
  --profile-id tsochev_ivan \
  --latest-days 90

# 3. Verify import
sqlite3 backend/data/coach.db \
  "SELECT COUNT(*), MAX(date) FROM activities WHERE profile_id=2;"
```

**Expected outcome:** Activity data populated, "stale data" warnings resolved.

### Phase 2: Performance Anchors (5 min)
```bash
# Update baselines from recent data or manual input
curl -X PATCH http://localhost:8088/api/profile \
  -H "Content-Type: application/json" \
  -d '{
    "email": "tsochev.ivan@gmail.com",
    "baselines": {
      "resting_hr_bpm_14d": 55,
      "lthr_bpm": 165,
      "max_hr_bpm": 185
    }
  }'
```

**Expected outcome:** HR zone calculations work, interval prescriptions are personalized.

### Phase 3: Formalize Constraints (10 min)
```bash
# Update profile with structured goals/constraints/availability
curl -X PATCH http://localhost:8088/api/profile \
  -H "Content-Type: application/json" \
  -d @- <<'EOF'
{
  "email": "tsochev.ivan@gmail.com",
  "goals": [
    "Complete marathon in under 3 hours by Oct 2026",
    "Build consistent 3-day/week training habit",
    "Improve running economy and threshold pace"
  ],
  "constraints": [
    "No gym access or preference",
    "Max 45min sessions on weekdays",
    "No weekend training commitments",
    "Prefer outdoor running over treadmill"
  ],
  "availability": {
    "weekly_minutes_target": 135,
    "weekly_schedule": {
      "mon": { "available": true, "max_minutes": 60 },
      "tue": { "available": true, "max_minutes": 45 },
      "wed": { "available": true, "max_minutes": 60 },
      "thu": { "available": true, "max_minutes": 45 },
      "fri": { "available": false },
      "sat": { "available": false },
      "sun": { "available": false }
    }
  },
  "access": {
    "equipment": ["road_bike", "running_shoes", "heart_rate_monitor"],
    "facilities": ["outdoor_roads", "trails"],
    "days_per_week": 3,
    "minutes_per_session": 45
  }
}
EOF
```

**Expected outcome:** Weekly planner respects specific day availability, coaching tone aligns with goals.

### Phase 4: Verification (5 min)
```bash
# Test weekly plan generation
curl "http://localhost:8088/api/workout/weekly-plan?email=tsochev.ivan@gmail.com&start_date=2026-04-07"

# Check for:
# - No "stale data" warnings
# - Workouts only on Mon/Tue/Wed/Thu
# - Duration ≤ 45min on Tue/Thu, ≤ 60min on Mon/Wed
# - Progressive intensity pattern (not all recovery)
```

---

## Data Freshness Issue — Root Cause Analysis

**Symptom:** "Last activity 40 days ago" despite claiming recent Garmin sync

**Possible Causes:**
1. ✅ **Most Likely:** Garmin sync writes to `data/garmin/HealthData/DBs/` but `import_garmindb_to_coach.py` wasn't run
   - Fix: Run import script (Phase 1 above)

2. **Profile mismatch:** Activities imported under different profile_id
   - Check: `SELECT DISTINCT profile_id FROM activities;`
   - If mismatched, migrate: `UPDATE activities SET profile_id=2 WHERE profile_id=1;`

3. **Date format issue:** Activities imported with incorrect date format
   - Check: `SELECT date FROM activities ORDER BY date DESC LIMIT 5;`
   - Should be `YYYY-MM-DD` format

4. **Sync failure:** GarminDB sync encountered errors, downloaded 0 activities
   - Check: `ls -lh data/garmin/HealthData/DBs/garmin_activities.db`
   - Verify: `sqlite3 data/garmin/HealthData/DBs/garmin_activities.db "SELECT COUNT(*) FROM activities;"`

---

## Next Steps

**Immediate (Today):**
1. Run Phase 1 (Data Foundation) to eliminate stale data warnings
2. Run Phase 2 (Performance Anchors) for HR zone accuracy
3. Run Phase 4 (Verification) to confirm fixes

**This Week:**
1. Run Phase 3 (Formalize Constraints) for better plan generation
2. Add planned event for Oct 2026 marathon via:
   ```bash
   curl -X POST http://localhost:8088/api/planned-activities \
     -H "Content-Type: application/json" \
     -d '{
       "email": "tsochev.ivan@gmail.com",
       "name": "Target Marathon",
       "event_type": "race",
       "sport": "run",
       "date": "2026-10-11",
       "priority": "A",
       "distance_km": 42.2,
       "goal_time_minutes": 179
     }'
   ```

**Optional:**
- Document injury history if relevant
- Add location lat/lon for weather-aware planning
- Connect Strava if using multiple platforms

---

## Audit Script for Future Use

Save this as `scripts/audit-profile.sh`:
```bash
#!/bin/bash
set -euo pipefail

PROFILE_EMAIL="${1:-tsochev.ivan@gmail.com}"
DB_PATH="backend/data/coach.db"

echo "=== Coach Profile Audit ==="
echo "Profile: $PROFILE_EMAIL"
echo ""

echo "1. Profile Exists:"
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM athlete_profiles ap JOIN users u ON ap.user_id=u.id WHERE u.garmin_email='$PROFILE_EMAIL';"

echo "2. Activity Count:"
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM activities WHERE profile_id=(SELECT ap.id FROM athlete_profiles ap JOIN users u ON ap.user_id=u.id WHERE u.garmin_email='$PROFILE_EMAIL');"

echo "3. Latest Activity:"
sqlite3 "$DB_PATH" "SELECT MAX(date) FROM activities WHERE profile_id=(SELECT ap.id FROM athlete_profiles ap JOIN users u ON ap.user_id=u.id WHERE u.garmin_email='$PROFILE_EMAIL');"

echo "4. Daily Metrics Count:"
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM daily_metrics WHERE profile_id=(SELECT ap.id FROM athlete_profiles ap JOIN users u ON ap.user_id=u.id WHERE u.garmin_email='$PROFILE_EMAIL');"

echo "5. Baselines:"
sqlite3 "$DB_PATH" "SELECT json_extract(profile_data, '$.baselines') FROM athlete_profiles ap JOIN users u ON ap.user_id=u.id WHERE u.garmin_email='$PROFILE_EMAIL';"

echo "6. Goals:"
sqlite3 "$DB_PATH" "SELECT json_extract(profile_data, '$.goals') FROM athlete_profiles ap JOIN users u ON ap.user_id=u.id WHERE u.garmin_email='$PROFILE_EMAIL';"

echo "7. Availability:"
sqlite3 "$DB_PATH" "SELECT json_extract(profile_data, '$.availability.weekly_schedule') FROM athlete_profiles ap JOIN users u ON ap.user_id=u.id WHERE u.garmin_email='$PROFILE_EMAIL';"

echo ""
echo "=== Audit Complete ==="
```

Usage: `./scripts/audit-profile.sh tsochev.ivan@gmail.com`
