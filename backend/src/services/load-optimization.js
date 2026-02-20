/**
 * Training Load Optimization Service
 * Smart ramp rate analysis, load distribution, volume/intensity balance
 */
import db from '../db/index.js';
import sqlite3 from 'sqlite3';
import logger from '../utils/logger.js';
import { getProfileIdFromEmail } from './stats-service.js';

const garminActivityDbPath = process.env.GARMIN_ACTIVITY_DB_PATH || 
  '/app/data/garmin/HealthData/DBs/garmin_activities.db';

/**
 * Query GarminDB for activities
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

/**
 * Comprehensive training load optimization analysis
 */
export async function getLoadOptimization(email, weeks = 12) {
  try {
    const profileId = await getProfileIdFromEmail(email);
    const days = weeks * 7;
    
    // Get metrics from coach DB
    const metrics = await db('daily_metrics')
      .where({ profile_id: profileId })
      .where('date', '>=', db.raw(`date('now', '-${days} days')`))
      .orderBy('date', 'desc');
    
    if (metrics.length === 0) {
      return { error: 'Not enough data for optimization analysis' };
    }
    
    const parsedMetrics = metrics.map(m => ({
      date: m.date,
      ...( typeof m.metrics_data === 'string' ? JSON.parse(m.metrics_data) : m.metrics_data)
    })).reverse(); // Oldest to newest for progression analysis
    
    // Get activities from GarminDB for sport distribution
    const startDate = parsedMetrics[0].date;
    const activities = await queryGarminActivities(`
      SELECT 
        date(start_time) as date,
        sport,
        training_load,
        elapsed_time,
        avg_hr,
        max_hr
      FROM activities
      WHERE start_time >= ?
      ORDER BY start_time
    `, [startDate]);
    
    // Run all optimization analyses
    const rampRate = analyzeRampRate(parsedMetrics);
    const sportDistribution = analyzeSportDistribution(activities, parsedMetrics);
    const volumeIntensity = analyzeVolumeIntensityBalance(parsedMetrics, activities);
    const fitnessFatigue = analyzeFitnessFatigueModel(parsedMetrics);
    const recommendations = generateOptimizationRecommendations(
      rampRate, 
      sportDistribution, 
      volumeIntensity, 
      fitnessFatigue,
      parsedMetrics
    );
    
    return {
      analysis_period: {
        weeks,
        days,
        start_date: parsedMetrics[0].date,
        end_date: parsedMetrics[parsedMetrics.length - 1].date
      },
      ramp_rate: rampRate,
      sport_distribution: sportDistribution,
      volume_intensity: volumeIntensity,
      fitness_fatigue: fitnessFatigue,
      recommendations,
      summary: generateOptimizationSummary(rampRate, sportDistribution, volumeIntensity, fitnessFatigue)
    };
  } catch (error) {
    logger.error('Error in load optimization:', error);
    throw error;
  }
}

/**
 * Analyze weekly ramp rates
 */
function analyzeRampRate(metrics) {
  const weeks = [];
  
  // Group by weeks
  for (let i = 0; i < metrics.length; i += 7) {
    const weekData = metrics.slice(i, i + 7);
    if (weekData.length < 7) continue;
    
    const totalLoad = weekData.reduce((sum, m) => sum + (m.training_load || 0), 0);
    const avgRecovery = weekData.reduce((sum, m) => sum + (m.recovery_score || 0), 0) / 7;
    const avgHrv = weekData.filter(m => m.hrv).reduce((sum, m) => sum + m.hrv, 0) / 
                   Math.max(weekData.filter(m => m.hrv).length, 1);
    
    weeks.push({
      week_number: Math.floor(i / 7) + 1,
      start_date: weekData[0].date,
      end_date: weekData[6].date,
      total_load: Math.round(totalLoad),
      avg_recovery: Math.round(avgRecovery),
      avg_hrv: Math.round(avgHrv) || null
    });
  }
  
  // Calculate week-to-week changes
  const changes = [];
  for (let i = 1; i < weeks.length; i++) {
    const prevLoad = weeks[i - 1].total_load;
    const currLoad = weeks[i].total_load;
    const change = prevLoad > 0 ? ((currLoad - prevLoad) / prevLoad) * 100 : 0;
    
    changes.push({
      from_week: weeks[i - 1].week_number,
      to_week: weeks[i].week_number,
      load_change_pct: Math.round(change),
      absolute_change: currLoad - prevLoad,
      status: determineRampStatus(change)
    });
  }
  
  // Calculate average ramp rate
  const avgRampRate = changes.length > 0 
    ? changes.reduce((sum, c) => sum + c.load_change_pct, 0) / changes.length 
    : 0;
  
  // Find violations (>10% increases)
  const violations = changes.filter(c => c.load_change_pct > 10);
  
  return {
    weekly_loads: weeks,
    week_to_week_changes: changes,
    avg_ramp_rate: Math.round(avgRampRate),
    violations: violations.length,
    violation_details: violations,
    current_trend: detectTrend(weeks.slice(-4)),
    optimal_range: { min: -5, max: 10, unit: 'percent' }
  };
}

