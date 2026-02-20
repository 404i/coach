/**
 * Pattern Recognition Service
 * 
 * Discovers and tracks athlete training patterns:
 * - Daily habits (e.g., yoga 6x/week)
 * - Weekly staples (e.g., HIIT on Tuesdays)
 * - Multi-activity days (e.g., yoga + ride in morning)
 * - Performance gaps (missing strength, HIIT, etc.)
 */

import db from '../db/index.js';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from '../utils/logger.js';
import { subDays, addDays, differenceInDays, format, startOfWeek, endOfWeek } from 'date-fns';
import { addDataContextToResponseByProfileId } from '../middleware/data-freshness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to GarminDB activities database
const garminActivityDbPath = process.env.GARMIN_ACTIVITIES_DB || 
  join(__dirname, '../../../data/garmin/HealthData/DBs/garmin_activities.db');

// ============================================================================
// PATTERN DISCOVERY
// ============================================================================

/**
 * Discover training patterns from historical data
 */
export async function discoverPatterns(profileId, lookbackDays = 90) {
  console.log(`Discovering patterns for profile ${profileId} (${lookbackDays} days)`);
  
  // Get all activities from GarminDB
  const activities = await getHistoricalActivities(profileId, lookbackDays);
  
  if (activities.length === 0) {
    return { patterns: [], message: 'No activities found' };
  }
  
  const patterns = [];
  
  // Group by sport - prioritize sub_sport (activity_type) over generic sport category
  // For Garmin activities like yoga (sport="training", sub_sport="yoga"), use the specific type
  const sportGroups = activities.reduce((acc, activity) => {
    const sport = activity.activity_type || activity.sport || 'unknown';
    if (!acc[sport]) acc[sport] = [];
    acc[sport].push(activity);
    return acc;
  }, {});
  
  // Analyze each sport
  for (const [sport, sportActivities] of Object.entries(sportGroups)) {
    const daysWithActivity = sportActivities.length;
    const frequencyPerWeek = (daysWithActivity / lookbackDays) * 7;
    
    // Daily habit check (5+ times per week)
    if (frequencyPerWeek >= 5) {
      const confidence = Math.min(100, Math.round((frequencyPerWeek / 7) * 100));
      const durations = sportActivities.map(a => a.duration_min).filter(d => d > 0);
      const typicalDuration = durations.length > 0 ? median(durations) : null;
      
      patterns.push({
        type: 'daily_habit',
        sport,
        frequency: parseFloat(frequencyPerWeek.toFixed(1)),
        confidence,
        typical_duration: typicalDuration,
        typical_time_slot: findMostCommonTimeSlot(sportActivities),
        occurrences: daysWithActivity,
        age_days: Math.round(lookbackDays * 0.8) // Estimate pattern age
      });
    }
    
    // Weekly staple check (1-4 times per week)
    else if (frequencyPerWeek >= 1 && frequencyPerWeek < 5) {
      const confidence = Math.min(100, Math.round(frequencyPerWeek * 20));
      const durations = sportActivities.map(a => a.duration_min).filter(d => d > 0);
      const typicalDuration = durations.length > 0 ? median(durations) : null;
      
      patterns.push({
        type: 'weekly_staple',
        sport,
        frequency: parseFloat(frequencyPerWeek.toFixed(1)),
        confidence,
        typical_duration: typicalDuration,
        typical_time_slot: findMostCommonTimeSlot(sportActivities),
        occurrences: daysWithActivity,
        age_days: Math.round(lookbackDays * 0.6)
      });
    }
  }
  
  // Multi-activity patterns
  const multiActivityPatterns = findMultiActivityPatterns(activities, lookbackDays);
  patterns.push(...multiActivityPatterns);
  
  console.log(`Discovered ${patterns.length} patterns`);
  const result = { patterns, activities_analyzed: activities.length };
  return await addDataContextToResponseByProfileId(profileId, result);
}

/**
 * Save discovered patterns to database
 */
