import db from '../db/index.js';
import logger from '../utils/logger.js';
import { startOfWeek, subDays, format, addDays } from 'date-fns';
import { getUpcomingActivities } from './planned-activities.js';
import { estimateObjectTokens, TOKEN_BUDGET } from '../utils/token-estimator.js';

/**
 * Build comprehensive context for LLM coaching decisions
 * Assembles all relevant data: profile, history, trends, constraints
 */

/**
 * Get athlete profile with all preferences
 */
async function getProfile(profileId) {
  const profile = await db('athlete_profiles')
    .where({ profile_id: profileId })
    .first();
  
  if (!profile) {
    throw new Error(`Profile ${profileId} not found`);
  }
  
  return JSON.parse(profile.profile_data);
}

/**
 * Get training mode configuration
 */
async function getTrainingMode(profileId) {
  const profile = await db('athlete_profiles')
    .where({ profile_id: profileId })
    .first();
  
  if (!profile) return null;
  
  const mode = await db('training_modes')
    .where({ profile_id: profile.id })
    .first();
  
  return mode ? {
    current_mode: mode.current_mode,
    config: JSON.parse(mode.mode_config || '{}'),
    history: JSON.parse(mode.switch_history || '[]')
  } : null;
}

/**
 * Get daily metrics for date range
 */
async function getDailyMetrics(profileId, startDate, endDate) {
  const profile = await db('athlete_profiles')
    .where({ profile_id: profileId })
    .first();
  
  if (!profile) return [];
  
  const metrics = await db('daily_metrics')
    .where({ profile_id: profile.id })
    .whereBetween('date', [startDate, endDate])
    .orderBy('date', 'asc');
  
  return metrics.map(m => ({
    date: m.date,
    ...JSON.parse(m.metrics_data)
  }));
}

/**
 * Calculate rolling averages for recovery signals
 */
function calculateTrends(dailyMetrics) {
  if (dailyMetrics.length === 0) return null;
  
  // Last 7 days
  const last7Days = dailyMetrics.slice(-7);
  const last14Days = dailyMetrics.slice(-14);
  
  const calculateAvg = (data, field) => {
    const values = data
      .map(d => d[field])
      .filter(v => v != null);
    return values.length > 0 
      ? values.reduce((sum, v) => sum + v, 0) / values.length 
      : null;
  };
  
  return {
    hrv_7d_avg: calculateAvg(last7Days, 'hrv'),
    hrv_14d_avg: calculateAvg(last14Days, 'hrv'),
    rhr_7d_avg: calculateAvg(last7Days, 'resting_hr'),
    rhr_14d_avg: calculateAvg(last14Days, 'resting_hr'),
    sleep_7d_avg: calculateAvg(last7Days, 'sleep_hours'),
    sleep_14d_avg: calculateAvg(last14Days, 'sleep_hours'),
    stress_7d_avg: calculateAvg(last7Days, 'stress_avg'),
    training_load_7d_avg: calculateAvg(last7Days, 'training_load')
  };
}

/**
 * Get current week status
 */
async function getWeekStatus(profileId, date) {
  const profile = await db('athlete_profiles')
    .where({ profile_id: profileId })
    .first();
  
  if (!profile) return null;
  
  const weekStart = startOfWeek(new Date(date), { weekStartsOn: 1 }); // Monday
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  
  const weekSummary = await db('weekly_summaries')
    .where({ profile_id: profile.id, week_start: weekStartStr })
    .first();
  
  const workoutsThisWeek = await db('workout_history')
    .where({ profile_id: profile.id })
    .where('date', '>=', weekStartStr)
    .where('date', '<=', date);
  
  const completed = workoutsThisWeek.filter(w => w.completed).length;
  const totalMinutes = workoutsThisWeek
    .filter(w => w.completed)
    .reduce((sum, w) => {
      const plan = JSON.parse(w.selected_plan || '{}');
      return sum + (plan.duration_min || 0);
    }, 0);
  
  // Count hard days (Z4+ for 10+ minutes)
  const hardDays = workoutsThisWeek.filter(w => {
    if (!w.completed) return false;
    const plan = JSON.parse(w.selected_plan || '{}');
    return plan.intensity === 'hiit' || plan.intensity === 'tempo_threshold';
  }).length;
  
  return {
    week_start: weekStartStr,
    planned_workouts: weekSummary ? JSON.parse(weekSummary.llm_generated_plan || '[]').length : 0,
    completed_workouts: completed,
    total_volume_minutes: totalMinutes,
    hard_days_count: hardDays,
    compliance_pct: weekSummary ? weekSummary.compliance_pct : null
  };
}

/**
 * Analyze user's workout patterns (completion rate by type, time of day)
 */
