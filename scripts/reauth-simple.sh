#!/usr/bin/env bash
# Simple Garmin Re-Authentication Script
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8080}"
EMAIL="${1:-}"

if [ -z "$EMAIL" ]; then
  echo "Usage: ./reauth-simple.sh <email>"
  echo "Example: ./reauth-simple.sh your@email.com"
  exit 1
fi

echo "🏃 Garmin Re-Authentication"
echo "Email: $EMAIL"
echo ""

# Try re-auth with stored credentials first
echo "🔄 Attempting re-auth with stored credentials..."
REAUTH_RESULT=$(curl -s -X POST "$API_BASE/api/garmin/reauth" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\"}")

if echo "$REAUTH_RESULT" | grep -q '"success":true'; then
  echo "✅ Re-authentication successful!"
  USERNAME=$(echo "$REAUTH_RESULT" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
  echo "   Username: $USERNAME"
  
  # Test sync
  echo ""
  echo "🔄 Testing data sync (last 7 days)..."
  TODAY=$(date -u +%Y-%m-%d)
  WEEK_AGO=$(date -u -v-7d +%Y-%m-%d 2>/dev/null || date -u -d '7 days ago' +%Y-%m-%d)
  
  SYNC_RESULT=$(curl -s -X POST "$API_BASE/api/garmin/sync" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"start_date\":\"$WEEK_AGO\",\"end_date\":\"$TODAY\"}")
  
  if echo "$SYNC_RESULT" | grep -q '"success":true'; then
    DAYS=$(echo "$SYNC_RESULT" | grep -o '"synced_days":[0-9]*' | cut -d':' -f2)
    echo "✅ Sync successful! Synced $DAYS days"
    echo ""
    echo "🎉 All done! Your Garmin authentication is now working."
  else
    echo "⚠️  Sync failed:"
    echo "$SYNC_RESULT" | grep -o '"message":"[^"]*"' | cut -d'"' -f4
  fi
  
elif echo "$REAUTH_RESULT" | grep -q '"mfa_required":true'; then
  echo "📱 MFA Required!"
  echo ""
  echo "Please complete authentication:"
  echo "1. Get your MFA code from your 2FA app"
  echo "2. Run: curl -X POST $API_BASE/api/garmin/mfa \\"
  echo "     -H 'Content-Type: application/json' \\"
  echo "     -d '{\"email\":\"$EMAIL\",\"password\":\"YOUR_PASSWORD\",\"mfa_code\":\"123456\"}'"
  
else
  echo "❌ Re-authentication failed"
  echo "$REAUTH_RESULT"
  echo ""
  echo "Please authenticate manually:"
  echo "curl -X POST $API_BASE/api/garmin/login \\"
  echo "  -H 'Content-Type: application/json' \\"
  echo "  -d '{\"email\":\"$EMAIL\",\"password\":\"YOUR_PASSWORD\"}'"
fi
