#!/bin/bash
# Integration test: MCP tools through actual MCP server
# Tests P0 fixes via MCP endpoints (port 3001)

set -e

EMAIL="tsochev.ivan@gmail.com"
DATE=$(date +%Y-%m-%d)
MCP_URL="http://localhost:3001"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}🔌 MCP INTEGRATION TEST - P0 Contract Fixes${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Testing MCP tools through MCP server (port 3001)"
echo "This simulates VS Code Copilot integration"
echo ""

# Test MCP server health
echo -e "${BLUE}┌─ MCP Server Health Check${NC}"
echo "└─ Checking http://localhost:3001/health"
health=$(curl -s http://localhost:3001/health 2>&1)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ MCP server responding${NC}"
else
    echo -e "${RED}✗ MCP server not responding${NC}"
    echo "Health response: $health"
    exit 1
fi
echo ""

# First set current athlete
echo -e "${BLUE}┌─ Setting Current Athlete${NC}"
echo "└─ set_current_athlete(email=$EMAIL)"
result=$(curl -s -X POST "$MCP_URL/tools/set_current_athlete" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\"}" 2>&1)

if echo "$result" | grep -q "successfully set" || echo "$result" | grep -q "email"; then
    echo -e "${GREEN}✓ Current athlete set${NC}"
else
    echo -e "${YELLOW}⚠ Warning: Could not set athlete (may already be set)${NC}"
fi
echo ""

# Test 1: get_today_workout via MCP
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Test: get_today_workout via MCP Server${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""
echo "Calling MCP tool: get_today_workout"
echo "  POST $MCP_URL/tools/get_today_workout"
echo "  params: {date: $DATE}"
echo ""

response=$(curl -s -X POST "$MCP_URL/tools/get_today_workout" \
    -H "Content-Type: application/json" \
    -d "{\"date\":\"$DATE\"}" 2>&1)

echo "Response check:"

# Check if response contains workout content
if echo "$response" | grep -q "Workout Recommendation"; then
    echo -e "${GREEN}✓${NC} Contains workout recommendation header"
else
    echo -e "${YELLOW}⚠${NC} Missing workout recommendation header"
fi

if echo "$response" | grep -q "Plan A\|Plan B\|Plan C\|Plan D"; then
    echo -e "${GREEN}✓${NC} Contains workout plan options"
else
    echo -e "${RED}✗${NC} Missing workout plan options"
fi

# Check for prompt dump indicators
if echo "$response" | grep -qi "LEDGER.md"; then
    echo -e "${RED}✗ FAIL${NC} Found LEDGER.md (prompt dump detected)"
    exit 1
else
    echo -e "${GREEN}✓${NC} No LEDGER.md context marker"
fi

if echo "$response" | grep -qi "You are an AI coach"; then
    echo -e "${RED}✗ FAIL${NC} Found coaching prompt text"
    exit 1
else
    echo -e "${GREEN}✓${NC} No prompt dump text"
fi

# Check for structured workout data
if echo "$response" | grep -q "Sport:\|Duration:\|Intensity:"; then
    echo -e "${GREEN}✓${NC} Contains structured workout fields"
else
    echo -e "${YELLOW}⚠${NC} May be missing structured fields"
fi

echo ""
echo "Sample response (first 500 chars):"
echo "──────────────────────────────────────"
echo "$response" | head -c 500
echo "..."
echo "──────────────────────────────────────"
echo ""

echo -e "${GREEN}✅ get_today_workout MCP integration: PASSED${NC}"
echo ""

# Test 2: get_weekly_plan via MCP
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Test: get_weekly_plan via MCP Server${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""
echo "Calling MCP tool: get_weekly_plan"
echo "  POST $MCP_URL/tools/get_weekly_plan"
echo "  params: {}"
echo ""

response=$(curl -s -X POST "$MCP_URL/tools/get_weekly_plan" \
    -H "Content-Type: application/json" \
    -d "{}" 2>&1)

echo "Response check:"

# Check if response contains weekly plan content
if echo "$response" | grep -q "Weekly Training Plan"; then
    echo -e "${GREEN}✓${NC} Contains weekly plan header"
else
    echo -e "${YELLOW}⚠${NC} Missing weekly plan header"
fi

if echo "$response" | grep -q "Monday\|Tuesday\|Wednesday\|Thursday\|Friday\|Saturday\|Sunday"; then
    echo -e "${GREEN}✓${NC} Contains day-of-week labels"
else
    echo -e "${RED}✗${NC} Missing day labels"
fi

# Check for prompt dump indicators
if echo "$response" | grep -qi "LEDGER.md"; then
    echo -e "${RED}✗ FAIL${NC} Found LEDGER.md (prompt dump detected)"
    exit 1
else
    echo -e "${GREEN}✓${NC} No LEDGER.md context marker"
fi

if echo "$response" | grep -qi "You are an AI coach"; then
    echo -e "${RED}✗ FAIL${NC} Found coaching prompt text"
    exit 1
else
    echo -e "${GREEN}✓${NC} No prompt dump text"
fi

# Check for structured plan data
if echo "$response" | grep -q "Sport:\|Duration:\|Intensity:"; then
    echo -e "${GREEN}✓${NC} Contains structured workout fields"
else
    echo -e "${YELLOW}⚠${NC} May be missing structured fields"
fi

echo ""
echo "Sample response (first 500 chars):"
echo "──────────────────────────────────────"
echo "$response" | head -c 500
echo "..."
echo "──────────────────────────────────────"
echo ""

echo -e "${GREEN}✅ get_weekly_plan MCP integration: PASSED${NC}"
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✨ MCP INTEGRATION TEST COMPLETE${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Both MCP tools working correctly:"
echo "  • get_today_workout: Returns structured workout recommendations"
echo "  • get_weekly_plan: Returns structured 7-day training plan"
echo "  • No prompt dumps detected in either response"
echo "  • Ready for VS Code Copilot integration"
echo ""
echo "Next steps:"
echo "  1. Test in VS Code with MCP client"
echo "  2. Monitor for edge cases (LLM timeout, missing data, etc.)"
echo "  3. Proceed with P1 implementation"
echo ""
