import db from '../db/index.js';
import logger from '../utils/logger.js';
import { mapAppActivityToGarminSchema } from '../utils/activity-schema-mapper.js';

// Maps sport name → Garmin sport_type integers so queries match
// activities like e_bike_mountain/mountain_biking (sport_type=2) when
// the caller searches for "cycling".
const SPORT_TYPE_IDS_BY_NAME = {
  cycling: [2, 21, 22],   // cycling, indoor_cycling, track_cycling
  running: [1, 12],        // running, trail_running
  swimming: [5],
  hiking: [15],
  walking: [14],
  skiing: [13, 32],
};

/**
 * Query app database for activities and map to legacy schema
 * @param {string} email - Athlete email
 * @param {string} startDate - Start date filter (YYYY-MM-DD)
 * @param {string} sport - Optional sport filter  
 */
export async function queryActivitiesForProfile(email, startDate, sport = null) {
  // Get user ID - activities table uses user.id as profile_id
  const user = await db('users').where('garmin_email', email).first();
  if (!user) {
    throw new Error('User not found');
  }
  
  let query = db('activities')
    .where({ user_id: user.id })
    .where('date', '>=', startDate)
    .orderBy('start_time', 'desc');
  
  if (sport) {
    const sportTypeIds = SPORT_TYPE_IDS_BY_NAME[sport.toLowerCase()];
    if (sportTypeIds) {
      // Match by activity_type text OR by the numeric sport_type column
      query = query.where(function() {
        this.where('activity_type', 'like', `%${sport}%`)
          .orWhereIn('sport_type', sportTypeIds);
      });
    } else {
      query = query.where('activity_type', 'like', `%${sport}%`);
    }
  }
  
  const activities = await query;
  
  // Map to legacy GarminDB schema for backward compatibility
  return activities.map(mapAppActivityToGarminSchema);
}

/**
 * Get activity distribution analysis
 * Shows breakdown of training by sport type over the last N days
 */
export async function getActivityDistribution(email, days = 30) {
  try {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const activities = await queryActivitiesForProfile(email, startDate);
    
    // Group by sport
    const sportStats = {};
    let totalLoad = 0;
    let totalDuration = 0;
    
    activities.forEach(activity => {
      const sport = activity.sport || 'other';
      if (!sportStats[sport]) {
        sportStats[sport] = {
          sport,
          count: 0,
          total_duration_minutes: 0,
          total_distance: 0,
          total_training_load: 0,
          total_calories: 0,
          avg_hr: [],
          recent_activities: []
        };
      }
      
      const durationMinutes = parseElapsedTime(activity.elapsed_time);
      const trainingLoad = activity.training_load || 0;
      
      sportStats[sport].count++;
      sportStats[sport].total_duration_minutes += durationMinutes;
      sportStats[sport].total_distance += activity.distance || 0;
      sportStats[sport].total_training_load += trainingLoad;
      sportStats[sport].total_calories += activity.calories || 0;
      if (activity.avg_hr) sportStats[sport].avg_hr.push(activity.avg_hr);
      
      if (sportStats[sport].recent_activities.length < 5) {
        sportStats[sport].recent_activities.push({
          date: activity.date,
          sub_sport: activity.sub_sport,
          distance: activity.distance,
          duration_minutes: durationMinutes,
          training_load: trainingLoad
        });
      }
      
      totalLoad += trainingLoad;
      totalDuration += durationMinutes;
    });
    
    // Calculate percentages and averages
    Object.values(sportStats).forEach(stats => {
      stats.percentage_of_load = totalLoad > 0 ? Math.round((stats.total_training_load / totalLoad) * 100) : 0;
      stats.percentage_of_duration = totalDuration > 0 ? Math.round((stats.total_duration_minutes / totalDuration) * 100) : 0;
      stats.avg_duration_minutes = Math.round(stats.total_duration_minutes / stats.count);
      stats.avg_training_load = Math.round(stats.total_training_load / stats.count);
      stats.avg_hr = stats.avg_hr.length > 0 
        ? Math.round(stats.avg_hr.reduce((a, b) => a + b, 0) / stats.avg_hr.length)
        : null;
      delete stats.avg_hr; // Remove the array
    });
    
    return {
      period_days: days,
      total_activities: activities.length,
      total_duration_minutes: Math.round(totalDuration),
      total_training_load: Math.round(totalLoad),
      by_sport: Object.values(sportStats).sort((a, b) => b.total_training_load - a.total_training_load)
    };
  } catch (error) {
    logger.error('Error getting activity distribution:', error);
    throw error;
  }
}

