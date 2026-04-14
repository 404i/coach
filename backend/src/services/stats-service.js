import db from '../db/index.js';
import logger from '../utils/logger.js';
import { addDataContextToResponse } from '../middleware/data-freshness.js';

/**
 * Helper function to get profile_id from email (returns athlete_profiles.id)
 * Use for tables that reference athlete_profiles: diary_entries, training_patterns, etc.
 */
export async function getProfileIdFromEmail(email) {
  const user = await db('users').where('garmin_email', email).first();
  if (!user) {
    throw new Error('User not found');
  }

  const profile = await db('athlete_profiles').where('user_id', user.id).first();
  if (!profile) {
    throw new Error('Athlete profile not found');
  }

  return profile.id;
}

/**
 * Helper function to get user_id from email (returns users.id)
 * Use for tables that reference users: activities, daily_metrics
 */
export async function getUserIdFromEmail(email) {
  const user = await db('users').where('garmin_email', email).first();
  if (!user) {
    throw new Error('User not found');
  }
  return user.id;
}

/**
 * Get training load trend analysis (acute vs chronic load)
 * Acute Load = 7-day average
 * Chronic Load = 42-day average (6 weeks)
 * Acute:Chronic Ratio (ACR) indicates training stress
 * - ACR < 0.8: Detraining risk
 * - ACR 0.8-1.3: Optimal training zone
 * - ACR > 1.3: High fatigue/injury risk
 */
export async function getTrainingLoadTrend(email, days = 60) {
  try {
    const userId = await getUserIdFromEmail(email);

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const metrics = await db('daily_metrics')
      .where('user_id', userId)
      .whereBetween('date', [startDate, endDate])
      .select('date', 'metrics_data')
      .orderBy('date', 'desc');

    const loadData = metrics.map(m => ({
      date: m.date,
      training_load: JSON.parse(m.metrics_data).training_load || 0
    }));

    // Detect stale training load data (no non-zero loads in last 7 days)
    const recent7 = loadData.slice(0, 7);
    const recentNonZero = recent7.filter(d => d.training_load > 0).length;
    const loadDataStale = recentNonZero === 0 && loadData.length > 0;

    // Calculate acute load (7-day average)
    const acuteLoad = calculateRollingAverage(loadData, 7);
    
    // Calculate chronic load (42-day average)
    const chronicLoad = calculateRollingAverage(loadData, 42);

    // Calculate acute:chronic ratio
    const acr = chronicLoad > 0 ? acuteLoad / chronicLoad : null;

    // Determine training status
    let status = 'unknown';
    let recommendation = '';
    if (acr !== null) {
      if (acr < 0.8) {
        status = 'detraining';
        recommendation = 'Your training load has decreased significantly. Consider ramping up gradually.';
      } else if (acr <= 1.3) {
        status = 'optimal';
        recommendation = 'Your training load is well-balanced. Maintain current approach.';
      } else if (acr <= 1.5) {
        status = 'building';
        recommendation = 'You\'re building fitness but watch for fatigue signs.';
      } else {
        status = 'high_risk';
        recommendation = 'Training load is very high. Consider a recovery week to prevent injury.';
      }
    }

    // Get trend data for last 30 days
    const trendData = loadData.slice(0, 30).reverse().map(d => ({
      date: d.date,
      training_load: d.training_load,
      acute_load: null, // Will calculate below
      chronic_load: null
    }));

    // Calculate rolling averages for each day in trend
    for (let i = 0; i < trendData.length; i++) {
      const dayIndex = loadData.length - trendData.length + i;
      const relevantData = loadData.slice(Math.max(0, dayIndex - 41), dayIndex + 1).reverse();
      
      if (relevantData.length >= 7) {
        trendData[i].acute_load = Math.round(
          relevantData.slice(0, 7).reduce((sum, d) => sum + d.training_load, 0) / 7
        );
      }
      if (relevantData.length >= 42) {
        trendData[i].chronic_load = Math.round(
          relevantData.slice(0, 42).reduce((sum, d) => sum + d.training_load, 0) / 42
        );
      }
    }

    const result = {
      current: {
        acute_load: Math.round(acuteLoad),
        chronic_load: Math.round(chronicLoad),
        acute_chronic_ratio: acr ? parseFloat(acr.toFixed(2)) : null,
        load_data_stale: loadDataStale,
        recent_load_days: recentNonZero,
        status,
        recommendation
      },
      trend: trendData
    };
    
    return await addDataContextToResponse(email, result);
  } catch (error) {
    logger.error('Error getting training load trend:', error);
    throw error;
  }
}

