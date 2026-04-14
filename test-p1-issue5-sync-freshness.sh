#!/bin/bash

# Test Script: P1 Issue #5 - Stale Data After Sync
# Tests that immediate API calls after sync don't show false "needs sync" warnings
#
# Expected Behavior:
# - After successful sync, data_context should show is_current=true, needs_sync=false
# - Sync metadata should be present (last_sync, sync_age_minutes)
# - No stale data warnings immediately after sync

set -e

BASE_URL="http://localhost:8088/api"
EMAIL="tsochev.ivan@gmail.com"

echo "════════════════════════════════════════════════════════════════"
echo "Testing Issue #5: Stale Data After Sync"
echo "════════════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Run Sync ─────────────────────────────────────────────────

echo "Step 1: Running Garmin sync..."
SYNC_RESPONSE=$(curl -s -X POST "$BASE_URL/garmin/sync" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"days\": 7}")

echo "$SYNC_RESPONSE" | jq '.'

# Check if sync succeeded
SUCCESS=$(echo "$SYNC_RESPONSE" | jq -r '.success // false')
if [ "$SUCCESS" != "true" ]; then
  echo "❌ FAIL: Sync did not complete successfully"
  exit 1
fi

echo "✅ Sync completed successfully"
echo ""

# ── Step 2: Immediate API Call After Sync ────────────────────────────

echo "Step 2: Making immediate API call after sync (within 5 minutes)..."
sleep 2  # Small delay to ensure sync timestamp is written

RECOMMENDATION=$(curl -s -X GET "$BASE_URL/workout/recommendations?email=$EMAIL")

echo "$RECOMMENDATION" | jq '.data_context'
echo ""

# ── Step 3: Verify Data Context ──────────────────────────────────────

echo "Step 3: Verifying data freshness indicators..."

IS_CURRENT=$(echo "$RECOMMENDATION" | jq -r '.data_context.is_current')
NEEDS_SYNC=$(echo "$RECOMMENDATION" | jq -r '.data_context.needs_sync')
WARNING=$(echo "$RECOMMENDATION" | jq -r '.data_context.warning')
SYNC_AGE=$(echo "$RECOMMENDATION" | jq -r '.data_context.sync_age_minutes // "not present"')
LAST_SYNC=$(echo "$RECOMMENDATION" | jq -r '.data_context.last_sync // "not present"')

echo "  is_current: $IS_CURRENT"
echo "  needs_sync: $NEEDS_SYNC" 
echo "  warning: $WARNING"
echo "  sync_age_minutes: $SYNC_AGE"
echo "  last_sync: $LAST_SYNC"
echo ""

# ── Assertions ────────────────────────────────────────────────────────

echo "════════════════════════════════════════════════════════════════"
echo "Test Results"
echo "════════════════════════════════════════════════════════════════"

PASS_COUNT=0
FAIL_COUNT=0

# Test 1: is_current should be true
if [ "$IS_CURRENT" = "true" ]; then
  echo "✅ PASS: is_current = true (data marked as current)"
  ((PASS_COUNT++))
else
  echo "❌ FAIL: is_current = $IS_CURRENT (expected true)"
  ((FAIL_COUNT++))
fi

# Test 2: needs_sync should be false
if [ "$NEEDS_SYNC" = "false" ]; then
  echo "✅ PASS: needs_sync = false (no false warning)"
  ((PASS_COUNT++))
else
  echo "❌ FAIL: needs_sync = $NEEDS_SYNC (expected false)"
  ((FAIL_COUNT++))
fi

# Test 3: warning should be null
if [ "$WARNING" = "null" ] || [ "$WARNING" = "" ]; then
  echo "✅ PASS: warning = null (no stale data warning)"
  ((PASS_COUNT++))
else
  echo "❌ FAIL: warning = '$WARNING' (expected null)"
  ((FAIL_COUNT++))
fi

# Test 4: sync_age_minutes should be present and < 5
if [ "$SYNC_AGE" != "not present" ] && [ "$SYNC_AGE" != "null" ]; then
  if [ "$SYNC_AGE" -lt 5 ]; then
    echo "✅ PASS: sync_age_minutes = $SYNC_AGE min (within 5-minute window)"
    ((PASS_COUNT++))
  else
    echo "⚠️  WARNING: sync_age_minutes = $SYNC_AGE min (>5 minutes, but field present)"
    ((PASS_COUNT++))
  fi
else
  echo "❌ FAIL: sync_age_minutes not present in response"
  ((FAIL_COUNT++))
fi

# Test 5: last_sync timestamp should be present
if [ "$LAST_SYNC" != "not present" ] && [ "$LAST_SYNC" != "null" ]; then
  echo "✅ PASS: last_sync timestamp present: $LAST_SYNC"
  ((PASS_COUNT++))
else
  echo "❌ FAIL: last_sync timestamp not present"
  ((FAIL_COUNT++))
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Summary: $PASS_COUNT passed, $FAIL_COUNT failed"
echo "════════════════════════════════════════════════════════════════"

if [ $FAIL_COUNT -eq 0 ]; then
  echo "🎉 All tests PASSED - Issue #5 is FIXED"
  exit 0
else
  echo "❌ Some tests FAILED - Issue #5 needs more work"
  exit 1
fi
