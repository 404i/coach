#!/usr/bin/env python3
"""Quick test to sync data and update database with new training readiness metrics"""

import sqlite3
import json
from datetime import date, timedelta
from garth import Client, DailySummary
from garth.data import MorningTrainingReadinessData

# Load session
conn = sqlite3.connect('backend/data/coach.db')
cursor = conn.execute('SELECT garth_session FROM users WHERE garmin_email = ?', ('tsochev.ivan@gmail.com',))
session_data = cursor.fetchone()[0]

# Get user ID
user_cursor = conn.execute('SELECT id FROM users WHERE garmin_email = ?', ('tsochev.ivan@gmail.com',))
user_id = user_cursor.fetchone()[0]

client = Client()
client.loads(session_data)

# Test for yesterday
test_date = date(2026, 2, 17)

# Get summary
summary = DailySummary.get(test_date, client=client)

# Get training readiness  
readiness = MorningTrainingReadinessData.get(test_date, client=client)

# Prepare metrics
metrics_data = {
    "stress_avg": summary.average_stress_level,
    "body_battery_drained": summary.body_battery_at_wake_time - summary.body_battery_lowest_value if summary.body_battery_at_wake_time else None,
    "training_load": readiness.acute_load,
    "recovery_score": readiness.score,
    "recovery_time": round(readiness.recovery_time / 60, 1) if readiness.recovery_time else None
}

print(f"Metrics for {test_date}:")
print(json.dumps(metrics_data, indent=2))

# Update database
cursor = conn.execute(
    "SELECT id, metrics_data FROM daily_metrics WHERE profile_id = ? AND date = ?",
    (user_id, str(test_date))
)
row = cursor.fetchone()

if row:
    record_id, existing_data = row
    existing_metrics = json.loads(existing_data)
    
    # Update with new values
    existing_metrics.update(metrics_data)
    
    conn.execute(
        "UPDATE daily_metrics SET metrics_data = ?, updated_at = datetime('now') WHERE id = ?",
        (json.dumps(existing_metrics), record_id)
    )
    conn.commit()
    print(f"\n✓ Updated daily_metrics record {record_id}")
else:
    print(f"\n✗ No record found for {test_date}")

# Verify update
verify_cursor = conn.execute(
    "SELECT metrics_data FROM daily_metrics WHERE profile_id = ? AND date = ?",
    (user_id, str(test_date))
)
updated_data = json.loads(verify_cursor.fetchone()[0])
print(f"\nVerified updated metrics:")
print(f"  stress_avg: {updated_data.get('stress_avg')}")
print(f"  body_battery_drained: {updated_data.get('body_battery_drained')}")
print(f"  training_load: {updated_data.get('training_load')}")
print(f"  recovery_score: {updated_data.get('recovery_score')}")
print(f"  recovery_time: {updated_data.get('recovery_time')}")

conn.close()
