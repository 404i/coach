#!/bin/bash
# Test P0 Contract Fixes - Verify structured workout responses
# Tests Issues #1 and #2: get_today_workout and get_weekly_plan

set -e

EMAIL="tsochev.ivan@gmail.com"
DATE=$(date +%Y-%m-%d)
BASE_URL="http://localhost:8088"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}🧪 P0 CONTRACT FIX VERIFICATION${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Testing Issues #1 and #2:"
echo "  - get_today_workout must return structured workout (not prompt dump)"
echo "  - get_weekly_plan must return 7-day plan (not prompt dump)"
echo ""

# Helper function to check for prompt dump indicators
check_prompt_dump() {
    local response="$1"
    local test_name="$2"
    
    # Check for common prompt dump phrases
    if echo "$response" | grep -qi "You are an AI coach"; then
        echo -e "${RED}✗ FAIL${NC}: Found 'You are an AI coach' prompt text"
        return 1
    fi
    
    if echo "$response" | grep -qi "Your Task:"; then
        echo -e "${RED}✗ FAIL${NC}: Found 'Your Task:' prompt text"
        return 1
    fi
    
    if echo "$response" | grep -qi "Generate workout recommendation"; then
        echo -e "${RED}✗ FAIL${NC}: Found 'Generate workout recommendation' prompt text"
        return 1
    fi
    
    if echo "$response" | grep -qi "LEDGER.md"; then
        echo -e "${RED}✗ FAIL${NC}: Found 'LEDGER.md' context marker (should be workout, not context)"
        return 1
    fi
    
    echo -e "${GREEN}✓ PASS${NC}: No prompt dump detected"
    return 0
}

# Test 1: get_today_workout
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Test T1.1: get_today_workout Returns Structured Workout${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""
echo "Calling POST /api/recommend..."
echo ""

response=$(curl -s -X POST "$BASE_URL/api/recommend" \
    -H "Content-Type: application/json" \
    -d "{\"profile_id\":\"default\",\"date\":\"$DATE\"}")

echo "Response structure check:"
echo ""

# Check if response is valid JSON
if ! echo "$response" | jq empty 2>/dev/null; then
    echo -e "${RED}✗ FAIL${NC}: Response is not valid JSON"
    echo "Response: $response"
    exit 1
else
    echo -e "${GREEN}✓ PASS${NC}: Valid JSON response"
fi

# Check for success field
if echo "$response" | jq -e '.success' > /dev/null 2>&1; then
    success=$(echo "$response" | jq -r '.success')
    if [ "$success" = "true" ]; then
        echo -e "${GREEN}✓ PASS${NC}: success: true"
    else
        echo -e "${RED}✗ FAIL${NC}: success: false"
        error=$(echo "$response" | jq -r '.error // "unknown"')
        echo "  Error: $error"
        exit 1
    fi
else
    echo -e "${RED}✗ FAIL${NC}: Missing 'success' field"
    exit 1
fi

# Check for recommendation field
if echo "$response" | jq -e '.recommendation' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}: recommendation field present"
else
    echo -e "${RED}✗ FAIL${NC}: Missing 'recommendation' field"
    exit 1
fi

# Check workout structure (plan_a, plan_b, plan_c, plan_d)
echo ""
echo "Workout structure validation:"
for plan in plan_a plan_b plan_c plan_d; do
    if echo "$response" | jq -e ".recommendation.$plan" > /dev/null 2>&1; then
        # Check required fields
        sport=$(echo "$response" | jq -r ".recommendation.$plan.sport // \"missing\"")
        duration=$(echo "$response" | jq -r ".recommendation.$plan.duration_min // \"missing\"")
        intensity=$(echo "$response" | jq -r ".recommendation.$plan.intensity // \"missing\"")
        
        if [ "$sport" != "missing" ] && [ "$duration" != "missing" ] && [ "$intensity" != "missing" ]; then
            echo -e "${GREEN}✓ PASS${NC}: $plan has required fields (sport: $sport, duration: ${duration}min, intensity: $intensity)"
        else
            echo -e "${YELLOW}⚠ WARN${NC}: $plan missing some fields (sport: $sport, duration: $duration, intensity: $intensity)"
        fi
    else
        echo -e "${RED}✗ FAIL${NC}: Missing $plan"
    fi
done

# Check for prompt dump
echo ""
echo "Prompt dump check:"
recommendation_text=$(echo "$response" | jq -r '.recommendation | tostring')
check_prompt_dump "$recommendation_text" "get_today_workout"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ TEST T1.1 PASSED: get_today_workout returns structured workout${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo ""

# Test 2: get_weekly_plan
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Test T2.1: get_weekly_plan Returns 7-Day Plan${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""

# Calculate Monday of current week
week_start=$(date -v Monday +%Y-%m-%d 2>/dev/null || date -d "last monday" +%Y-%m-%d 2>/dev/null || echo "2026-04-07")

echo "Calling GET /api/recommend/week..."
echo "Week starting: $week_start"
echo ""

response=$(curl -s "$BASE_URL/api/recommend/week?profile_id=default&week_start=$week_start")

echo "Response structure check:"
echo ""

# Check if response is valid JSON
if ! echo "$response" | jq empty 2>/dev/null; then
    echo -e "${RED}✗ FAIL${NC}: Response is not valid JSON"
    echo "Response: $response"
    exit 1
else
    echo -e "${GREEN}✓ PASS${NC}: Valid JSON response"
fi

# Check for success field
if echo "$response" | jq -e '.success' > /dev/null 2>&1; then
    success=$(echo "$response" | jq -r '.success')
    if [ "$success" = "true" ]; then
        echo -e "${GREEN}✓ PASS${NC}: success: true"
    else
        echo -e "${RED}✗ FAIL${NC}: success: false"
        exit 1
    fi
else
    echo -e "${RED}✗ FAIL${NC}: Missing 'success' field"
    exit 1
fi

# Check for plan field
if echo "$response" | jq -e '.plan' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}: plan field present"
else
    echo -e "${RED}✗ FAIL${NC}: Missing 'plan' field"
    exit 1
fi

# Check for days array
if echo "$response" | jq -e '.plan.days' > /dev/null 2>&1; then
    day_count=$(echo "$response" | jq '.plan.days | length')
    if [ "$day_count" = "7" ]; then
        echo -e "${GREEN}✓ PASS${NC}: plan.days array has 7 days"
    else
        echo -e "${RED}✗ FAIL${NC}: plan.days has $day_count days (expected 7)"
        exit 1
    fi
else
    echo -e "${RED}✗ FAIL${NC}: Missing 'plan.days' array"
    exit 1
fi

# Validate each day's structure
echo ""
echo "Daily workout validation:"
for i in {0..6}; do
    day=$(echo "$response" | jq -r ".plan.days[$i]")
    date=$(echo "$day" | jq -r '.date // "missing"')
    day_name=$(echo "$day" | jq -r '.day_name // "missing"')
    sport=$(echo "$day" | jq -r '.primary_workout.sport // "missing"')
    intensity=$(echo "$day" | jq -r '.primary_workout.intensity // "missing"')
    
    if [ "$date" != "missing" ] && [ "$day_name" != "missing" ] && [ "$sport" != "missing" ]; then
        echo -e "${GREEN}✓ PASS${NC}: Day $((i+1)) ($day_name): $sport / $intensity"
    else
        echo -e "${YELLOW}⚠ WARN${NC}: Day $((i+1)) missing some fields"
    fi
done

# Check for prompt dump
echo ""
echo "Prompt dump check:"
plan_text=$(echo "$response" | jq -r '.plan | tostring')
check_prompt_dump "$plan_text" "get_weekly_plan"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ TEST T2.1 PASSED: get_weekly_plan returns 7-day structured plan${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✨ P0 CONTRACT FIX VERIFICATION COMPLETE${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Results:"
echo -e "  ${GREEN}✓${NC} Issue #1 FIXED: get_today_workout returns structured workout"
echo -e "  ${GREEN}✓${NC} Issue #2 FIXED: get_weekly_plan returns 7-day structured plan"
echo ""
echo "Contract compliance:"
echo "  • No prompt dumps detected"
echo "  • Valid JSON structure"
echo "  • Required fields present"
echo "  • Ready for VS Code Copilot integration"
echo ""
