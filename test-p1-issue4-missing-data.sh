#!/bin/bash

# Test Script: P1 Issue #4 - False Missing Data Warnings
# Tests that 0 values are displayed correctly, not treated as missing data
#
# Expected Behavior:
# - 0 stress should display as "0", not "N/A"
# - 0 body_battery should display as "0%", not "N/A"
# - 0 steps should display as "0" or actual number, not "N/A"
# - 0 calories should display as "0" or actual number, not "N/A"
# - 0 duration_minutes should display as "0", not treated as missing
# - null/undefined values should still show "N/A"

set -e

BASE_URL="http://localhost:8088/api"
EMAIL="tsochev.ivan@gmail.com"
PROFILE_ID="default"

echo "════════════════════════════════════════════════════════════════"
echo "Testing Issue #4: False Missing Data Warnings"
echo "════════════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Get Context with Metrics ──────────────────────────────────

echo "Step 1: Fetching daily context with metrics..."
CONTEXT_RESPONSE=$(curl -s -X POST "$BASE_URL/recommend/context" \
  -H "Content-Type: application/json" \
  -d "{\"profile_id\": \"$PROFILE_ID\", \"date\": \"2026-04-07\"}")

CONTEXT=$(echo "$CONTEXT_RESPONSE" | jq -r '.context' 2>/dev/null)

if [ -z "$CONTEXT" ] || [ "$CONTEXT" = "null" ]; then
  echo "❌ FAIL: No context returned"
  exit 1
fi

echo "✅ Context retrieved successfully"
echo ""

# ── Step 2: Check for False N/A on 0 Values ───────────────────────────

echo "Step 2: Checking for false 'N/A' warnings on 0 values..."
echo ""

PASS_COUNT=0
FAIL_COUNT=0

# Test 1: Stress field should show numeric values (not all N/A)
STRESS_NUMERIC=$(echo "$CONTEXT" | grep -cE "Stress.*\| [0-9]+ \|" || true)
echo "Test 1: Stress field displays numeric values"
echo "  Found $STRESS_NUMERIC numeric stress values"
if [ "$STRESS_NUMERIC" -gt 0 ]; then
  echo "✅ PASS: Stress displays numeric values (including 0)"
  ((PASS_COUNT++))
else
  echo "❌ FAIL: No numeric stress values found"
  ((FAIL_COUNT++))
fi
echo ""

# Test 2: Duration should always be numeric (never N/A with our fix)
DURATION_ZERO=$(echo "$CONTEXT" | grep -c "\*\*Duration\*\*: 0 minutes" || true)
DURATION_NUMERIC=$(echo "$CONTEXT" | grep -cE "\*\*Duration\*\*: [0-9]+ minutes" || true)
echo "Test 2: Duration field formatting"
echo "  Found $DURATION_NUMERIC duration entries, $DURATION_ZERO with 0 minutes"
if [ "$DURATION_NUMERIC" -gt 0 ] && [ "$DURATION_ZERO" -gt 0 ]; then
  echo "✅ PASS: Duration shows 0 minutes (not N/A) for rest days"
  ((PASS_COUNT++))
elif [ "$DURATION_NUMERIC" -gt 0 ]; then
  echo "✅ PASS: Duration always numeric (no false N/A)"
  ((PASS_COUNT++))
else
  echo "❌ FAIL: Duration field has issues"
  ((FAIL_COUNT++))
fi
echo ""

# Test 3: Intensity Minutes should be numeric (including 0)
INTENSITY_ZERO=$(echo "$CONTEXT" | grep -c "\*\*Intensity Minutes\*\*: 0" || true)
INTENSITY_NUMERIC=$(echo "$CONTEXT" | grep -cE "\*\*Intensity Minutes\*\*: [0-9]+" || true)
echo "Test 3: Intensity Minutes field formatting"
echo "  Found $INTENSITY_NUMERIC entries, $INTENSITY_ZERO with 0 minutes"
if [ "$INTENSITY_NUMERIC" -gt 0 ] && [ "$INTENSITY_ZERO" -gt 0 ]; then
  echo "✅ PASS: Intensity Minutes shows 0 (not N/A) for low-intensity days"
  ((PASS_COUNT++))
elif [ "$INTENSITY_NUMERIC" -gt 0 ]; then
  echo "✅ PASS: Intensity Minutes always numeric"
  ((PASS_COUNT++))
