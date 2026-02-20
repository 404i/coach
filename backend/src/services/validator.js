import logger from '../utils/logger.js';

/**
 * Validation service for LLM outputs
 * Ensures AI recommendations are safe and follow constraints
 */

const VALID_SPORTS = ['run', 'bike', 'swim', 'strength', 'yoga', 'hiit', 'walk', 'rest'];
const VALID_INTENSITIES = ['rest', 'easy_aerobic', 'tempo_threshold', 'hiit'];
const VALID_LOCATIONS = ['outdoor', 'indoor'];

/**
 * Validate a single workout plan
 */
function validateWorkoutPlan(plan, planName, context) {
  const errors = [];
  
  // Required fields
  if (!plan.title) errors.push(`${planName}.title is required`);
  if (!plan.sport) errors.push(`${planName}.sport is required`);
  if (!plan.intensity) errors.push(`${planName}.intensity is required`);
  if (typeof plan.duration_min !== 'number') errors.push(`${planName}.duration_min must be a number`);
  
  // Valid values
  if (plan.sport && !VALID_SPORTS.includes(plan.sport)) {
    errors.push(`${planName}.sport must be one of: ${VALID_SPORTS.join(', ')}`);
  }
  if (plan.intensity && !VALID_INTENSITIES.includes(plan.intensity)) {
    errors.push(`${planName}.intensity must be one of: ${VALID_INTENSITIES.join(', ')}`);
  }
  if (plan.location && !VALID_LOCATIONS.includes(plan.location)) {
    errors.push(`${planName}.location must be outdoor or indoor`);
  }
  
  // Duration bounds
  if (plan.duration_min < 0 || plan.duration_min > 240) {
    errors.push(`${planName}.duration_min must be between 0 and 240 minutes`);
  }
  
  // Injury contraindications check - CRITICAL
  if (context?.profile?.injuries) {
    const contraindications = context.profile.injuries
      .flatMap(injury => injury.contraindications || []);
    
    const sportConflict = contraindications.some(contra => 
      plan.title?.toLowerCase().includes(contra.toLowerCase()) ||
      plan.sport === contra.toLowerCase()
    );
    
    if (sportConflict) {
      errors.push(`${planName} violates injury contraindications: ${contraindications.join(', ')}`);
    }
  }
  
  // Steps should be an array
  if (plan.steps && !Array.isArray(plan.steps)) {
    errors.push(`${planName}.steps must be an array`);
  }
  
  return errors;
}

/**
 * Validate daily workout response structure and safety
 */
export function validateWorkoutResponse(response, context) {
  const errors = [];
  
  // Check required top-level fields
  if (!response.recovery_assessment) {
    errors.push('Missing recovery_assessment');
  } else {
    if (!response.recovery_assessment.status) {
      errors.push('recovery_assessment.status is required');
    }
    if (!response.recovery_assessment.reasoning) {
      errors.push('recovery_assessment.reasoning is required');
    }
  }
  
  if (!response.recommended_state) {
    errors.push('Missing recommended_state');
  }
  
  // Validate all 4 plans
  const plans = ['plan_a', 'plan_b', 'plan_c', 'plan_d'];
  for (const planName of plans) {
    if (!response[planName]) {
      errors.push(`Missing ${planName}`);
    } else {
      errors.push(...validateWorkoutPlan(response[planName], planName, context));
    }
  }
  
  // Cross-plan validation
  if (response.plan_a && response.plan_b) {
    // Plan B should be easier than Plan A
    const intensityOrder = VALID_INTENSITIES;
    const aIndex = intensityOrder.indexOf(response.plan_a.intensity);
    const bIndex = intensityOrder.indexOf(response.plan_b.intensity);
    
    if (bIndex > aIndex) {
      errors.push('plan_b should be same or easier intensity than plan_a');
    }
  }
  
  // Guardrails logic check - CRITICAL
  if (response.recovery_assessment?.force_recovery === true) {
    // If forcing recovery, all plans should be rest or very easy
    const nonRecoveryPlans = plans.filter(p => {
      const plan = response[p];
      return plan && !['rest', 'easy_aerobic'].includes(plan.intensity);
    });
    
    if (nonRecoveryPlans.length > 0) {
      errors.push(`force_recovery is true but ${nonRecoveryPlans.join(', ')} have non-recovery intensity`);
    }
  }
  
  // Volume sanity check
  if (context?.current_week) {
    const plannedVolume = (response.plan_a?.duration_min || 0);
    const weekVolume = (context.current_week.total_volume_minutes || 0) + plannedVolume;
    const avgWeekly = context.trends?.weekly_avg_volume || 300;
    
    if (weekVolume > avgWeekly * 1.2) {
      logger.warn(`Weekly volume spike detected: ${weekVolume}min vs ${avgWeekly}min average`);
      // Don't fail validation, just log warning
    }
  }
  
  const valid = errors.length === 0;
  
  if (!valid) {
    logger.warn('Workout validation failed:', errors);
  }
  
  return {
    valid,
    errors,
    retryable: errors.some(e => 
      e.includes('required') || 
      e.includes('must be') || 
      e.includes('contraindications')
    )
  };
}