export async function savePatterns(profileId, patterns) {
  const saved = [];
  
  for (const pattern of patterns) {
    // Check if pattern already exists
    const existing = await db('training_patterns')
      .where({
        profile_id: profileId,
        pattern_type: pattern.type,
        sport: pattern.sport
      })
      .first();
    
    if (existing) {
      // Update existing pattern
      await db('training_patterns')
        .where({ pattern_id: existing.pattern_id })
        .update({
          frequency_days_per_week: pattern.frequency,
          pattern_confidence: pattern.confidence,
          typical_duration_min: pattern.typical_duration,
          time_slot: pattern.typical_time_slot,
          total_occurrences: pattern.occurrences,
          pattern_age_days: pattern.age_days,
          updated_at: new Date(),
          status: 'active'
        });
      
      saved.push({ ...pattern, pattern_id: existing.pattern_id, action: 'updated' });
    } else {
      // Insert new pattern
      const [inserted] = await db('training_patterns')
        .insert({
          profile_id: profileId,
          pattern_type: pattern.type,
          sport: pattern.sport,
          activity_type: pattern.sport,
          frequency_days_per_week: pattern.frequency,
          pattern_confidence: pattern.confidence,
          typical_duration_min: pattern.typical_duration,
          typical_intensity: 'moderate', // Default
          time_slot: pattern.typical_time_slot,
          pattern_age_days: pattern.age_days || 0,
          total_occurrences: pattern.occurrences || 0,
          discovered_at: new Date(),
          status: 'active'
        })
        .returning('*');
      
      saved.push({ ...pattern, pattern_id: inserted.pattern_id, action: 'created' });
    }
  }
  
  return saved;
}

// ============================================================================
// PATTERN UPDATES & BREAK DETECTION
// ============================================================================

/**
 * Update all patterns for a profile (run daily)
 */
export async function updatePatterns(profileId) {
  const patterns = await db('training_patterns')
    .where({ profile_id: profileId, status: 'active' });
  
  const updates = [];
  
  for (const pattern of patterns) {
    const update = await checkPatternStatus(pattern);
    updates.push(update);
  }
  
  return updates;
}

/**
 * Check if a pattern is still active or breaking
 */
async function checkPatternStatus(pattern) {
  const lookbackDays = 14; // Check last 2 weeks
  const recentActivities = await getRecentActivities(
    pattern.profile_id,
    pattern.sport,
    lookbackDays
  );
  
  const currentFrequency = (recentActivities.length / lookbackDays) * 7;
  const expectedFrequency = pattern.frequency_days_per_week;
  const daysSinceLast = pattern.last_occurrence 
    ? differenceInDays(new Date(), new Date(pattern.last_occurrence))
    : 999;
  
  // Pattern is breaking
  if (currentFrequency < expectedFrequency * 0.5 || daysSinceLast > getBreakThreshold(pattern)) {
    const breakRecord = await detectPatternBreak(pattern, currentFrequency, daysSinceLast);
    return {
      pattern_id: pattern.pattern_id,
      status: 'broken',
      break_record: breakRecord
    };
  }
  
  // Pattern is active - update statistics
  const lastActivity = recentActivities[0];
  await db('training_patterns')
    .where({ pattern_id: pattern.pattern_id })
    .update({
      last_occurrence: lastActivity?.date,
      total_occurrences: pattern.total_occurrences + recentActivities.length,
      updated_at: new Date()
    });
  
  return {
    pattern_id: pattern.pattern_id,
    status: 'active',
    current_frequency: currentFrequency,
    days_since_last: daysSinceLast
  };
}

/**
 * Detect and record a pattern break
 */
async function detectPatternBreak(pattern, currentFrequency, daysSinceLast) {
  const severity = calculateBreakSeverity(daysSinceLast, pattern.frequency_days_per_week);
  const impactScore = calculateImpactScore(pattern, daysSinceLast);
  
  // Check if break already exists
  const existingBreak = await db('pattern_breaks')
    .where({
      pattern_id: pattern.pattern_id,
      break_ended: null // Ongoing break
    })
    .first();
  
  if (existingBreak) {
    // Update existing break
    await db('pattern_breaks')
      .where({ break_id: existingBreak.break_id })
      .update({
        break_duration_days: daysSinceLast,
        severity,
        impact_score: impactScore
      });
    
    return existingBreak;
  }
  
  // Create new break record
  const [breakRecord] = await db('pattern_breaks')
    .insert({
      pattern_id: pattern.pattern_id,
      profile_id: pattern.profile_id,
      break_started: subDays(new Date(), daysSinceLast),
      break_duration_days: daysSinceLast,
      severity,
      impact_score: impactScore,
      detected_at: new Date(),
      nudge_sent: false
    })
    .returning('*');
  
  // Update pattern status
  await db('training_patterns')
    .where({ pattern_id: pattern.pattern_id })
    .update({ status: 'broken' });
  
  console.log(`Pattern break detected: ${pattern.sport} (${daysSinceLast} days)`);
  
  return breakRecord;
}

