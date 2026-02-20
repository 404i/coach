#!/usr/bin/env python3
"""
Garth wrapper for Garmin Connect authentication and data sync
Designed to be called from Node.js backend via child_process
"""
import sys
import json
import argparse
from datetime import datetime, timedelta, date as date_type
from garth import Client, DailySummary, DailyBodyBatteryStress
from garth.data import MorningTrainingReadinessData

def handle_error(message):
    """Output error in JSON format and exit"""
    print(json.dumps({"success": False, "error": message}), file=sys.stderr)
    sys.exit(1)

def handle_success(data):
    """Output success response in JSON format"""
    print(json.dumps({"success": True, "data": data}))
    sys.exit(0)

def login(email, password):
    """Authenticate with Garmin Connect"""
    try:
        client = Client()
        client.configure(domain="garmin.com", timeout=30)
        
        # Use prompt callback to capture MFA request
        mfa_token = None
        
        def mfa_prompt(prompt_message):
            # Signal that MFA is required
            nonlocal mfa_token
            mfa_token = "MFA_REQUIRED"
            return None  # Will cause login to fail, but we'll handle it
        
        try:
            client.login(email, password, prompt_mfa=mfa_prompt)
            # Login successful without MFA
            session_data = client.dumps()
            handle_success({"session": session_data, "username": client.username, "mfa_required": False})
        except Exception as e:
            error_str = str(e).lower()
            if mfa_token == "MFA_REQUIRED" or "mfa" in error_str or "verification" in error_str:
                # Store email/password temporarily for MFA completion
                # In production, this should use encrypted temporary storage
                handle_success({"mfa_required": True, "email": email, "message": "MFA code required. Use /api/garmin/mfa endpoint."})
            else:
                raise e
                
    except Exception as e:
        handle_error(f"Login failed: {str(e)}")

def submit_mfa(email, password, mfa_code):
    """Submit MFA code to complete authentication"""
    try:
        client = Client()
        client.configure(domain="garmin.com", timeout=30)
        
        # Login with MFA code provided via callback
        client.login(email, password, prompt_mfa=lambda: mfa_code)
        
        # Return session for Node.js to store
        session_data = client.dumps()
        handle_success({"session": session_data, "username": client.username})
    except Exception as e:
        handle_error(f"MFA authentication failed: {str(e)}")

def resume_session(session_data):
    """Resume existing Garmin Connect session"""
    try:
        client = Client()
        client.configure(domain="garmin.com", timeout=30)
        client.loads(session_data)
        
        # Test session validity
        profile = client.profile
        handle_success({"valid": True, "username": client.username})
    except Exception as e:
        handle_error(f"Session invalid: {str(e)}")

def get_sleep(session_data, date_str):
    """Fetch sleep data for specific date"""
    try:
        client = Client()
        client.loads(session_data)
        
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
        endpoint = f"/wellness-service/wellness/dailySleepData/{client.username}"
        params = {"date": date_str, "nonSleepBufferMinutes": 60}
        
        data = client.connectapi(endpoint, params=params)
        handle_success(data)
    except Exception as e:
        handle_error(f"Sleep fetch failed: {str(e)}")

def get_rhr(session_data, date_str):
    """Fetch resting heart rate for specific date"""
    try:
        client = Client()
        client.loads(session_data)
        
        endpoint = f"/userstats-service/wellness/daily/{client.username}"
        params = {
            "fromDate": date_str,
            "untilDate": date_str,
            "metricId": 60
        }
        
        data = client.connectapi(endpoint, params=params)
        handle_success(data)
    except Exception as e:
        handle_error(f"RHR fetch failed: {str(e)}")

def get_activities(session_data, start_index=0, limit=20):
    """Fetch recent activities"""
    try:
        client = Client()
        client.loads(session_data)
        
        endpoint = "/activitylist-service/activities/search/activities"
        params = {"start": str(start_index), "limit": str(limit)}
        
        data = client.connectapi(endpoint, params=params)
        handle_success(data)
    except Exception as e:
        handle_error(f"Activities fetch failed: {str(e)}")

def get_daily_summary(session_data, date_str):
    """Fetch daily summary including training readiness, stress, body battery"""
    try:
        client = Client()
        client.loads(session_data)
        
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
        endpoint = f"/usersummary-service/usersummary/daily/{client.username}"
        params = {
            "calendarDate": date_str,
            "_": str(int(date_obj.timestamp() * 1000))
        }
        
        data = client.connectapi(endpoint, params=params)
        handle_success(data)
    except Exception as e:
        handle_error(f"Daily summary fetch failed: {str(e)}")

