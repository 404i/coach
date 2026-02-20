#!/usr/bin/env python3
"""Import GarminDB SQLite data into coach MCP daily metrics store."""

from __future__ import annotations

import argparse
import copy
import datetime as dt
import json
import sqlite3
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile-id", required=True)
    parser.add_argument("--store", default="data/coach_mcp_store.json")
    parser.add_argument("--garmin-db-dir", default="data/garmin/HealthData/DBs")
    parser.add_argument("--from-date")
    parser.add_argument("--to-date")
    parser.add_argument("--latest-days", type=int)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--overwrite", dest="overwrite", action="store_true", default=True)
    parser.add_argument("--no-overwrite", dest="overwrite", action="store_false")
    return parser.parse_args()


def parse_date(value: str | None) -> dt.date | None:
    if not value:
        return None
    return dt.datetime.strptime(value, "%Y-%m-%d").date()


def parse_time_to_minutes(value: Any) -> float:
    if value in (None, ""):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return 0.0
    parts = text.split(":")
    if len(parts) != 3:
        return 0.0
    hours = int(parts[0])
    minutes = int(parts[1])
    seconds = float(parts[2])
    return (hours * 60.0) + minutes + (seconds / 60.0)


def parse_time_to_hours(value: Any) -> float:
    return round(parse_time_to_minutes(value) / 60.0, 3)


