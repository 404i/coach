import logger from '../utils/logger.js';
import { addDataContextToResponse } from '../middleware/data-freshness.js';
import {
  getTrainingLoadTrend,
  getRecoveryTrend,
  getHrvBaseline,
  getTrainingStressBalance
} from './stats-service.js';

/**
 * Workout Recommendation Engine
 * Uses training load, recovery, HRV, and TSB to recommend optimal workout intensity
 */

/**
 * Generate workout recommendations based on current athlete status
 * Returns 4 workout options at different intensities
 */
export async function getWorkoutRecommendations(email, date = null) {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    // Fetch all stats in parallel
    const [loadTrend, recoveryTrend, hrvBaseline, tsb] = await Promise.all([
      getTrainingLoadTrend(email, 60),
      getRecoveryTrend(email, 60),
      getHrvBaseline(email, 60),
      getTrainingStressBalance(email, 60)
    ]);

    // Calculate training readiness score (0-100)
    // This is a COMPOSITE metric combining recovery, training load, HRV, and TSB
    const readinessResult = calculateReadinessScore({
      recovery: recoveryTrend.current.recovery_score,
      acr: loadTrend.current.acute_chronic_ratio,
      hrvStatus: hrvBaseline.current.status,
      tsbForm: tsb.current.form
    });

    // Determine recommended intensity level
    const intensityLevel = determineIntensityLevel({
      readinessScore: readinessResult.total_score,
      recovery: recoveryTrend.current.recovery_score,
      acr: loadTrend.current.acute_chronic_ratio,
      tsb: tsb.current.tsb,
      hrvPercentile: hrvBaseline.current.percentile_rank
    });

    // Generate 4 workout options
    const workouts = generateWorkoutOptions(intensityLevel, {
      loadTrend,
      recoveryTrend,
      hrvBaseline,
      tsb
    });

    const limitingFactors = identifyLimitingFactors({
      loadTrend,
      recoveryTrend,
      hrvBaseline,
      tsb
    });

    const result = {
      date: targetDate,
      training_readiness_score: readinessResult.total_score,
      readiness_breakdown: readinessResult.breakdown,
      readiness_interpretation: getReadinessInterpretation(readinessResult.total_score),
      recommended_intensity: intensityLevel,
      limiting_factors: limitingFactors,
      workouts,
      context: {
        recovery_score: recoveryTrend.current.recovery_score,
        acute_chronic_ratio: loadTrend.current.acute_chronic_ratio,
        hrv_status: hrvBaseline.current.status,
        tsb_form: tsb.current.form,
        recovery_trend: recoveryTrend.current.trend_direction
      }
    };
    
    return await addDataContextToResponse(email, result);
  } catch (error) {
    logger.error('Error getting workout recommendations:', error);
    throw error;
  }
}

/**
 * Calculate overall training readiness score (0-100)
 * This is a COMPOSITE metric, NOT just recovery
 * 
 * Components:
 * - Recovery Score (35%): Overnight recovery from Garmin
 * - ACR/Training Load (25%): Recent vs long-term training load balance
 * - HRV Status (20%): Heart rate variability vs baseline
 * - TSB/Form (20%): Fitness-fatigue balance
 * 
 * Returns: { total_score, breakdown }
 */
