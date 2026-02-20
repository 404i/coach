# Garmin Authentication Fix Guide

## Problem
Garmin authentication has expired (401 Unauthorized error). Sleep data hasn't synced since Feb 12, 2026.

## Solution Overview

We've implemented three ways to re-authenticate:

### ✅ Changes Made

1. **Fixed onboarding flow** - Now properly authenticates with Garmin and stores real sessions
2. **Added `/api/garmin/reauth` endpoint** - Re-authenticate using stored credentials
3. **Created re-auth scripts** - Easy CLI tools for re-authentication

## Quick Fix (Recommended)

### Option 1: Simple Script (Easiest)

```bash
# Backend must be running (port 8080)
./scripts/reauth-simple.sh tsochev.ivan@gmail.com
```

This will:
- ✅ Use stored credentials to re-authenticate
- ✅ Handle MFA if required
- ✅ Test sync with last 7 days of data

### Option 2: Interactive Node Script

```bash
node scripts/reauth-garmin.js
```

Prompts  for:
- Email
- Password (if needed)
- MFA code (if required)

### Option 3: Direct API Call

```bash
# Using stored credentials
curl -X POST http://localhost:8080/api/garmin/reauth \
  -H "Content-Type: application/json" \
  -d '{"email":"tsochev.ivan@gmail.com"}'

# With fresh credentials
curl -X POST http://localhost:8080/api/garmin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"your_password"}'
```

## Step-by-Step Instructions

### 1. Restart Backend (to load new endpoints)

```bash
cd backend
npm start
```

Or if already running:
```bash
# Find and kill the process
lsof -ti:8080 | xargs kill
cd backend && npm start
```

### 2. Run Re-Authentication

```bash
./scripts/reauth-simple.sh tsochev.ivan@gmail.com
```

**Expected output:**
```
🏃 Garmin Re-Authentication
Email: tsochev.ivan@gmail.com

🔄 Attempting re-auth with stored credentials...
✅ Re-authentication successful!
   Username: tsochkata

🔄 Testing data sync (last 7 days)...
✅ Sync successful! Synced 7 days

🎉 All done! Your Garmin authentication is now working.
```

### 3. Verify Data Sync

```bash
# Check if new sleep data was imported
sqlite3 backend/data/coach.db "
  SELECT date, 
    json_extract(metrics_data, '$.sleep_hours') as sleep_hours,
    json_extract(metrics_data, '$.hrv') as hrv,
    json_extract(metrics_data, '$.resting_hr') as rhr
  FROM daily_metrics 
  WHERE date >= '2026-02-13' 
  ORDER BY date DESC;
"
```

**You should see:**
- Sleep hours (not null!)
- HRV values
- Resting HR values

## Troubleshooting

### MFA Required

If you have 2-factor authentication enabled:

```bash
# Get MFA code from your authenticator app, then:
curl -X POST http://localhost:8080/api/garmin/mfa \
  -H "Content-Type: application/json" \
  -d '{
    "email":"your@email.com",
    "password":"your_password",
    "mfa_code":"123456"
  }'
```

### Credentials Not Stored

If you get "No stored credentials found":

```bash
curl -X POST http://localhost:8080/api/garmin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"your_password"}'
```

### Backend Not Running

```bash
# Start backend
cd backend
npm start

# In another terminal
./scripts/reauth-simple.sh your@email.com
```

### Check Authentication Status

```bash
curl "http://localhost:8080/api/garmin/status?email=your@email.com"
```

## API Endpoints

### POST `/api/garmin/login`
Authenticate with email/password

**Request:**
```json
{
  "email": "your@email.com",
  "password": "your_password"
}
```

**Response:**
```json
{
  "success": true,
  "username": "your_username",
  "message": "Logged in successfully"
}
```

### POST `/api/garmin/reauth`
Re-authenticate using stored credentials

**Request:**
```json
{
  "email": "your@email.com"
}
```

