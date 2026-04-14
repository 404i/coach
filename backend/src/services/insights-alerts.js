/**
 * Insights & Alerts Service
 * Proactive injury warnings, overtraining detection, milestones, and smart notifications
 */
import db from '../db/index.js';
import logger from '../utils/logger.js';
import { getProfileIdFromEmail, getUserIdFromEmail } from './stats-service.js';

/**
 * Get all active insights and alerts for an athlete
 */
export async function getInsightsAndAlerts(email) {
  try {
    const userId = await getUserIdFromEmail(email);
    
    // Get recent metrics (last 30 days)
    const metrics = await db('daily_metrics')
      .where({ user_id: userId })
      .where('date', '>=', db.raw("date('now', '-30 days')"))
      .orderBy('date', 'desc');
    
    if (metrics.length === 0) {
      return {
        alerts: [],
        insights: [],
        milestones: []
      };
    }
    
    // Parse metrics data
    const parsedMetrics = metrics.map(m => ({
      date: m.date,
      ...( typeof m.metrics_data === 'string' ? JSON.parse(m.metrics_data) : m.metrics_data)
    }));
    
    // Run all detection algorithms
    const alerts = [
      ...detectInjuryRisk(parsedMetrics),
      ...detectOvertraining(parsedMetrics),
      ...detectRecoveryIssues(parsedMetrics),
      ...detectHrvAnomalies(parsedMetrics),
      ...await detectTSBAlerts(userId)
    ];
    
    const insights = [
      ...detectTrainingPatterns(parsedMetrics),
      ...detectPerformanceTrends(parsedMetrics)
    ];
    
    const milestones = await detectMilestones(userId, parsedMetrics);
    
    return {
      alerts: alerts.sort((a, b) => severityToNumber(b.severity) - severityToNumber(a.severity)),
      insights,
      milestones,
      summary: generateSummary(alerts, insights, milestones)
    };
  } catch (error) {
    logger.error('Error getting insights and alerts:', error);
    throw error;
  }
}

/**
 * Detect injury risk from training load
 */
function detectInjuryRisk(metrics) {
  const alerts = [];
  
  if (metrics.length < 42) return alerts;
  
  // Calculate ACR (Acute:Chronic Ratio)
  const last7Days = metrics.slice(0, 7);
  const last42Days = metrics.slice(0, 42);
  
  const acuteLoad = last7Days.reduce((sum, m) => sum + (m.training_load || 0), 0) / 7;
  const chronicLoad = last42Days.reduce((sum, m) => sum + (m.training_load || 0), 0) / 42;
  
  const acr = chronicLoad > 0 ? acuteLoad / chronicLoad : 0;
  
  // Very high risk: ACR > 1.5
  if (acr > 1.5) {
    alerts.push({
      type: 'injury_risk',
      severity: 'critical',
      title: '⚠️ Very High Injury Risk',
      message: `Your Acute:Chronic Ratio is ${acr.toFixed(2)} (very high risk zone). You've ramped up training too quickly.`,
      recommendation: 'Take 2-3 easy/recovery days immediately. Reduce volume by 30-40% this week.',
      data: { acr, acuteLoad: Math.round(acuteLoad), chronicLoad: Math.round(chronicLoad) }
    });
  }
  // High risk: ACR > 1.3
  else if (acr > 1.3) {
    alerts.push({
      type: 'injury_risk',
      severity: 'high',
      title: '⚠️ High Injury Risk',
      message: `Your Acute:Chronic Ratio is ${acr.toFixed(2)} (high risk). Training load increased too rapidly.`,
      recommendation: 'Schedule a recovery week. Cap intensity and reduce volume by 20-30%.',
      data: { acr, acuteLoad: Math.round(acuteLoad), chronicLoad: Math.round(chronicLoad) }
    });
  }
  // Detraining risk: ACR < 0.8
  else if (acr < 0.8 && acuteLoad > 50) {
    alerts.push({
      type: 'detraining_risk',
      severity: 'medium',
      title: '📉 Detraining Risk',
      message: `Your Acute:Chronic Ratio is ${acr.toFixed(2)} (low). Recent training is much lower than your baseline.`,
      recommendation: 'Gradually increase training volume by 5-10% this week to maintain fitness.',
      data: { acr, acuteLoad: Math.round(acuteLoad), chronicLoad: Math.round(chronicLoad) }
    });
  }
  
  return alerts;
}