/**
 * Determine ramp rate status
 */
function determineRampStatus(changePct) {
  if (changePct > 15) return 'too_fast';
  if (changePct > 10) return 'aggressive';
  if (changePct >= 5 && changePct <= 10) return 'optimal';
  if (changePct >= 0 && changePct < 5) return 'conservative';
  if (changePct >= -10 && changePct < 0) return 'recovery';
  return 'deload';
}

/**
 * Detect trend in recent weeks
 */
function detectTrend(recentWeeks) {
  if (recentWeeks.length < 3) return 'insufficient_data';
  
  const loads = recentWeeks.map(w => w.total_load);
  const increasing = loads.slice(1).every((load, i) => load >= loads[i]);
  const decreasing = loads.slice(1).every((load, i) => load <= loads[i]);
  
  if (increasing) return 'building';
  if (decreasing) return 'tapering';
  
  // Check volatility
  const avgLoad = loads.reduce((a, b) => a + b, 0) / loads.length;
  const maxDeviation = Math.max(...loads.map(l => Math.abs(l - avgLoad) / avgLoad));
  
  if (maxDeviation > 0.15) return 'volatile';
  return 'stable';
}

/**
 * Analyze sport distribution and balance
 */
function analyzeSportDistribution(activities, metrics) {
  if (activities.length === 0) {
    return { message: 'No activity data available' };
  }
  
  // Group by sport
  const sportStats = {};
  let totalLoad = 0;
  let totalTime = 0;
  
  activities.forEach(a => {
    const sport = a.sport || 'other';
    if (!sportStats[sport]) {
      sportStats[sport] = {
        sport,
        sessions: 0,
        total_load: 0,
        total_time_minutes: 0,
        avg_hr: []
      };
    }
    
    sportStats[sport].sessions++;
    sportStats[sport].total_load += a.training_load || 0;
    sportStats[sport].total_time_minutes += parseElapsedTime(a.elapsed_time);
    if (a.avg_hr) sportStats[sport].avg_hr.push(a.avg_hr);
    
    totalLoad += a.training_load || 0;
    totalTime += parseElapsedTime(a.elapsed_time);
  });
  
  // Calculate percentages and averages
  const distribution = Object.values(sportStats).map(s => ({
    sport: s.sport,
    sessions: s.sessions,
    load_percentage: totalLoad > 0 ? Math.round((s.total_load / totalLoad) * 100) : 0,
    time_percentage: totalTime > 0 ? Math.round((s.total_time_minutes / totalTime) * 100) : 0,
    avg_session_load: Math.round(s.total_load / s.sessions),
    avg_session_minutes: Math.round(s.total_time_minutes / s.sessions),
    avg_hr: s.avg_hr.length > 0 ? Math.round(s.avg_hr.reduce((a, b) => a + b) / s.avg_hr.length) : null
  })).sort((a, b) => b.load_percentage - a.load_percentage);
  
  // Calculate balance score
  const balanceScore = calculateDistributionBalance(distribution);
  
  // Detect issues
  const issues = [];
  if (distribution[0]?.load_percentage > 80) {
    issues.push({
      type: 'over_concentration',
      sport: distribution[0].sport,
      message: `${distribution[0].load_percentage}% of load in one sport - high injury risk`
    });
  }
  
  if (distribution.length === 1) {
    issues.push({
      type: 'single_sport',
      message: 'No cross-training - consider adding variety to reduce overuse'
    });
  }
  
  return {
    distribution,
    total_sports: distribution.length,
    balance_score: balanceScore,
    issues,
    recommendation: balanceScore < 60 ? 'Add cross-training variety' : 'Good sport balance'
  };
}

/**
 * Calculate balance score (0-100)
 */
