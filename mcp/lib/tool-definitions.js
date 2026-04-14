/**
 * MCP tool definitions — the schema for every tool exposed to Claude.
 * Separated from handler logic for readability.
 */

export const TOOLS = [
  // ── Session / Profile ────────────────────────────────────────────────────
  {
    name: "set_current_athlete",
    description: "Set the current athlete context for this session. Call this at the start of a conversation to establish who you're coaching. After calling this, other tools won't require the email parameter.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email address (coach account identifier)" },
      },
      required: ["email"],
    },
  },
  {
    name: "get_athlete_profile",
    description: "Get the athlete's complete profile including goals, sports, baselines, injuries, and training preferences. Use this to understand the athlete before giving advice.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email address (optional if current athlete is set)" },
      },
      required: [],
    },
  },
  {
    name: "add_equipment",
    description: "Record equipment the athlete mentions (shoes, watch, bike, etc.). This helps personalize training advice.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        equipment: { type: "string", description: "Equipment to add (e.g., 'Garmin Forerunner 945', 'road bike', 'Hoka Clifton 9')" },
      },
      required: ["equipment"],
    },
  },
  {
    name: "update_preferences",
    description: "Update athlete preferences learned during conversations (workout times, training style, etc.)",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        preference_key: { type: "string", description: "Preference key (e.g., 'workout_time', 'training_style', 'motivation')" },
        preference_value: { type: "string", description: "Preference value" },
      },
      required: ["preference_key", "preference_value"],
    },
  },
  {
    name: "add_conversation_note",
    description: "Record important topics discussed in coaching conversations for future reference.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        topic: { type: "string", description: "Conversation topic or subject" },
        summary: { type: "string", description: "Brief summary of what was discussed" },
      },
      required: ["topic", "summary"],
    },
  },
  {
    name: "add_important_note",
    description: "Record important coaching notes (restrictions, preferences, injury warnings, etc.)",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        note: { type: "string", description: "Important note to remember" },
      },
      required: ["note"],
    },
  },
  {
    name: "refresh_athlete_memory",
    description: "Refresh athlete memory from their database profile. Use this if you suspect the profile has been updated (new goals, changed preferences, etc.) or to ensure you have the latest athlete information.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
      },
      required: [],
    },
  },

  // ── Coaching / Chat ──────────────────────────────────────────────────────
  {
    name: "chat_with_coach",
    description: "Have a natural conversation with the AI coach. Ask questions, discuss training, get advice on nutrition, recovery, race prep, or any training-related topics. CRITICAL: NEVER invent or hallucinate data. If metrics are null/missing, explicitly state 'NO DATA AVAILABLE' - do not make up values.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email address (optional if current athlete is set)" },
        message: { type: "string", description: "Your question or message to the coach" },
      },
      required: ["message"],
    },
  },

  // ── Garmin / Sync ────────────────────────────────────────────────────────
  {
    name: "sync_garmin_data",
    description: "Sync latest Garmin data for the athlete. Fetches recent activities, heart rate, sleep, and other metrics from Garmin Connect. Data is considered stale after 2 hours and will be auto-synced before any coaching response.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email address (optional if current athlete is set)" },
        days: { type: "number", description: "Number of days to sync (default: 3)", default: 3 },
      },
      required: [],
    },
  },
  {
    name: "confirm_garmin_auth",
    description: "Call this AFTER the user has run the authentication terminal command and confirms they've completed the MFA process. This will retry the sync operation.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email address (optional if current athlete is set)" },
      },
      required: [],
    },
  },
  {
    name: "get_activities",
    description: "Get detailed workout/activity records (cycling, running, swimming, yoga, etc.) including distance, duration, heart rate, power, training load, and performance metrics. Use this to answer questions about specific workouts or training history.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email address (optional if current athlete is set)" },
        limit: { type: "number", description: "Maximum number of activities to return (default: 20)", default: 20 },
        start_date: { type: "string", description: "Filter activities from this date (YYYY-MM-DD format, optional)" },
        end_date: { type: "string", description: "Filter activities to this date (YYYY-MM-DD format, optional)" },
      },
      required: [],
    },
  },
  {
    name: "get_training_metrics",
    description: "Get Garmin training metrics (heart rate, activities, sleep, etc.) for a specific time period. Returns data for visualization and analysis. CRITICAL: If any metric shows null/undefined, state 'NO DATA AVAILABLE' for that metric - NEVER invent or estimate values.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email address (optional if current athlete is set)" },
        days: { type: "number", description: "Number of days to fetch (default: 30)", default: 30 },
      },
      required: [],
    },
  },

  // ── Planning / Workouts ──────────────────────────────────────────────────
  {
    name: "get_today_workout",
    description: "Generate today's workout recommendation with 4 intensity options (optimal, moderate, easy, recovery). Uses AI analysis of athlete profile, recovery metrics (HRV, RHR, sleep), training load, recent history, and constraints. Returns structured workout plans with sport, duration, intensity, and rationale for each option. Includes recovery assessment to guide training decisions.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email address (optional if current athlete is set)" },
        date: { type: "string", description: "Date in YYYY-MM-DD format (defaults to today)" },
      },
      required: [],
    },
  },
  {
    name: "get_weekly_plan",
    description: "Generate a complete 7-day training plan with daily workout prescriptions. Uses AI analysis of athlete profile, 4-week training history, recovery trends, compliance patterns, and upcoming commitments. Returns structured plan with daily workouts (sport, duration, intensity, focus), rest day distribution, volume progression, and coaching rationale. Respects athlete constraints like weekday availability and weekend preferences.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email address (optional if current athlete is set)" },
        week_start: { type: "string", description: "Monday of the week in YYYY-MM-DD format (optional, defaults to current week)" },
      },
      required: [],
    },
  },
  {
    name: "get_workout_recommendations",
    description: "Get intelligent workout recommendations based on current readiness, training load, recovery, HRV, and TSB. Returns 4 workout options (recovery/easy/moderate/hard) with activities, durations, intensity guidelines, and warnings. Includes TRAINING READINESS SCORE (0-100, a composite metric combining Recovery 35% + ACR 25% + HRV 20% + TSB 20%, NOT just recovery alone), with detailed breakdown showing each component's contribution, readiness interpretation, recommended intensity level, and limiting factors analysis. Use this to recommend what the athlete should do TODAY.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        date: { type: "string", description: "Optional date (YYYY-MM-DD format). Defaults to today." },
      },
      required: [],
    },
  },
  {
    name: "get_weekly_workout_plan",
    description: "Generate an intelligent 7-day training plan based on current fitness, fatigue, and recovery. Uses polarized training principles (80% easy, 20% hard). Automatically schedules recovery weeks when needed, manages progressive load increases to avoid injury (ACR spikes), and balances hard/moderate/easy/rest days. Returns daily workouts with activities, durations, targets, plus coaching notes and weekly strategy. Use this for MULTI-DAY planning and strategic training guidance.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        start_date: { type: "string", description: "Optional start date (YYYY-MM-DD format). Defaults to tomorrow." },
      },
      required: [],
    },
  },
  {
    name: "add_planned_activity",
    description: "Record a future activity mentioned by the athlete (e.g., 'yoga tonight', 'DH park next weekend', 'bike race in 2 weeks'). This creates shared context between Claude and LM Studio so all AI systems know about upcoming plans. Use this whenever athlete mentions future training intentions.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        activityType: { type: "string", description: "Type of activity: yoga, mountain_biking, cycling, running, swimming, strength, etc." },
        description: { type: "string", description: "Description of the planned activity (e.g., 'DH park session', 'yoga retreat', 'local criterium race')" },
        plannedDate: { type: "string", description: "Date in YYYY-MM-DD format (required)" },
        options: {
          type: "object",
          description: "Optional details",
          properties: {
            timeOfDay: { type: "string", description: "morning, afternoon, evening" },
            priority: { type: "string", description: "low, medium, high, committed" },
            isEvent: { type: "boolean", description: "Is this an organized event/race?" },
            isSocial: { type: "boolean", description: "Is this a group/social activity?" },
            context: { type: "string", description: "Original conversation context" },
          },
        },
      },
      required: ["activityType", "plannedDate"],
    },
  },
  {
    name: "get_upcoming_activities",
    description: "Retrieve future activities the athlete has mentioned (e.g., planned yoga sessions, upcoming races, bike park trips). Use this to check what's already scheduled before making recommendations, and to inform weekly/daily planning. Shows athlete's actual intentions rather than just historic data.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        daysAhead: { type: "number", description: "How many days ahead to look (default: 30)", default: 30 },
      },
      required: [],
    },
  },
  {
    name: "update_planned_activity",
    description: "Update or mark a planned activity as completed, cancelled, or rescheduled. Use this when athlete completes a planned activity or changes their plans.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Planned activity ID (from get_upcoming_activities)" },
        status: { type: "string", description: "New status: completed, cancelled, rescheduled, planned, scheduled" },
        completedDate: { type: "string", description: "Date completed (YYYY-MM-DD), if marking as completed" },
        notes: { type: "string", description: "Additional notes about the update" },
      },
      required: ["id"],
    },
  },

  // ── Health Metrics / Stats ───────────────────────────────────────────────
  {
    name: "get_training_load_trend",
    description: "Get training load trend analysis including acute load (7-day avg), chronic load (42-day avg), and acute:chronic ratio. Shows if athlete is in optimal training zone, overreaching, or detraining. Status values: 'detraining' (ACR < 0.8), 'optimal' (0.8-1.3), 'building' (1.3-1.5), 'high_risk' (>1.5).",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        days: { type: "number", description: "Number of days to analyze (default: 60)", default: 60 },
      },
      required: [],
    },
  },
  {
    name: "get_recovery_trend",
    description: "Get recovery score trends including 7-day and 30-day averages, trend direction (improving/declining/stable), and factor breakdown (HRV%, sleep%, stress%, recovery_time%). Identifies the limiting factor affecting recovery.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        days: { type: "number", description: "Number of days to analyze (default: 60)", default: 60 },
      },
      required: [],
    },
  },
  {
    name: "get_hrv_baseline",
    description: "Get HRV baseline analysis including personal mean, standard deviation, percentiles (p10/p25/p50/p75/p90), and current HRV status. Shows if current HRV is very_low (<p10), low (<p25), normal (p25-p75), high (>p75), or very_high (>p90).",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        days: { type: "number", description: "Number of days to analyze (default: 60)", default: 60 },
      },
      required: [],
    },
  },
  {
    name: "get_training_stress_balance",
    description: "Get Training Stress Balance (TSB) showing fitness level, fatigue level, and form status. TSB = Fitness - Fatigue. Form values: 'rested' (TSB>10), 'fresh' (-10 to 10), 'fatigued' (-30 to -10), 'overreached' (<-30). Helps determine if athlete needs rest or can handle hard training.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        days: { type: "number", description: "Number of days to analyze (default: 60)", default: 60 },
      },
      required: [],
    },
  },
  {
    name: "get_stats_summary",
    description: "Get comprehensive stats summary in one call: training load trend, recovery trend, HRV baseline, and training stress balance. Provides complete overview of athlete's current fitness, fatigue, and recovery status for holistic coaching insights.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
      },
      required: [],
    },
  },

  // ── Activities / Sport ───────────────────────────────────────────────────
  {
    name: "get_activity_distribution",
    description: "Analyze training distribution across sports (running/cycling/swimming/etc). Shows breakdown by percentage of load and duration, frequency, averages, and recent activities per sport. Use this to understand training balance and identify if athlete is over-focused on one sport.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        days: { type: "number", description: "Number of days to analyze (default: 30)" },
      },
      required: [],
    },
  },
  {
    name: "get_sport_insights",
    description: "Get comprehensive activity insights: training balance, sport-specific patterns, frequency issues, intensity balance (80/20 rule), and cross-training recommendations. Returns insights with severity levels and actionable recommendations. Use this for strategic coaching on training variety and balance.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        days: { type: "number", description: "Number of days to analyze (default: 30)" },
      },
      required: [],
    },
  },
  {
    name: "get_sport_specific_workout",
    description: "Generate structured workouts for a specific sport (running/cycling/swimming). Returns sport-appropriate workout structures with pace/power/HR targets, interval timing, technique focus, and coaching cues. Workouts are tailored to athlete's recent baseline performance. Use this when recommending SPECIFIC workout structures rather than generic guidance.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        sport: { type: "string", description: "Sport type (running, cycling, swimming, training, etc)" },
        intensity: { type: "string", description: "Intensity level: recovery, easy, moderate, or hard (default: moderate)" },
      },
      required: ["sport"],
    },
  },

  // ── Diary ────────────────────────────────────────────────────────────────
  {
    name: "add_diary_entry",
    description: "Create or update a training diary entry. Logs subjective feelings, energy, motivation, sleep quality, stress, soreness, and free-form notes. Use this to help athletes reflect on training sessions and track how they feel day-to-day. Accepts ratings on 1-10 scale plus text notes.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        date: { type: "string", description: "Date of entry (YYYY-MM-DD format). Defaults to today." },
        overall_feel: { type: "number", description: "Overall feeling rating 1-10 (1=terrible, 10=amazing)" },
        energy: { type: "number", description: "Energy level 1-10 (1=exhausted, 10=fully energized)" },
        motivation: { type: "number", description: "Motivation to train 1-10 (1=no motivation, 10=extremely motivated)" },
        sleep_quality: { type: "number", description: "Sleep quality last night 1-10 (1=terrible, 10=excellent)" },
        stress_level: { type: "number", description: "Mental stress level 1-10 (1=very relaxed, 10=extremely stressed)" },
        soreness: { type: "number", description: "Muscle soreness 1-10 (1=no soreness, 10=very sore)" },
        rpe: { type: "number", description: "Rate of Perceived Exertion for workout 1-10" },
        notes: { type: "string", description: "Free-form training notes, thoughts, observations" },
        highlights: { type: "string", description: "What went well today" },
        challenges: { type: "string", description: "What was difficult or challenging" },
        tags: { type: "array", items: { type: "string" }, description: "Tags like 'breakthrough', 'tough', 'fun', 'race'" },
      },
      required: [],
    },
  },
  {
    name: "get_diary_entries",
    description: "Retrieve training diary entries with optional date filtering. Returns subjective ratings, notes, and observations logged by the athlete. Use this to review recent training experiences and understand how the athlete has been feeling.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        start_date: { type: "string", description: "Start date for filtering (YYYY-MM-DD format)" },
        end_date: { type: "string", description: "End date for filtering (YYYY-MM-DD format)" },
        limit: { type: "number", description: "Maximum number of entries to return (default: 30)" },
      },
      required: [],
    },
  },
  {
    name: "analyze_diary_patterns",
    description: "AI-powered analysis of patterns between diary entries and objective metrics. Correlates subjective feelings (energy, motivation, mood) with objective data (HRV, recovery, training load). Returns statistical patterns and AI-generated insights about what conditions lead to best/worst training days. Use this to help athletes understand their personal recovery patterns.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        days: { type: "number", description: "Number of days to analyze (default: 60)" },
      },
      required: [],
    },
  },
  {
    name: "get_weekly_summary",
    description: "Generate or retrieve AI-powered weekly training summary. Provides narrative summary of the week's training, key insights, patterns detected, and recommendations for the coming week. Combines objective metrics with diary entries for comprehensive weekly review.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        week_start: { type: "string", description: "Monday of the week (YYYY-MM-DD format)" },
      },
      required: ["week_start"],
    },
  },

  // ── Load Analysis ────────────────────────────────────────────────────────
  {
    name: "get_load_optimization",
    description: "Get comprehensive training load optimization analysis including ramp rate, sport distribution, volume/intensity balance, fitness-fatigue modeling, and smart recommendations. Identifies training load issues and opportunities.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        weeks: { type: "number", description: "Number of weeks to analyze (default: 12)" },
      },
      required: [],
    },
  },
  {
    name: "get_ramp_rate_analysis",
    description: "Analyze weekly training load progression (ramp rate). Identifies aggressive load increases (>10%/week) that increase injury risk. Provides safe progression recommendations (5-10% per week).",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        weeks: { type: "number", description: "Number of weeks to analyze (default: 12)" },
      },
      required: [],
    },
  },
  {
    name: "get_sport_distribution",
    description: "Analyze training load distribution across sports (cycling, running, swimming, etc). Identifies over-concentration in single sport which increases overuse injury risk. Recommends cross-training balance.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        weeks: { type: "number", description: "Number of weeks to analyze (default: 12)" },
      },
      required: [],
    },
  },
  {
    name: "get_volume_intensity_balance",
    description: "Analyze volume vs intensity balance. Checks adherence to 80/20 rule (80% easy, 20% hard training). Identifies polarization issues that can lead to overtraining or undertraining.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        weeks: { type: "number", description: "Number of weeks to analyze (default: 12)" },
      },
      required: [],
    },
  },

  // ── Patterns / Nudges ────────────────────────────────────────────────────
  {
    name: "get_training_patterns",
    description: "Get athlete's established training patterns including daily habits (e.g., yoga 6x/week), weekly staples (e.g., HIIT on Tuesdays), time-of-day preferences (morning runs), and multi-activity patterns (yoga + ride combos). Shows pattern confidence, frequency, and how long each pattern has been established. Use this to understand athlete's training routine and consistency.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
      },
      required: [],
    },
  },
  {
    name: "get_pattern_breaks",
    description: "Identify when athlete stops doing regular activities, such as no yoga in 7 days when they usually do it daily, or no HIIT in 3 weeks when it was a weekly staple. Returns breaks with severity levels (low/medium/high/critical), impact scores, and days since last occurrence. Critical for proactive coaching when habits break.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
      },
      required: [],
    },
  },
  {
    name: "get_nudges",
    description: "Get all coaching nudges including pattern breaks (stopped yoga, missing HIIT) and performance gaps (no strength training). Returns prioritized nudges with actionable messages, severity levels, and expected benefits of addressing each issue. Use this to proactively guide athletes back to beneficial habits.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
      },
      required: [],
    },
  },
  {
    name: "suggest_multi_activity",
    description: "Suggest second or third workout for today based on what's already completed and current recovery status. Handles multi-activity days intelligently with load adjustments and recovery predictions. Recommends complementary activities (e.g., yoga after ride, strength after morning run) with load impact and timing guidance.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        date: { type: "string", description: "Date to analyze (YYYY-MM-DD). Defaults to today." },
      },
      required: [],
    },
  },
  {
    name: "analyze_performance_gaps",
    description: "Identify missing training modalities such as strength training, HIIT intervals, or flexibility work. Shows days absent, typical frequency expected, gap severity, and performance/injury risk impacts. Critical for identifying weaknesses in training program and suggesting high-value additions.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
      },
      required: [],
    },
  },
  {
    name: "get_performance_multipliers",
    description: "Show specific quantified benefits athlete would gain from adding a missing modality. For strength: +10-15% power, -30% injury risk. For HIIT: +5-10% VO2max, +2-5% race speed. For yoga: -20% soreness, +15% sleep quality. Includes timeline estimates and recommended frequency/duration. Use this to motivate athletes with concrete performance improvements.",
    inputSchema: {
      type: "object",
      properties: {
        modality: { type: "string", description: "Training modality: strength, hiit, or yoga" },
      },
      required: ["modality"],
    },
  },

  // ── Weather ──────────────────────────────────────────────────────────────
  {
    name: "get_weather_safety",
    description: "Get weather safety assessment for outdoor training. Analyzes temperature, wind, precipitation, visibility. Provides safety score (0-100) and risk level. Critical for planning outdoor workouts safely.",
    inputSchema: {
      type: "object",
      properties: {
        location: { type: "string", description: "Location name (city) or 'lat,lon' coordinates (e.g., '42.36,-71.06')" },
      },
      required: ["location"],
    },
  },
  {
    name: "get_weather_adjusted_workout",
    description: "Get workout plan automatically adjusted for current weather conditions. Modifies intensity, duration, gear recommendations, and provides indoor alternatives when needed. Essential for safe, effective outdoor training.",
    inputSchema: {
      type: "object",
      properties: {
        location: { type: "string", description: "Location name (city) or 'lat,lon' coordinates" },
        sport: { type: "string", description: "Sport type: cycling, running, swimming (default: cycling)" },
        duration: { type: "number", description: "Planned duration in minutes (default: 60)" },
      },
      required: ["location"],
    },
  },
  {
    name: "check_weather_forecast",
    description: "Check current weather and short-term forecast with training-specific analysis. Shows conditions, feels-like temperature, precipitation, wind. Useful for multi-hour workout planning.",
    inputSchema: {
      type: "object",
      properties: {
        location: { type: "string", description: "Location name (city) or 'lat,lon' coordinates" },
      },
      required: ["location"],
    },
  },

  // ── Insights / Alerts ────────────────────────────────────────────────────
  {
    name: "get_insights_and_alerts",
    description: "Get all current insights, alerts, and milestones. Returns proactive warnings (injury risk, overtraining, recovery issues), positive insights (consistency, trends), and achievements (streaks, volume PRs). Use this to check training health status and celebrate wins.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
      },
      required: [],
    },
  },
  {
    name: "get_alerts_by_type",
    description: "Get specific type of alerts. Types: injury_risk, overtraining, poor_recovery, sleep_issues, hrv_decline, hrv_low, detraining_risk, consistency, recovery, hrv_trend, streak, volume_pr, high_volume, consistency_milestone. Use to focus on specific concerns.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        type: { type: "string", description: "Alert type to filter by (e.g., 'injury_risk', 'overtraining', 'streak')" },
      },
      required: ["type"],
    },
  },

  // ── Strava Integration ──────────────────────────────────────────────────
  {
    name: "connect_strava",
    description: "Connect the athlete's Strava account. Uses the configured STRAVA_CLIENT_ID/SECRET/REFRESH_TOKEN from .env to establish an OAuth connection. Must be called before syncing Strava data. Only needs to be done once per user.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
      },
      required: [],
    },
  },
  {
    name: "sync_strava_data",
    description: "Pull activities from Strava API into the local database. Syncs the last N days (default 30). Requires Strava to be connected first via connect_strava. Use this to get cycling, running, swimming, and other activities recorded on Strava that may not appear in Garmin.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        days: { type: "number", description: "Number of days to sync (default: 30)" },
      },
      required: [],
    },
  },
  {
    name: "get_strava_activities",
    description: "Query locally-stored Strava activities. Use to view rides, runs, and other workouts synced from Strava. Can filter by date range, activity type (Ride, Run, Swim, MountainBikeRide, TrailRun, etc.), and limit. Activities include distance, duration, elevation, HR, power, and suffer score.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        limit: { type: "number", description: "Max activities to return (default: 20)" },
        start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
        end_date: { type: "string", description: "End date (YYYY-MM-DD)" },
        type: { type: "string", description: "Activity type filter: Ride, Run, Swim, MountainBikeRide, TrailRun, etc." },
      },
      required: [],
    },
  },
  {
    name: "get_strava_athlete",
    description: "Fetch the connected Strava athlete profile. Returns name, location, premium status, weight, FTP, and account creation date. Useful for cross-referencing Strava identity with Garmin profile.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
      },
      required: [],
    },
  },

  // ── Smart Goals ──────────────────────────────────────────────────────────
  {
    name: "get_active_goals",
    description: "Get all active smart training goals for the athlete with hierarchy (long-term → block sub-goals) and latest weekly progress status (on_track / at_risk / off_track). Use this at the start of coaching conversations or when the athlete asks about their goals.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        include_draft: { type: "boolean", description: "Also return draft block sub-goals pending review (default: false)" },
      },
      required: [],
    },
  },
  {
    name: "create_goal",
    description: "Parse a free-text training goal into a structured smart goal and save it. The system will interpret the intent, extract a target metric, generate weekly KPIs, and automatically create progressive block sub-goals in the background. Use preview_only=true to show the athlete the interpretation before saving.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        text: { type: "string", description: "Free-text goal from the athlete (e.g., 'Build MTB endurance for summer, avoid overreaching, add 2 core sessions/week')" },
        preview_only: { type: "boolean", description: "If true, returns parsed preview without saving. Default: false (saves immediately)." },
      },
      required: ["text"],
    },
  },
  {
    name: "adapt_goals",
    description: "When training sessions have been missed or disrupted, propose a minimum-effective-dose alternative that preserves goal progress without overloading the athlete. The rest of the plan is NOT changed — this is a targeted goal-specific adjustment only.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        goal_id: { type: "number", description: "ID of the goal to adapt (from get_active_goals)" },
        disruptions: {
          type: "array",
          items: { type: "string" },
          description: "List of disruptions e.g. ['missed Tuesday tempo', 'travel Thursday-Friday', 'illness Monday']"
        },
        remaining_days: {
          type: "array",
          items: { type: "string" },
          description: "Days still available this week e.g. ['Saturday', 'Sunday']"
        },
        recovery_signals: {
          type: "object",
          description: "Optional current recovery context { hrv, resting_hr, sleep_hours, fatigue_0_10 }"
        },
      },
      required: ["goal_id", "disruptions"],
    },
  },
  {
    name: "get_weekly_goal_review",
    description: "Get a per-goal weekly progress review showing on_track / at_risk / off_track status for each active goal, KPI snapshot, plain-language coaching note, and (if needed) a proposed minimum-effective alternative. Call this during weekly check-ins.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Athlete's email (optional if current athlete is set)" },
        week_start: { type: "string", description: "Monday of the week (YYYY-MM-DD). Defaults to current week." },
      },
      required: [],
    },
  },
];