def as_float_or_none(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def map_sport(raw_sport: Any, raw_type: Any) -> str:
    value = str(raw_sport or raw_type or "").strip().lower()
    mapping = {
        "running": "run",
        "trail_running": "run",
        "treadmill_running": "run",
        "cycling": "bike",
        "mountain_biking": "bike",
        "indoor_cycling": "bike",
        "e_biking": "bike",
        "biking": "bike",
        "swimming": "swim",
        "pool_swimming": "swim",
        "open_water_swimming": "swim",
        "walking": "walk",
        "hiking": "walk",
        "training": "strength",
        "strength_training": "strength",
        "fitness_equipment": "strength",
        "yoga": "yoga",
        "pilates": "yoga",
        "hiit": "hiit",
    }
    if value in mapping:
        return mapping[value]
    if value in {"run", "bike", "swim", "strength", "yoga", "hiit", "walk"}:
        return value
    return "other"


def build_where_clause(date_column: str, from_date: dt.date | None, to_date: dt.date | None) -> tuple[str, list[str]]:
    clauses = []
    params: list[str] = []
    if from_date:
        clauses.append(f"{date_column} >= ?")
        params.append(from_date.isoformat())
    if to_date:
        clauses.append(f"{date_column} <= ?")
        params.append(to_date.isoformat())
    if not clauses:
        return "", params
    return " WHERE " + " AND ".join(clauses), params


def load_store(store_path: Path) -> dict[str, Any]:
    if not store_path.exists():
        return {
            "profiles": {},
            "daily": {},
            "planned": {},
            "lastRecommendation": {},
            "agentMemory": {},
        }
    with store_path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_store(store_path: Path, store: dict[str, Any]) -> None:
    store_path.parent.mkdir(parents=True, exist_ok=True)
    with store_path.open("w", encoding="utf-8") as f:
        json.dump(store, f, indent=2)


def default_daily(profile_id: str, day: str) -> dict[str, Any]:
    return {
        "profile_id": profile_id,
        "date": day,
        "source": {
            "type": "api",
            "artifacts": ["garmindb"],
            "extraction_confidence_0_1": 0.98,
        },
        "readiness": {
            "garmin_training_readiness": None,
            "training_status_label": "",
            "acute_load": None,
            "chronic_load": None,
            "load_ratio": None,
        },
        "recovery_signals": {
            "resting_hr_bpm": None,
            "hrv_ms": None,
            "sleep_hours": None,
            "stress_score": None,
        },
        "daily_metrics": {
            "steps": None,
            "floors_climbed": None,
        },
        "subjective": {
            "pain_0_10": 0,
            "fatigue_0_10": 3,
            "soreness_0_10": 3,
            "illness_symptoms": False,
            "notes": "Imported from GarminDB",
        },
        "activities": [],
    }


def merge_daily(existing: dict[str, Any], imported: dict[str, Any]) -> dict[str, Any]:
    merged = copy.deepcopy(existing)
    merged["profile_id"] = imported["profile_id"]
    merged["date"] = imported["date"]
    merged["source"] = imported.get("source", merged.get("source"))

    merged.setdefault("readiness", {})
    for key, value in imported.get("readiness", {}).items():
        if value not in (None, ""):
            merged["readiness"][key] = value

    merged.setdefault("recovery_signals", {})
    for key, value in imported.get("recovery_signals", {}).items():
        if value not in (None, ""):
            merged["recovery_signals"][key] = value

    merged.setdefault("daily_metrics", {})
    for key, value in imported.get("daily_metrics", {}).items():
        if value not in (None, ""):
            merged["daily_metrics"][key] = value

    if imported.get("activities"):
        merged["activities"] = imported["activities"]

    if not merged.get("subjective"):
        merged["subjective"] = imported.get("subjective", default_daily(imported["profile_id"], imported["date"])["subjective"])

    return merged


def main() -> None:
    args = parse_args()
    store_path = Path(args.store).resolve()
    db_dir = Path(args.garmin_db_dir).resolve()

    garmin_db_path = db_dir / "garmin.db"
    summary_db_path = db_dir / "garmin_summary.db"
    activities_db_path = db_dir / "garmin_activities.db"
    if not garmin_db_path.exists():
        raise SystemExit(f"Missing Garmin DB: {garmin_db_path}")
    if not summary_db_path.exists():
        raise SystemExit(f"Missing Garmin summary DB: {summary_db_path}")
    if not activities_db_path.exists():
        raise SystemExit(f"Missing Garmin activities DB: {activities_db_path}")

    from_date = parse_date(args.from_date)
    to_date = parse_date(args.to_date)
    if args.latest_days and not from_date:
        to_date = to_date or dt.date.today()
        from_date = to_date - dt.timedelta(days=max(1, args.latest_days) - 1)

    if from_date and to_date and from_date > to_date:
        raise SystemExit("from-date must be <= to-date")

    store = load_store(store_path)
    profiles = store.get("profiles", {})
    if args.profile_id not in profiles:
        raise SystemExit(f"Profile not found in store: {args.profile_id}")

    # Import athlete attributes (VO2 max, weight, height, etc.)
    athlete_attrs = {}
    with sqlite3.connect(garmin_db_path) as garmin_conn:
        garmin_conn.row_factory = sqlite3.Row
        attrs_query = "SELECT key, value FROM attributes WHERE key IN ('vo2max_running', 'vo2max_cycling', 'weight', 'height', 'gender', 'year_of_birth')"
        for row in garmin_conn.execute(attrs_query):
            athlete_attrs[row["key"]] = row["value"]
    
    # Update profile with VO2 max if available
    profile = profiles[args.profile_id]
    if "vo2max_running" in athlete_attrs or "vo2max_cycling" in athlete_attrs:
        if "training_zones" not in profile:
            profile["training_zones"] = {}
        if "vo2max_running" in athlete_attrs:
            profile["vo2max_running"] = float(athlete_attrs["vo2max_running"])
        if "vo2max_cycling" in athlete_attrs:
            profile["vo2max_cycling"] = float(athlete_attrs["vo2max_cycling"])
        store["profiles"][args.profile_id] = profile

    by_day: dict[str, dict[str, Any]] = {}
    summary_rows = 0
    activity_rows = 0

    with sqlite3.connect(summary_db_path) as summary_conn:
        summary_conn.row_factory = sqlite3.Row
        where, params = build_where_clause("day", from_date, to_date)
        query = (
            "SELECT day, rhr_avg, sleep_avg, stress_avg, steps, floors "
            "FROM days_summary"
            f"{where} ORDER BY day"
        )
        for row in summary_conn.execute(query, params):
            day = str(row["day"])
            item = by_day.setdefault(day, default_daily(args.profile_id, day))
            item["recovery_signals"]["resting_hr_bpm"] = as_float_or_none(row["rhr_avg"])
            item["recovery_signals"]["sleep_hours"] = parse_time_to_hours(row["sleep_avg"]) if row["sleep_avg"] else None
            item["recovery_signals"]["stress_score"] = as_float_or_none(row["stress_avg"])
            item["daily_metrics"]["steps"] = int(row["steps"]) if row["steps"] else None
            item["daily_metrics"]["floors_climbed"] = round(float(row["floors"]), 1) if row["floors"] else None
            summary_rows += 1

    with sqlite3.connect(activities_db_path) as act_conn:
        act_conn.row_factory = sqlite3.Row
        where, params = build_where_clause("DATE(start_time)", from_date, to_date)
        query = (
            "SELECT activity_id, sport, type, start_time, elapsed_time, moving_time, "
            "training_load, distance, ascent, descent, calories, "
            "avg_hr, max_hr, avg_rr, max_rr, "
            "avg_speed, max_speed, avg_cadence, max_cadence, cycles, "
            "training_effect, anaerobic_training_effect, "
            "hrz_1_time, hrz_2_time, hrz_3_time, hrz_4_time, hrz_5_time "
            "FROM activities"
            f"{where} ORDER BY start_time"
        )
        for row in act_conn.execute(query, params):
            day = str(row["start_time"]).split(" ")[0]
            item = by_day.setdefault(day, default_daily(args.profile_id, day))
            activity = {
                "sport": map_sport(row["sport"], row["type"]),
                "duration_min": round(parse_time_to_minutes(row["elapsed_time"]), 2),
                "moving_time_min": round(parse_time_to_minutes(row["moving_time"]), 2) if row["moving_time"] else None,
                "distance_km": round(float(row["distance"]), 3) if row["distance"] else None,
                "elevation_gain_m": round(float(row["ascent"]), 1) if row["ascent"] else None,
                "elevation_loss_m": round(float(row["descent"]), 1) if row["descent"] else None,
                "calories": int(row["calories"]) if row["calories"] else None,
                "avg_speed_kph": round(float(row["avg_speed"]), 2) if row["avg_speed"] else None,
                "max_speed_kph": round(float(row["max_speed"]), 2) if row["max_speed"] else None,
                "avg_cadence_rpm": int(row["avg_cadence"]) if row["avg_cadence"] else None,
                "max_cadence_rpm": int(row["max_cadence"]) if row["max_cadence"] else None,
                "total_cycles": int(row["cycles"]) if row["cycles"] else None,
                "exercise_load": as_float_or_none(row["training_load"]),
                "avg_hr_bpm": as_float_or_none(row["avg_hr"]),
                "max_hr_bpm": as_float_or_none(row["max_hr"]),
                "avg_respiration_rate": as_float_or_none(row["avg_rr"]),
                "max_respiration_rate": as_float_or_none(row["max_rr"]),
                "training_effect_aerobic": as_float_or_none(row["training_effect"]),
                "training_effect_anaerobic": as_float_or_none(row["anaerobic_training_effect"]),
                "hr_zone_minutes": {
                    "z1": round(parse_time_to_minutes(row["hrz_1_time"]), 2),
                    "z2": round(parse_time_to_minutes(row["hrz_2_time"]), 2),
                    "z3": round(parse_time_to_minutes(row["hrz_3_time"]), 2),
                    "z4": round(parse_time_to_minutes(row["hrz_4_time"]), 2),
                    "z5": round(parse_time_to_minutes(row["hrz_5_time"]), 2),
                },
                "power_zone_minutes": None,
            }
            item["activities"].append(activity)
            activity_rows += 1

    imported_days = sorted(by_day.keys())
    existing_history = store.setdefault("daily", {}).setdefault(args.profile_id, [])
    existing_by_day = {str(row.get("date")): row for row in existing_history if isinstance(row, dict)}

    upserted = 0
    skipped = 0
    for day in imported_days:
        imported = by_day[day]
        existing = existing_by_day.get(day)
        if existing and not args.overwrite:
            skipped += 1
            continue
        existing_by_day[day] = merge_daily(existing, imported) if existing else imported
        upserted += 1

    next_history = sorted(existing_by_day.values(), key=lambda row: str(row.get("date", "")))
    if not args.dry_run:
        store["daily"][args.profile_id] = next_history
        save_store(store_path, store)

    out = {
        "profile_id": args.profile_id,
        "store_path": str(store_path),
        "garmin_db_dir": str(db_dir),
        "athlete_attributes_imported": athlete_attrs,
        "date_range": {
            "from_date": from_date.isoformat() if from_date else None,
            "to_date": to_date.isoformat() if to_date else None,
        },
        "imported_days_detected": len(imported_days),
        "upserted_days": upserted,
        "skipped_days": skipped,
        "activities_imported": activity_rows,
        "summary_rows_used": summary_rows,
        "dry_run": args.dry_run,
        "first_imported_day": imported_days[0] if imported_days else None,
        "last_imported_day": imported_days[-1] if imported_days else None,
        "total_days_in_store_for_profile": len(next_history),
    }
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