function calculateDistributionBalance(distribution) {
  if (distribution.length === 0) return 0;
  if (distribution.length === 1) return 40; // Single sport = lower score
  
  // Penalize over-concentration
  const topSportPct = distribution[0].load_percentage;
  let score = 100;
  
  if (topSportPct > 80) score -= 40;
  else if (topSportPct > 70) score -= 25;
  else if (topSportPct > 60) score -= 10;
  
  // Reward variety
  if (distribution.length >= 3) score += 10;
  if (distribution.length >= 4) score += 10;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Analyze volume vs intensity balance
 */
function analyzeVolumeIntensityBalance(metrics, activities) {
  const last4Weeks = metrics.slice(-28);
  
  // Calculate volume metrics
  const totalLoad = last4Weeks.reduce((sum, m) => sum + (m.training_load || 0), 0);
  const totalTime = last4Weeks.reduce((sum, m) => sum + (m.total_duration_seconds || 0), 0) / 3600;
  const avgDailyLoad = totalLoad / 28;
  
  // Analyze intensity distribution from activities
  const recentActivities = activities.slice(-100); // Last 100 activities
  const intensityZones = {
    recovery: 0,   // < 60% max HR
    endurance: 0,  // 60-75%
    tempo: 0,      // 75-85%
    threshold: 0,  // 85-95%
    vo2max: 0      // > 95%
  };
  
  let activitiesWithHr = 0;
  recentActivities.forEach(a => {
    if (!a.avg_hr || !a.max_hr) return;
    activitiesWithHr++;
    
    const pctMax = (a.avg_hr / a.max_hr) * 100;
    
    if (pctMax < 60) intensityZones.recovery++;
    else if (pctMax < 75) intensityZones.endurance++;
    else if (pctMax < 85) intensityZones.tempo++;
    else if (pctMax < 95) intensityZones.threshold++;
    else intensityZones.vo2max++;
  });
  
  // Calculate percentages
  const intensityDistribution = activitiesWithHr > 0 ? {
    recovery: Math.round((intensityZones.recovery / activitiesWithHr) * 100),
    endurance: Math.round((intensityZones.endurance / activitiesWithHr) * 100),
    tempo: Math.round((intensityZones.tempo / activitiesWithHr) * 100),
    threshold: Math.round((intensityZones.threshold / activitiesWithHr) * 100),
    vo2max: Math.round((intensityZones.vo2max / activitiesWithHr) * 100)
  } : null;
  
  // Check 80/20 rule
  const easyPct = intensityDistribution ? 
    intensityDistribution.recovery + intensityDistribution.endurance : null;
  const hardPct = intensityDistribution ?
    intensityDistribution.tempo + intensityDistribution.threshold + intensityDistribution.vo2max : null;
  
  const follows8020 = easyPct ? (easyPct >= 70 && easyPct <= 90) : null;
  
  return {
    volume: {
      total_load: Math.round(totalLoad),
      total_hours: parseFloat(totalTime.toFixed(1)),
      avg_daily_load: Math.round(avgDailyLoad),
      avg_daily_hours: parseFloat((totalTime / 28).toFixed(1))
    },
    intensity_distribution: intensityDistribution,
    polarization: {
      easy_pct: easyPct,
      hard_pct: hardPct,
      follows_80_20_rule: follows8020,
      recommendation: follows8020 ? 'Good polarization' : 
        easyPct < 70 ? 'Too much hard training - add more easy volume' :
        'Too much easy training - add quality sessions'
    },
    balance_score: calculateVolumeIntensityScore(intensityDistribution),
    insights: generateVolumeIntensityInsights(intensityDistribution, totalLoad, totalTime)
  };
}

/**
 * Calculate volume/intensity balance score
 */
function calculateVolumeIntensityScore(distribution) {
  if (!distribution) return null;
  
  const easyPct = distribution.recovery + distribution.endurance;
  const hardPct = distribution.tempo + distribution.threshold + distribution.vo2max;
  
  let score = 100;
  
  // Ideal: 75-85% easy, 15-25% hard
  if (easyPct < 70) score -= 20;
  else if (easyPct < 75) score -= 10;
  else if (easyPct > 90) score -= 15;
  else if (easyPct > 85) score -= 5;
  
  if (hardPct < 10) score -= 10; // Too little quality
  if (hardPct > 30) score -= 15; // Too much intensity
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Generate insights for volume/intensity
 */
function generateVolumeIntensityInsights(distribution, totalLoad, totalTime) {
  const insights = [];
  
  if (!distribution) {
    insights.push('Add heart rate data to activities for intensity analysis');
    return insights;
  }
  
  const easyPct = distribution.recovery + distribution.endurance;
  const hardPct = distribution.tempo + distribution.threshold + distribution.vo2max;
  
  if (easyPct < 70) {
    insights.push(`Only ${easyPct}% easy training. Risk of overtraining - add more easy volume.`);
  } else if (easyPct > 90) {
    insights.push(`${easyPct}% easy training. Consider adding 1-2 quality sessions per week.`);
  } else {
    insights.push(`Good polarization: ${easyPct}% easy, ${hardPct}% hard.`);
  }
  
  if (distribution.vo2max > 10) {
    insights.push(`High VO2max work (${distribution.vo2max}%). Ensure adequate recovery between hard sessions.`);
  }
  
  if (totalTime < 5) {
    insights.push('Low weekly volume. Consider gradually increasing training time.');
  } else if (totalTime > 15) {
    insights.push('High volume athlete. Monitor recovery closely.');
  }
  
  return insights;
}

/**
 * Analyze fitness-fatigue model (Banister model)
 */
function analyzeFitnessFatigueModel(metrics) {
  if (metrics.length < 60) {
    return { message: 'Need at least 60 days of data for fitness-fatigue modeling' };
  }
  
  const last90Days = metrics.slice(-90);
  
  // Calculate fitness (42-day exponential average)
  let fitness = 0;
  const fitnessDecay = 1 / 42; // Time constant
  
  last90Days.forEach((m, i) => {
    const load = m.training_load || 0;
    fitness = fitness * (1 - fitnessDecay) + load * fitnessDecay;
  });
  
  // Calculate fatigue (7-day exponential average)
  let fatigue = 0;
  const fatigueDecay = 1 / 7;
  
  last90Days.slice(-7).forEach(m => {
    const load = m.training_load || 0;
    fatigue = fatigue * (1 - fatigueDecay) + load * fatigueDecay;
  });
  
  // Training Stress Balance (Form)
  const tsb = fitness - fatigue;
  
  // Form interpretation
  let formStatus, formMessage;
  if (tsb > 25) {
    formStatus = 'peaked';
    formMessage = 'Well rested and ready for peak performance';
  } else if (tsb > 5) {
    formStatus = 'fresh';
    formMessage = 'Good form, ready for racing or hard training';
  } else if (tsb >= -10) {
    formStatus = 'neutral';
    formMessage = 'Balanced fitness and fatigue';
  } else if (tsb >= -30) {
    formStatus = 'productive';
    formMessage = 'Accumulating fitness through training stress';
  } else {
    formStatus = 'overreached';
    formMessage = 'High fatigue - schedule recovery soon';
  }
  
  return {
    fitness: Math.round(fitness),
    fatigue: Math.round(fatigue),
    form: Math.round(tsb),
    form_status: formStatus,
    form_message: formMessage,
    optimal_range: { min: -20, max: 0 },
    recommendation: tsb < -30 ? 'Schedule recovery week' : 
                    tsb > 10 ? 'Increase training load' :
                    'Maintain current load'
  };
}

/**
 * Generate optimization recommendations
 */
function generateOptimizationRecommendations(rampRate, sportDist, volIntensity, fitFat, metrics) {
  const recommendations = [];
  
  // Ramp rate recommendations
  if (rampRate.violations > 2) {
    recommendations.push({
      category: 'ramp_rate',
      priority: 'high',
      title: 'Reduce Weekly Load Increases',
      issue: `${rampRate.violations} weeks exceeded 10% load increase`,
      action: 'Limit weekly increases to 5-10%. Use 3:1 pattern (3 build weeks + 1 recovery).',
      expected_benefit: 'Reduce injury risk by 40-50%'
    });
  }
  
  if (rampRate.current_trend === 'volatile') {
    recommendations.push({
      category: 'consistency',
      priority: 'medium',
      title: 'Stabilize Weekly Volume',
      issue: 'Training load is too variable week-to-week',
      action: 'Aim for consistent weekly volume. Small, steady increases beat large swings.',
      expected_benefit: 'Better adaptation and reduced injury risk'
    });
  }
  
  // Sport distribution recommendations
  if (sportDist.balance_score < 60) {
    recommendations.push({
      category: 'cross_training',
      priority: 'medium',
      title: 'Add Cross-Training Variety',
      issue: `Balance score: ${sportDist.balance_score}/100`,
      action: 'Add 1-2 complementary sports (swimming, cycling, yoga) to reduce overuse.',
      expected_benefit: 'Lower injury risk, improved recovery'
    });
  }
  
  // Volume/intensity recommendations
  if (volIntensity.intensity_distribution && volIntensity.polarization.easy_pct < 70) {
    recommendations.push({
      category: 'polarization',
      priority: 'high',
      title: 'Increase Easy Training Volume',
      issue: `Only ${volIntensity.polarization.easy_pct}% of training is easy`,
      action: 'Follow 80/20 rule: 80% easy/recovery effort, 20% hard. Make easy days truly easy.',
      expected_benefit: 'Better recovery, sustainable performance gains'
    });
  }
  
  // Fitness-fatigue recommendations
  if (fitFat.form !== undefined && fitFat.form < -30) {
    recommendations.push({
      category: 'recovery',
      priority: 'critical',
      title: 'Schedule Recovery Week Now',
      issue: `Form = ${fitFat.form} (overreached)`,
      action: 'Reduce volume by 40-50% this week. Focus on sleep, nutrition, easy activities.',
      expected_benefit: 'Prevent overtraining, restore performance'
    });
  }
  
  // Progressive load recommendation
  if (rampRate.current_trend === 'stable' && fitFat.form > 0) {
    recommendations.push({
      category: 'progression',
      priority: 'low',
      title: 'Opportunity to Increase Load',
      issue: 'You have recovery capacity for more training',
      action: 'Consider 5-8% weekly increase for 2-3 weeks, then recovery week.',
      expected_benefit: 'Continued fitness gains'
    });
  }
  
  return recommendations.sort((a, b) => {
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  });
}

/**
 * Generate optimization summary
 */
function generateOptimizationSummary(rampRate, sportDist, volIntensity, fitFat) {
  const issues = [];
  const strengths = [];
  
  // Ramp rate
  if (rampRate.violations > 2) {
    issues.push('Load increasing too rapidly');
  } else if (rampRate.violations === 0) {
    strengths.push('Smart load progression');
  }
  
  // Sport distribution
  if (sportDist.balance_score >= 70) {
    strengths.push('Good cross-training balance');
  } else if (sportDist.balance_score < 60) {
    issues.push('Over-concentrated in one sport');
  }
  
  // Volume/intensity
  if (volIntensity.balance_score >= 80) {
    strengths.push('Excellent volume/intensity balance');
  } else if (volIntensity.balance_score < 70) {
    issues.push('Volume/intensity imbalance');
  }
  
  // Fitness-fatigue
  if (fitFat.form !== undefined) {
    if (fitFat.form < -30) {
      issues.push('Overreached - recovery needed');
    } else if (fitFat.form > -10 && fitFat.form < 5) {
      strengths.push('Optimal training stress');
    }
  }
  
  let summary;
  if (issues.length === 0) {
    summary = `✅ Training load is well optimized. ${strengths.length} strengths identified.`;
  } else if (issues.length === 1) {
    summary = `⚠️ 1 optimization opportunity: ${issues[0]}`;
  } else {
    summary = `⚠️ ${issues.length} optimization opportunities identified`;
  }
  
  return {
    summary,
    issues,
    strengths,
    overall_score: calculateOverallOptimizationScore(rampRate, sportDist, volIntensity, fitFat)
  };
}

/**
 * Calculate overall optimization score
 */
function calculateOverallOptimizationScore(rampRate, sportDist, volIntensity, fitFat) {
  let score = 100;
  
  // Ramp rate (25 points)
  if (rampRate.violations > 3) score -= 25;
  else if (rampRate.violations > 1) score -= 15;
  else if (rampRate.violations === 1) score -= 5;
  
  // Sport distribution (25 points)
  score -= (100 - (sportDist.balance_score || 70)) * 0.25;
  
  // Volume/intensity (25 points)
  if (volIntensity.balance_score) {
    score -= (100 - volIntensity.balance_score) * 0.25;
  }
  
  // Fitness-fatigue (25 points)
  if (fitFat.form !== undefined) {
    if (fitFat.form < -30) score -= 25;
    else if (fitFat.form < -20) score -= 10;
    else if (fitFat.form > 10) score -= 15;
  }
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Parse elapsed time string to minutes
 */
function parseElapsedTime(timeStr) {
  if (!timeStr) return 0;
  
  const parts = timeStr.split(':').map(p => parseFloat(p));
  if (parts.length === 3) {
    return parts[0] * 60 + parts[1] + parts[2] / 60;
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

/**
 * Get specific optimization recommendation
 */
export async function getOptimizationRecommendation(email, category) {
  const optimization = await getLoadOptimization(email);
  const rec = optimization.recommendations.find(r => r.category === category);
  return rec || { message: `No recommendations for category: ${category}` };
}
