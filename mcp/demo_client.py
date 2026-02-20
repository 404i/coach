#!/usr/bin/env python3
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "mcp" / "server.js"


def send(proc, message):
    body = json.dumps(message).encode("utf-8")
    header = f"Content-Length: {len(body)}\r\n\r\n".encode("utf-8")
    proc.stdin.write(header + body)
    proc.stdin.flush()


def recv(proc):
    header = b""
    while b"\r\n\r\n" not in header:
        chunk = proc.stdout.read(1)
        if not chunk:
            raise RuntimeError("Server closed connection")
        header += chunk

    head, rest = header.split(b"\r\n\r\n", 1)
    length = 0
    for line in head.decode("utf-8").split("\r\n"):
        if line.lower().startswith("content-length:"):
            length = int(line.split(":", 1)[1].strip())
            break

    body = rest
    while len(body) < length:
        body += proc.stdout.read(length - len(body))

    return json.loads(body[:length])


def call(proc, req_id, method, params=None):
    payload = {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params or {}}
    send(proc, payload)
    return recv(proc)


def call_tool(proc, req_id, name, arguments):
    return call(proc, req_id, "tools/call", {"name": name, "arguments": arguments})


def main():
    proc = subprocess.Popen(
      ["node", str(SERVER)],
      stdin=subprocess.PIPE,
      stdout=subprocess.PIPE,
      stderr=subprocess.DEVNULL,
      cwd=str(ROOT),
    )

    try:
        print("Initializing MCP server...")
        print(
            call(
                proc,
                1,
                "initialize",
                {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "coach-demo-client", "version": "0.1.0"},
                },
            )["result"]
        )

        send(proc, {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})

        tools = call(proc, 2, "tools/list", {})["result"]["tools"]
        print(f"Tools available: {len(tools)}")

        profile = {
            "profile_id": "demo-athlete",
            "goals": ["endurance", "general_fitness"],
            "favorite_sports": ["bike", "swim", "yoga"],
            "access": {
                "equipment": ["indoor bike", "pool"],
                "facilities": ["gym", "pool"],
                "days_per_week": 5,
                "minutes_per_session": 45,
            },
            "injuries_conditions": [
                {"name": "right knee sensitivity", "status": "managed", "severity_0_10": 2, "contraindications": ["deep squat under load"]}
            ],
            "baselines": {"resting_hr_bpm_14d": 52, "hrv_ms_7d": 40, "lthr_bpm": 165, "ftp_watts": 218},
            "preferences": {"max_hard_days_per_week": 2, "preferred_training_time": "am", "likes_variety": True},
        }

        print("Saving profile...")
        print(call_tool(proc, 3, "save_profile", {"profile": profile})["result"]["structuredContent"]["profile"]["profile_id"])

        daily = {
            "profile_id": "demo-athlete",
            "date": "2026-02-04",
            "source": {"type": "manual", "artifacts": [], "extraction_confidence_0_1": 0.9},
            "readiness": {"garmin_training_readiness": 61, "training_status_label": "Maintaining", "load_ratio": 1.1},
            "recovery_signals": {"resting_hr_bpm": 55, "hrv_ms": 38, "sleep_hours": 6.8, "stress_score": 22},
            "subjective": {
                "pain_0_10": 1,
                "fatigue_0_10": 4,
                "soreness_0_10": 3,
                "illness_symptoms": False,
                "notes": "Normal day",
            },
            "activities": [
                {
                    "sport": "bike",
                    "duration_min": 40,
                    "exercise_load": 52,
                    "hr_zone_minutes": {"z1": 12, "z2": 18, "z3": 8, "z4": 2, "z5": 0},
                }
            ],
        }

        print("Ingesting daily metrics...")
        print(call_tool(proc, 4, "ingest_daily_metrics", {"daily": daily})["result"]["structuredContent"]["saved"])

        rec = call_tool(proc, 5, "recommend_today", {"profile_id": "demo-athlete"})["result"]["structuredContent"]
        print("Recommendation:")
        print(json.dumps({
            "state": rec["state"],
            "recommendation_type": rec["recommendation_type"],
            "recovery_score": rec["recovery_score"],
            "plan_a": rec["plan_a"],
        }, indent=2))

        answer = call_tool(
            proc,
            6,
            "chat_followup",
            {"profile_id": "demo-athlete", "question": "why not hiit today?"},
        )["result"]["structuredContent"]
        print("Follow-up:")
        print(answer["answer"])

        print("Demo complete.")
    finally:
        proc.terminate()


if __name__ == "__main__":
    main()
