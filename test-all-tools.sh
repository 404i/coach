#!/bin/bash
# Comprehensive test script for Garmin Coach backend APIs
# Tests all main endpoints that MCP tools use

set -e

EMAIL="tsochev.ivan@gmail.com"
PROFILE_ID="default"
DATE=$(date +%Y-%m-%d)
BASE_URL="http://localhost:8088"

echo "🧪 Testing Garmin Coach Backend APIs"
echo "===================================="
echo ""
echo "Using:"
echo "  Email: $EMAIL"
echo "  Profile ID: $PROFILE_ID"
echo "  Date: $DATE"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_endpoint() {
    local name="$1"
    local endpoint="$2"
    local method="${3:-GET}"
    local body="$4"
    
    echo -n "Testing ${name}... "
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -X POST "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$body" \
            -w "\n%{http_code}")
    else
        response=$(curl -s "$BASE_URL$endpoint" -w "\n%{http_code}")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
        
        # Check for error in JSON response
        if echo "$body" | jq -e '.error' > /dev/null 2>&1; then
            error=$(echo "$body" | jq -r '.error')
            echo -e "  ${YELLOW}⚠ Warning: Response contains error: $error${NC}"
        fi
        
        # Show data freshness if present
        if echo "$body" | jq -e '.data_age_hours' > /dev/null 2>&1; then
            data_age=$(echo "$body" | jq -r '.data_age_hours')
            needs_sync=$(echo "$body" | jq -r '.needs_sync')
            echo "  Data age: ${data_age}h, Needs sync: $needs_sync"
        fi
        
        # Show summary info based on endpoint
        case "$name" in
            "Health Check")
                status=$(echo "$body" | jq -r '.services.database')
                activity_count=$(echo "$body" | jq -r '.database.statistics.activity_count')
                echo "  DB status: $status, Activities: $activity_count"
                ;;
            "Profile Lookup")
                sport=$(echo "$body" | jq -r '.profile.sport_type')
                mode=$(echo "$body" | jq -r '.profile.training_mode')
                echo "  Sport: $sport, Mode: $mode"
                ;;
            "Daily Context"|"Weekly Context")
                if echo "$body" | jq -e '.context' > /dev/null 2>&1; then
                    context_size=$(echo "$body" | jq -r '.context | length')
                    echo "  Context size: $context_size bytes"
                    # Check for key sections
                    if echo "$body" | jq -r '.context' | grep -q "Recovery Metrics"; then
                        echo "  ✓ Contains recovery metrics"
                    fi
                fi
                ;;
        esac
        
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $http_code)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        return 1
    fi
}

echo "📋 Core Endpoints"
echo "──────────────────"
test_endpoint "Health Check" "/api/health"
test_endpoint "Profile Lookup" "/api/profile?email=$EMAIL"
echo ""

echo "📊 Context Endpoints (MCP Tools)"
echo "────────────────────────────────"
test_endpoint "Daily Context" "/api/recommend/context" "POST" "{\"profile_id\":\"$PROFILE_ID\",\"date\":\"$DATE\"}"
test_endpoint "Weekly Context" "/api/recommend/context/week?profile_id=$PROFILE_ID&week_start=2026-03-31"
echo ""

echo "🏃 Activity & Analytics Endpoints"
echo "──────────────────────────────────"
test_endpoint "Recent Activities" "/api/activities/recent?email=$EMAIL&limit=5"
test_endpoint "Activity Summary" "/api/activities/summary?email=$EMAIL&days=7"
test_endpoint "Activity by Sport" "/api/activities/by-sport?email=$EMAIL&days=30"
test_endpoint "Multi-Activity Detection" "/api/activities/multi-activity?email=$EMAIL&start=2026-03-01&end=2026-04-03"
echo ""

echo "💤 Recovery & Metrics"
echo "────────────────────"
test_endpoint "Recovery Trends" "/api/analytics/recovery-trends?email=$EMAIL&days=7"
test_endpoint "Daily Metrics" "/api/daily-metrics?email=$EMAIL&start_date=2026-04-01&end_date=2026-04-03"
echo ""

echo "📈 Training Analysis"
echo "────────────────────"
test_endpoint "Training Load" "/api/analytics/training-load?email=$EMAIL&days=7"
test_endpoint "Weekly Progress" "/api/analytics/weekly-progress?email=$EMAIL&week_start=2026-03-31"
test_endpoint "Insights & Alerts" "/api/analytics/insights?email=$EMAIL&days=30"
echo ""

echo "🌦️  Weather & External"
echo "───────────────────────"
test_endpoint "Current Weather" "/api/weather?location=Sofia"
echo ""

echo "🔄 Strava Integration"
echo "─────────────────────"
test_endpoint "Strava Activities" "/api/strava/activities?email=$EMAIL&days=7"
echo ""

echo "===================================="
echo "✨ Test suite complete!"
echo ""
