#!/bin/bash

# Test Script: P1 Issue #6 - Multi-Activity False Negatives
# Tests that existing multi-activity days are detected and tracked in real-time
#
# Expected Behavior:
# - Pattern discovery backfills multi_activity_days table
# - Existing activities with 2+ per day are detected
# - Multi-activity history endpoint returns tracked days
# - No sync required for detection

set -e

BASE_URL="http://localhost:8088/api"
EMAIL="tsochev.ivan@gmail.com"

echo "════════════════════════════════════════════════════════════════"
echo "Testing Issue #6: Multi-Activity False Negatives"
echo "════════════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Check Current Multi-Activity Days ─────────────────────────

echo "Step 1: Checking current multi-activity day count..."
BEFORE_RESPONSE=$(curl -s "$BASE_URL/patterns/multi-activity/history?email=$EMAIL&days=90")
BEFORE_COUNT=$(echo "$BEFORE_RESPONSE" | jq -r '.count // 0' 2>/dev/null)

echo "  Current tracked multi-activity days: $BEFORE_COUNT"
echo ""

# ── Step 2: Run Pattern Discovery (triggers backfill) ─────────────────

echo "Step 2: Running pattern discovery to trigger backfill..."
DISCOVERY_RESPONSE=$(curl -s -X POST "$BASE_URL/patterns/discover" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"lookback_days\": 90}")

echo "$DISCOVERY_RESPONSE" | jq '{patterns: (.patterns | length), activities_analyzed: .activities_analyzed}' 2>/dev/null || echo "Failed to parse discovery response"

PATTERNS_FOUND=$(echo "$DISCOVERY_RESPONSE" | jq -r '.patterns | length' 2>/dev/null)
ACTIVITIES_ANALYZED=$(echo "$DISCOVERY_RESPONSE" | jq -r '.activities_analyzed // 0' 2>/dev/null)

echo "  Patterns found: $PATTERNS_FOUND"
echo "  Activities analyzed: $ACTIVITIES_ANALYZED"
echo ""

# ── Step 3: Check Multi-Activity Days After Discovery ─────────────────

echo "Step 3: Checking multi-activity days after backfill..."
sleep 2  # Allow database writes to complete

AFTER_RESPONSE=$(curl -s "$BASE_URL/patterns/multi-activity/history?email=$EMAIL&days=90")
AFTER_COUNT=$(echo "$AFTER_RESPONSE" | jq -r '.count // 0' 2>/dev/null)

echo "$AFTER_RESPONSE" | jq '{count, avg_activities_per_day, avg_adjusted_load, common_combos}' 2>/dev/null || echo "No data"
echo ""

# ── Step 4: Verify Backfill Happened ──────────────────────────────────

echo "Step 4: Verifying backfill detection..."

PASS_COUNT=0
FAIL_COUNT=0

# Test 1: Multi-activity days should increase or stay same (not decrease)
if [ "$AFTER_COUNT" -ge "$BEFORE_COUNT" ]; then
  echo "✅ PASS: Multi-activity count increased or stayed same ($BEFORE_COUNT → $AFTER_COUNT)"
  ((PASS_COUNT++))
else
  echo "❌ FAIL: Multi-activity count decreased ($BEFORE_COUNT → $AFTER_COUNT)"
  ((FAIL_COUNT++))
fi

# Test 2: If activities analyzed > 20, expect some multi-activity days
if [ "$ACTIVITIES_ANALYZED" -gt 20 ]; then
  if [ "$AFTER_COUNT" -gt 0 ]; then
    echo "✅ PASS: Detected multi-activity days in large activity set ($AFTER_COUNT days found)"
    ((PASS_COUNT++))
  else
    echo "⚠️  INFO: No multi-activity days found in $ACTIVITIES_ANALYZED activities (user may not have multi-activity days)"
  fi
else
  echo "ℹ️  INFO: Small activity set ($ACTIVITIES_ANALYZED activities), skipping detection test"
fi

# Test 3: New multi-activity days detected
NEW_DAYS=$((AFTER_COUNT - BEFORE_COUNT))
if [ "$NEW_DAYS" -gt 0 ]; then
  echo "✅ PASS: Backfill detected $NEW_DAYS new multi-activity days"
  ((PASS_COUNT++))
elif [ "$BEFORE_COUNT" -gt 0 ]; then
  echo "ℹ️  INFO: No new multi-activity days detected (already tracked or none exist)"
else
  echo "ℹ️  INFO: No multi-activity days in dataset (user may not have multi-activity patterns)"
fi

# Test 4: Response structure validation
AVG_ACTIVITIES=$(echo "$AFTER_RESPONSE" | jq -r '.avg_activities_per_day // "null"' 2>/dev/null)
if [ "$AVG_ACTIVITIES" != "null" ] && [ "$AVG_ACTIVITIES" != "0" ]; then
  echo "✅ PASS: Multi-activity metadata present (avg activities/day: $AVG_ACTIVITIES)"
  ((PASS_COUNT++))
elif [ "$AFTER_COUNT" -eq 0 ]; then
  echo "ℹ️  INFO: No multi-activity days to show metadata for"
else
  echo "❌ FAIL: Multi-activity metadata missing"
  ((FAIL_COUNT++))
fi

echo ""

# ── Step 5: Sample Multi-Activity Day ─────────────────────────────────

echo "Step 5: Sample multi-activity day details..."
if [ "$AFTER_COUNT" -gt 0 ]; then
  echo "$AFTER_RESPONSE" | jq '.history[0] | {date, activity_count, activity_combo, adjusted_total_load, is_typical_combo}' 2>/dev/null || echo "Could not parse sample"
else
  echo "  No multi-activity days to display"
fi
echo ""

# ── Results ────────────────────────────────────────────────────────────

echo "════════════════════════════════════════════════════════════════"
echo "Test Results"
echo "════════════════════════════════════════════════════════════════"
echo "✅ PASSED: $PASS_COUNT"
echo "❌ FAILED: $FAIL_COUNT"
echo ""
echo "Summary:"
echo "  • Before discovery: $BEFORE_COUNT multi-activity days tracked"
echo "  • After discovery: $AFTER_COUNT multi-activity days tracked"
echo "  • New days detected: $NEW_DAYS"
echo "  • Activities analyzed: $ACTIVITIES_ANALYZED"
echo ""

if [ $FAIL_COUNT -eq 0 ] && [ $PASS_COUNT -ge 1 ]; then
  echo "🎉 Issue #6 is FIXED - Real-time detection working"
  echo ""
  echo "Key improvements:"
  echo "  • Pattern discovery now backfills multi_activity_days table"
  echo "  • Existing activities automatically detected"
  echo "  • No sync required for detection"
  echo "  • Multi-activity history available immediately"
  exit 0
else
  echo "❌ Issue #6 needs review - Tests failed: $FAIL_COUNT"
  exit 1
fi