function calculateReadinessScore({ recovery, acr, hrvStatus, tsbForm }) {
  // Recovery score weight: 35%
  const recoveryContribution = recovery * 0.35;

  // ACR weight: 25%
  let acrScore = 0;
  if (acr < 0.8) acrScore = 60; // Detraining
  else if (acr <= 1.0) acrScore = 90; // Optimal low
  else if (acr <= 1.25) acrScore = 100; // Optimal
  else if (acr <= 1.5) acrScore = 75; // Building
  else acrScore = 40; // High risk
  const acrContribution = acrScore * 0.25;

  // HRV status weight: 20%
  let hrvScore = 0;
  switch (hrvStatus) {
    case 'very_high': hrvScore = 100; break;
    case 'high': hrvScore = 85; break;
    case 'normal': hrvScore = 70; break;
    case 'low': hrvScore = 50; break;
    case 'very_low': hrvScore = 30; break;
    default: hrvScore = 60;
  }
  const hrvContribution = hrvScore * 0.20;

  // TSB Form weight: 20%
  let tsbScore = 0;
  switch (tsbForm) {
    case 'rested': tsbScore = 90; break;
    case 'fresh': tsbScore = 100; break;
    case 'fatigued': tsbScore = 60; break;
    case 'overreached': tsbScore = 30; break;
    default: tsbScore = 60;
  }
  const tsbContribution = tsbScore * 0.20;

  const totalScore = Math.round(recoveryContribution + acrContribution + hrvContribution + tsbContribution);

  return {
    total_score: totalScore,
    breakdown: {
      recovery: {
        raw_score: recovery,
        weighted_score: Math.round(recoveryContribution),
        weight: '35%',
        description: 'Overnight recovery quality (from Garmin)'
      },
      training_load: {
        acr_value: acr,
        acr_score: acrScore,
        weighted_score: Math.round(acrContribution),
        weight: '25%',
        description: 'Acute:Chronic Ratio - recent vs long-term load'
      },
      hrv: {
        status: hrvStatus,
        hrv_score: hrvScore,
        weighted_score: Math.round(hrvContribution),
        weight: '20%',
        description: 'Heart Rate Variability status'
      },
      tsb: {
        form: tsbForm,
        tsb_score: tsbScore,
        weighted_score: Math.round(tsbContribution),
        weight: '20%',
        description: 'Training Stress Balance (fitness-fatigue)'
      }
    }
  };
}

/**
 * Get human-readable interpretation of training readiness score
 */
function getReadinessInterpretation(score) {
  if (score >= 80) {
    return {
      level: 'Excellent',
      description: 'Strong training readiness. Ready for hard/intense workouts.',
      recommendation: 'Capitalize on this state with challenging sessions.'
    };
  } else if (score >= 60) {
    return {
      level: 'Good',
      description: 'Good training readiness. Ready for moderate to hard efforts.',
      recommendation: 'Proceed with planned training, monitor recovery.'
    };
  } else if (score >= 40) {
    return {
      level: 'Moderate',
      description: 'Moderate readiness. Easy to moderate training recommended.',
      recommendation: 'Focus on base training, avoid high intensity.'
    };
  } else if (score >= 20) {
    return {
      level: 'Low',
      description: 'Low training readiness. Recovery or very easy training only.',
      recommendation: 'Prioritize recovery, investigate limiting factors.'
    };
  } else {
    return {
      level: 'Very Low',
      description: 'Very low readiness. Active recovery or complete rest needed.',
      recommendation: 'Focus on recovery. Check sleep, stress, nutrition.'
    };
  }
}

/**
 * Determine recommended intensity level
 */
function determineIntensityLevel({ readinessScore, recovery, acr, tsb, hrvPercentile }) {
  // Critical warnings - force recovery
  if (recovery < 30 || readinessScore < 35 || tsb < -50 || acr > 1.8) {
    return 'recovery';
  }

  // Low readiness - easy training only
  if (readinessScore < 50 || recovery < 50 || tsb < -30 || acr > 1.5) {
    return 'easy';
  }

  // Moderate readiness - moderate training
  if (readinessScore < 70 || recovery < 65 || tsb < -10) {
    return 'moderate';
  }

  // High readiness - ready for hard training
  if (readinessScore >= 80 && recovery >= 70 && hrvPercentile >= 50 && tsb > -10) {
    return 'hard';
  }

  // Default to moderate
  return 'moderate';
}

/**
 * Generate 4 workout options at different intensities
 */