/**
 * Get recovery trend analysis
 * Tracks recovery score patterns over 7-day and 30-day windows
 */
export async function getRecoveryTrend(email, days = 60) {
  try {
    const userId = await getUserIdFromEmail(email);

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const metrics = await db('daily_metrics')
      .where('user_id', userId)
      .whereBetween('date', [startDate, endDate])
      .select('date', 'metrics_data')
      .orderBy('date', 'desc');

    const recoveryData = metrics.map(m => {
      const data = JSON.parse(m.metrics_data);
      return {
        date: m.date,
        recovery_score: data.recovery_score || 0,
        hrv_factor: data.hrv_factor_percent || null,
        sleep_factor: data.sleep_factor_percent || null,
        stress_factor: data.stress_factor_percent || null,
        recovery_time_factor: data.recovery_time_factor_percent || null
      };
    });

    // Calculate averages
    const avg7day = calculateRollingAverage(
      recoveryData.map(d => ({ date: d.date, value: d.recovery_score })),
      7,
      'value'
    );
    const avg30day = calculateRollingAverage(
      recoveryData.map(d => ({ date: d.date, value: d.recovery_score })),
      30,
      'value'
    );

    // Determine trend direction
    const recentDays = recoveryData.slice(0, 7);
    const previousDays = recoveryData.slice(7, 14);
    const recentAvg = recentDays.reduce((sum, d) => sum + d.recovery_score, 0) / recentDays.length;
    const previousAvg = previousDays.reduce((sum, d) => sum + d.recovery_score, 0) / previousDays.length;
    const trendDirection = recentAvg > previousAvg + 5 ? 'improving' : 
                          recentAvg < previousAvg - 5 ? 'declining' : 'stable';

    // Analyze factor patterns (last 7 days)
    const factorAnalysis = {
      hrv: { avg: 0, count: 0 },
      sleep: { avg: 0, count: 0 },
      stress: { avg: 0, count: 0 },
      recovery_time: { avg: 0, count: 0 }
    };

    recentDays.forEach(d => {
      if (d.hrv_factor !== null) {
        factorAnalysis.hrv.avg += d.hrv_factor;
        factorAnalysis.hrv.count++;
      }
      if (d.sleep_factor !== null) {
        factorAnalysis.sleep.avg += d.sleep_factor;
        factorAnalysis.sleep.count++;
      }
      if (d.stress_factor !== null) {
        factorAnalysis.stress.avg += d.stress_factor;
        factorAnalysis.stress.count++;
      }
      if (d.recovery_time_factor !== null) {
        factorAnalysis.recovery_time.avg += d.recovery_time_factor;
        factorAnalysis.recovery_time.count++;
      }
    });

    // Calculate averages and identify limiting factor
    const factors = {};
    let limitingFactor = null;
    let lowestScore = 100;

    Object.keys(factorAnalysis).forEach(key => {
      if (factorAnalysis[key].count > 0) {
        const avg = Math.round(factorAnalysis[key].avg / factorAnalysis[key].count);
        factors[key] = avg;
        if (avg < lowestScore) {
          lowestScore = avg;
          limitingFactor = key;
        }
      }
    });

    const result = {
      current: {
        recovery_score: recoveryData[0].recovery_score,
        avg_7day: Math.round(avg7day),
        avg_30day: Math.round(avg30day),
        trend_direction: trendDirection
      },
      factors,
      limiting_factor: limitingFactor,
      trend: recoveryData.slice(0, 30).reverse().map(d => ({
        date: d.date,
        recovery_score: d.recovery_score,
        hrv_factor: d.hrv_factor,
        sleep_factor: d.sleep_factor,
        stress_factor: d.stress_factor,
        recovery_time_factor: d.recovery_time_factor
      }))
    };
    
    return await addDataContextToResponse(email, result);
  } catch (error) {
    logger.error('Error getting recovery trend:', error);
    throw error;
  }
}