/**
 * Detect overtraining syndrome
 */
function detectOvertraining(metrics) {
  const alerts = [];
  
  if (metrics.length < 14) return alerts;
  
  const last14Days = metrics.slice(0, 14);
  
  // Check for prolonged high load with low recovery
  const highLoadDays = last14Days.filter(m => (m.training_load || 0) > 400).length;
  const lowRecoveryDays = last14Days.filter(m => (m.recovery_score || 100) < 50).length;
  const avgRecovery = last14Days.reduce((sum, m) => sum + (m.recovery_score || 0), 0) / 14;
  const avgHrv = last14Days.filter(m => m.hrv).reduce((sum, m) => sum + m.hrv, 0) / last14Days.filter(m => m.hrv).length;
  
  // Critical: 10+ days high load + 7+ days low recovery
  if (highLoadDays >= 10 && lowRecoveryDays >= 7) {
    alerts.push({
      type: 'overtraining',
      severity: 'critical',
      title: '🚨 Overtraining Detected',
      message: `You've had ${highLoadDays} high-load days and ${lowRecoveryDays} low-recovery days in the past 2 weeks. Average recovery: ${Math.round(avgRecovery)}%.`,
      recommendation: 'Take 3-5 complete rest days. Consider medical consultation if symptoms persist (fatigue, poor sleep, irritability).',
      data: { highLoadDays, lowRecoveryDays, avgRecovery: Math.round(avgRecovery) }
    });
  }
  // High risk: 7+ days high load + 5+ days low recovery
  else if (highLoadDays >= 7 && lowRecoveryDays >= 5) {
    alerts.push({
      type: 'overtraining',
      severity: 'high',
      title: '⚠️ Overtraining Risk',
      message: `You've had ${highLoadDays} high-load days and ${lowRecoveryDays} low-recovery days recently. Recovery average: ${Math.round(avgRecovery)}%.`,
      recommendation: 'Schedule a recovery week immediately. Focus on sleep, nutrition, and stress management.',
      data: { highLoadDays, lowRecoveryDays, avgRecovery: Math.round(avgRecovery) }
    });
  }
  
  return alerts;
}

/**
 * Detect recovery issues
 */
function detectRecoveryIssues(metrics) {
  const alerts = [];
  
  if (metrics.length < 7) return alerts;
  
  const last7Days = metrics.slice(0, 7);
  
  // Check for consecutive days of poor recovery
  let consecutiveLowRecovery = 0;
  for (const m of last7Days) {
    if ((m.recovery_score || 100) < 50) {
      consecutiveLowRecovery++;
    } else {
      break;
    }
  }
  
  if (consecutiveLowRecovery >= 3) {
    const avgRecovery = last7Days.slice(0, consecutiveLowRecovery).reduce((sum, m) => sum + (m.recovery_score || 0), 0) / consecutiveLowRecovery;
    
    alerts.push({
      type: 'poor_recovery',
      severity: consecutiveLowRecovery >= 5 ? 'high' : 'medium',
      title: '😴 Prolonged Poor Recovery',
      message: `You've had ${consecutiveLowRecovery} consecutive days with recovery below 50% (avg: ${Math.round(avgRecovery)}%).`,
      recommendation: 'Prioritize sleep (8+ hours), reduce training intensity, check hydration and nutrition.',
      data: { consecutiveDays: consecutiveLowRecovery, avgRecovery: Math.round(avgRecovery) }
    });
  }
  
  // Check sleep issues
  const lowSleepDays = last7Days.filter(m => (m.sleep_score || 100) < 60).length;
  if (lowSleepDays >= 4) {
    const avgSleep = last7Days.reduce((sum, m) => sum + (m.sleep_score || 0), 0) / 7;
    
    alerts.push({
      type: 'sleep_issues',
      severity: 'medium',
      title: '💤 Sleep Quality Issues',
      message: `${lowSleepDays} days out of 7 had poor sleep (avg: ${Math.round(avgSleep)}/100).`,
      recommendation: 'Focus on sleep hygiene: consistent bedtime, cool dark room, limit screens 1hr before bed.',
      data: { lowSleepDays, avgSleep: Math.round(avgSleep) }
    });
  }
  
  return alerts;
}