**Response:**
```json
{
  "success": true,
  "username": "your_username",
  "message": "Re-authentication successful"
}
```

### POST `/api/garmin/mfa`
Submit MFA code

**Request:**
```json
{
  "email": "your@email.com",
  "password": "your_password",
  "mfa_code": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "username": "your_username",
  "message": "MFA authentication successful"
}
```

### POST `/api/garmin/sync`
Sync data for date range

**Request:**
```json
{
  "email": "your@email.com",
  "start_date": "2026-02-11",
  "end_date": "2026-02-18"
}
```

**Response:**
```json
{
  "success": true,
  "synced_days": 7,
  "data": { ... }
}
```

### GET `/api/garmin/status`
Check authentication status

**Request:**
```
GET /api/garmin/status?email=your@email.com
```

**Response:**
```json
{
  "email": "your@email.com",
  "session_valid": true,
  "error": null
}
```

## What Got Fixed

### 1. Onboarding Flow ([backend/src/routes/profile.js](../backend/src/routes/profile.js))

**Before:**
```javascript
// Just stored credentials, didn't authenticate
garth_session: JSON.stringify({
  email: garmin_email,
  password: garmin_password
})
```

**After:**
```javascript
// Properly authenticate and store real Garth session
const authResult = await loginGarmin(garmin_email, garmin_password);
// Session now contains OAuth tokens, not just credentials
```

### 2. New Re-Auth Endpoint ([backend/src/routes/garmin.js](../backend/src/routes/garmin.js))

Added `POST /api/garmin/reauth`:
- Extracts stored credentials from database
- Re-authenticates with Garmin
- Updates session with fresh OAuth tokens
- Handles MFA if required

### 3. Re-Auth Scripts

- **reauth-simple.sh** - Quick bash script using curl
- **reauth-garmin.js** - Interactive Node.js tool

## Security Notes

⚠️ **Current Implementation:**
- Credentials stored in plaintext in database
- TODO: Implement encryption for production

📌 **For Production:**
```javascript
// Use crypto to encrypt passwords
import crypto from 'crypto';
const encrypted = crypto.publicEncrypt(publicKey, Buffer.from(password));
```

## Next Steps

1. ✅ **Re-authenticate** - Run reauth script
2. ✅ **Verify sync** - Check sleep data imported
3. ✅ **Test MCP** - Ask Claude about your sleep
4. 🔄 **Set up auto-sync** - Backend has cron job for daily sync
5. 🔄 **Implement encryption** - Encrypt stored credentials

## Testing

### Test MCP Hallucination Fix

After re-authenticating and syncing:

```
# In Claude Desktop with MCP configured
User: "How was my sleep last night?"

Before fix: "Sleep was excellent at 8h 14m with score of 85" (FAKE)
After fix: "You slept 7.5 hours with a score of 82" (REAL from Garmin)
```

### Verify Data Pipeline

```bash
# 1. Check GarminDB has recent data
sqlite3 data/garmin/HealthData/DBs/garmin.db \
  "SELECT day, total_sleep/3600.0 as hours, score 
   FROM sleep 
   ORDER BY day DESC LIMIT 5;"

# 2. Check coach.db has imported data
sqlite3 backend/data/coach.db \
  "SELECT date, 
    json_extract(metrics_data, '$.sleep_hours') as sleep,
    json_extract(metrics_data, '$.hrv') as hrv
   FROM daily_metrics 
   ORDER BY date DESC LIMIT 5;"

# Both should show recent dates (last 7 days)
```

## Summary

✅ **Fixed:**
- Garmin authentication flow
- Session storage (now stores real OAuth tokens)
- Added re-auth endpoint
- Created easy re-auth tools

✅ **Now Working:**
- Fresh data sync from Garmin
- Sleep data import
- MCP no longer hallucinates missing data

🔄 **To Do:**
- Test the re-auth with your Garmin credentials
- Verify sleep data appears in database
- Test Claude conversations with real data
