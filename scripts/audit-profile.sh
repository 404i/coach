#!/bin/bash
set -euo pipefail

PROFILE_EMAIL="${1:-tsochev.ivan@gmail.com}"
DB_PATH="backend/data/coach.db"

echo "=== Coach Profile Audit ==="
echo "Profile: $PROFILE_EMAIL"
echo "Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

echo "1. Profile Exists:"
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM athlete_profiles ap JOIN users u ON ap.user_id=u.id WHERE u.garmin_email='$PROFILE_EMAIL';"

echo ""
echo "2. Activity Count:"
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM activities WHERE profile_id=(SELECT ap.id FROM athlete_profiles ap JOIN users u ON ap.user_id=u.id WHERE u.garmin_email='$PROFILE_EMAIL');"

echo ""
echo "3. Latest Activity:"
sqlite3 "$DB_PATH" "SELECT MAX(date) FROM activities WHERE profile_id=(SELECT ap.id FROM athlete_profiles ap JOIN users u ON ap.user_id=u.id WHERE u.garmin_email='$PROFILE_EMAIL');"

echo ""
echo "4. Daily Metrics Count:"
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM daily_metrics WHERE profile_id=(SELECT ap.id FROM athlete_profiles ap JOIN users u ON ap.user_id=u.id WHERE u.garmin_email='$PROFILE_EMAIL');"

echo ""
echo "5. Baselines:"
sqlite3 "$DB_PATH" "SELECT json_extract(profile_data, '$.baselines') FROM athlete_profiles ap JOIN users u ON ap.user_id=u.id WHERE u.garmin_email='$PROFILE_EMAIL';" | python3 -m json.tool 2>/dev/null || echo "(none)"

echo ""
echo "6. Goals:"
sqlite3 "$DB_PATH" "SELECT json_extract(profile_data, '$.goals') FROM athlete_profiles ap JOIN users u ON ap.user_id=u.id WHERE u.garmin_email='$PROFILE_EMAIL';" | python3 -m json.tool 2>/dev/null || echo "[]"

echo ""
echo "7. Constraints:"
sqlite3 "$DB_PATH" "SELECT json_extract(profile_data, '$.constraints') FROM athlete_profiles ap JOIN users u ON ap.user_id=u.id WHERE u.garmin_email='$PROFILE_EMAIL';" | python3 -m json.tool 2>/dev/null || echo "[]"

echo ""
echo "8. Availability Schedule:"
SCHEDULE=$(sqlite3 "$DB_PATH" "SELECT json_extract(profile_data, '$.availability.weekly_schedule') FROM athlete_profiles ap JOIN users u ON ap.user_id=u.id WHERE u.garmin_email='$PROFILE_EMAIL';")
if [ -n "$SCHEDULE" ] && [ "$SCHEDULE" != "null" ]; then
  echo "$SCHEDULE" | python3 -m json.tool
else
  echo "(not set)"
fi

echo ""
echo "9. Equipment & Facilities:"
echo "Equipment:"
sqlite3 "$DB_PATH" "SELECT json_extract(profile_data, '$.access.equipment') FROM athlete_profiles ap JOIN users u ON ap.user_id=u.id WHERE u.garmin_email='$PROFILE_EMAIL';" | python3 -m json.tool 2>/dev/null || echo "[]"
echo "Facilities:"
sqlite3 "$DB_PATH" "SELECT json_extract(profile_data, '$.access.facilities') FROM athlete_profiles ap JOIN users u ON ap.user_id=u.id WHERE u.garmin_email='$PROFILE_EMAIL';" | python3 -m json.tool 2>/dev/null || echo "[]"

echo ""
echo "=== Completeness Summary ==="

# Count populated fields
ACTIVITIES=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM activities WHERE profile_id=(SELECT ap.id FROM athlete_profiles ap JOIN users u ON ap.user_id=u.id WHERE u.garmin_email='$PROFILE_EMAIL');")
METRICS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM daily_metrics WHERE profile_id=(SELECT ap.id FROM athlete_profiles ap JOIN users u ON ap.user_id=u.id WHERE u.garmin_email='$PROFILE_EMAIL');")
GOALS_LEN=$(sqlite3 "$DB_PATH" "SELECT json_array_length(json_extract(profile_data, '$.goals')) FROM athlete_profiles ap JOIN users u ON ap.user_id=u.id WHERE u.garmin_email='$PROFILE_EMAIL';" || echo "0")
BASELINES_NULL=$(sqlite3 "$DB_PATH" "SELECT 
  CASE WHEN json_extract(profile_data, '$.baselines.resting_hr_bpm_14d') IS NULL THEN 1 ELSE 0 END +
  CASE WHEN json_extract(profile_data, '$.baselines.lthr_bpm') IS NULL THEN 1 ELSE 0 END +
  CASE WHEN json_extract(profile_data, '$.baselines.max_hr_bpm') IS NULL THEN 1 ELSE 0 END
FROM athlete_profiles ap JOIN users u ON ap.user_id=u.id WHERE u.garmin_email='$PROFILE_EMAIL';" || echo "3")

echo ""
if [ "$ACTIVITIES" -eq 0 ]; then
  echo "❌ CRITICAL: No activity data synced"
else
  echo "✅ Activity data: $ACTIVITIES activities"
fi

if [ "$METRICS" -eq 0 ]; then
  echo "⚠️  No daily metrics synced"
else
  echo "✅ Daily metrics: $METRICS days"
fi

if [ "$BASELINES_NULL" -eq 3 ]; then
  echo "❌ CRITICAL: No performance baselines set (HR zones, FTP)"
else
  echo "✅ Performance baselines: $((3 - BASELINES_NULL))/3 set"
fi

if [ "$GOALS_LEN" -eq 0 ]; then
  echo "⚠️  No goals formalized"
else
  echo "✅ Goals: $GOALS_LEN defined"
fi

if [ -n "$SCHEDULE" ] && [ "$SCHEDULE" != "null" ]; then
  echo "✅ Weekly schedule defined"
else
  echo "⚠️  Weekly availability schedule not set"
fi

echo ""
echo "=== Recommended Actions ==="
if [ "$ACTIVITIES" -eq 0 ]; then
  echo "1. Sync Garmin data: ./scripts/sync-manager.sh"
  echo "2. Import to coach: python scripts/import_garmindb_to_coach.py --profile-id <your-profile> --latest-days 90"
fi

if [ "$BASELINES_NULL" -eq 3 ]; then
  echo "3. Set performance baselines via PATCH /api/profile (see ONBOARDING_AUDIT.md)"
fi

if [ "$GOALS_LEN" -eq 0 ]; then
  echo "4. Formalize goals and constraints (see ONBOARDING_AUDIT.md Phase 3)"
fi

echo ""
echo "=== Audit Complete ==="
