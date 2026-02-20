#!/usr/bin/env python3
"""
Test all available garth data types that correspond to Garmin Connect categories.
This will show us what data we can actually retrieve.
"""

import sys
from datetime import date, timedelta
from pathlib import Path
import json

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

# Import garth data classes
from garth import Client
from garth.data import (
    DailySummary,
    DailyBodyBatteryStress,
    DailySleepData,
    DailyHeartRate,
    HRVData,
    GarminScoresData,
    TrainingReadinessData,
    MorningTrainingReadinessData,
    BodyBatteryData,
)

def test_all_data_types():
    """Test all garth data types for yesterday's data"""
    
    # Load session from database export
    token_file = Path(__file__).parent / "data" / "garmin_token.json"
    client = Client()
    
    # Load the base64 encoded session (it's stored as a JSON string in the export)
    with open(token_file) as f:
        data = json.load(f)
        # Remove the outer JSON string wrapping if it exists
        session = data['garth_session']
        if isinstance(session, str) and session.startswith('"'):
            session = json.loads(session)
        client.loads(session)
    
    # Test for yesterday (more likely to have complete data)
    test_date = date.today() - timedelta(days=1)
    print(f"Testing data for: {test_date}")
    print("=" * 70)
    
    # 1. DAILY SUMMARY (resting HR, stress, body battery)
    print("\n1. DAILY SUMMARY")
    print("-" * 70)
    try:
        summary = DailySummary.get(test_date, client=client)
        print(f"✓ DailySummary retrieved")
        print(f"  Resting HR: {summary.resting_heart_rate}")
        print(f"  Avg Stress: {summary.average_stress_level}")
        print(f"  Max Stress: {summary.max_stress_level}")
        print(f"  Body Battery - Wake: {summary.body_battery_at_wake_time}")
        print(f"  Body Battery - Highest: {summary.body_battery_highest_value}")
        print(f"  Body Battery - Lowest: {summary.body_battery_lowest_value}")
        print(f"  Total Steps: {summary.total_steps}")
        print(f"  Total Distance (m): {summary.total_distance_meters}")
        
        # Print all non-private attributes
        print(f"\n  All Summary Fields:")
        for attr in dir(summary):
            if not attr.startswith('_') and not callable(getattr(summary, attr)):
                value = getattr(summary, attr)
                if value is not None:
                    print(f"    {attr}: {value}")
    except Exception as e:
        print(f"✗ DailySummary failed: {e}")
    
    # 2. BODY BATTERY & STRESS
    print("\n2. BODY BATTERY & STRESS")
    print("-" * 70)
    try:
        bb_stress = DailyBodyBatteryStress.get(test_date, client=client)
        print(f"✓ DailyBodyBatteryStress retrieved")
        print(f"  Body Battery Charged: {bb_stress.body_battery_charged_value}")
        print(f"  Body Battery Drained: {bb_stress.body_battery_drained_value}")
        print(f"  Body Battery Highest: {bb_stress.body_battery_highest_value}")
        print(f"  Body Battery Lowest: {bb_stress.body_battery_lowest_value}")
        print(f"  Body Battery Most Recent: {bb_stress.body_battery_most_recent_value}")
        
        # Print all fields
        print(f"\n  All Body Battery Fields:")
        for attr in dir(bb_stress):
            if not attr.startswith('_') and not callable(getattr(bb_stress, attr)):
                value = getattr(bb_stress, attr)
                if value is not None:
                    print(f"    {attr}: {value}")
    except Exception as e:
        print(f"✗ DailyBodyBatteryStress failed: {e}")
    
    # 3. HRV DATA
    print("\n3. HRV DATA")
    print("-" * 70)
    try:
        hrv = HRVData.get(test_date, client=client)
        print(f"✓ HRVData retrieved")
        
        # Print all fields
        print(f"  All HRV Fields:")
        for attr in dir(hrv):
            if not attr.startswith('_') and not callable(getattr(hrv, attr)):
                value = getattr(hrv, attr)
                if value is not None:
                    print(f"    {attr}: {value}")
    except Exception as e:
        print(f"✗ HRVData failed: {e}")
    
    # 4. SLEEP DATA
    print("\n4. SLEEP DATA")
    print("-" * 70)
    try:
        sleep = DailySleepData.get(test_date, client=client)
        print(f"✓ DailySleepData retrieved")
        
        # Print all fields
        print(f"  All Sleep Fields:")
        for attr in dir(sleep):
            if not attr.startswith('_') and not callable(getattr(sleep, attr)):
                value = getattr(sleep, attr)
                if value is not None and not isinstance(value, list):
                    print(f"    {attr}: {value}")
    except Exception as e:
        print(f"✗ DailySleepData failed: {e}")
    
    # 5. HEART RATE DATA
    print("\n5. HEART RATE DATA")
    print("-" * 70)
    try:
        hr = DailyHeartRate.get(test_date, client=client)
        print(f"✓ DailyHeartRate retrieved")
        
        # Print summary
        print(f"  All Heart Rate Fields:")
        for attr in dir(hr):
            if not attr.startswith('_') and not callable(getattr(hr, attr)):
                value = getattr(hr, attr)
                if value is not None and not isinstance(value, list):
                    print(f"    {attr}: {value}")
    except Exception as e:
        print(f"✗ DailyHeartRate failed: {e}")
    
    # 6. GARMIN SCORES (Training Readiness, Recovery, etc.)
    print("\n6. GARMIN SCORES")
    print("-" * 70)
    try:
        scores = GarminScoresData.get(test_date)
        print(f"✓ GarminScoresData retrieved")
        
        # Print all attributes
        print(f"  All Scores Fields:")
        for attr in dir(scores):
            if not attr.startswith('_') and not callable(getattr(scores, attr)):
                value = getattr(scores, attr)
                if value is not None:
                    print(f"    {attr}: {value}")
    except Exception as e:
        print(f"✗ GarminScoresData failed: {e}")
    
    # 7. TRAINING READINESS
    print("\n7. TRAINING READINESS")
    print("-" * 70)
    try:
        readiness = TrainingReadinessData.get(test_date, client=client)
        print(f"✓ TrainingReadinessData retrieved")
        
        # Print all attributes
        print(f"  All Training Readiness Fields:")
        for attr in dir(readiness):
            if not attr.startswith('_') and not callable(getattr(readiness, attr)):
                value = getattr(readiness, attr)
                if value is not None:
                    print(f"    {attr}: {value}")
    except Exception as e:
        print(f"✗ TrainingReadinessData failed: {e}")
    
    # 8. MORNING TRAINING READINESS
    print("\n8. MORNING TRAINING READINESS")
    print("-" * 70)
    try:
        morning = MorningTrainingReadinessData.get(test_date, client=client)
        print(f"✓ MorningTrainingReadinessData retrieved")
        
        # Print all attributes
        print(f"  All Morning Readiness Fields:")
        for attr in dir(morning):
            if not attr.startswith('_') and not callable(getattr(morning, attr)):
                value = getattr(morning, attr)
                if value is not None:
                    print(f"    {attr}: {value}")
    except Exception as e:
        print(f"✗ MorningTrainingReadinessData failed: {e}")
    
    # 9. BODY BATTERY DETAILED DATA
    print("\n9. BODY BATTERY DETAILED DATA")
    print("-" * 70)
    try:
        bb_data = BodyBatteryData.get(test_date, client=client)
        print(f"✓ BodyBatteryData retrieved")
        
        # Print all attributes
        print(f"  All Body Battery Data Fields:")
        for attr in dir(bb_data):
            if not attr.startswith('_') and not callable(getattr(bb_data, attr)):
                value = getattr(bb_data, attr)
                if value is not None and not isinstance(value, list):
                    print(f"    {attr}: {value}")
    except Exception as e:
        print(f"✗ BodyBatteryData failed: {e}")
    
    print("\n" + "=" * 70)
    print("Testing complete!")

if __name__ == "__main__":
    test_all_data_types()