function generateWorkoutOptions(recommendedLevel, stats) {
  const { loadTrend, recoveryTrend, hrvBaseline, tsb } = stats;
  const currentLoad = loadTrend.current.acute_load;
  const avgLoad = loadTrend.current.chronic_load;

  // Calculate target loads for each intensity
  const loads = {
    recovery: Math.round(avgLoad * 0.4),
    easy: Math.round(avgLoad * 0.7),
    moderate: Math.round(avgLoad * 1.0),
    hard: Math.round(avgLoad * 1.3)
  };

  const workouts = [];

  // Recovery workout
  workouts.push({
    level: 'recovery',
    recommended: recommendedLevel === 'recovery',
    training_load: loads.recovery,
    duration_minutes: Math.round(loads.recovery * 0.8), // Rough estimate
    description: 'Active Recovery',
    activities: [
      'Easy yoga or stretching (20-30 min)',
      'Light walk (30-40 min)',
      'Easy swim (20-30 min)',
      'Gentle cycling (30-40 min)'
    ],
    intensity: 'Very easy, conversational pace',
    rationale: 'Focus on movement quality and recovery. Keep heart rate low.',
    warning: recoveryTrend.current.recovery_score < 40 ? 
      'Low recovery score - prioritize rest and sleep' : null
  });

  // Easy workout
  workouts.push({
    level: 'easy',
    recommended: recommendedLevel === 'easy',
    training_load: loads.easy,
    duration_minutes: Math.round(loads.easy * 0.8),
    description: 'Easy Endurance',
    activities: [
      'Easy run (45-60 min, Z2)',
      'Easy bike ride (60-90 min, Z2)',
      'Easy swim (40-50 min)',
      'Hike (60-90 min)'
    ],
    intensity: 'Easy, nose breathing, can maintain full conversation',
    rationale: 'Build aerobic base without adding stress. Promote recovery while maintaining fitness.',
    warning: loadTrend.current.status === 'high_risk' ? 
      'High training load - avoid intensity today' : null
  });

  // Moderate workout
  workouts.push({
    level: 'moderate',
    recommended: recommendedLevel === 'moderate',
    training_load: loads.moderate,
    duration_minutes: Math.round(loads.moderate * 0.8),
    description: 'Moderate Training',
    activities: [
      'Tempo run (10-15 min tempo, 45-60 min total)',
      'Sweet spot intervals (3-4 x 10 min, 60-75 min total)',
      'Moderate hill repeats (6-8 x 2 min, 50-60 min total)',
      'Steady state workout (30-40 min Z3, 60 min total)'
    ],
    intensity: 'Comfortably hard, can speak in short sentences, Z3/Z4',
    rationale: 'Build fitness with quality work. Manageable stress that promotes adaptation.',
    warning: tsb.current.form === 'fatigued' ? 
      'Moderate fatigue detected - keep it controlled' : null
  });

  // Hard workout
  workouts.push({
    level: 'hard',
    recommended: recommendedLevel === 'hard',
    training_load: loads.hard,
    duration_minutes: Math.round(loads.hard * 0.8),
    description: 'High Intensity',
    activities: [
      'VO2 max intervals (5-6 x 3 min @ Z5, 60 min total)',
      'Threshold workout (2-3 x 8-12 min @ Z4, 60-75 min total)',
      'Hard hill repeats (8-10 x 90 sec @ max, 50-60 min total)',
      'Race pace workout (3-4 x 5 min @ race pace, 60 min total)'
    ],
    intensity: 'Hard, breathing heavily, limited conversation, Z4/Z5',
    rationale: 'Push fitness boundaries. Only when well-recovered and adapted to current load.',
    warning: (
      loadTrend.current.status === 'high_risk' || 
      tsb.current.form === 'overreached' || 
      hrvBaseline.current.status === 'very_low'
    ) ? 
      '⚠️ NOT RECOMMENDED - Recovery indicators suggest rest is needed' : null
  });

  return workouts;
}

/**
 * Identify limiting factors affecting performance
 */
