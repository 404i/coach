#!/bin/bash
# Local AI Coach CLI - Fully local, no cloud LLMs
# Uses your LMStudio backend directly

EMAIL="tsochev.ivan@gmail.com"
BASE_URL="http://localhost:8080/api"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🏃 Garmin AI Coach (Local)${NC}"
echo -e "${GREEN}Using LMStudio @ localhost:1234${NC}"
echo ""

# Check if backend is running
if ! curl -s http://localhost:8080/api/health > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Backend not running. Start with: cd backend && npm start${NC}"
    exit 1
fi

# Menu
PS3="Choose an option: "
options=(
    "Today's Workout Recommendation"
    "Training Patterns & Nudges"
    "Training Load Status"
    "Recovery Status"
    "Performance Gaps"
    "Weekly Training Plan"
    "Training Diary (Ask AI)"
    "Activity Distribution"
    "Stats Summary"
    "Exit"
)

select opt in "${options[@]}"
do
    case $opt in
        "Today's Workout Recommendation")
            echo ""
            curl -s "$BASE_URL/recommend/workout?email=$EMAIL" | jq -r '
                "Readiness: \(.readiness_score)/100 (\(.readiness_level))",
                "",
                "Recommended Intensity: \(.recommended_intensity)",
                "",
                "🎯 Best Workout:",
                "  Activity: \(.recommendations[0].activity)",
                "  Duration: \(.recommendations[0].duration)",
                "  Intensity: \(.recommendations[0].intensity_guidance)",
                "",
                "Limiting Factors:",
                (.limiting_factors | join(", "))
            '
            echo ""
            ;;
        "Training Patterns & Nudges")
            echo ""
            curl -s "$BASE_URL/patterns/nudges?email=$EMAIL" | jq -r '
                "🔔 Active Nudges: \(.count)",
                "",
                (.nudges[] | "  \(.title)", "  Priority: \(.priority)", "  \(.message)", "")
            '
            ;;
        "Training Load Status")
            echo ""
            curl -s "$BASE_URL/load/fitness-fatigue?email=$EMAIL" | jq -r '
                "Form (TSB): \(.form.current) (\(.form.status))",
                "Fitness (CTL): \(.fitness.current)",
                "Fatigue (ATL): \(.fatigue.current)",
                "",
                "Status: \(.form.interpretation)"
            '
            echo ""
            ;;
        "Recovery Status")
            echo ""
            curl -s "$BASE_URL/daily/latest?email=$EMAIL" | jq -r '
                "Recovery Score: \(.recovery_score)/100",
                "HRV: \(.hrv) ms",
                "Resting HR: \(.resting_hr) bpm",
                "Sleep: \(.sleep_hours)h",
                "Stress: \(.stress)/100"
            '
            echo ""
            ;;
        "Performance Gaps")
            echo ""
            curl -s "$BASE_URL/patterns/performance/gaps?email=$EMAIL" | jq -r '
                "🎯 Performance Gaps: \(.count)",
                "",
                (.gaps[] | 
                    "  \(.modality | ascii_upcase):",
                    "  Days Absent: \(.days_absent)",
                    "  Severity: \(.gap_severity)",
                    "  Benefits:",
                    (.benefits | map("    • \(.)") | join("\n")),
                    ""
                )
            '
            ;;
        "Weekly Training Plan")
            echo ""
            curl -s "$BASE_URL/recommend/weekly-plan?email=$EMAIL" | jq -r '
                "📅 7-Day Training Plan",
                "",
                (.plan[] | 
                    "\(.date) - \(.day_type | ascii_upcase):",
                    "  Activity: \(.activity)",
                    "  Duration: \(.duration)",
                    "  Goal: \(.target)",
                    ""
                )
            '
            ;;
        "Training Diary (Ask AI)")
            echo ""
            read -p "Ask your coach: " question
            curl -s -X POST "$BASE_URL/diary/ask" \
                -H "Content-Type: application/json" \
                -d "{\"email\":\"$EMAIL\",\"question\":\"$question\"}" | \
                jq -r '.response'
            echo ""
            ;;
        "Activity Distribution")
            echo ""
            curl -s "$BASE_URL/activity/distribution?email=$EMAIL&days=30" | jq -r '
                "📊 Last 30 Days Activity Distribution",
                "",
                (.distribution[] | 
                    "  \(.sport):",
                    "    Load: \(.load_percentage)%",
                    "    Time: \(.duration_percentage)%",
                    "    Count: \(.count) activities",
                    ""
                )
            '
            ;;
        "Stats Summary")
            echo ""
            curl -s "$BASE_URL/stats/summary?email=$EMAIL" | jq -r '
                "📈 Training Stats Summary",
                "",
                "Training Load Trend: \(.training_load.trend)",
                "Current TSB: \(.training_stress_balance.current)",
                "HRV Status: \(.hrv.status)",
                "Recovery Trend: \(.recovery.trend)"
            '
            echo ""
            ;;
        "Exit")
            break
            ;;
        *) echo "Invalid option";;
    esac
done