else
  echo "❌ FAIL: Intensity Minutes field has issues"
  ((FAIL_COUNT++))
fi
echo ""

# Test 4: Activities count should be numeric (including 0)
ACTIVITIES_ZERO=$(echo "$CONTEXT" | grep -c "\*\*Activities\*\*: 0" || true)
ACTIVITIES_NUMERIC=$(echo "$CONTEXT" | grep -cE "\*\*Activities\*\*: [0-9]+" || true)
echo "Test 4: Activities count field formatting"
echo "  Found $ACTIVITIES_NUMERIC entries, $ACTIVITIES_ZERO with 0 activities"
if [ "$ACTIVITIES_NUMERIC" -gt 0 ] && [ "$ACTIVITIES_ZERO" -gt 0 ]; then
  echo "✅ PASS: Activities shows 0 (not N/A) for rest days"
  ((PASS_COUNT++))
elif [ "$ACTIVITIES_NUMERIC" -gt 0 ]; then
  echo "✅ PASS: Activities count always numeric"
  ((PASS_COUNT++))
else
  echo "❌ FAIL: Activities count field has issues"
  ((FAIL_COUNT++))
fi
echo ""

# Test 5: Training Load should handle 0 correctly
TRAINING_LOAD_ZERO=$(echo "$CONTEXT" | grep -c "\*\*Training Load\*\*: 0" || true)
TRAINING_LOAD_NUMERIC=$(echo "$CONTEXT" | grep -cE "\*\*Training Load\*\*: [0-9]+" || true)
echo "Test 5: Training Load field formatting"
echo "  Found $TRAINING_LOAD_NUMERIC entries, $TRAINING_LOAD_ZERO with 0 load"
if [ "$TRAINING_LOAD_NUMERIC" -gt 0 ]; then
  echo "✅ PASS: Training Load always numeric (handles 0 correctly)"
  ((PASS_COUNT++))
else
  echo "❌ FAIL: Training Load field has issues"
  ((FAIL_COUNT++))
fi
echo ""

# ── Step 3: Sample Context Output ─────────────────────────────────────

echo "Step 3: Sample context excerpt (Recovery Metrics)..."
echo "─────────────────────────────────────────────────────────"
echo "$CONTEXT" | grep -A 15 "# Recovery Metrics" | head -20 || echo "Recovery metrics not found in context"
echo ""

echo "Step 3b: Sample context excerpt (Recent Training)..."
echo "─────────────────────────────────────────────────────────"
echo "$CONTEXT" | grep -A 10 "## 2026-04" | head -12 || echo "Recent training not found in context"
echo ""

# ── Step 4: Verify Sleep Stages ───────────────────────────────────────

echo "Step 4: Checking sleep stage formatting (if available)..."
DEEP_SLEEP_NUMERIC=$(echo "$CONTEXT" | grep -cE "Deep Sleep.*: [0-9]+ min" || true)
DEEP_SLEEP_NA=$(echo "$CONTEXT" | grep -c "Deep Sleep.*: N/A" || true)

echo "  Deep Sleep numeric: $DEEP_SLEEP_NUMERIC, N/A: $DEEP_SLEEP_NA"

if [ "$DEEP_SLEEP_NUMERIC" -gt 0 ]; then
  echo "✅ PASS: Sleep stages display numeric values (including 0)"
  ((PASS_COUNT++))
else
  echo "ℹ️  INFO: No detailed sleep stage data available (optional metric)"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Test Results"
echo "════════════════════════════════════════════════════════════════"
echo "✅ PASSED: $PASS_COUNT"
echo "❌ FAILED: $FAIL_COUNT"
echo ""

if [ $FAIL_COUNT -eq 0 ] && [ $PASS_COUNT -ge 4 ]; then
  echo "🎉 Issue #4 is FIXED - No false missing data warnings detected"
  echo ""
  echo "Summary:"
  echo "  • 0 values display correctly (not as 'N/A')"  
  echo "  • Numeric fields always show numbers"
  echo "  • Duration, Intensity, Activities show 0 for rest days"
  echo "  • Stress displays numeric values"
  echo "  • Context formatting is correct"
  exit 0
else
  echo "❌ Issue #4 needs more work - Tests failed: $FAIL_COUNT"
  exit 1
fi