/**
 * Validate weekly plan response
 */
export function validateWeeklyPlanResponse(response, context) {
  const errors = [];
  
  // Check required fields
  if (!response.week_summary) {
    errors.push('Missing week_summary');
  } else {
    if (!response.week_summary.phase) errors.push('week_summary.phase is required');
    if (!response.week_summary.overall_theme) errors.push('week_summary.overall_theme is required');
  }
  
  if (!response.days || !Array.isArray(response.days)) {
    errors.push('days must be an array');
  } else {
    if (response.days.length !== 7) {
      errors.push('days array must contain exactly 7 days');
    }
    
    // Validate each day
    response.days.forEach((day, index) => {
      if (!day.date) errors.push(`days[${index}].date is required`);
      if (!day.day_name) errors.push(`days[${index}].day_name is required`);
      if (!day.primary_workout) {
        errors.push(`days[${index}].primary_workout is required`);
      } else {
        const workout = day.primary_workout;
        if (!VALID_SPORTS.includes(workout.sport)) {
          errors.push(`days[${index}].primary_workout.sport invalid`);
        }
        if (!VALID_INTENSITIES.includes(workout.intensity)) {
          errors.push(`days[${index}].primary_workout.intensity invalid`);
        }
        
        // Check injury contraindications
        if (context?.profile?.injuries) {
          const contraindications = context.profile.injuries
            .flatMap(injury => injury.contraindications || []);
          
          if (contraindications.some(c => workout.sport === c.toLowerCase())) {
            errors.push(`days[${index}] violates injury contraindications`);
          }
        }
      }
    });
    
    // Check hard days distribution
    const hardDays = response.days.filter(d => 
      ['tempo_threshold', 'hiit'].includes(d.primary_workout?.intensity)
    ).length;
    
    if (hardDays > 3) {
      errors.push(`Too many hard days: ${hardDays} (max 3 per week)`);
    }
    
    // Check for at least one rest day
    const restDays = response.days.filter(d => 
      d.primary_workout?.intensity === 'rest'
    ).length;
    
    if (restDays === 0) {
      errors.push('Weekly plan must include at least one rest day');
    }
  }
  
  // Volume check
  if (response.volume_comparison) {
    const changePct = response.volume_comparison.change_pct;
    if (Math.abs(changePct) > 20) {
      errors.push(`Volume change too extreme: ${changePct}% (should be ≤20%)`);
    }
  }
  
  const valid = errors.length === 0;
  
  if (!valid) {
    logger.warn('Weekly plan validation failed:', errors);
  }
  
  return {
    valid,
    errors,
    retryable: errors.some(e => 
      e.includes('required') || 
      e.includes('invalid') || 
      e.includes('contraindications')
    )
  };
}

/**
 * Generate safe fallback workout when LLM fails or validation fails repeatedly
 */