/**
 * Detect HRV anomalies
 */
function detectHrvAnomalies(metrics) {
  const alerts = [];
  
  const withHrv = metrics.filter(m => m.hrv);
  if (withHrv.length < 14) return alerts;
  
  const last7Days = withHrv.slice(0, 7);
  const previous7Days = withHrv.slice(7, 14);
  
  const recentAvg = last7Days.reduce((sum, m) => sum + m.hrv, 0) / last7Days.length;
  const previousAvg = previous7Days.reduce((sum, m) => sum + m.hrv, 0) / previous7Days.length;
  
  // Sharp decline: >20% drop
  if (recentAvg < previousAvg * 0.8) {
    const dropPct = Math.round(((previousAvg - recentAvg) / previousAvg) * 100);
    
    alerts.push({
      type: 'hrv_decline',
      severity: dropPct > 30 ? 'high' : 'medium',
      title: '📉 HRV Declined Sharply',
      message: `Your HRV dropped ${dropPct}% in the past week (${Math.round(recentAvg)}ms vs. ${Math.round(previousAvg)}ms).`,
      recommendation: 'This indicates accumulated stress/fatigue. Take 1-2 easy days, prioritize recovery.',
      data: { recentAvg: Math.round(recentAvg), previousAvg: Math.round(previousAvg), dropPct }
    });
  }
  
  // Check for consistently low HRV
  const avgHrv = withHrv.slice(0, 30).reduce((sum, m) => sum + m.hrv, 0) / Math.min(withHrv.length, 30);
  const stdDev = Math.sqrt(withHrv.slice(0, 30).reduce((sum, m) => Math.pow(m.hrv - avgHrv, 2), 0) / Math.min(withHrv.length, 30));
  
  if (recentAvg < avgHrv - stdDev) {
    alerts.push({
      type: 'hrv_low',
      severity: 'low',
      title: '⚠️ HRV Below Normal',
      message: `Current HRV (${Math.round(recentAvg)}ms) is below your baseline (${Math.round(avgHrv)}ms ± ${Math.round(stdDev)}ms).`,
      recommendation: 'Monitor closely. Consider easier training today.',
      data: { current: Math.round(recentAvg), baseline: Math.round(avgHrv) }
    });
  }
  
  return alerts;
}

/**
 * Detect TSB (Training Stress Balance) based fatigue/freshness alerts
 * TSB = CTL - ATL (Form = Fitness - Fatigue)
 * 
 * Zones:
 * - TSB < -30: Severe overreach (critical injury risk)
 * - TSB -30 to -15: High fatigue (recovery needed)
 * - TSB -15 to -5: Productive training zone
 * - TSB -5 to +5: Freshness/maintenance
 * - TSB +5 to +25: Fresh/rested
 * - TSB > +25: Very fresh (detraining risk)
 */
async function detectTSBAlerts(userId) {
  const alerts = [];
  
  // Get latest metrics with TSB
  const latestMetric = await db('daily_metrics')
    .where({ user_id: userId })
    .orderBy('date', 'desc')
    .first();
  
  if (!latestMetric) return alerts;
  
  const data = typeof latestMetric.metrics_data === 'string' 
    ? JSON.parse(latestMetric.metrics_data) 
    : latestMetric.metrics_data;
  
  const tsb = data.tsb;
  const ctl = data.ctl; // Chronic Training Load (fitness)
  const atl = data.atl; // Acute Training Load (fatigue)
  
  if (tsb == null) return alerts;
  
  // Critical overreach: TSB < -30
  if (tsb < -30) {
    alerts.push({
      type: 'overreached',
      severity: tsb < -50 ? 'critical' : 'high',
      title: '🚨 Severe Overreach Detected',
      message: `Your Training Stress Balance is ${tsb} (severe overreach). You are at high risk of injury or illness.`,
      recommendation: 'Take at least 2-3 complete rest days immediately. Focus on recovery: sleep 8+ hours, nutrition, hydration. Consider medical consultation if you experience persistent fatigue, irritability, or poor sleep.',
      data: { 
        tsb, 
        ctl: Math.round(ctl || 0), 
        atl: Math.round(atl || 0), 
        date: latestMetric.date 
      }
    });
  }
  // High fatigue: TSB -30 to -15
  else if (tsb < -15) {
    alerts.push({
      type: 'fatigued',
      severity: 'medium',
      title: '⚠️ High Fatigue Load',
      message: `Your TSB is ${tsb} (fatigued state). You are carrying significant accumulated fatigue.`,
      recommendation: 'Reduce training intensity by 20-30%. Schedule 1-2 easy/recovery days this week. Monitor sleep quality and recovery metrics closely.',
      data: { 
        tsb, 
        ctl: Math.round(ctl || 0), 
        atl: Math.round(atl || 0), 
        date: latestMetric.date 
      }
    });
  }
  // Very fresh (detraining risk): TSB > +25
  else if (tsb > 25) {
    alerts.push({
      type: 'undertrained',
      severity: 'low',
      title: '📉 Very Fresh — Risk of Detraining',
      message: `Your TSB is ${tsb} (very fresh/rested). Extended rest may lead to fitness loss.`,
      recommendation: 'Increase training load gradually. Add 1-2 quality sessions this week. Consider if you\'re recovering from injury or illness before ramping up.',
      data: { 
        tsb, 
        ctl: Math.round(ctl || 0), 
        atl: Math.round(atl || 0), 
        date: latestMetric.date 
      }
    });
  }
  
  return alerts;
}