function identifyLimitingFactors({ loadTrend, recoveryTrend, hrvBaseline, tsb }) {
  const factors = [];

  // Training load issues
  if (loadTrend.current.status === 'high_risk') {
    factors.push({
      factor: 'Training Load',
      severity: 'high',
      description: `Acute:Chronic ratio of ${loadTrend.current.acute_chronic_ratio} indicates high injury risk. Training load ramped up too quickly.`,
      recommendation: 'Reduce training volume by 20-30% for the next week.'
    });
  } else if (loadTrend.current.status === 'building') {
    factors.push({
      factor: 'Training Load',
      severity: 'moderate',
      description: `Building fitness but ACR of ${loadTrend.current.acute_chronic_ratio} shows elevated stress.`,
      recommendation: 'Monitor recovery closely. Consider a recovery day soon.'
    });
  } else if (loadTrend.current.status === 'detraining') {
    factors.push({
      factor: 'Training Load',
      severity: 'low',
      description: `ACR of ${loadTrend.current.acute_chronic_ratio} suggests recent reduction in training.`,
      recommendation: 'Can gradually increase training volume if recovery allows.'
    });
  }

  // Recovery issues
  if (recoveryTrend.current.recovery_score < 40) {
    factors.push({
      factor: 'Recovery Score',
      severity: 'high',
      description: `Very low recovery (${recoveryTrend.current.recovery_score}%). Limiting factor: ${recoveryTrend.limiting_factor}.`,
      recommendation: 'Prioritize rest and address the limiting factor before hard training.'
    });
  } else if (recoveryTrend.current.recovery_score < 60) {
    factors.push({
      factor: 'Recovery Score',
      severity: 'moderate',
      description: `Below average recovery (${recoveryTrend.current.recovery_score}%). Main issue: ${recoveryTrend.limiting_factor}.`,
      recommendation: 'Focus on easy training until recovery improves.'
    });
  }

  // Specific factor issues
  if (recoveryTrend.limiting_factor === 'sleep' && recoveryTrend.factors.sleep < 50) {
    factors.push({
      factor: 'Sleep Quality',
      severity: 'high',
      description: `Sleep factor at ${recoveryTrend.factors.sleep}% is significantly limiting recovery.`,
      recommendation: 'Prioritize 8-9 hours of sleep. Consider earlier bedtime and sleep hygiene improvements.'
    });
  }

  // HRV issues
  if (hrvBaseline.current.status === 'very_low') {
    factors.push({
      factor: 'HRV',
      severity: 'high',
      description: `HRV at ${hrvBaseline.current.hrv} ms (${hrvBaseline.current.percentile_rank}th percentile) indicates high physiological stress.`,
      recommendation: 'Avoid hard training. Focus on recovery, stress management, and sleep.'
    });
  } else if (hrvBaseline.current.status === 'low') {
    factors.push({
      factor: 'HRV',
      severity: 'moderate',
      description: `HRV below normal (${hrvBaseline.current.percentile_rank}th percentile). Body needs extra recovery time.`,
      recommendation: 'Keep training easy to moderate until HRV returns to normal range.'
    });
  }

  // TSB/Fatigue issues
  if (tsb.current.form === 'overreached') {
    factors.push({
      factor: 'Training Stress Balance',
      severity: 'high',
      description: `TSB of ${tsb.current.tsb} indicates significant overreaching. Fatigue (${tsb.current.fatigue}) far exceeds fitness (${tsb.current.fitness}).`,
      recommendation: 'Take 3-5 days of active recovery or rest. Let fatigue dissipate before resuming normal training.'
    });
  } else if (tsb.current.form === 'fatigued') {
    factors.push({
      factor: 'Training Stress Balance',
      severity: 'moderate',
      description: `TSB of ${tsb.current.tsb} shows elevated fatigue relative to fitness.`,
      recommendation: 'Reduce training intensity. Include extra recovery days in the next week.'
    });
  }

  return factors;
}

/**
 * Get workout recommendation for a specific intensity level
 */
export async function getWorkoutByIntensity(email, intensity, date = null) {
  const recommendations = await getWorkoutRecommendations(email, date);
  const workout = recommendations.workouts.find(w => w.level === intensity);
  
  if (!workout) {
    throw new Error(`Invalid intensity level: ${intensity}. Valid options: recovery, easy, moderate, hard`);
  }

  return {
    ...workout,
    date: recommendations.date,
    context: recommendations.context,
    limiting_factors: recommendations.limiting_factors
  };
}