export function generateSafeFallback(context) {
  logger.warn('Generating safe fallback workout');
  
  // Determine safest sport based on injuries
  let safeSport = 'walk';
  const injuries = context?.profile?.injuries || [];
  const contraindications = injuries.flatMap(i => i.contraindications || []);
  
  if (!contraindications.includes('walk') && !contraindications.includes('walking')) {
    safeSport = 'walk';
  } else if (!contraindications.includes('yoga')) {
    safeSport = 'yoga';
  } else {
    safeSport = 'rest';
  }
  
  return {
    recovery_assessment: {
      status: 'poor',
      reasoning: 'LLM service unavailable. Defaulting to conservative recommendation.',
      force_recovery: true,
      guardrails_triggered: ['llm_failure_safety']
    },
    recommended_state: 'recover',
    plan_a: {
      title: 'Easy Recovery Session',
      location: 'outdoor',
      sport: safeSport,
      intensity: 'easy_aerobic',
      duration_min: 30,
      target_zones: ['Z1'],
      equipment_needed: [],
      steps: [
        'Start very easy and conversational',
        'Stay in Zone 1 (very comfortable)',
        'Stop if any discomfort'
      ],
      reasoning: 'Conservative recommendation due to system limitations',
      weather_notes: 'Dress appropriately for conditions'
    },
    plan_b: {
      title: 'Short Walk',
      location: 'outdoor',
      sport: 'walk',
      intensity: 'easy_aerobic',
      duration_min: 20,
      target_zones: ['Z1'],
      equipment_needed: [],
      steps: ['Easy walking pace', 'Enjoy being outside'],
      reasoning: 'Even easier option'
    },
    plan_c: {
      title: 'Gentle Yoga',
      location: 'indoor',
      sport: 'yoga',
      intensity: 'easy_aerobic',
      duration_min: 25,
      target_zones: [],
      equipment_needed: ['yoga mat'],
      steps: ['Gentle stretching and breathing', 'Focus on mobility'],
      reasoning: 'Indoor recovery option'
    },
    plan_d: {
      title: 'Rest Day',
      location: 'indoor',
      sport: 'rest',
      intensity: 'rest',
      duration_min: 0,
      target_zones: [],
      equipment_needed: [],
      steps: ['Complete rest and recovery'],
      reasoning: 'Safest option when system unavailable'
    },
    coach_notes: 'AI coach temporarily unavailable. These are conservative recommendations. Listen to your body.',
    listen_to_body: 'Stop immediately if any pain or unusual discomfort'
  };
}

/**
 * Generate safe fallback weekly plan when LLM fails
 */
export function generateSafeWeeklyFallback(context) {
  logger.warn('Generating safe fallback weekly plan');
  
  const weekStart = context.week_start || new Date().toISOString().split('T')[0];
  const days = [];
  
  // Generate 7 days with conservative plan
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[date.getDay()];
    
    // Rest days on Sunday and Wednesday
    const isRestDay = i === 0 || i === 3;
    
    days.push({
      date: dateStr,
      day_name: dayName,
      primary_workout: {
        sport: isRestDay ? 'rest' : 'walk',
        intensity: isRestDay ? 'rest' : 'easy_aerobic',
        duration_min: isRestDay ? 0 : 30,
        title: isRestDay ? 'Complete Rest' : 'Easy Recovery Walk',
        brief_description: isRestDay ? 'Complete recovery day' : 'Easy aerobic activity',
        target_zones: isRestDay ? [] : ['Z1'],
        estimated_tss: 0
      },
      optional_second_workout: null,
      reasoning: 'Conservative fallback plan due to system unavailability'
    });
  }
  
  return {
    week_summary: {
      week_number: 1,
      phase: 'recovery',
      overall_theme: 'Conservative recovery week (system fallback)',
      total_planned_volume_min: 120,
      key_sessions: ['Rest days for recovery']
    },
    days,
    volume_comparison: {
      last_week_min: 0,
      this_week_min: 120,
      change_pct: 0,
      justification: 'Fallback plan - conservative approach'
    },
    hard_days_distribution: {
      planned_count: 0,
      days: [],
      reasoning: 'No hard sessions in fallback plan'
    },
    injury_accommodations: ['Conservative plan due to system limitations'],
    coach_message: 'AI coach temporarily unavailable. This is a conservative recovery week. Adjust as you feel appropriate and listen to your body.',
    success_metrics: 'Complete rest days and easy movement on active days',
    flexibility_notes: 'Feel free to adjust any workout based on how you feel'
  };
}
