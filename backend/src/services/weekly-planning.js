import logger from '../utils/logger.js';
import {
  getTrainingLoadTrend,
  getRecoveryTrend,
  getHrvBaseline,
  getTrainingStressBalance
} from './stats-service.js';

/**
 * Weekly Workout Planning Service
 * Generates intelligent multi-day training plans based on current fitness, fatigue, and recovery status
 */

/**
 * Generate a 7-day training plan
 * @param {string} email - Athlete email
 * @param {string} startDate - Plan start date (YYYY-MM-DD), defaults to tomorrow
 * @returns {Object} Weekly plan with daily workouts and rationale
 */
export async function generateWeeklyPlan(email, startDate = null) {
  try {
    // Start from tomorrow by default
    const planStart = startDate 
      ? new Date(startDate)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    // Fetch current stats
    const [loadTrend, recoveryTrend, hrvBaseline, tsb] = await Promise.all([
      getTrainingLoadTrend(email, 60),
      getRecoveryTrend(email, 60),
      getHrvBaseline(email, 60),
      getTrainingStressBalance(email, 60)
    ]);

    // Analyze current state
    const currentState = analyzeTrainingState({
      loadTrend,
      recoveryTrend,
      hrvBaseline,
      tsb
    });

    // Determine if a recovery week is needed
    const needsRecoveryWeek = shouldScheduleRecoveryWeek(currentState, loadTrend);

    // Generate day-by-day plan
    const dailyWorkouts = generateDailyWorkouts({
      startDate: planStart,
      currentState,
      needsRecoveryWeek,
      loadTrend,
      recoveryTrend,
      hrvBaseline,
      tsb
    });

    return {
      plan_start: planStart.toISOString().split('T')[0],
      plan_end: new Date(planStart.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      plan_type: needsRecoveryWeek ? 'recovery_week' : 'progression_week',
      current_state: currentState,
      weekly_targets: calculateWeeklyTargets(currentState, needsRecoveryWeek, loadTrend),
      daily_workouts: dailyWorkouts,
      coaching_notes: generateCoachingNotes(currentState, needsRecoveryWeek, dailyWorkouts)
    };
  } catch (error) {
    logger.error('Error generating weekly plan:', error);
    throw error;
  }
}

/**
 * Analyze current training state to inform planning decisions
 */
function analyzeTrainingState({ loadTrend, recoveryTrend, hrvBaseline, tsb }) {
  const acr = loadTrend.current.acute_chronic_ratio;
  const recovery = recoveryTrend.current.recovery_score;
  const hrvStatus = hrvBaseline.current.status;
  const tsbValue = tsb.current.tsb;
  const tsbForm = tsb.current.form;

  // Determine overall readiness (0-100)
  let readiness = 0;
  
  // Recovery contributes 35%
  readiness += (recovery || 0) * 0.35;
  
  // ACR contributes 25% (optimal zone = 0.8-1.25)
  let acrScore = 50;
  if (acr >= 0.8 && acr <= 1.25) acrScore = 100;
  else if (acr > 1.25 && acr <= 1.5) acrScore = 70;
  else if (acr > 1.5) acrScore = 40;
  else if (acr < 0.8) acrScore = 60;
  readiness += acrScore * 0.25;
  
  // HRV contributes 20%
  const hrvScoreMap = { very_high: 100, high: 85, normal: 70, low: 50, very_low: 30 };
  readiness += (hrvScoreMap[hrvStatus] || 50) * 0.20;
  
  // TSB contributes 20%
  const tsbScoreMap = { rested: 90, fresh: 100, fatigued: 60, overreached: 30 };
  readiness += (tsbScoreMap[tsbForm] || 50) * 0.20;

  // Determine training capacity
  let capacity = 'high';
  if (readiness < 40 || acr > 1.5 || tsbForm === 'overreached') {
    capacity = 'very_low';
  } else if (readiness < 55 || acr > 1.3 || recovery < 50) {
    capacity = 'low';
  } else if (readiness < 70) {
    capacity = 'moderate';
  }

  return {
    readiness_score: Math.round(readiness),
    capacity,
    recovery_status: recovery >= 70 ? 'good' : recovery >= 50 ? 'fair' : 'poor',
    load_status: loadTrend.current.status,
    fatigue_level: tsbForm,
    limiting_factors: identifyLimitingFactors({ loadTrend, recoveryTrend, hrvBaseline, tsb })
  };
}

/**
 * Determine if athlete needs a recovery week
 */
function shouldScheduleRecoveryWeek(currentState, loadTrend) {
  // Force recovery week if very fatigued
  if (currentState.capacity === 'very_low') return true;
  if (currentState.fatigue_level === 'overreached') return true;
  
  // Check for sustained high load (3+ weeks)
  const trend = loadTrend.trend || [];
  let highLoadWeeks = 0;
  
  // Sample every 7 days for last 21 days
  for (let i = 0; i < Math.min(3, Math.floor(trend.length / 7)); i++) {
    const weekIndex = i * 7;
    if (weekIndex < trend.length) {
      const weekData = trend.slice(weekIndex, weekIndex + 7);
      const avgAcr = weekData.reduce((sum, d) => {
        const acr = d.chronic_load > 0 ? d.acute_load / d.chronic_load : 1;
        return sum + acr;
      }, 0) / weekData.length;
      
      if (avgAcr > 1.2) highLoadWeeks++;
    }
  }
  
  return highLoadWeeks >= 3;
}

/**
 * Calculate weekly training targets
 */
function calculateWeeklyTargets(currentState, isRecoveryWeek, loadTrend) {
  const chronicLoad = loadTrend.current.chronic_load || 250;
  
  if (isRecoveryWeek) {
    // Recovery week: 60% of chronic load
    return {
      total_load: Math.round(chronicLoad * 0.6 * 7),
      target_acr: 0.6,
      hard_days: 0,
      moderate_days: 2,
      easy_days: 3,
      rest_days: 2,
      load_increase: -40
    };
  }
  
  // Normal progression week
  let loadIncrease = 0;
  let hardDays = 2;
  let moderateDays = 2;
  let easyDays = 2;
  let restDays = 1;
  
  if (currentState.capacity === 'low') {
    // Conservative week: maintain load
    loadIncrease = 0;
    hardDays = 1;
    moderateDays = 2;
    easyDays = 3;
    restDays = 1;
  } else if (currentState.capacity === 'moderate') {
    // Moderate progression: +5%
    loadIncrease = 5;
    hardDays = 2;
    moderateDays = 2;
    easyDays = 2;
    restDays = 1;
  } else if (currentState.capacity === 'high') {
    // Good progression: +8%
    loadIncrease = 8;
    hardDays = 2;
    moderateDays = 2;
    easyDays = 2;
    restDays = 1;
  }
  
  const weeklyMultiplier = 1 + (loadIncrease / 100);
  const targetAcr = Math.min(1.3, 1 + (loadIncrease / 100)); // Cap at 1.3
  
  return {
    total_load: Math.round(chronicLoad * weeklyMultiplier * 7),
    target_acr: parseFloat(targetAcr.toFixed(2)),
    hard_days: hardDays,
    moderate_days: moderateDays,
    easy_days: easyDays,
    rest_days: restDays,
    load_increase: loadIncrease
  };
}

/**
 * Generate daily workouts for the week
 */
function generateDailyWorkouts({ startDate, currentState, needsRecoveryWeek, loadTrend, recoveryTrend, hrvBaseline, tsb }) {
  const chronicLoad = loadTrend.current.chronic_load || 250;
  const dailyWorkouts = [];
  
  // Get weekly targets
  const weeklyTargets = calculateWeeklyTargets(currentState, needsRecoveryWeek, loadTrend);
  
  // Polarized training: distribute intensity across the week
  // Pattern: [Hard, Easy, Moderate, Easy, Hard, Easy, Rest] or variations
  let intensityPattern;
  
  if (needsRecoveryWeek) {
    intensityPattern = ['easy', 'recovery', 'easy', 'moderate', 'easy', 'recovery', 'rest'];
  } else if (currentState.capacity === 'very_low') {
    intensityPattern = ['recovery', 'easy', 'recovery', 'easy', 'recovery', 'easy', 'rest'];
  } else if (currentState.capacity === 'low') {
    intensityPattern = ['easy', 'moderate', 'easy', 'easy', 'easy', 'recovery', 'rest'];
  } else if (currentState.capacity === 'moderate') {
    intensityPattern = ['moderate', 'easy', 'hard', 'easy', 'moderate', 'easy', 'rest'];
  } else {
    intensityPattern = ['hard', 'easy', 'moderate', 'easy', 'hard', 'easy', 'rest'];
  }
  
  // Generate workout for each day
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(startDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const intensity = intensityPattern[dayOffset];
    const workout = generateDailyWorkout(date, intensity, chronicLoad, currentState, weeklyTargets);
    dailyWorkouts.push(workout);
  }
  
  return dailyWorkouts;
}

/**
 * Generate a single day's workout
 */
function generateDailyWorkout(date, intensity, chronicLoad, currentState, weeklyTargets) {
  const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
  
  if (intensity === 'rest') {
    return {
      date: date.toISOString().split('T')[0],
      day_of_week: dayOfWeek,
      intensity: 'rest',
      training_load: 0,
      duration_minutes: 0,
      description: 'Complete Rest',
      activities: ['Rest and recovery', 'Light stretching if desired'],
      focus: 'Physical and mental recovery',
      rationale: 'Rest is essential for adaptation and preventing overtraining.'
    };
  }
  
  // Calculate target load for this intensity
  let loadMultiplier;
  let durationMultiplier;
  
  switch (intensity) {
    case 'recovery':
      loadMultiplier = 0.4;
      durationMultiplier = 0.6;
      break;
    case 'easy':
      loadMultiplier = 0.7;
      durationMultiplier = 0.8;
      break;
    case 'moderate':
      loadMultiplier = 1.0;
      durationMultiplier = 1.0;
      break;
    case 'hard':
      loadMultiplier = 1.3;
      durationMultiplier = 1.2;
      break;
    default:
      loadMultiplier = 0.7;
      durationMultiplier = 0.8;
  }
  
  // Apply weekly target multiplier
  const weeklyLoadFactor = 1 + (weeklyTargets.load_increase / 100);
  const targetLoad = Math.round(chronicLoad * loadMultiplier * weeklyLoadFactor);
  const duration = Math.round(240 * durationMultiplier); // Base 240 min for chronic load
  
  // Generate activity options
  const activities = generateActivityOptions(intensity, duration);
  
  // Generate focus and rationale
  const { focus, rationale } = generateWorkoutFocus(intensity, currentState, dayOfWeek);
  
  return {
    date: date.toISOString().split('T')[0],
    day_of_week: dayOfWeek,
    intensity,
    training_load: targetLoad,
    duration_minutes: duration,
    description: getIntensityDescription(intensity),
    activities,
    focus,
    rationale
  };
}

/**
 * Generate activity options based on intensity
 */
function generateActivityOptions(intensity, duration) {
  const activities = [];
  
  switch (intensity) {
    case 'recovery':
      activities.push(`Easy yoga or stretching (20-30 min)`);
      activities.push(`Light walk (30-40 min)`);
      activities.push(`Easy swim (20-30 min)`);
      activities.push(`Gentle cycling (30-40 min)`);
      break;
      
    case 'easy':
      activities.push(`Easy run (${Math.round(duration * 0.5)}-${Math.round(duration * 0.6)} min, Z2)`);
      activities.push(`Easy bike ride (${Math.round(duration * 0.7)}-${Math.round(duration * 0.9)} min, Z2)`);
      activities.push(`Easy swim (${Math.round(duration * 0.4)}-${Math.round(duration * 0.5)} min)`);
      activities.push(`Hike (${Math.round(duration * 0.7)}-${Math.round(duration * 0.9)} min)`);
      break;
      
    case 'moderate':
      activities.push(`Tempo run (10-15 min tempo, ${Math.round(duration * 0.6)}-${duration} min total)`);
      activities.push(`Sweet spot intervals (3-4 x 10 min, ${Math.round(duration * 0.7)}-${Math.round(duration * 0.9)} min total)`);
      activities.push(`Moderate hill repeats (6-8 x 2 min, ${Math.round(duration * 0.5)}-${Math.round(duration * 0.6)} min total)`);
      activities.push(`Steady state swim (30-40 min Z3, ${duration} min total)`);
      break;
      
    case 'hard':
      activities.push(`VO2 max intervals (5-6 x 3 min @ Z5, ${duration} min total)`);
      activities.push(`Threshold workout (2-3 x 8-12 min @ Z4, ${Math.round(duration * 0.8)}-${Math.round(duration * 0.9)} min total)`);
      activities.push(`Hard hill repeats (8-10 x 90 sec @ max, ${Math.round(duration * 0.5)}-${Math.round(duration * 0.6)} min total)`);
      activities.push(`Race pace workout (3-4 x 5 min @ race pace, ${duration} min total)`);
      break;
  }
  
  return activities;
}

/**
 * Get intensity description
 */
function getIntensityDescription(intensity) {
  const descriptions = {
    recovery: 'Active Recovery',
    easy: 'Easy Endurance',
    moderate: 'Moderate Training',
    hard: 'High Intensity'
  };
  return descriptions[intensity] || intensity;
}

/**
 * Generate workout focus and rationale
 */
function generateWorkoutFocus(intensity, currentState, dayOfWeek) {
  const focuses = {
    recovery: {
      focus: 'Movement quality, relaxation, active recovery',
      rationale: 'Promote blood flow and recovery without adding training stress.'
    },
    easy: {
      focus: 'Aerobic base building, conversation pace',
      rationale: 'Build endurance foundation at low stress. These workouts improve mitochondrial density and fat oxidation.'
    },
    moderate: {
      focus: 'Tempo/threshold work, controlled intensity',
      rationale: 'Develop lactate threshold and sustainable high-intensity capacity. Bridges easy and hard training.'
    },
    hard: {
      focus: 'VO2 max, neuromuscular power, race-specific intensity',
      rationale: 'Push physiological limits to drive adaptation. Only do when well-recovered.'
    }
  };
  
  return focuses[intensity] || focuses.easy;
}

/**
 * Identify limiting factors (shared with workout recommendations)
 */
function identifyLimitingFactors({ loadTrend, recoveryTrend, hrvBaseline, tsb }) {
  const factors = [];
  
  // Training load issues
  const acr = loadTrend.current.acute_chronic_ratio;
  if (acr > 1.5) {
    factors.push({
      factor: 'Training Load',
      severity: 'high',
      description: `Acute:Chronic ratio of ${acr.toFixed(2)} indicates high injury risk. Training load ramped up too quickly.`,
      recommendation: 'Reduce training volume by 20-30% for the next week.'
    });
  } else if (acr < 0.8) {
    factors.push({
      factor: 'Training Load',
      severity: 'moderate',
      description: `Low acute:chronic ratio (${acr.toFixed(2)}) suggests detraining risk.`,
      recommendation: 'Gradually increase training volume by 5-10% per week.'
    });
  }
  
  // Recovery issues
  const recovery = recoveryTrend.current.recovery_score;
  if (recovery < 40) {
    factors.push({
      factor: 'Recovery Score',
      severity: 'high',
      description: `Very low recovery (${recovery}%). Body needs significant rest.`,
      recommendation: 'Take 2-3 days of complete rest or very easy activity.'
    });
  } else if (recovery < 60) {
    const limitingFactor = recoveryTrend.limiting_factor || 'unknown';
    factors.push({
      factor: 'Recovery Score',
      severity: 'moderate',
      description: `Below average recovery (${recovery}%). Main issue: ${limitingFactor}.`,
      recommendation: 'Focus on easy training until recovery improves.'
    });
  }
  
  // HRV issues
  const hrvStatus = hrvBaseline.current.status;
  const hrvPercentile = hrvBaseline.current.percentile_rank;
  if (hrvStatus === 'very_low' || hrvPercentile < 10) {
    factors.push({
      factor: 'HRV',
      severity: 'high',
      description: `HRV very low (${hrvPercentile}th percentile). Significant physiological stress.`,
      recommendation: 'Prioritize sleep, nutrition, and stress management. Reduce training intensity.'
    });
  } else if (hrvStatus === 'low' || hrvPercentile < 25) {
    factors.push({
      factor: 'HRV',
      severity: 'moderate',
      description: `HRV below normal (${hrvPercentile}th percentile). Body needs extra recovery time.`,
      recommendation: 'Keep training easy to moderate until HRV returns to normal range.'
    });
  }
  
  // TSB/Fatigue issues
  const tsbValue = tsb.current.tsb;
  const tsbForm = tsb.current.form;
  if (tsbForm === 'overreached') {
    factors.push({
      factor: 'Training Stress Balance',
      severity: 'high',
      description: `TSB of ${tsbValue} indicates significant overreaching. Fatigue (${tsb.current.fatigue}) far exceeds fitness (${tsb.current.fitness}).`,
      recommendation: 'Take 3-5 days of active recovery or rest. Let fatigue dissipate before resuming normal training.'
    });
  } else if (tsbForm === 'fatigued') {
    factors.push({
      factor: 'Training Stress Balance',
      severity: 'moderate',
      description: `TSB of ${tsbValue} shows accumulated fatigue.`,
      recommendation: 'Include an extra recovery day this week. Avoid hard sessions until TSB improves.'
    });
  }
  
  return factors;
}

/**
 * Generate coaching notes for the week
 */
function generateCoachingNotes(currentState, isRecoveryWeek, dailyWorkouts) {
  const notes = [];
  
  // Overall week strategy
  if (isRecoveryWeek) {
    notes.push('🔄 **Recovery Week**: Your body needs a break to absorb recent training. Reduced volume this week will help you come back stronger.');
  } else if (currentState.capacity === 'high') {
    notes.push('💪 **Building Week**: Your recovery indicators look good. This week progressively builds fitness with quality sessions.');
  } else if (currentState.capacity === 'moderate') {
    notes.push('📈 **Maintenance Week**: Maintaining current fitness level with controlled progression.');
  } else {
    notes.push('⚠️ **Conservative Week**: Your body needs extra recovery. Focus on easy training and let your fitness rebound.');
  }
  
  // Readiness assessment
  notes.push(`📊 **Current Readiness**: ${currentState.readiness_score}/100 (${currentState.capacity} capacity)`);
  
  // Key limiting factors
  if (currentState.limiting_factors.length > 0) {
    const topFactor = currentState.limiting_factors[0];
    notes.push(`🎯 **Primary Focus**: ${topFactor.factor} - ${topFactor.recommendation}`);
  }
  
  // Week structure
  const hardDays = dailyWorkouts.filter(d => d.intensity === 'hard').length;
  const moderateDays = dailyWorkouts.filter(d => d.intensity === 'moderate').length;
  const easyDays = dailyWorkouts.filter(d => d.intensity === 'easy').length;
  notes.push(`📅 **Week Structure**: ${hardDays} hard, ${moderateDays} moderate, ${easyDays} easy days (polarized training for optimal gains)`);
  
  // Recovery reminder
  notes.push('💤 **Remember**: Quality sleep and nutrition are as important as the workouts themselves.');
  
  return notes;
}