/**
 * Get HRV baseline and percentile analysis
 * Establishes personal HRV baseline and identifies anomalies
 */
export async function getHrvBaseline(email, days = 60) {
  try {
    const userId = await getUserIdFromEmail(email);

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const metrics = await db('daily_metrics')
      .where('user_id', userId)
      .whereBetween('date', [startDate, endDate])
      .select('date', 'metrics_data')
      .orderBy('date', 'asc');

    const hrvData = metrics
      .map(m => {
        const data = JSON.parse(m.metrics_data);
        return {
          date: m.date,
          hrv: data.hrv
        };
      })
      .filter(d => d.hrv && d.hrv > 0);

    if (hrvData.length === 0) {
      throw new Error('No HRV data available');
    }

    // Calculate statistics
    const hrvValues = hrvData.map(d => d.hrv).sort((a, b) => a - b);
    const mean = hrvValues.reduce((sum, v) => sum + v, 0) / hrvValues.length;
    const variance = hrvValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / hrvValues.length;
    const stdDev = Math.sqrt(variance);

    // Calculate percentiles
    const percentiles = {
      p10: hrvValues[Math.floor(hrvValues.length * 0.1)],
      p25: hrvValues[Math.floor(hrvValues.length * 0.25)],
      p50: hrvValues[Math.floor(hrvValues.length * 0.5)],
      p75: hrvValues[Math.floor(hrvValues.length * 0.75)],
      p90: hrvValues[Math.floor(hrvValues.length * 0.9)]
    };

    // Current HRV status
    const currentHrv = hrvData[hrvData.length - 1].hrv;
    let status = 'normal';
    let statusDescription = '';

    if (currentHrv < percentiles.p10) {
      status = 'very_low';
      statusDescription = 'HRV is significantly below your baseline. Consider rest or light activity.';
    } else if (currentHrv < percentiles.p25) {
      status = 'low';
      statusDescription = 'HRV is below average. Your body may need extra recovery.';
    } else if (currentHrv > percentiles.p75) {
      status = 'high';
      statusDescription = 'HRV is above average. You\'re well-recovered.';
    } else if (currentHrv > percentiles.p90) {
      status = 'very_high';
      statusDescription = 'HRV is excellent. You\'re ready for high-intensity training.';
    } else {
      status = 'normal';
      statusDescription = 'HRV is within your normal range.';
    }

    // Calculate 7-day rolling average
    const rollingAvg = [];
    for (let i = 6; i < hrvData.length; i++) {
      const window = hrvData.slice(i - 6, i + 1);
      const avg = window.reduce((sum, d) => sum + d.hrv, 0) / window.length;
      rollingAvg.push({
        date: hrvData[i].date,
        hrv: hrvData[i].hrv,
        rolling_avg: Math.round(avg)
      });
    }

    const result = {
      baseline: {
        mean: Math.round(mean),
        std_dev: parseFloat(stdDev.toFixed(1)),
        min: hrvValues[0],
        max: hrvValues[hrvValues.length - 1],
        sample_size: hrvValues.length
      },
      percentiles,
      current: {
        hrv: currentHrv,
        status,
        status_description: statusDescription,
        percentile_rank: calculatePercentileRank(currentHrv, hrvValues)
      },
      trend: rollingAvg.slice(-30)
    };
    
    return await addDataContextToResponse(email, result);
  } catch (error) {
    logger.error('Error getting HRV baseline:', error);
    throw error;
  }
}

