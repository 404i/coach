#!/usr/bin/env python3
"""Test Garmin API endpoints to debug missing data"""
import sys
import json
from garth import Client
from datetime import datetime
from pathlib import Path

# Load session
script_dir = Path(__file__).parent
token_path = script_dir / 'data' / 'garmin_token.json'
with open(token_path) as f:
    token_data = json.load(f)
    session = token_data['garth_session']

client = Client()
client.loads(session)

date_str = '2026-02-17'  # Yesterday - should have data
date_obj = datetime.strptime(date_str, "%Y-%m-%d")

print(f"Testing endpoints for {date_str}")
print(f"Username:  {client.username}")
print("=" * 60)

# Try getting display name to find user ID
print("\n0. Getting user profile...")
try:
    profile = client.profile
    user_id = profile.get('profileId')
    print(f"✓ Profile found!")
    print(f"   Display Name: {profile.get('displayName')}")
    print(f"   User ID: {user_id}")
    print(f"   Full Name: {profile.get('fullName')}")
except Exception as e:
    print(f"✗ Profile Failed: {e}")
    user_id = None

# Test RHR - Try with user ID instead of email
print("\n1. Testing RHR endpoint...")
try:
    rhr_endpoint = f"/userstats-service/wellness/daily/{user_id if user_id else client.username}"
    params = {"fromDate": date_str, "untilDate": date_str, "metricId": 60}
    result = client.connectapi(rhr_endpoint, params=params)
    print(f"✓ RHR Success: {json.dumps(result, indent=2)[:200]}")
except Exception as e:
    print(f"✗ RHR Failed: {e}")

# Test Summary - Try with user ID
print("\n2. Testing Summary endpoint...")
try:
    summary_endpoint = f"/usersummary-service/usersummary/daily/{user_id if user_id else client.username}"
    params = {"calendarDate": date_str, "_": str(int(date_obj.timestamp() * 1000))}
    result = client.connectapi(summary_endpoint, params=params)
    print(f"✓ Summary Success!")
    print(f"   Keys: {list(result.keys())[:10]}")
    print(f"   Body Battery Charged: {result.get('bodyBatteryChargedValue')}")
    print(f"   Body Battery Drained: {result.get('bodyBatteryDrainedValue')}")
    print(f"   Avg Stress: {result.get('avgStressLevel')}")
    print(f"   Max Stress: {result.get('maxStressLevel')}")
    print(f"   Rest Stress Duration: {result.get('restStressDuration')}")
except Exception as e:
    print(f"✗ Summary Failed: {e}")

# Test Training Status
print("\n3. Testing Training Status endpoint...")
try:
    training_endpoint = f"/wellness-service/wellness/trainingStatus/mostRecent"
    result = client.connectapi(training_endpoint)
    print(f"✓ Training Status Success!")
    print(f"   Training Load: {result.get('activityTrainingLoad')}")
    print(f"   Acute Load: {result.get('acuteTrainingLoad')}")
    print(f"   Chronic Load: {result.get('chronicTrainingLoad')}")
except Exception as e:
    print(f"✗ Training Status Failed: {e}")

# Test HRV Status  
print("\n4. Testing HRV Status endpoint...")
try:
    hrv_endpoint = f"/hrv-service/hrv"
    params = {"date": date_str}
    result = client.connectapi(hrv_endpoint, params=params)
    print(f"✓ HRV Status Success!")
    print(f"   HRV: {result.get('avgHrv')}")
    print(f"   HRV Status: {result.get('hrvStatus')}")
except Exception as e:
    print(f"✗ HRV Status Failed: {e}")
