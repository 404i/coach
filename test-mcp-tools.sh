#!/bin/bash
# Test MCP tool outputs to verify Phase 5 fixes
# Ensures tools return CLEAN CONTEXT without embedded coaching instructions

set -e

PROFILE_ID="default"
DATE=$(date +%Y-%m-%d)
BASE_URL="http://localhost:8088"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🔍 Testing MCP Tool Outputs (Phase 5 Verification)"
echo "=================================================="
echo ""

# Test 1: Daily Context (get_today_workout backend)
echo "📋 Test 1: get_today_workout context"
echo "──────────────────────────────────────"
echo "Endpoint: POST /api/recommend/context"
echo ""

response=$(curl -s -X POST "$BASE_URL/api/recommend/context" \
    -H "Content-Type: application/json" \
    -d "{\"profile_id\":\"$PROFILE_ID\",\"date\":\"$DATE\"}")

# Check response structure
if echo "$response" | jq -e '.context' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Response contains 'context' field${NC}"
    
    context=$(echo "$response" | jq -r '.context')
    
    # Verify it's markdown with LEDGER
    if echo "$context" | grep -q "# 📄 LEDGER.md"; then
        echo -e "${GREEN}✓ Context starts with LEDGER.md${NC}"
    else
        echo -e "${RED}✗ Missing LEDGER.md header${NC}"
    fi
    
    # Verify key sections exist
    sections=("athlete-profile.md" "recovery-metrics.md" "training-load.md" "recent-training.md")
    for section in "${sections[@]}"; do
        if echo "$context" | grep -q "$section"; then
            echo -e "${GREEN}✓ Contains section: $section${NC}"
        else
            echo -e "${RED}✗ Missing section: $section${NC}"
        fi
    done
    
    # ❌ Check for UNWANTED coaching instructions (should NOT be present)
    echo ""
    echo "Checking for unwanted coaching instructions..."
    
    bad_phrases=(
        "You are an AI coach"
        "Your Task: Analyze"
        "Generate workout recommendation"
        "Return a JSON object"
        "Provide 4 workout options"
    )
    
    issues_found=0
    for phrase in "${bad_phrases[@]}"; do
        if echo "$context" | grep -qi "$phrase"; then
            echo -e "${RED}✗ FOUND BAD PHRASE: \"$phrase\"${NC}"
            issues_found=$((issues_found + 1))
        fi
    done
    
    if [ $issues_found -eq 0 ]; then
        echo -e "${GREEN}✓ No coaching instructions found in context${NC}"
        echo -e "${GREEN}✓ Phase 5 fix VERIFIED - tools return clean context${NC}"
    else
        echo -e "${RED}✗ Phase 5 fix FAILED - $issues_found coaching instructions found${NC}"
    fi
    
    # Show context size
    context_size=$(echo "$context" | wc -c | tr -d ' ')
    echo ""
    echo "Context size: $context_size bytes"
    
    # Preview first 500 chars
    echo ""
    echo "Preview (first 500 chars):"
    echo "─────────────────────────────"
    echo "$context" | head -c 500
    echo ""
    echo "─────────────────────────────"
    
else
    echo -e "${RED}✗ Response missing 'context' field${NC}"
    echo "Response:"
    echo "$response" | jq '.'
fi

echo ""
echo ""

# Test 2: Weekly Context (get_weekly_plan backend)
echo "📅 Test 2: get_weekly_plan context"
echo "───────────────────────────────────"
echo "Endpoint: GET /api/recommend/context/week"
echo ""

response=$(curl -s "$BASE_URL/api/recommend/context/week?profile_id=$PROFILE_ID&week_start=2026-03-31")

if echo "$response" | jq -e '.context' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Response contains 'context' field${NC}"
    
    context=$(echo "$response" | jq -r '.context')
    
    # Check for bad phrases
    echo "Checking for unwanted coaching instructions..."
    
    bad_phrases=(
        "You are an AI coach"
        "Your Task:"
        "Generate a weekly plan"
        "Return a JSON object"
    )
    
    issues_found=0
    for phrase in "${bad_phrases[@]}"; do
        if echo "$context" | grep -qi "$phrase"; then
            echo -e "${RED}✗ FOUND BAD PHRASE: \"$phrase\"${NC}"
            issues_found=$((issues_found + 1))
        fi
    done
    
    if [ $issues_found -eq 0 ]; then
        echo -e "${GREEN}✓ No coaching instructions found in weekly context${NC}"
        echo -e "${GREEN}✓ Phase 5 fix VERIFIED for weekly context${NC}"
    else
        echo -e "${RED}✗ Phase 5 fix FAILED - $issues_found coaching instructions found${NC}"
    fi
    
    context_size=$(echo "$context" | wc -c | tr -d ' ')
    echo "Weekly context size: $context_size bytes"
    
else
    echo -e "${RED}✗ Response missing 'context' field${NC}"
fi

echo ""
echo ""

# Test 3: Verify tool DESCRIPTIONS (not responses) contain guidance
echo "🎯 Test 3: MCP Tool Definitions"
echo "────────────────────────────────"
echo "Checking tool descriptions contain proper guidance..."
echo ""

# Read tool definitions from deployed container
tool_def=$(docker exec garmin-ai-coach-mcp cat /app/mcp/lib/tool-definitions.js 2>/dev/null || echo "")

if [ -n "$tool_def" ]; then
    # Check get_today_workout description
    if echo "$tool_def" | grep -A 5 '"get_today_workout"' | grep -q "Get comprehensive training context"; then
        echo -e "${GREEN}✓ get_today_workout description says 'Get context'${NC}"
    else
        echo -e "${RED}✗ get_today_workout description incorrect${NC}"
    fi
    
    if echo "$tool_def" | grep -A 5 '"get_today_workout"' | grep -q "Use this data to analyze"; then
        echo -e "${GREEN}✓ Description tells LLM what to do with context${NC}"
    else
        echo -e "${YELLOW}⚠ Description might not guide LLM properly${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Could not read tool definitions from container${NC}"
fi

echo ""
echo "=================================================="
echo "✨ Phase 5 Verification Complete!"
echo ""
echo "Expected behavior:"
echo "  ✓ Backend /api/recommend/context returns CLEAN MARKDOWN"
echo "  ✓ No coaching instructions in response context"
echo "  ✓ Tool DESCRIPTION guides client LLM on what to do"
echo "  ✓ VS Code Copilot receives context, processes naturally"
echo ""