async function analyzePatterns(profileId) {
  const profile = await db('athlete_profiles')
    .where({ profile_id: profileId })
    .first();
  
  if (!profile) return null;
  
  const last30Days = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  const workouts = await db('workout_history')
    .where({ profile_id: profile.id })
    .where('date', '>=', last30Days);
  
  const byIntensity = {};
  const feedbackByIntensity = {};
  
  workouts.forEach(w => {
    const plan = JSON.parse(w.selected_plan || '{}');
    const intensity = plan.intensity || 'unknown';
    
    if (!byIntensity[intensity]) {
      byIntensity[intensity] = { planned: 0, completed: 0 };
      feedbackByIntensity[intensity] = [];
    }
    
    byIntensity[intensity].planned++;
    if (w.completed) {
      byIntensity[intensity].completed++;
      if (w.user_feedback) {
        feedbackByIntensity[intensity].push(w.user_feedback);
      }
    }
  });
  
  return {
    completion_by_intensity: byIntensity,
    recent_feedback: feedbackByIntensity,
    total_workouts_30d: workouts.length,
    completion_rate_30d: workouts.length > 0 
      ? workouts.filter(w => w.completed).length / workouts.length 
      : 0
  };
}

/**
 * Main function: Build complete context for LLM
 */
export async function buildDailyContext(profileId, date) {
  try {
    logger.info(`Building context for ${profileId} on ${date}`);
    
    const profile = await getProfile(profileId);
    const trainingMode = await getTrainingMode(profileId);
    
    // Get last 14 days of data
    const startDate = format(subDays(new Date(date), 14), 'yyyy-MM-dd');
    const dailyMetrics = await getDailyMetrics(profileId, startDate, date);
    
    const trends = calculateTrends(dailyMetrics);
    const weekStatus = await getWeekStatus(profileId, date);
    const patterns = await analyzePatterns(profileId);
    
    // Get planned activities for context (next 7 days)
    const profileRecord = await db('athlete_profiles').where({ profile_id: profileId }).first();
    const plannedActivities = profileRecord ? await getUpcomingActivities(profileRecord.id, { daysAhead: 7 }) : [];
    
    // Get today's data if available
    const todayMetrics = dailyMetrics.find(d => d.date === date);
    
    const context = {
      date,
      profile: {
        goals: profile.goals,
        motivations: profile.motivations,
        favorite_sports: profile.favorite_sports,
        equipment: profile.access?.equipment || [],
        facilities: profile.access?.facilities || [],
        days_per_week: profile.access?.days_per_week,
        minutes_per_session: profile.access?.minutes_per_session,
        injuries: profile.injuries_conditions || [],
        baselines: profile.baselines,
        preferences: profile.preferences,
        location: profile.location
      },
      training_mode: trainingMode,
      recent_history: dailyMetrics.slice(-7),  // Last 7 days
      full_history: dailyMetrics,  // All 14 days for deeper analysis
      trends,
      today: todayMetrics,
      current_week: weekStatus,
      patterns,
      constraints: {
        available_time: profile.availability?.weekly_schedule?.[new Date(date).getDay()] || null,
        preferred_time: profile.preferences?.preferred_training_time
      },
      planned_activities: plannedActivities.map(pa => ({
        date: pa.planned_date,
        type: pa.activity_type,
        description: pa.description,
        time_of_day: pa.time_of_day,
        priority: pa.priority,
        is_event: pa.is_event,
        is_social: pa.is_social,
        context: pa.context
      }))
    };
    
    logger.info(`Context built successfully for ${profileId}`);
    return context;
  } catch (error) {
    logger.error(`Failed to build context for ${profileId}:`, error);
    throw error;
  }
}

/**
 * Build context for weekly planning
 */
