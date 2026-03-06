/**
 * Analytics, stats, diary, load, patterns, and performance tool handlers.
 */
import { callAPI } from '../api.js';
import { getCurrentAthlete } from '../state.js';
import { ensureFreshData } from '../sync.js';
import { getActivityContext } from '../activity-context.js';

export const analyticsHandlers = {
  // ── Stats & Metrics ──────────────────────────────────────────────────────
  async get_training_load_trend(args) {
    const email = args.email || getCurrentAthlete();
    const days = args.days || 60;
    const activityCtx = await getActivityContext(email);
    const data = await callAPI(`/api/stats/training-load-trend?email=${encodeURIComponent(email)}&days=${days}`);

    let response = `📊 **TRAINING LOAD TREND** (${days} days)\n`;
    if (activityCtx.latest_activity_date) response += `📅 Data through: ${activityCtx.latest_activity_date}\n`;
    if (activityCtx.days_since_last > 2) response += `⚠️  Training load may be incomplete - last activity ${activityCtx.days_since_last} days ago\n`;
    response += `\n${JSON.stringify(data, null, 2)}`;
    return { content: [{ type: "text", text: response }] };
  },

  async get_recovery_trend(args) {
    const email = args.email || getCurrentAthlete();
    const freshnessNote = await ensureFreshData(email);
    const days = args.days || 60;
    const activityCtx = await getActivityContext(email);
    const data = await callAPI(`/api/stats/recovery-trend?email=${encodeURIComponent(email)}&days=${days}`);

    let response = `${freshnessNote}\n\n💚 **RECOVERY TREND** (${days} days)\n`;
    if (activityCtx.latest_activity_date) response += `📅 Data through: ${activityCtx.latest_activity_date}\n`;
    response += `\n${JSON.stringify(data, null, 2)}`;
    return { content: [{ type: "text", text: response }] };
  },

  async get_hrv_baseline(args) {
    const email = args.email || getCurrentAthlete();
    const days = args.days || 60;
    const activityCtx = await getActivityContext(email);
    const data = await callAPI(`/api/stats/hrv-baseline?email=${encodeURIComponent(email)}&days=${days}`);

    let response = `❤️  **HRV BASELINE** (${days} days)\n`;
    if (activityCtx.latest_activity_date) response += `📅 Data through: ${activityCtx.latest_activity_date}\n`;
    response += `\n${JSON.stringify(data, null, 2)}`;
    return { content: [{ type: "text", text: response }] };
  },

  async get_training_stress_balance(args) {
    const email = args.email || getCurrentAthlete();
    const days = args.days || 60;
    const activityCtx = await getActivityContext(email);
    const data = await callAPI(`/api/stats/training-stress-balance?email=${encodeURIComponent(email)}&days=${days}`);

    let response = `⚖️ **TRAINING STRESS BALANCE (TSB)** (${days} days)\n`;
    response += `📚 Need explanation? Use get_help tool with topic="tsb"\n`;
    if (activityCtx.latest_activity_date) response += `📅 Data through: ${activityCtx.latest_activity_date}\n`;
    if (activityCtx.days_since_last > 2) response += `⚠️  TSB may be inaccurate - last training ${activityCtx.days_since_last} days ago\n`;
    response += `\n${JSON.stringify(data, null, 2)}`;
    return { content: [{ type: "text", text: response }] };
  },

  async get_stats_summary(args) {
    const email = args.email || getCurrentAthlete();
    const activityCtx = await getActivityContext(email);
    const data = await callAPI(`/api/stats/summary?email=${encodeURIComponent(email)}`);

    let response = `📊 **STATS SUMMARY**\n`;
    if (activityCtx.latest_activity_date) response += `📅 Data through: ${activityCtx.latest_activity_date}\n`;
    if (activityCtx.warning) response += `${activityCtx.warning}\n`;
    response += `\n${JSON.stringify(data, null, 2)}`;
    return { content: [{ type: "text", text: response }] };
  },

  // ── Activity Distribution & Sport Insights ───────────────────────────────
  async get_activity_distribution(args) {
    const email = args.email || getCurrentAthlete();
    const days = args.days || 30;
    const activityCtx = await getActivityContext(email);
    const data = await callAPI(`/api/activity/distribution?email=${encodeURIComponent(email)}&days=${days}`);

    let response = `📊 **ACTIVITY DISTRIBUTION** (Last ${days} days)\n`;
    if (activityCtx.latest_activity_date) response += `📅 Through: ${activityCtx.latest_activity_date}\n`;
    if (activityCtx.warning) response += `${activityCtx.warning}\n`;
    response += `\n${JSON.stringify(data, null, 2)}`;
    return { content: [{ type: "text", text: response }] };
  },

  async get_sport_insights(args) {
    const email = args.email || getCurrentAthlete();
    const days = args.days || 30;
    const activityCtx = await getActivityContext(email);
    const data = await callAPI(`/api/activity/insights?email=${encodeURIComponent(email)}&days=${days}`);

    let response = `🎯 **SPORT INSIGHTS** (Last ${days} days)\n`;
    if (activityCtx.latest_activity_date) response += `📅 Through: ${activityCtx.latest_activity_date}\n`;
    if (activityCtx.warning) response += `${activityCtx.warning}\n`;
    response += `\n${JSON.stringify(data, null, 2)}`;
    return { content: [{ type: "text", text: response }] };
  },

  async get_sport_specific_workout(args) {
    const email = args.email || getCurrentAthlete();
    const sport = args.sport;
    const intensity = args.intensity || 'moderate';
    const activityCtx = await getActivityContext(email);
    const data = await callAPI(
      `/api/activity/workouts/${encodeURIComponent(sport)}?email=${encodeURIComponent(email)}&intensity=${intensity}`
    );

    let response = `🏃 **${sport.toUpperCase()} WORKOUT** (${intensity} intensity)\n`;
    if (activityCtx.latest_activity_date) response += `📅 Based on activities through: ${activityCtx.latest_activity_date}\n`;
    if (activityCtx.days_since_last > 3) response += `⚠️  Last activity: ${activityCtx.days_since_last} days ago - workout may need adjustment\n`;
    response += `\n${JSON.stringify(data, null, 2)}`;
    return { content: [{ type: "text", text: response }] };
  },

  // ── Diary ─────────────────────────────────────────────────────────────────
  async add_diary_entry(args) {
    const email = args.email || getCurrentAthlete();
    const entryData = {
      date: args.date || new Date().toISOString().split('T')[0],
      activity_id: args.activity_id,
      overall_feel: args.overall_feel,
      energy: args.energy,
      motivation: args.motivation,
      sleep_quality: args.sleep_quality,
      stress_level: args.stress_level,
      soreness: args.soreness,
      rpe: args.rpe,
      notes: args.notes,
      highlights: args.highlights,
      challenges: args.challenges,
      tags: args.tags,
      email,
    };
    const data = await callAPI('/api/diary/entry', {
      method: 'POST',
      body: JSON.stringify(entryData),
    });
    return {
      content: [{ type: "text", text: `Diary entry saved for ${entryData.date}:\n` + JSON.stringify(data, null, 2) }],
    };
  },

  async get_diary_entries(args) {
    const email = args.email || getCurrentAthlete();
    const queryParams = new URLSearchParams({ email });
    if (args.start_date) queryParams.append('start_date', args.start_date);
    if (args.end_date) queryParams.append('end_date', args.end_date);
    if (args.limit) queryParams.append('limit', args.limit.toString());
    const data = await callAPI(`/api/diary/entries?${queryParams.toString()}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },

  async analyze_diary_patterns(args) {
    const email = args.email || getCurrentAthlete();
    const days = args.days || 60;
    const activityCtx = await getActivityContext(email);
    const data = await callAPI(`/api/diary/analysis?email=${encodeURIComponent(email)}&days=${days}`);

    let response = `📝 **DIARY PATTERNS ANALYSIS** (${days} days)\n`;
    if (activityCtx.latest_activity_date) response += `📅 Analysis through: ${activityCtx.latest_activity_date}\n`;
    response += `\n${JSON.stringify(data, null, 2)}`;
    return { content: [{ type: "text", text: response }] };
  },

  async get_weekly_summary(args) {
    const email = args.email || getCurrentAthlete();
    const weekStart = args.week_start;
    const activityCtx = await getActivityContext(email);
    const data = await callAPI(
      `/api/diary/weekly-summary?email=${encodeURIComponent(email)}&week_start=${weekStart}`
    );

    let response = `📊 **WEEKLY SUMMARY** (Week of ${weekStart})\n`;
    if (activityCtx.latest_activity_date) response += `📅 Activities through: ${activityCtx.latest_activity_date}\n`;
    if (activityCtx.days_since_last > 3) response += `⚠️  Week summary incomplete - last activity ${activityCtx.days_since_last} days ago\n`;
    response += `\n${JSON.stringify(data, null, 2)}`;
    return { content: [{ type: "text", text: response }] };
  },

  // ── Load Analysis ─────────────────────────────────────────────────────────
  async get_load_optimization(args) {
    const email = args.email || getCurrentAthlete();
    const weeks = args.weeks || 12;
    const activityCtx = await getActivityContext(email);
    const data = await callAPI(`/api/load/optimization?email=${encodeURIComponent(email)}&weeks=${weeks}`);

    let response = `🎯 **LOAD OPTIMIZATION** (${weeks} weeks)\n`;
    if (activityCtx.latest_activity_date) response += `📅 Analysis through: ${activityCtx.latest_activity_date}\n`;
    if (activityCtx.days_since_last > 3) response += `⚠️  Analysis incomplete - last activity ${activityCtx.days_since_last} days ago\n`;
    response += `\n${JSON.stringify(data, null, 2)}`;
    return { content: [{ type: "text", text: response }] };
  },

  async get_ramp_rate_analysis(args) {
    const email = args.email || getCurrentAthlete();
    const weeks = args.weeks || 12;
    const activityCtx = await getActivityContext(email);
    const data = await callAPI(`/api/load/ramp-rate?email=${encodeURIComponent(email)}&weeks=${weeks}`);

    let response = `📈 **RAMP RATE ANALYSIS** (${weeks} weeks)\n`;
    if (activityCtx.latest_activity_date) response += `📅 Analysis through: ${activityCtx.latest_activity_date}\n`;
    if (activityCtx.days_since_last > 3) response += `⚠️  Ramp rate incomplete - last activity ${activityCtx.days_since_last} days ago\n`;
    response += `\n${JSON.stringify(data, null, 2)}`;
    return { content: [{ type: "text", text: response }] };
  },

  async get_sport_distribution(args) {
    const email = args.email || getCurrentAthlete();
    const weeks = args.weeks || 12;
    const activityCtx = await getActivityContext(email);
    const data = await callAPI(`/api/load/distribution?email=${encodeURIComponent(email)}&weeks=${weeks}`);

    let response = `🎮 **SPORT DISTRIBUTION** (${weeks} weeks)\n`;
    if (activityCtx.latest_activity_date) response += `📅 Distribution through: ${activityCtx.latest_activity_date}\n`;
    if (activityCtx.days_since_last > 2) response += `⚠️  Distribution may not reflect current week - last activity ${activityCtx.days_since_last} days ago\n`;
    response += `\n${JSON.stringify(data, null, 2)}`;
    return { content: [{ type: "text", text: response }] };
  },

  async get_volume_intensity_balance(args) {
    const email = args.email || getCurrentAthlete();
    const weeks = args.weeks || 12;
    const activityCtx = await getActivityContext(email);
    const data = await callAPI(`/api/load/volume-intensity?email=${encodeURIComponent(email)}&weeks=${weeks}`);

    let response = `⚖️ **VOLUME/INTENSITY BALANCE** (${weeks} weeks)\n`;
    if (activityCtx.latest_activity_date) response += `📅 Balance through: ${activityCtx.latest_activity_date}\n`;
    if (activityCtx.days_since_last > 3) response += `⚠️  Balance analysis incomplete - last activity ${activityCtx.days_since_last} days ago\n`;
    response += `\n${JSON.stringify(data, null, 2)}`;
    return { content: [{ type: "text", text: response }] };
  },

  // ── Patterns, Nudges & Performance ────────────────────────────────────────
  async get_training_patterns(args) {
    const email = args.email || getCurrentAthlete();
    const activityCtx = await getActivityContext(email);
    const data = await callAPI(`/api/patterns?email=${encodeURIComponent(email)}`);

    let response = `🔍 **TRAINING PATTERNS**\n`;
    if (activityCtx.latest_activity_date) response += `📅 Patterns through: ${activityCtx.latest_activity_date}\n`;
    if (activityCtx.days_since_last > 3) response += `⚠️  Patterns may be incomplete - last activity ${activityCtx.days_since_last} days ago\n`;
    response += `\n${JSON.stringify(data, null, 2)}`;
    return { content: [{ type: "text", text: response }] };
  },

  async get_pattern_breaks(args) {
    const email = args.email || getCurrentAthlete();
    const activityCtx = await getActivityContext(email);
    const data = await callAPI(`/api/patterns/breaks?email=${encodeURIComponent(email)}`);

    let response = `🚫 **PATTERN BREAKS**\n`;
    if (activityCtx.latest_activity_date) response += `📅 Analysis through: ${activityCtx.latest_activity_date}\n`;
    if (activityCtx.days_since_last > 2) response += `⚠️  Current break detected: ${activityCtx.days_since_last} days since last activity\n`;
    response += `\n${JSON.stringify(data, null, 2)}`;
    return { content: [{ type: "text", text: response }] };
  },

  async get_nudges(args) {
    const email = args.email || getCurrentAthlete();
    const activityCtx = await getActivityContext(email);
    const data = await callAPI(`/api/patterns/nudges?email=${encodeURIComponent(email)}`);

    let response = `👉 **NUDGES & SUGGESTIONS**\n`;
    if (activityCtx.latest_activity_date) response += `📅 Based on data through: ${activityCtx.latest_activity_date}\n`;
    if (activityCtx.days_since_last > 2) response += `⚠️  👉 🏃 PRIMARY NUDGE: Last activity was ${activityCtx.days_since_last} days ago. Time to get moving!\n`;
    response += `\n${JSON.stringify(data, null, 2)}`;
    return { content: [{ type: "text", text: response }] };
  },

  async suggest_multi_activity(args) {
    const email = args.email || getCurrentAthlete();
    const date = args.date || new Date().toISOString().split('T')[0];
    const activityCtx = await getActivityContext(email);
    const data = await callAPI(
      `/api/patterns/multi-activity/today?email=${encodeURIComponent(email)}&date=${date}`
    );

    let response = `🏋️ **MULTI-ACTIVITY SUGGESTION**\n`;
    if (activityCtx.latest_activity_date) response += `📅 Based on patterns through: ${activityCtx.latest_activity_date}\n`;
    response += `\n${JSON.stringify(data, null, 2)}`;
    return { content: [{ type: "text", text: response }] };
  },

  async analyze_performance_gaps(args) {
    const email = args.email || getCurrentAthlete();
    const activityCtx = await getActivityContext(email);
    const data = await callAPI(`/api/patterns/performance/gaps?email=${encodeURIComponent(email)}`);

    let response = `🔍 **PERFORMANCE GAPS ANALYSIS**\n`;
    if (activityCtx.latest_activity_date) response += `📅 Analysis through: ${activityCtx.latest_activity_date}\n`;
    if (activityCtx.days_since_last > 3) response += `⚠️  Gap analysis may be incomplete - last activity ${activityCtx.days_since_last} days ago\n`;
    response += `\n${JSON.stringify(data, null, 2)}`;
    return { content: [{ type: "text", text: response }] };
  },

  async get_performance_multipliers(args) {
    const modality = args.modality;
    if (!modality) throw new Error("Modality parameter is required (strength, hiit, or yoga)");
    const data = await callAPI(`/api/patterns/performance/benefits/${modality}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
};