function getBreakThreshold(pattern) {
  const thresholds = {
    daily_habit: 3,
    weekly_staple: 14,
    time_of_day: 7,
    multi_activity: 21
  };
  return thresholds[pattern.pattern_type] || 7;
}

function calculateBreakSeverity(daysSinceLast, expectedFrequency) {
  if (daysSinceLast >= 30) return 'critical';
  if (daysSinceLast >= 21) return 'high';
  if (daysSinceLast >= 14) return 'medium';
  return 'low';
}

function calculateImpactScore(pattern, daysSinceLast) {
  // Higher score = bigger impact
  let score = 0;
  
  // Daily habits have higher impact when broken
  if (pattern.pattern_type === 'daily_habit') {
    score += 40;
  } else if (pattern.pattern_type === 'weekly_staple') {
    score += 25;
  }
  
  // Duration of break matters
  if (daysSinceLast >= 30) score += 40;
  else if (daysSinceLast >= 21) score += 30;
  else if (daysSinceLast >= 14) score += 20;
  else score += 10;
  
  // Pattern confidence matters
  score += Math.round(pattern.pattern_confidence * 0.2);
  
  return Math.min(100, score);
}

// ============================================================================
// MULTI-ACTIVITY DAY TRACKING
// ============================================================================

/**
 * Track multiple activities on the same day
 */
export async function trackMultiActivityDay(profileId, date, activities) {
  if (activities.length < 2) {
    return { message: 'Single activity day - not tracked as multi-activity' };
  }
  
  // Sort by time
  const sorted = activities.sort((a, b) => 
    (a.start_time || '').localeCompare(b.start_time || '')
  );
  
  // Calculate loads
  const individualLoads = sorted.map(a => a.training_load || 0);
  const baseTotal = individualLoads.reduce((sum, load) => sum + load, 0);
  
  // Multi-activity penalty
  let penalty = 0;
  if (activities.length === 2) penalty = Math.round(baseTotal * 0.10);
  if (activities.length >= 3) penalty = Math.round(baseTotal * 0.20);
  
  // Same time slot penalty
  const slots = sorted.map(a => a.time_slot || 'unknown');
  const uniqueSlots = new Set(slots);
  if (slots.length > uniqueSlots.size) {
    penalty += Math.round(baseTotal * 0.05);
  }
  
  const adjustedTotal = baseTotal + penalty;
  
  // Activity combo
  const combo = sorted.map(a => a.sport || a.activity_type).join('_');
  
  // Check if typical combo
  const historicalCombos = await db('multi_activity_days')
    .where({ profile_id: profileId })
    .pluck('activity_combo');
  
  const isTypical = historicalCombos.filter(c => c === combo).length >= 3;
  
  // Recovery predictions
  const recoveryDeficit = Math.round(adjustedTotal * 0.15);
  const predictedRecovery = Math.max(40, 85 - Math.round(adjustedTotal * 0.3));
  
  // Check if record exists
  const existing = await db('multi_activity_days')
    .where({ profile_id: profileId, date })
    .first();
  
  const record = {
    profile_id: profileId,
    date,
    activity_ids: sorted.map(a => a.id || 0),
    activity_count: activities.length,
    time_slots: Array.from(uniqueSlots),
    total_duration_min: sorted.reduce((sum, a) => sum + (a.duration_min || 0), 0),
    individual_loads: individualLoads,
    base_total_load: baseTotal,
    multi_activity_penalty: penalty,
    adjusted_total_load: adjustedTotal,
    activity_combo: combo,
    is_typical_combo: isTypical,
    recovery_deficit: recoveryDeficit,
    predicted_next_day_recovery: predictedRecovery
  };
  
  if (existing) {
    await db('multi_activity_days')
      .where({ multi_day_id: existing.multi_day_id })
      .update(record);
  } else {
    await db('multi_activity_days').insert(record);
  }
  
  return {
    ...record,
    message: `Tracked ${activities.length} activities`,
    penalty_pct: Math.round((penalty / baseTotal) * 100)
  };
}

// ============================================================================
// PERFORMANCE GAP DETECTION
// ============================================================================

/**
 * Detect missing training modalities
 */