/**
 * Get Training Stress Balance (TSB)
 * TSB = Fitness - Fatigue
 * Fitness (Chronic Training Load) - slow-changing, builds over weeks
 * Fatigue (Acute Training Load) - fast-changing, responds quickly
 * Positive TSB = Fresh, negative TSB = Fatigued
 */
export async function getTrainingStressBalance(email, days = 60) {
  try {
    const userId = await getUserIdFromEmail(email);

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const metrics = await db('daily_metrics')
      .where('user_id', userId)
      .whereBetween('date', [startDate, endDate])
      .select('date', 'metrics_data')
      .orderBy('date', 'asc');

    const data = metrics.map(m => {
      const parsed = JSON.parse(m.metrics_data);
      return {
        date: m.date,
        training_load: parsed.training_load || 0,
        recovery_score: parsed.recovery_score || 0
      };
    });

    // Calculate TSB for each day
    const tsbData = [];
    for (let i = 0; i < data.length; i++) {
      const historicalData = data.slice(0, i + 1);
      
      // Fatigue (ATL) = 7-day exponential weighted average
      const fatigue = calculateExponentialAverage(historicalData.map(d => d.training_load), 7);
      
      // Fitness (CTL) = 42-day exponential weighted average
      const fitness = calculateExponentialAverage(historicalData.map(d => d.training_load), 42);
      
      // TSB = Fitness - Fatigue (inverted for intuitive interpretation)
      const tsb = fitness - fatigue;
      
      // Form estimate based on TSB and recovery
      let form = 'unknown';
      if (tsb < -30) {
        form = 'overreached';
      } else if (tsb < -10) {
        form = 'fatigued';
      } else if (tsb < 10) {
        form = 'fresh';
      } else {
        form = 'rested';
      }

      tsbData.push({
        date: data[i].date,
        fatigue: Math.round(fatigue),
        fitness: Math.round(fitness),
        tsb: Math.round(tsb),
        form,
        recovery_score: data[i].recovery_score
      });
    }

    const current = tsbData[tsbData.length - 1];
    let recommendation = '';

    switch (current.form) {
      case 'overreached':
        recommendation = 'You are significantly fatigued. Prioritize rest and recovery.';
        break;
      case 'fatigued':
        recommendation = 'Moderate fatigue. Consider easier training days or active recovery.';
        break;
      case 'fresh':
        recommendation = 'Good balance of fitness and freshness. Ideal for quality training.';
        break;
      case 'rested':
        recommendation = 'You are well-rested. Good time to build fitness with harder workouts.';
        break;
    }

    const result = {
      current: {
        fitness: current.fitness,
        fatigue: current.fatigue,
        tsb: current.tsb,
        form: current.form,
        recommendation
      },
      trend: tsbData.slice(-30)
    };
    
    return await addDataContextToResponse(email, result);
  } catch (error) {
    logger.error('Error getting training stress balance:', error);
    throw error;
  }
}

// Helper functions

function calculateRollingAverage(data, windowSize, field = 'training_load') {
  if (data.length < windowSize) {
    return data.reduce((sum, d) => sum + (d[field] || 0), 0) / data.length;
  }
  
  const window = data.slice(0, windowSize);
  return window.reduce((sum, d) => sum + (d[field] || 0), 0) / windowSize;
}

function calculateExponentialAverage(values, timeConstant) {
  // Exponential weighted average with time constant
  // More recent values have higher weight
  const alpha = 2 / (timeConstant + 1);
  let ema = values[0] || 0;
  
  for (let i = 1; i < values.length; i++) {
    ema = alpha * values[i] + (1 - alpha) * ema;
  }
  
  return ema;
}

function calculatePercentileRank(value, sortedValues) {
  const index = sortedValues.findIndex(v => v >= value);
  if (index === -1) return 100;
  return Math.round((index / sortedValues.length) * 100);
}
