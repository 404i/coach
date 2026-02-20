#!/bin/bash
# Interactive Sync - Handles MFA codes from Garmin email

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  🏊 Garmin AI Coach - Sync with MFA${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 1: Load credentials
echo -e "${BLUE}[1/4]${NC} Loading encrypted credentials..."
eval "$($SCRIPT_DIR/credential-manager.sh load)"

if [ -z "$GARMIN_EMAIL" ]; then
    echo -e "${RED}✗${NC} No credentials found. Run: ./scripts/credential-manager.sh save"
    exit 1
fi

echo -e "${GREEN}✓${NC} Credentials loaded for: ${GARMIN_EMAIL:0:3}***@${GARMIN_EMAIL##*@}"
echo ""

# Step 2: Check for MFA
echo -e "${BLUE}[2/4]${NC} MFA Check"
echo ""
echo -e "${YELLOW}📧 Garmin may send a verification code to your email${NC}"
echo -e "   If you receive one, you'll enter it during sync"
echo ""
read -p "Press ENTER to start sync..."
echo ""

# Step 3: Sync GarminDB with MFA support
echo -e "${BLUE}[3/4]${NC} Syncing with Garmin Connect..."
cd "$PROJECT_ROOT"

export GARMIN_USER="$GARMIN_EMAIL"
export GARMIN_PASSWORD="$GARMIN_PASSWORD"

# Start sync - it will prompt for MFA if needed
echo ""
echo -e "${YELLOW}Starting sync...${NC}"
echo -e "${YELLOW}If prompted 'MFA code:', check your email and enter the code${NC}"
echo ""

./scripts/garmindb_sync_latest.sh

SYNC_EXIT=$?

if [ $SYNC_EXIT -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓${NC} GarminDB synced successfully"
else
    echo ""
    echo -e "${RED}✗${NC} Sync failed (exit code: $SYNC_EXIT)"
    echo ""
    echo -e "${YELLOW}Common issues:${NC}"
    echo "  • Wrong password"
    echo "  • Incorrect MFA code"
    echo "  • Network timeout"
    echo ""
    echo "Try again and watch for MFA prompt in your email"
    exit 1
fi

echo ""

# Step 4: Import to coach
echo -e "${BLUE}[4/4]${NC} Importing to AI Coach..."
echo ""

DAYS="${1:-7}"
PROFILE_ID="${PROFILE_ID:-test-athlete-1}"

python3 scripts/import_garmindb_to_coach.py \
    --profile-id "$PROFILE_ID" \
    --latest-days "$DAYS"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Sync Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Latest activities (including today's swim!) are now available"
echo "Ask Claude: 'How was my swim today?'"
echo ""