/**
 * Get sport-specific insights and recommendations
 */
export async function getSportSpecificInsights(email, days = 30) {
  try {
    const distribution = await getActivityDistribution(email, days);
    
    const insights = [];
    const recommendations = [];
    
    // Analyze training balance
    const sports = distribution.by_sport;
    const primarySport = sports[0];
    
    if (sports.length === 1) {
      insights.push({
        type: 'warning',
        message: `Training only ${primarySport.sport}. Cross-training reduces injury risk and improves overall fitness.`,
        severity: 'moderate'
      });
      recommendations.push({
        sport: 'cross_training',
        reason: 'Injury prevention and balanced fitness',
        suggestion: 'Add 1-2 sessions per week of a complementary sport (swimming, cycling, or strength training)'
      });
    }
    
    // Check for sport dominance
    if (primarySport && primarySport.percentage_of_load > 70 && sports.length > 1) {
      insights.push({
        type: 'imbalance',
        message: `${primarySport.sport} represents ${primarySport.percentage_of_load}% of training load. Consider more balance.`,
        severity: 'low'
      });
    }
    
    // Sport-specific analysis
    sports.forEach(sportStat => {
      const sportInsights = analyzeSportPatterns(sportStat);
      insights.push(...sportInsights.insights);
      recommendations.push(...sportInsights.recommendations);
    });
    
    return {
      distribution,
      insights,
      recommendations,
      balance_score: calculateBalanceScore(sports)
    };
  } catch (error) {
    logger.error('Error getting sport-specific insights:', error);
    throw error;
  }
}

/**
 * Generate sport-specific workout recommendations
 */
export async function getSportSpecificWorkouts(email, sport, intensity = 'moderate') {
  try {
    // Get recent activities for this sport to establish baseline
    const startDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const activities = await queryActivitiesForProfile(email, startDate, sport);
    
    // Limit to 10 most recent
    const recentActivities = activities.slice(0, 10);
    
    if (recentActivities.length === 0) {
      return {
        sport,
        message: `No recent ${sport} activities found. Starting with beginner-friendly recommendations.`,
        workouts: generateBeginnerWorkouts(sport, intensity)
      };
    }
    
    // Calculate baseline metrics
    const baseline = calculateSportBaseline(recentActivities, sport);
    
    // Generate structured workouts
    const workouts = generateSportWorkouts(sport, intensity, baseline);
    
    return {
      sport,
      intensity,
      baseline,
      workouts
    };
  } catch (error) {
    logger.error('Error getting sport-specific workouts:', error);
    throw error;
  }
}

/**
 * Analyze patterns for a specific sport
 */
function analyzeSportPatterns(sportStat) {
  const insights = [];
  const recommendations = [];
  const sport = sportStat.sport;
  
  // Frequency analysis
  if (sportStat.count < 2) {
    insights.push({
      type: 'low_frequency',
      message: `Only ${sportStat.count} ${sport} session in the period. Consistency drives improvement.`,
      severity: 'low'
    });
    recommendations.push({
      sport,
      reason: 'Build consistency',
      suggestion: `Aim for 2-3 ${sport} sessions per week for meaningful adaptation`
    });
  } else if (sportStat.count > 15) {
    insights.push({
      type: 'high_frequency',
      message: `${sportStat.count} ${sport} sessions may be too much. Consider recovery.`,
      severity: 'moderate'
    });
  }
  
  // Duration analysis
  if (sportStat.avg_duration_minutes < 20 && sport !== 'training') {
    insights.push({
      type: 'short_duration',
      message: `Average ${sport} duration only ${sportStat.avg_duration_minutes} minutes. Longer sessions build endurance.`,
      severity: 'low'
    });
  }
  
  // Heart rate analysis
  if (sportStat.avg_hr) {
    if (sportStat.avg_hr > 150) {
      insights.push({
        type: 'high_intensity',
        message: `Average HR ${sportStat.avg_hr} bpm for ${sport} suggests mostly hard efforts. Add easy sessions.`,
        severity: 'moderate'
      });
      recommendations.push({
        sport,
        reason: 'Polarized training principle',
        suggestion: '80% of training should be easy (conversational pace), 20% hard'
      });
    }
  }
  
  return { insights, recommendations };
}

/**
 * Calculate training balance score (0-100)
 */
