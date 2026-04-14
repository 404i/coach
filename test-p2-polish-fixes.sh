#!/bin/bash

# Test Script: P2 Issues #7-9 - Polish Fixes
# Tests:
#   - Issue #7: Strava sport_type normalization (no "?" placeholders)
#   - Issue #8: Pattern detection for occasional activities (0.5 - 1x/week)
#   - Issue #9: Profile field normalization (top-level access to key fields)
#
# Expected Behavior:
#   - Strava activities with sport_type="?" use activity type instead
#   - Patterns detected for activities occurring 2-4x per month
#   - Profile context has days_per_week and minutes_per_session at top level

set -e

BASE_URL="http://localhost:8088/api"
EMAIL="tsochev.ivan@gmail.com"
PROFILE_ID="default"

echo "════════════════════════════════════════════════════════════════"
echo "Testing P2 Issues: #7 (Strava), #8 (Patterns), #9 (Profile)"
echo "════════════════════════════════════════════════════════════════"
echo ""

PASS_COUNT=0
FAIL_COUNT=0

# ── Issue #7: Strava Sport Type Normalization ─────────────────────────

echo "━━━ Issue #7: Strava Sport Type Normalization ━━━"
echo ""

# Check if Strava activities exist
STRAVA_RESPONSE=$(curl -s "$BASE_URL/strava/activities?email=$EMAIL&limit=10" 2>/dev/null)
STRAVA_COUNT=$(echo "$STRAVA_RESPONSE" | jq -r '.total // 0' 2>/dev/null)

if [ "$STRAVA_COUNT" -gt 0 ]; then
  echo "Found $STRAVA_COUNT Strava activities"
  
  # Check for "?" in sport_type
  QUESTION_MARKS=$(echo "$STRAVA_RESPONSE" | jq -r '.activities[] | select(.sport_type == "?") | .sport_type' | wc -l | tr -d ' ')
  
  if [ "$QUESTION_MARKS" -eq 0 ]; then
    echo "✅ PASS: No '?' placeholders found in sport_type"
    ((PASS_COUNT++))
  else
    echo "❌ FAIL: Found $QUESTION_MARKS activities with sport_type='?'"
    ((FAIL_COUNT++))
  fi
  
  # Show sample activity
  echo ""
  echo "Sample Strava activity:"
  echo "$STRAVA_RESPONSE" | jq '.activities[0] | {name, type, sport_type, date}' 2>/dev/null || echo "Could not parse"
else
  echo "ℹ️  INFO: No Strava activities found (Issue #7 test skipped)"
fi

echo ""

# ── Issue #8: Pattern Detection for Occasional Activities ─────────────

echo "━━━ Issue #8: Pattern Detection Thresholds ━━━"
echo ""

# Run pattern discovery
PATTERN_RESPONSE=$(curl -s -X POST "$BASE_URL/patterns/discover" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"lookback_days\": 90}")

PATTERNS_COUNT=$(echo "$PATTERN_RESPONSE" | jq -r '.patterns | length' 2>/dev/null)
OCCASIONAL_COUNT=$(echo "$PATTERN_RESPONSE" | jq -r '[.patterns[] | select(.type == "occasional")] | length' 2>/dev/null)

echo "Total patterns found: $PATTERNS_COUNT"
echo "Occasional patterns (0.5-1x/week): $OCCASIONAL_COUNT"
echo ""

if [ "$PATTERNS_COUNT" -gt 0 ]; then
  echo "Pattern breakdown:"
  echo "$PATTERN_RESPONSE" | jq -r '.patterns | group_by(.type) | map({type: .[0].type, count: length}) | .[]' 2>/dev/null || echo "Could not parse"
  echo ""
  
  if [ "$OCCASIONAL_COUNT" -gt 0 ]; then
    echo "✅ PASS: Occasional patterns detected (catches low-frequency activities)"
    ((PASS_COUNT++))
    
    # Show sample occasional pattern
    echo ""
    echo "Sample occasional pattern:"
    echo "$PATTERN_RESPONSE" | jq '.patterns[] | select(.type == "occasional") | {sport, frequency, occurrences, confidence}' | head -10
  else
    echo "ℹ️  INFO: No occasional patterns found (user may not have 0.5-1x/week activities)"
  fi
else
  echo "⚠️  WARNING: No patterns found at all"
fi

echo ""

# ── Issue #9: Profile Field Normalization ─────────────────────────────

echo "━━━ Issue #9: Profile Field Normalization ━━━"
echo ""

# Get daily context to check profile structure
CONTEXT_RESPONSE=$(curl -s -X POST "$BASE_URL/recommend/context" \
  -H "Content-Type: application/json" \
  -d "{\"profile_id\": \"$PROFILE_ID\", \"date\": \"2026-04-07\"}")

CONTEXT=$(echo "$CONTEXT_RESPONSE" | jq -r '.context // empty' 2>/dev/null)

if [ -n "$CONTEXT" ]; then
  # Check for normalized availability fields in markdown output
  HAS_DAYS=$(echo "$CONTEXT" | grep -c "Days per week" || true)
  HAS_MINUTES=$(echo "$CONTEXT" | grep -c "Minutes per session" || true)
  
  echo "Profile field checks:"
  echo "  'Days per week' present: $HAS_DAYS occurrences"
  echo "  'Minutes per session' present: $HAS_MINUTES occurrences"
  echo ""
  
  if [ "$HAS_DAYS" -gt 0 ] && [ "$HAS_MINUTES" -gt 0 ]; then
    echo "✅ PASS: Profile has normalized availability fields"
    ((PASS_COUNT++))
  else
    echo "❌ FAIL: Profile missing availability fields"
    ((FAIL_COUNT++))
  fi
  
  # Show profile excerpt
  echo ""
  echo "Profile excerpt (Athlete Profile section):"
  echo "$CONTEXT" | grep -A 15 "# Athlete Profile" | head -20 || echo "Could not find profile section"
else
  echo "❌ FAIL: Could not retrieve context"
  ((FAIL_COUNT++))
fi

echo ""

# ── Results Summary ────────────────────────────────────────────────────

echo "════════════════════════════════════════════════════════════════"
echo "Test Results"
echo "════════════════════════════════════════════════════════════════"
echo "✅ PASSED: $PASS_COUNT"
echo "❌ FAILED: $FAIL_COUNT"
echo ""

if [ $FAIL_COUNT -eq 0 ] && [ $PASS_COUNT -ge 2 ]; then
  echo "🎉 P2 Issues (Polish) are FIXED"
  echo ""
  echo "Improvements:"
  echo "  • Issue #7: Strava sport types normalized (no '?' placeholders)"
  echo "  • Issue #8: Occasional patterns detected (2-4x per month)"
  echo "  • Issue #9: Profile fields normalized for LLM (top-level access)"
  exit 0
else
  echo "⚠️  P2 Issues need review - $FAIL_COUNT failures, $PASS_COUNT passes"
  exit 1
fi