/**
 * Detect positive training patterns
 */
function detectTrainingPatterns(metrics) {
  const insights = [];
  
  if (metrics.length < 14) return insights;
  
  const last14Days = metrics.slice(0, 14);
  
  // Check consistency
  const daysWithTraining = last14Days.filter(m => (m.training_load || 0) > 50).length;
  if (daysWithTraining >= 12) {
    insights.push({
      type: 'consistency',
      sentiment: 'positive',
      title: '🔥 Excellent Consistency',
      message: `You've trained ${daysWithTraining} out of 14 days. Outstanding commitment!`,
      data: { daysWithTraining }
    });
  } else if (daysWithTraining >= 10) {
    insights.push({
      type: 'consistency',
      sentiment: 'positive',
      title: '💪 Great Consistency',
      message: `You've trained ${daysWithTraining} out of 14 days. Keep it up!`,
      data: { daysWithTraining }
    });
  }
  
  // Check for balanced recovery
  const avgRecovery = last14Days.reduce((sum, m) => sum + (m.recovery_score || 0), 0) / 14;
  if (avgRecovery >= 70) {
    insights.push({
      type: 'recovery',
      sentiment: 'positive',
      title: '✅ Well Recovered',
      message: `Your average recovery is ${Math.round(avgRecovery)}%. You're managing training stress well.`,
      data: { avgRecovery: Math.round(avgRecovery) }
    });
  }
  
  return insights;
}

/**
 * Detect performance trends
 */
function detectPerformanceTrends(metrics) {
  const insights = [];
  
  if (metrics.length < 21) return insights;
  
  const withHrv = metrics.filter(m => m.hrv);
  if (withHrv.length < 14) return insights;
  
  const recentWeek = withHrv.slice(0, 7);
  const previousWeek = withHrv.slice(7, 14);
  
  const recentAvgHrv = recentWeek.reduce((sum, m) => sum + m.hrv, 0) / recentWeek.length;
  const previousAvgHrv = previousWeek.reduce((sum, m) => sum + m.hrv, 0) / previousWeek.length;
  
  // HRV improving
  if (recentAvgHrv > previousAvgHrv * 1.1) {
    const improvePct = Math.round(((recentAvgHrv - previousAvgHrv) / previousAvgHrv) * 100);
    insights.push({
      type: 'hrv_trend',
      sentiment: 'positive',
      title: '📈 HRV Improving',
      message: `Your HRV increased ${improvePct}% this week (${Math.round(recentAvgHrv)}ms vs. ${Math.round(previousAvgHrv)}ms). Your fitness is adapting!`,
      data: { recentAvg: Math.round(recentAvgHrv), previousAvg: Math.round(previousAvgHrv), improvePct }
    });
  }
  
  return insights;
}

/**
 * Detect milestones and achievements
 */
