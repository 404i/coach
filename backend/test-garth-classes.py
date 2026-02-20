#!/usr/bin/env python3
"""Test garth built-in classes for wellness data."""

import sqlite3
from datetime import date, timedelta
from garth import Client, DailyStress, DailyBodyBatteryStress, DailyTrainingStatus, DailySummary, GarminScoresData
import json

# Load session from database
conn = sqlite3.connect('backend/data/coach.db')
cursor = conn.execute('SELECT garth_session FROM users WHERE garmin_email = ?', ('tsochev.ivan@gmail.com',))
session_data = cursor.fetchone()[0]
conn.close()

client = Client()
client.loads(session_data)

test_date = date.today() - timedelta(days=1)  # Yesterday
print(f"Testing garth classes for {test_date}")
print("=" * 60)

# Test DailyStress
print("\n1. DailyStress...")
try:
    stress = DailyStress.get(test_date, client=client)
    print(f"✓ DailyStress Success!")
    print(f"   Data: {json.dumps(stress, indent=2, default=str)[:500]}")
except Exception as e:
    print(f"✗ DailyStress Failed: {e}")

# Test DailyBodyBatteryStress  
print("\n2. DailyBodyBatteryStress...")
try:
    body_battery = DailyBodyBatteryStress.get(test_date, client=client)
    print(f"✓ DailyBodyBatteryStress Success!")
    print(f"   Data: {json.dumps(body_battery, indent=2, default=str)[:500]}")
except Exception as e:
    print(f"✗ DailyBodyBatteryStress Failed: {e}")

# Test DailySummary
print("\n3. DailySummary...")
try:
    summary = DailySummary.get(test_date, client=client)
    print(f"✓ DailySummary Success!")
    print(f"   Data: {json.dumps(summary, indent=2, default=str)[:500]}")
except Exception as e:
    print(f"✗ DailySummary Failed: {e}")

# Test DailyTrainingStatus
print("\n4. DailyTrainingStatus...")
try:
    training = DailyTrainingStatus.get(test_date, client=client)
    print(f"✓ DailyTrainingStatus Success!")
    print(f"   Data: {json.dumps(training, indent=2, default=str)[:500]}")
except Exception as e:
    print(f"✗ DailyTrainingStatus Failed: {e}")

# Test GarminScoresData
print("\n5. GarminScoresData...")
try:
    scores = GarminScoresData.get(test_date, client=client)
    print(f"✓ GarminScoresData Success!")
    print(f"   Data: {json.dumps(scores, indent=2, default=str)[:500]}")
except Exception as e:
    print(f"✗ GarminScoresData Failed: {e}")

print("\n" + "=" * 60)
print("Testing complete!")