export async function detectPerformanceGaps(profileId) {
  const lookbackDays = 60;
  const activities = await getHistoricalActivities(profileId, lookbackDays);
  
  const sportCounts = activities.reduce((acc, a) => {
    const sport = (a.sport || '').toLowerCase();
    const activityType = (a.activity_type || '').toLowerCase();
    // Check both sport and sub_sport (activity_type) for modality counting
    if (sport) acc[sport] = (acc[sport] || 0) + 1;
    if (activityType && activityType !== sport) acc[activityType] = (acc[activityType] || 0) + 1;
    return acc;
  }, {});
  
  const gaps = [];
  
  // Check strength training
  const strengthGap = await checkModalityGap(
    profileId,
    'strength',
    sportCounts,
    activities,
    21, // 3 weeks absent threshold
    '2x per week'
  );
  if (strengthGap) gaps.push(strengthGap);
  
  // Note: HIIT is an intensity level (not a sport) - can be part of cycling/running/swimming
  // Intensity analysis should be done separately based on HR zones, power, etc.
  
  // Check yoga/flexibility
  const yogaGap = await checkModalityGap(
    profileId,
    'yoga',
    sportCounts,
    activities,
    7, // 1 week absent threshold
    'Daily or 5-6x per week'
  );
  if (yogaGap) gaps.push(yogaGap);
  
  // Save detected gaps to database
  for (const gap of gaps) {
    await savePerformanceGap(profileId, gap);
  }

  // Resolve old gaps whose modality is no longer a gap
  const detectedModalities = gaps.map(g => g.modality);
  const allCheckedModalities = ['strength', 'yoga'];
  const resolvedModalities = allCheckedModalities.filter(m => !detectedModalities.includes(m));
  if (resolvedModalities.length > 0) {
    await db('performance_gaps')
      .where({ profile_id: profileId, resolved_at: null })
      .whereIn('modality', resolvedModalities)
      .update({ resolved_at: new Date().toISOString() });
  }

  // Always resolve legacy 'hiit' gaps (HIIT is intensity, not a sport type)
  await db('performance_gaps')
    .where({ profile_id: profileId, modality: 'hiit', resolved_at: null })
    .update({ resolved_at: new Date().toISOString() });

  const result = { gaps, count: gaps.length };
  return await addDataContextToResponseByProfileId(profileId, result);
}

async function checkModalityGap(profileId, modality, sportCounts, activities, absentThreshold, typicalFrequency) {
  // Find last activity of this type - check both sport and sub_sport (activity_type)
  const modalityActivities = activities.filter(a => {
    const sport = (a.sport || '').toLowerCase();
    const activityType = (a.activity_type || '').toLowerCase();
    return sport.includes(modality) || activityType.includes(modality);
  });
  
  const lastActivity = modalityActivities[0]; // Activities are sorted by date desc
  const daysAbsent = lastActivity 
    ? differenceInDays(new Date(), new Date(lastActivity.date))
    : 999;
  
  if (daysAbsent < absentThreshold) {
    return null; // Not a gap
  }
  
  // Calculate severity and impact
  const severity = calculateGapSeverity(daysAbsent, absentThreshold);
  const performanceImpact = calculatePerformanceImpact(modality, daysAbsent);
  const injuryRisk = calculateInjuryRisk(modality, daysAbsent);
  
  // Get benefits and recommendations
  const benefits = getModalityBenefits(modality);
  const improvements = estimateImprovements(modality, daysAbsent);
  
  return {
    modality,
    days_absent: daysAbsent,
    last_performed: lastActivity?.date || null,
    typical_frequency: typicalFrequency,
    current_frequency: '0x in last month',
    gap_severity: severity,
    performance_impact: performanceImpact,
    injury_risk_increase: injuryRisk,
    benefits,
    estimated_improvement: improvements,
    nudge_priority: calculateNudgePriority(modality, daysAbsent, severity)
  };
}

async function savePerformanceGap(profileId, gap) {
  // Check if gap already exists
  const existing = await db('performance_gaps')
    .where({
      profile_id: profileId,
      modality: gap.modality,
      resolved_at: null
    })
    .first();
  
  if (existing) {
    // Update existing
    await db('performance_gaps')
      .where({ gap_id: existing.gap_id })
      .update({
        days_absent: gap.days_absent,
        gap_severity: gap.gap_severity,
        performance_impact: gap.performance_impact,
        injury_risk_increase: gap.injury_risk_increase
      });
  } else {
    // Insert new
    await db('performance_gaps').insert({
      profile_id: profileId,
      modality: gap.modality,
      days_absent: gap.days_absent,
      last_performed: gap.last_performed,
      typical_frequency: gap.typical_frequency,
      current_frequency: gap.current_frequency,
      gap_severity: gap.gap_severity,
      performance_impact: gap.performance_impact,
      injury_risk_increase: gap.injury_risk_increase,
      recommended_frequency: gap.typical_frequency,
      recommended_duration: getRecommendedDuration(gap.modality),
      recommended_timing: getRecommendedTiming(gap.modality),
      benefits: JSON.stringify(gap.benefits),
      estimated_improvement: JSON.stringify(gap.estimated_improvement),
      nudge_priority: gap.nudge_priority,
      detected_at: new Date(),
      nudge_sent: false
    });
  }
}