async function detectMilestones(userId, metrics) {
  const milestones = [];
  
  // Check training streak
  let currentStreak = 0;
  for (const m of metrics) {
    if ((m.training_load || 0) > 50) {
      currentStreak++;
    } else {
      break;
    }
  }
  
  if (currentStreak >= 7) {
    milestones.push({
      type: 'streak',
      title: `🔥 ${currentStreak}-Day Training Streak`,
      message: `You've trained consistently for ${currentStreak} days straight!`,
      data: { days: currentStreak }
    });
  }
  
  // Check weekly volume milestone
  if (metrics.length >= 7) {
    const weeklyLoad = metrics.slice(0, 7).reduce((sum, m) => sum + (m.training_load || 0), 0);
    
    // Fetch all-time data for comparison
    const allMetrics = await db('daily_metrics')
      .where({ user_id: userId })
      .orderBy('date', 'desc');
    
    const parsedAll = allMetrics.map(m => ({
      date: m.date,
      ...(typeof m.metrics_data === 'string' ? JSON.parse(m.metrics_data) : m.metrics_data)
    }));
    
    // Calculate weekly loads for all weeks
    const weeklyLoads = [];
    for (let i = 0; i < parsedAll.length - 7; i += 7) {
      const weekLoad = parsedAll.slice(i, i + 7).reduce((sum, m) => sum + (m.training_load || 0), 0);
      weeklyLoads.push(weekLoad);
    }
    
    weeklyLoads.sort((a, b) => b - a);
    const topLoad = weeklyLoads[0];
    
    // Personal record
    if (weeklyLoad >= topLoad && weeklyLoad > 2000) {
      milestones.push({
        type: 'volume_pr',
        title: '🏆 Weekly Volume PR!',
        message: `This is your highest training load week ever: ${Math.round(weeklyLoad)}!`,
        data: { weeklyLoad: Math.round(weeklyLoad), previousBest: Math.round(topLoad) }
      });
    }
    // High volume milestone
    else if (weeklyLoad > 2500 && weeklyLoad >= topLoad * 0.95) {
      milestones.push({
        type: 'high_volume',
        title: '💪 High Volume Week',
        message: `You logged ${Math.round(weeklyLoad)} training load this week—one of your highest!`,
        data: { weeklyLoad: Math.round(weeklyLoad) }
      });
    }
  }
  
  // Check consistency milestone (30 days)
  if (metrics.length >= 30) {
    const daysWithTraining = metrics.slice(0, 30).filter(m => (m.training_load || 0) > 50).length;
    
    if (daysWithTraining >= 25) {
      milestones.push({
        type: 'consistency_milestone',
        title: '🎯 30-Day Consistency',
        message: `You trained ${daysWithTraining} out of the last 30 days. Exceptional dedication!`,
        data: { daysWithTraining, totalDays: 30 }
      });
    }
  }
  
  return milestones;
}

/**
 * Generate summary text
 */
function generateSummary(alerts, insights, milestones) {
  const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
  const highAlerts = alerts.filter(a => a.severity === 'high').length;
  
  if (criticalAlerts > 0) {
    return `⚠️ URGENT: ${criticalAlerts} critical alert${criticalAlerts > 1 ? 's' : ''} requiring immediate attention.`;
  }
  
  if (highAlerts > 0) {
    return `⚠️ ${highAlerts} high-priority alert${highAlerts > 1 ? 's' : ''}. Review and adjust training.`;
  }
  
  if (alerts.length > 0) {
    return `${alerts.length} notification${alerts.length > 1 ? 's' : ''} to review.`;
  }
  
  if (milestones.length > 0) {
    return `🎉 ${milestones.length} milestone${milestones.length > 1 ? 's' : ''} achieved! Keep up the great work.`;
  }
  
  return '✅ All systems green. Training is well-balanced.';
}

/**
 * Convert severity to number for sorting
 */
function severityToNumber(severity) {
  const map = { critical: 4, high: 3, medium: 2, low: 1 };
  return map[severity] || 0;
}

/**
 * Get specific type of alerts
 */
export async function getAlertsByType(email, type) {
  const all = await getInsightsAndAlerts(email);
  return {
    alerts: all.alerts.filter(a => a.type === type),
    insights: all.insights.filter(i => i.type === type),
    milestones: all.milestones.filter(m => m.type === type)
  };
}

/**
 * Dismiss/acknowledge an alert (for future: store dismissals in DB)
 */
export async function acknowledgeAlert(email, alertType) {
  // For now, just return success
  // In future: store in database with timestamp
  return {
    acknowledged: true,
    type: alertType,
    timestamp: new Date().toISOString()
  };
}