def sync_range(session_data, start_date_str, end_date_str):
    """Sync all data for a date range"""
    try:
        client = Client()
        client.loads(session_data)
        
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
        end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
        
        results = {"dates": {}, "errors": []}
        current_date = start_date
        
        while current_date <= end_date:
            date_str = current_date.strftime("%Y-%m-%d")
            day_data = {}
            date_obj = date_type(current_date.year, current_date.month, current_date.day)
            
            # Fetch all data types for this day
            try:
                # Sleep - still using API endpoint as there's no garth class issue
                sleep_endpoint = f"/wellness-service/wellness/dailySleepData/{client.username}"
                day_data["sleep"] = client.connectapi(sleep_endpoint, params={"date": date_str, "nonSleepBufferMinutes": 60})
            except Exception as e:
                day_data["sleep"] = None
                results["errors"].append(f"Sleep fetch failed for {date_str}: {str(e)}")
            
            try:
                # Daily Summary - use garth built-in class (includes RHR, stress, body battery)
                summary_obj = DailySummary.get(date_obj, client=client)
                # Convert to dict for JSON serialization
                day_data["summary"] = {
                    "resting_heart_rate": summary_obj.resting_heart_rate,
                    "average_stress_level": summary_obj.average_stress_level,
                    "max_stress_level": summary_obj.max_stress_level,
                    "stress_qualifier": summary_obj.stress_qualifier,
                    "body_battery_at_wake_time": summary_obj.body_battery_at_wake_time,
                    "body_battery_highest_value": summary_obj.body_battery_highest_value,
                    "body_battery_lowest_value": summary_obj.body_battery_lowest_value,
                    "bodyBatteryChargedValue": summary_obj.body_battery_highest_value - summary_obj.body_battery_at_wake_time if summary_obj.body_battery_at_wake_time else None,
                    "bodyBatteryDrainedValue": summary_obj.body_battery_at_wake_time - summary_obj.body_battery_lowest_value if summary_obj.body_battery_at_wake_time else None,
                    "avgStressLevel": summary_obj.average_stress_level,
                    "total_steps": summary_obj.total_steps,
                    "total_calories": summary_obj.total_kilocalories,
                    "active_calories": summary_obj.active_kilocalories,
                    "total_distance_meters": summary_obj.total_distance_meters,
                    "floors_ascended": summary_obj.floors_ascended,
                    "moderate_intensity_minutes": summary_obj.moderate_intensity_minutes,
                    "vigorous_intensity_minutes": summary_obj.vigorous_intensity_minutes,
                }
            except Exception as e:
                day_data["summary"] = None
                results["errors"].append(f"Summary fetch failed for {date_str}: {str(e)}")
            
            try:
                # Training Readiness -contains training load, recovery time, and readiness score
                readiness_obj = MorningTrainingReadinessData.get(date_obj, client=client)
                day_data["training_readiness"] = {
                    "score": readiness_obj.score,  # Training Readiness Score
                    "acute_load": readiness_obj.acute_load,  # Training Load
                    "recovery_time": round(readiness_obj.recovery_time / 60, 1) if readiness_obj.recovery_time else None,  # Recovery time in hours
                    "hrv_factor_percent": readiness_obj.hrv_factor_percent,
                    "sleep_score_factor_percent": readiness_obj.sleep_score_factor_percent,
                    "stress_history_factor_percent": readiness_obj.stress_history_factor_percent,
                    "recovery_time_factor_percent": readiness_obj.recovery_time_factor_percent,
                    "feedback_short": readiness_obj.feedback_short,
                }
            except Exception as e:
                day_data["training_readiness"] = None
                results["errors"].append(f"Training readiness fetch failed for {date_str}: {str(e)}")
            
            # Legacy RHR - now included in summary but keep for backwards compatibility
            if day_data.get("summary") and day_data["summary"].get("resting_heart_rate"):
                day_data["rhr"] = [{
                    "restingHeartRate": day_data["summary"]["resting_heart_rate"],
                    "calendarDate": date_str
                }]
            else:
                day_data["rhr"] = None
            
            results["dates"][date_str] = day_data
            current_date += timedelta(days=1)
        
        # Activities for the full range
        try:
            activities_endpoint = "/activitylist-service/activities/search/activities"
            results["activities"] = client.connectapi(activities_endpoint, params={"start": "0", "limit": "100"})
        except:
            results["activities"] = []
        
        handle_success(results)
    except Exception as e:
        handle_error(f"Sync range failed: {str(e)}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Garth wrapper for Garmin Connect")
    parser.add_argument("command", choices=["login", "mfa", "resume", "sleep", "rhr", "activities", "summary", "sync"])
    parser.add_argument("--email", help="Garmin email")
    parser.add_argument("--password", help="Garmin password")
    parser.add_argument("--mfa-code", help="MFA verification code")
    parser.add_argument("--session", help="Garth session data")
    parser.add_argument("--date", help="Date in YYYY-MM-DD format")
    parser.add_argument("--start-date", help="Start date for sync range")
    parser.add_argument("--end-date", help="End date for sync range")
    parser.add_argument("--start-index", type=int, default=0, help="Activity start index")
    parser.add_argument("--limit", type=int, default=20, help="Activity limit")
    
    args = parser.parse_args()
    
    if args.command == "login":
        if not args.email or not args.password:
            handle_error("Email and password required for login")
        login(args.email, args.password)
    
    elif args.command == "mfa":
        if not args.email or not args.password or not args.mfa_code:
            handle_error("Email, password, and MFA code required")
        submit_mfa(args.email, args.password, args.mfa_code)
    
    elif args.command == "resume":
        if not args.session:
            handle_error("Session data required")
        resume_session(args.session)
    
    elif args.command == "sleep":
        if not args.session or not args.date:
            handle_error("Session and date required")
        get_sleep(args.session, args.date)
    
    elif args.command == "rhr":
        if not args.session or not args.date:
            handle_error("Session and date required")
        get_rhr(args.session, args.date)
    
    elif args.command == "activities":
        if not args.session:
            handle_error("Session required")
        get_activities(args.session, args.start_index, args.limit)
    
    elif args.command == "summary":
        if not args.session or not args.date:
            handle_error("Session and date required")
        get_daily_summary(args.session, args.date)
    
    elif args.command == "sync":
        if not args.session or not args.start_date or not args.end_date:
            handle_error("Session, start-date, and end-date required")
        sync_range(args.session, args.start_date, args.end_date)