function calculateBalanceScore(sports) {
  if (sports.length === 0) return 0;
  if (sports.length === 1) return 50; // Single sport = moderate score
  
  // Ideal is 3+ sports with no single sport >50% of load
  const maxPercentage = Math.max(...sports.map(s => s.percentage_of_load));
  
  let score = 60; // Base score for cross-training
  
  // Bonus for multiple sports
  if (sports.length >= 3) score += 20;
  else if (sports.length >= 2) score += 10;
  
  // Penalty for extreme imbalance
  if (maxPercentage > 70) score -= 20;
  else if (maxPercentage > 60) score -= 10;
  
  // Bonus for balanced distribution
  if (maxPercentage < 50 && sports.length >= 2) score += 10;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate baseline metrics for a sport
 */
function calculateSportBaseline(activities, sport) {
  const durations = activities.map(a => parseElapsedTime(a.elapsed_time));
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  
  const speeds = activities.filter(a => a.avg_speed).map(a => a.avg_speed);
  const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;
  
  const hrs = activities.filter(a => a.avg_hr).map(a => a.avg_hr);
  const avgHr = hrs.length > 0 ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;
  
  const distances = activities.filter(a => a.distance).map(a => a.distance);
  const avgDistance = distances.length > 0 ? distances.reduce((a, b) => a + b, 0) / distances.length : null;
  
  return {
    avg_duration_minutes: Math.round(avgDuration),
    avg_speed: avgSpeed ? parseFloat(avgSpeed.toFixed(2)) : null,
    avg_hr: avgHr,
    avg_distance: avgDistance ? parseFloat(avgDistance.toFixed(2)) : null,
    sample_size: activities.length
  };
}

/**
 * Generate sport-specific structured workouts
 */
function generateSportWorkouts(sport, intensity, baseline) {
  const workouts = [];
  
  switch (sport.toLowerCase()) {
    case 'running':
      workouts.push(...generateRunningWorkouts(intensity, baseline));
      break;
    case 'cycling':
      workouts.push(...generateCyclingWorkouts(intensity, baseline));
      break;
    case 'swimming':
      workouts.push(...generateSwimmingWorkouts(intensity, baseline));
      break;
    default:
      workouts.push(...generateGenericWorkouts(sport, intensity, baseline));
  }
  
  return workouts;
}

/**
 * Generate running-specific workouts
 */
function generateRunningWorkouts(intensity, baseline) {
  const workouts = [];
  const baseDuration = baseline.avg_duration_minutes || 40;
  
  if (intensity === 'easy' || intensity === 'recovery') {
    workouts.push({
      name: 'Easy Run',
      duration_minutes: Math.round(baseDuration * 0.8),
      structure: 'Continuous easy pace',
      intensity_target: 'Z2 (60-70% max HR)',
      pace_guidance: 'Conversational - should be able to speak in full sentences',
      focus: 'Aerobic base building, recovery',
      notes: 'If baseline pace is X, run 30-60 seconds slower per km/mile'
    });
  } else if (intensity === 'moderate') {
    workouts.push({
      name: 'Tempo Run',
      duration_minutes: Math.round(baseDuration),
      structure: '10 min warmup + 15-20 min tempo + 10 min cooldown',
      intensity_target: 'Z3-Z4 (75-85% max HR)',
      pace_guidance: 'Comfortably hard - can speak in short phrases',
      focus: 'Lactate threshold development',
      notes: 'Tempo pace = ~10K race pace or slightly slower'
    });
    
    workouts.push({
      name: 'Hill Repeats',
      duration_minutes: Math.round(baseDuration * 0.9),
      structure: '15 min warmup + 6-8 x (90 sec uphill + 2 min easy jog down) + 10 min cooldown',
      intensity_target: 'Z4-Z5 on hills',
      pace_guidance: 'Hard effort uphill, easy recovery downhill',
      focus: 'Strength, power, running economy',
      notes: 'Find a 4-6% grade hill'
    });
  } else if (intensity === 'hard') {
    workouts.push({
      name: 'VO2 Max Intervals',
      duration_minutes: Math.round(baseDuration),
      structure: '15 min warmup + 5 x (3 min @ Z5 + 3 min easy jog) + 10 min cooldown',
      intensity_target: 'Z5 (90-95% max HR)',
      pace_guidance: 'Hard breathing, can only say a few words',
      focus: 'VO2 max improvement, cardiovascular capacity',
      notes: 'Interval pace = ~5K race pace'
    });
    
    workouts.push({
      name: 'Threshold Intervals',
      duration_minutes: Math.round(baseDuration * 1.1),
      structure: '15 min warmup + 3 x (8 min @ threshold + 3 min easy) + 10 min cooldown',
      intensity_target: 'Z4 (85-90% max HR)',
      pace_guidance: 'Sustainably hard for 8 minutes',
      focus: 'Lactate threshold, race pace',
      notes: 'Threshold pace = ~1 hour race pace'
    });
  }
  
  return workouts;
}

/**
 * Generate cycling-specific workouts
 */
function generateCyclingWorkouts(intensity, baseline) {
  const workouts = [];
  const baseDuration = baseline.avg_duration_minutes || 60;
  
  if (intensity === 'easy' || intensity === 'recovery') {
    workouts.push({
      name: 'Easy Spin',
      duration_minutes: Math.round(baseDuration * 0.8),
      structure: 'Continuous easy effort',
      intensity_target: 'Z2 (60-70% FTP or max HR)',
      cadence_target: '80-95 RPM',
      focus: 'Active recovery, aerobic base',
      notes: 'Keep power low, focus on smooth pedaling'
    });
  } else if (intensity === 'moderate') {
    workouts.push({
      name: 'Sweet Spot',
      duration_minutes: Math.round(baseDuration * 1.2),
      structure: '15 min warmup + 3-4 x (10 min @ sweet spot + 5 min easy) + 10 min cooldown',
      intensity_target: 'Z3 (85-95% FTP, 75-85% max HR)',
      cadence_target: '85-95 RPM',
      focus: 'Sustainable power, efficiency',
      notes: 'Sweet spot = hard but sustainable for 10+ minutes'
    });
    
    workouts.push({
      name: 'Tempo Ride',
      duration_minutes: Math.round(baseDuration * 1.1),
      structure: '15 min warmup + 20-30 min tempo + 10 min cooldown',
      intensity_target: 'Z3 (75-85% FTP)',
      cadence_target: '85-95 RPM',
      focus: 'Endurance at moderate intensity',
      notes: 'Steady effort you could maintain for 60-90 minutes'
    });
  } else if (intensity === 'hard') {
    workouts.push({
      name: 'VO2 Max Intervals',
      duration_minutes: Math.round(baseDuration),
      structure: '15 min warmup + 5 x (4 min @ VO2 max + 4 min easy) + 10 min cooldown',
      intensity_target: 'Z5 (105-120% FTP, 90-95% max HR)',
      cadence_target: '95-105 RPM',
      focus: 'Maximum aerobic capacity',
      notes: 'Very hard effort, near maximal breathing'
    });
    
    workouts.push({
      name: 'Threshold Intervals',
      duration_minutes: Math.round(baseDuration * 1.1),
      structure: '15 min warmup + 2-3 x (8-12 min @ FTP + 5 min easy) + 10 min cooldown',
      intensity_target: 'Z4 (95-105% FTP)',
      cadence_target: '90-100 RPM',
      focus: 'Functional threshold power',
      notes: 'Sustainable hard effort for the interval duration'
    });
  }
  
  return workouts;
}

/**
 * Generate swimming-specific workouts
 */
function generateSwimmingWorkouts(intensity, baseline) {
  const workouts = [];
  const baseDistance = baseline.avg_distance || 1500; // meters
  
  if (intensity === 'easy' || intensity === 'recovery') {
    workouts.push({
      name: 'Easy Swim',
      total_distance_meters: Math.round(baseDistance * 0.8),
      structure: 'Continuous swimming with focus on form',
      intensity_target: 'Z2 (comfortable breathing)',
      pace_guidance: 'Easy pace, can breathe every 3-4 strokes comfortably',
      focus: 'Technique, feel for the water',
      example_set: `${Math.round(baseDistance * 0.8)}m continuous @ easy pace`,
      notes: 'Focus on long strokes, relaxed breathing rhythm'
    });
  } else if (intensity === 'moderate') {
    workouts.push({
      name: 'Threshold Set',
      total_distance_meters: Math.round(baseDistance),
      structure: 'Warmup + threshold intervals + cooldown',
      intensity_target: 'Z3-Z4 (breathing every 2-3 strokes)',
      pace_guidance: 'Comfortably hard, sustainable for each interval',
      focus: 'Lactate threshold, pacing',
      example_set: `200m warmup + 5 x 200m @ threshold pace (30s rest) + 100m cooldown`,
      notes: 'Threshold pace = ~1500m race pace'
    });
    
    workouts.push({
      name: 'Technique Intervals',
      total_distance_meters: Math.round(baseDistance),
      structure: 'Mixed pace with form focus',
      intensity_target: 'Z2-Z3',
      pace_guidance: 'Moderate effort with excellent form',
      focus: 'Stroke efficiency, catch and pull',
      example_set: `200m warmup + 8 x 100m (odds: form focus, evens: steady pace, 20s rest) + 100m cooldown`,
      notes: 'Focus on high elbow catch, strong finish'
    });
  } else if (intensity === 'hard') {
    workouts.push({
      name: 'Sprint Set',
      total_distance_meters: Math.round(baseDistance * 0.9),
      structure: 'Warmup + high-intensity intervals + cooldown',
      intensity_target: 'Z5 (almost maximal)',
      pace_guidance: 'Fast swimming, breathing every 2 strokes',
      focus: 'Speed, power, anaerobic capacity',
      example_set: `300m warmup + 10 x 50m @ 85-90% max (30s rest) + 100m cooldown`,
      notes: 'Quality over quantity - maintain excellent form at speed'
    });
    
    workouts.push({
      name: 'VO2 Max Set',
      total_distance_meters: Math.round(baseDistance),
      structure: 'Hard intervals with short rest',
      intensity_target: 'Z4-Z5',
      pace_guidance: 'Hard breathing, near-maximal effort',
      focus: 'Cardiovascular capacity, pain tolerance',
      example_set: `200m warmup + 6 x 150m @ hard (20s rest) + 8 x 25m sprint (10s rest) + 100m cooldown`,
      notes: 'Push the pace, embrace the discomfort'
    });
  }
  
  return workouts;
}

/**
 * Generate generic workouts for other sports
 */
function generateGenericWorkouts(sport, intensity, baseline) {
  const baseDuration = baseline.avg_duration_minutes || 40;
  
  return [{
    name: `${intensity.charAt(0).toUpperCase() + intensity.slice(1)} ${sport}`,
    duration_minutes: Math.round(baseDuration),
    structure: `Continuous ${intensity} effort`,
    intensity_target: intensity === 'easy' ? 'Z2' : intensity === 'moderate' ? 'Z3' : 'Z4-Z5',
    focus: `${sport} specific training`,
    notes: `Maintain ${intensity} intensity throughout the session`
  }];
}

/**
 * Generate beginner workouts when no baseline exists
 */
function generateBeginnerWorkouts(sport, intensity) {
  switch (sport.toLowerCase()) {
    case 'running':
      return [{
        name: 'Beginner Run',
        duration_minutes: 30,
        structure: 'Run/walk intervals: 5 min warmup walk + 6 x (2 min run + 2 min walk) + 5 min cooldown walk',
        intensity_target: 'Easy - able to hold conversation',
        focus: 'Build running endurance gradually',
        notes: 'Start conservatively. Better to finish feeling you could do more.'
      }];
    case 'cycling':
      return [{
        name: 'Beginner Ride',
        duration_minutes: 45,
        structure: 'Continuous easy pedaling on flat terrain',
        intensity_target: 'Z2 - comfortable breathing',
        cadence_target: '80-90 RPM',
        focus: 'Build cycling endurance and bike handling skills',
        notes: 'Focus on maintaining steady cadence'
      }];
    case 'swimming':
      return [{
        name: 'Beginner Swim',
        total_distance_meters: 800,
        structure: '200m warmup (mix strokes/kick/drill) + 4 x 100m (30s rest) + 100m cooldown',
        intensity_target: 'Easy - breathing every 3-4 strokes',
        focus: 'Stroke technique and breathing rhythm',
        notes: 'Rest as needed. Focus on relaxation and form over speed.'
      }];
    default:
      return [{
        name: `Beginner ${sport}`,
        duration_minutes: 30,
        structure: 'Easy continuous effort',
        focus: 'Build familiarity and basic fitness',
        notes: 'Start with shorter sessions and build gradually'
      }];
  }
}

/**
 * Parse elapsed time from seconds or HH:MM:SS format to minutes
 */
function parseElapsedTime(timeValue) {
  if (!timeValue) return 0;
  
  // If it's a number, assume seconds (from app database)
  if (typeof timeValue === 'number') {
    return timeValue / 60; // Convert seconds to minutes
  }
  
  // If it's a string in HH:MM:SS format (legacy)
  const parts = String(timeValue).split(':').map(p => parseFloat(p));
  if (parts.length === 3) {
    return parts[0] * 60 + parts[1] + parts[2] / 60;
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}