function calculateGapSeverity(daysAbsent, threshold) {
  if (daysAbsent >= threshold * 3) return 'critical';
  if (daysAbsent >= threshold * 2) return 'significant';
  if (daysAbsent >= threshold * 1.5) return 'moderate';
  return 'minor';
}

function calculatePerformanceImpact(modality, daysAbsent) {
  const impacts = {
    strength: { 14: 10, 21: 20, 30: 30, 60: 50 },
    hiit: { 14: 5, 21: 10, 30: 15, 60: 25 },
    yoga: { 7: 10, 14: 20, 30: 40, 60: 60 }
  };
  
  const modalityImpacts = impacts[modality] || {};
  const thresholds = Object.keys(modalityImpacts).map(Number).sort((a, b) => a - b);
  
  let impact = 0;
  for (const threshold of thresholds) {
    if (daysAbsent >= threshold) {
      impact = modalityImpacts[threshold];
    }
  }
  
  return impact;
}

function calculateInjuryRisk(modality, daysAbsent) {
  if (modality === 'strength') {
    if (daysAbsent >= 30) return 40;
    if (daysAbsent >= 21) return 30;
    return 20;
  }
  if (modality === 'yoga') {
    if (daysAbsent >= 30) return 35;
    if (daysAbsent >= 14) return 25;
    return 15;
  }
  return 10;
}

function getModalityBenefits(modality) {
  const benefits = {
    strength: [
      'Injury prevention: -30% risk',
      'Power output: +10-15% on climbs',
      'Bone density maintenance',
      'Core stability for endurance sports'
    ],
    hiit: [
      'VO2 max improvement: +5-10% in 8 weeks',
      'Lactate threshold increase',
      'Time efficiency: Big gains in short time',
      'Race performance: +2-5% speed'
    ],
    yoga: [
      'Recovery acceleration: -20% soreness',
      'Injury prevention: Reduced muscle imbalances',
      'Range of motion: Better bike position',
      'Sleep quality: +15% deep sleep'
    ]
  };
  
  return benefits[modality] || ['General fitness improvement'];
}

function estimateImprovements(modality, daysAbsent) {
  if (modality === 'strength') {
    return {
      power_gain_pct: daysAbsent >= 30 ? 15 : 12,
      timeline_weeks: 6,
      injury_reduction_pct: 30
    };
  }
  if (modality === 'hiit') {
    return {
      vo2_gain_pct: daysAbsent >= 30 ? 10 : 8,
      timeline_weeks: 8,
      race_speed_gain_pct: 3
    };
  }
  if (modality === 'yoga') {
    return {
      flexibility_gain_pct: daysAbsent >= 30 ? 40 : 30,
      timeline_weeks: 4,
      recovery_improvement_pct: 20
    };
  }
  return { general_improvement: 'moderate' };
}

function calculateNudgePriority(modality, daysAbsent, severity) {
  let priority = 5;
  
  if (severity === 'critical') priority += 3;
  else if (severity === 'significant') priority += 2;
  else if (severity === 'moderate') priority += 1;
  
  if (modality === 'strength' && daysAbsent >= 30) priority += 2;
  if (modality === 'hiit' && daysAbsent >= 21) priority += 1;
  
  return Math.min(10, priority);
}

function getRecommendedDuration(modality) {
  return { strength: 45, hiit: 30, yoga: 30 }[modality] || 30;
}

function getRecommendedTiming(modality) {
  return {
    strength: 'After hard rides or separate day',
    hiit: 'When well recovered (TSB > -10)',
    yoga: 'Evening or post-workout'
  }[modality] || 'Flexible';
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Query GarminDB for activities using sqlite3
 */
async function queryGarminActivities(query, params = []) {
  return new Promise((resolve, reject) => {
    const garminDb = new sqlite3.Database(garminActivityDbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        logger.error('Error opening GarminDB:', err);
        return reject(err);
      }
      
      garminDb.all(query, params, (err, rows) => {
        garminDb.close();
        if (err) {
          logger.error('Error querying GarminDB:', err);
          return reject(err);
        }
        resolve(rows || []);
      });
    });
  });
}

