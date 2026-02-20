#!/bin/bash
# Quick Sync - Sync latest Garmin data using encrypted credentials

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Garmin AI Coach - Quick Sync${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 1: Load credentials
echo -e "${BLUE}[1/3]${NC} Loading encrypted credentials..."
eval "$($SCRIPT_DIR/credential-manager.sh load)"

if [ -z "$GARMIN_EMAIL" ]; then
    echo -e "${YELLOW}No credentials found. Setting up...${NC}"
    echo ""
    $SCRIPT_DIR/credential-manager.sh save
    echo ""
    eval "$($SCRIPT_DIR/credential-manager.sh load)"
fi

echo -e "${GREEN}✓${NC} Credentials loaded"
echo ""

# Step 2: Sync GarminDB
echo -e "${BLUE}[2/3]${NC} Syncing with Garmin Connect..."
cd "$PROJECT_ROOT"

export GARMIN_USER="$GARMIN_EMAIL"
export GARMIN_PASSWORD="$GARMIN_PASSWORD"

# Check if MFA code is needed
echo -e "${YELLOW}Note:${NC} If Garmin sends MFA code to your email, you'll be prompted"
echo ""

# Prompt for MFA code if needed
read -p "Did you receive an MFA code via email? (y/n, default n): " NEED_MFA
if [[ "$NEED_MFA" =~ ^[Yy]$ ]]; then
    read -p "Enter MFA code from email: " MFA_CODE
    export GARMIN_MFA_CODE="$MFA_CODE"
    echo ""
fi

./scripts/garmindb_sync_latest.sh

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠${NC}  Sync had issues. If MFA is required, run again with code."
    echo -e "${YELLOW}💡${NC} Check your email for Garmin verification code"
    exit 1
fi

echo -e "${GREEN}✓${NC} GarminDB synced"
echo ""

# Step 3: Import to coach
echo -e "${BLUE}[3/3]${NC} Importing to AI Coach..."

DAYS="${1:-7}"
PROFILE_ID="${PROFILE_ID:-test-athlete-1}"

python3 scripts/import_garmindb_to_coach.py \
    --profile-id "$PROFILE_ID" \
    --latest-days "$DAYS"

echo ""
echo -e "${GREEN}✓${NC} Sync complete!"
echo ""
echo "Latest activities are now available in Claude Desktop"
echo ""