export async function buildWeeklyContext(profileId, weekStartDate) {
  try {
    logger.info(`Building weekly context for ${profileId} starting ${weekStartDate}`);
    
    const profile = await getProfile(profileId);
    const trainingMode = await getTrainingMode(profileId);
    
    // Get last 4 weeks of data
    const startDate = format(subDays(new Date(weekStartDate), 28), 'yyyy-MM-dd');
    const dailyMetrics = await getDailyMetrics(profileId, startDate, weekStartDate);
    
    // Get last 4 weeks summaries
    const profileRecord = await db('athlete_profiles')
      .where({ profile_id: profileId })
      .first();
    
    const weeklySummaries = await db('weekly_summaries')
      .where({ profile_id: profileRecord.id })
      .where('week_start', '>=', startDate)
      .orderBy('week_start', 'desc')
      .limit(4);
    
    const patterns = await analyzePatterns(profileId);
    
    // Get planned activities for the week (next 7 days from week start)
    const plannedActivities = profileRecord ? await getUpcomingActivities(profileRecord.id, {
      fromDate: weekStartDate,
      daysAhead: 7
    }) : [];
    
    return {
      week_start: weekStartDate,
      profile: {
        goals: profile.goals,
        favorite_sports: profile.favorite_sports,
        equipment: profile.access?.equipment || [],
        days_per_week: profile.access?.days_per_week,
        injuries: profile.injuries_conditions || [],
        baselines: profile.baselines,
        preferences: profile.preferences
      },
      training_mode: trainingMode,
      last_4_weeks: weeklySummaries.map(w => ({
        week_start: w.week_start,
        plan: JSON.parse(w.llm_generated_plan || '[]'),
        compliance: w.compliance_pct,
        volume: w.actual_volume_minutes,
        adjustments: JSON.parse(w.llm_adjustments || '{}')
      })),
      recent_metrics: dailyMetrics.slice(-14),
      patterns,
      planned_activities: plannedActivities.map(pa => ({
        date: pa.planned_date,
        type: pa.activity_type,
        description: pa.description,
        time_of_day: pa.time_of_day,
        priority: pa.priority,
        is_event: pa.is_event,
        is_social: pa.is_social,
        context: pa.context
      }))
    };
  } catch (error) {
    logger.error(`Failed to build weekly context for ${profileId}:`, error);
    throw error;
  }
}

/**
 * Split daily context into ordered chunks for multi-turn LLM calls.
 * If the full context fits within the token budget, returns a single chunk.
 * Otherwise splits into:
 *   Chunk 1: profile + today + planned_activities + constraints
 *   Chunk 2: recent_history (7d) + trends
 *   Chunk 3: full_history (days 8-14) + patterns + current_week + training_mode
 *
 * Each chunk carries chunkIndex and totalChunks for the LLM caller.
 */
export async function buildChunkedDailyContext(profileId, date) {
  const fullContext = await buildDailyContext(profileId, date);
  const estimatedTokens = estimateObjectTokens(fullContext);

  logger.info(`Daily context for ${profileId}: ~${estimatedTokens} tokens (budget: ${TOKEN_BUDGET})`);

  if (estimatedTokens <= TOKEN_BUDGET) {
    return [{ ...fullContext, chunkIndex: 1, totalChunks: 1 }];
  }

  // Split into 3 priority-ordered chunks
  const chunk1 = {
    date: fullContext.date,
    profile: fullContext.profile,
    today: fullContext.today,
    planned_activities: fullContext.planned_activities,
    constraints: fullContext.constraints,
    chunkIndex: 1,
    totalChunks: 3,
  };

  const chunk2 = {
    date: fullContext.date,
    recent_history: fullContext.recent_history,
    trends: fullContext.trends,
    chunkIndex: 2,
    totalChunks: 3,
  };

  const chunk3 = {
    date: fullContext.date,
    full_history: fullContext.full_history?.slice(0, -7) || [], // days 8-14 only
    patterns: fullContext.patterns,
    current_week: fullContext.current_week,
    training_mode: fullContext.training_mode,
    chunkIndex: 3,
    totalChunks: 3,
  };

  return [chunk1, chunk2, chunk3];
}

/**
 * Split weekly context into ordered chunks for multi-turn LLM calls.
 */
export async function buildChunkedWeeklyContext(profileId, weekStartDate) {
  const fullContext = await buildWeeklyContext(profileId, weekStartDate);
  const estimatedTokens = estimateObjectTokens(fullContext);

  logger.info(`Weekly context for ${profileId}: ~${estimatedTokens} tokens (budget: ${TOKEN_BUDGET})`);

  if (estimatedTokens <= TOKEN_BUDGET) {
    return [{ ...fullContext, chunkIndex: 1, totalChunks: 1 }];
  }

  const chunk1 = {
    week_start: fullContext.week_start,
    profile: fullContext.profile,
    training_mode: fullContext.training_mode,
    planned_activities: fullContext.planned_activities,
    chunkIndex: 1,
    totalChunks: 3,
  };

  const chunk2 = {
    week_start: fullContext.week_start,
    recent_metrics: fullContext.recent_metrics?.slice(-7) || [],
    patterns: fullContext.patterns,
    chunkIndex: 2,
    totalChunks: 3,
  };

  const chunk3 = {
    week_start: fullContext.week_start,
    last_4_weeks: fullContext.last_4_weeks,
    recent_metrics: fullContext.recent_metrics?.slice(0, -7) || [],
    chunkIndex: 3,
    totalChunks: 3,
  };

  return [chunk1, chunk2, chunk3];
}