async function getHistoricalActivities(profileId, lookbackDays) {
  const sinceDate = format(subDays(new Date(), lookbackDays), 'yyyy-MM-dd');
  
  // Query GarminDB for activities
  const activities = await queryGarminActivities(`
    SELECT 
      activity_id as id,
      start_time as date,
      sport,
      sub_sport as activity_type,
      elapsed_time as duration_sec
    FROM activities
    WHERE start_time >= ?
    ORDER BY start_time DESC
  `, [sinceDate]);
  
  // Convert duration to minutes and add time slot
  return activities.map(a => ({
    ...a,
    duration_min: Math.round((a.duration_sec || 0) / 60),
    time_slot: getTimeSlot(a.date),
    training_load: estimateTrainingLoad(a)
  }));
}

async function getRecentActivities(profileId, sport, lookbackDays) {
  const sinceDate = format(subDays(new Date(), lookbackDays), 'yyyy-MM-dd');
  
  const activities = await queryGarminActivities(`
    SELECT *
    FROM activities
    WHERE start_time >= ?
    AND (sport LIKE ? OR sub_sport LIKE ?)
    ORDER BY start_time DESC
  `, [sinceDate, `%${sport}%`, `%${sport}%`]);
  
  return activities.map(a => ({
    ...a,
    date: a.start_time,
    duration_min: Math.round((a.elapsed_time || 0) / 60)
  }));
}

function findMultiActivityPatterns(activities, lookbackDays) {
  // Group by date
  const byDate = activities.reduce((acc, activity) => {
    const date = format(new Date(activity.date), 'yyyy-MM-dd');
    if (!acc[date]) acc[date] = [];
    acc[date].push(activity);
    return acc;
  }, {});
  
  // Find dates with 2+ activities
  const multiDays = Object.entries(byDate)
    .filter(([date, acts]) => acts.length >= 2)
    .map(([date, acts]) => ({
      date,
      combo: acts.map(a => a.sport).sort().join('_'),
      count: acts.length
    }));
  
  // Count combo frequency
  const comboFrequency = multiDays.reduce((acc, { combo }) => {
    acc[combo] = (acc[combo] || 0) + 1;
    return acc;
  }, {});
  
  // Return patterns that occur regularly
  const patterns = [];
  for (const [combo, count] of Object.entries(comboFrequency)) {
    if (count >= 4) { // At least 4 occurrences
      const frequencyPerWeek = (count / (lookbackDays / 7)).toFixed(1);
      patterns.push({
        type: 'multi_activity',
        sport: combo,
        frequency: parseFloat(frequencyPerWeek),
        confidence: Math.min(100, count * 5),
        occurrences: count,
        age_days: 30
      });
    }
  }
  
  return patterns;
}

function getTimeSlot(dateString) {
  try {
    const hour = new Date(dateString).getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'midday';
    if (hour >= 17 && hour < 22) return 'evening';
    return 'night';
  } catch (e) {
    return 'unknown';
  }
}

function findMostCommonTimeSlot(activities) {
  const slots = activities
    .map(a => getTimeSlot(a.date))
    .filter(s => s !== 'unknown');
  
  if (slots.length === 0) return null;
  
  return mode(slots);
}

function estimateTrainingLoad(activity) {
  const durationMin = Math.round((activity.duration_sec || 0) / 60);
  
  // Simple estimation based on sport and duration
  const sportFactors = {
    cycling: 1.0,
    running: 1.2,
    swimming: 1.1,
    strength: 0.9,
    yoga: 0.5,
    walking: 0.4
  };
  
  const sport = (activity.sport || '').toLowerCase();
  const factor = sportFactors[sport] || 0.8;
  
  return Math.round(durationMin * factor);
}

function median(numbers) {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mode(array) {
  if (array.length === 0) return null;
  const frequency = {};
  let maxFreq = 0;
  let modeValue = array[0];
  
  for (const item of array) {
    frequency[item] = (frequency[item] || 0) + 1;
    if (frequency[item] > maxFreq) {
      maxFreq = frequency[item];
      modeValue = item;
    }
  }
  
  return modeValue;
}

export default {
  discoverPatterns,
  savePatterns,
  updatePatterns,
  trackMultiActivityDay,
  detectPerformanceGaps
};
