/**
 * Format training context as structured markdown files with a ledger index.
 * Makes it easier for LLMs to navigate complex training data.
 */

/**
 * Format athlete profile as markdown
 */
function formatProfileMD(profile, date) {
  return `# Athlete Profile

**Date**: ${date}

## Goals & Motivations
${profile.goals?.map(g => `- ${g}`).join('\n') || '_No goals specified_'}

**Motivations**: ${profile.motivations?.join(', ') || '_Not specified_'}

## Physical Capabilities

### Favorite Sports
${profile.favorite_sports?.map(s => `- ${s}`).join('\n') || '_Not specified_'}

### Fitness Baselines
${profile.baselines ? Object.entries(profile.baselines)
  .map(([k, v]) => `- **${k}**: ${v}`)
  .join('\n') : '_No baselines recorded_'}

### Injuries & Conditions
${profile.injuries?.length > 0 
  ? profile.injuries.map(i => `- ${i}`).join('\n')
  : '_None reported_'}

## Training Access & Constraints

### Available Equipment
${profile.equipment?.map(e => `- ${e}`).join('\n') || '_Not specified_'}

### Facilities
${profile.facilities?.map(f => `- ${f}`).join('\n') || '_Not specified_'}

### Time Availability
- **Days per week**: ${profile.days_per_week || '_Not specified_'}
- **Minutes per session**: ${profile.minutes_per_session || '_Not specified_'}

## Preferences
${profile.preferences ? Object.entries(profile.preferences)
  .map(([k, v]) => `- **${k}**: ${v}`)
  .join('\n') : '_No preferences recorded_'}

## Location
${profile.location ? `**${profile.location.city}, ${profile.location.country}**\n- Timezone: ${profile.location.timezone}` : '_Not specified_'}
`;
}

/**
 * Format recovery metrics as markdown
 */
function formatRecoveryMetricsMD(today, trends) {
  return `# Recovery Metrics

**Status**: ${getTodayRecoveryStatus(today, trends)}

## Today's Metrics (${today?.date || 'N/A'})

| Metric | Value | 7-Day Avg | 14-Day Avg | Trend |
|--------|-------|-----------|------------|-------|
| **HRV** | ${today?.hrv || 'N/A'} ms | ${trends?.hrv_7d_avg?.toFixed(1) || 'N/A'} | ${trends?.hrv_14d_avg?.toFixed(1) || 'N/A'} | ${getHRVTrend(today?.hrv, trends?.hrv_7d_avg)} |
| **Resting HR** | ${today?.resting_hr || 'N/A'} bpm | ${trends?.rhr_7d_avg?.toFixed(1) || 'N/A'} | ${trends?.rhr_14d_avg?.toFixed(1) || 'N/A'} | ${getRHRTrend(today?.resting_hr, trends?.rhr_7d_avg)} |
| **Sleep** | ${today?.sleep_hours || 'N/A'} hrs | ${trends?.sleep_7d_avg?.toFixed(1) || 'N/A'} | ${trends?.sleep_14d_avg?.toFixed(1) || 'N/A'} | ${getSleepTrend(today?.sleep_hours, trends?.sleep_7d_avg)} |
| **Stress** | ${today?.stress_avg != null ? today.stress_avg : 'N/A'} | ${trends?.stress_7d_avg?.toFixed(1) || 'N/A'} | - | - |
| **Body Battery** | ${today?.body_battery != null ? today.body_battery + '%' : 'N/A'} | - | - | - |

## Recovery Indicators

${analyzeRecoveryState(today, trends)}

## Sleep Quality
${today?.sleep_score ? `- **Sleep Score**: ${today.sleep_score}/100
- **Deep Sleep**: ${today.deep_sleep_minutes != null ? today.deep_sleep_minutes : 'N/A'} min
- **REM Sleep**: ${today.rem_sleep_minutes != null ? today.rem_sleep_minutes : 'N/A'} min
- **Light Sleep**: ${today.light_sleep_minutes != null ? today.light_sleep_minutes : 'N/A'} min` : '_No sleep data available_'}
`;
}

/**
 * Format training load as markdown
 */
function formatTrainingLoadMD(recentHistory, trends, weekStatus) {
  if (!recentHistory || recentHistory.length === 0) {
    return `# Training Load Analysis

**Status**: _No recent training data available_

## Current Week
${weekStatus ? `
- **Completed Workouts**: ${weekStatus?.completed_workouts || 0} / ${weekStatus?.planned_workouts || 0}
- **Total Volume**: ${weekStatus?.total_volume_minutes || 0} minutes
- **Hard Days**: ${weekStatus?.hard_days_count || 0}
- **Compliance**: ${weekStatus?.compliance_pct ? `${weekStatus.compliance_pct}%` : 'N/A'}
` : '_No week status available_'}`;
  }
  
  const last7Days = recentHistory.slice(-7);
  const totalLoad = last7Days.reduce((sum, d) => sum + (d.training_load || 0), 0);
  const acuteLoad = totalLoad / 7;
  
  return `# Training Load Analysis

## Current Week (${weekStatus?.week_start || 'N/A'})

- **Completed Workouts**: ${weekStatus?.completed_workouts || 0} / ${weekStatus?.planned_workouts || 0}
- **Total Volume**: ${weekStatus?.total_volume_minutes || 0} minutes
- **Hard Days**: ${weekStatus?.hard_days_count || 0}
- **Compliance**: ${weekStatus?.compliance_pct ? `${weekStatus.compliance_pct}%` : 'N/A'}

## Load Metrics (Last 7 Days)

- **Acute Training Load (ATL)**: ${acuteLoad.toFixed(1)}
- **Average Daily Load**: ${trends?.training_load_7d_avg?.toFixed(1) || 'N/A'}
- **Total Load (7d)**: ${totalLoad.toFixed(1)}

## Daily Load History

${last7Days.map(d => `- **${d.date}**: ${d.training_load || 0} (${d.training_status || 'N/A'})`).join('\n')}

## Load Interpretation

${interpretTrainingLoad(acuteLoad, last7Days)}
`;
}

/**
 * Format recent training activities as markdown
 */
function formatRecentTrainingMD(recentHistory) {
  if (!recentHistory || recentHistory.length === 0) {
    return `# Recent Training History (Last 7 Days)

_No recent training data available_`;
  }

  return `# Recent Training History (Last 7 Days)

${recentHistory.slice(-7).reverse().map(day => `
## ${day.date}

- **Training Status**: ${day.training_status || 'N/A'}
- **Training Load**: ${day.training_load != null ? day.training_load : 0}
- **Duration**: ${day.duration_minutes != null ? day.duration_minutes : 0} minutes
- **Intensity Minutes**: ${day.intensity_minutes != null ? day.intensity_minutes : 0}
- **Steps**: ${day.steps != null ? day.steps : 'N/A'}
- **Calories**: ${day.calories_burned != null ? day.calories_burned : 'N/A'}
- **Activities**: ${day.activity_count != null ? day.activity_count : 0}

${day.activities_summary ? `### Activities Summary\n${day.activities_summary}` : ''}
`).join('\n---\n')}
`;
}

/**
 * Format training patterns and habits as markdown
 */
function formatPatternsMD(patterns) {
  if (!patterns) {
    return `# Training Patterns\n\n_No pattern data available_`;
  }
  
  return `# Training Patterns & Habits (Last 30 Days)

## Compliance Overview

- **Total Workouts**: ${patterns.total_workouts_30d}
- **Completion Rate**: ${(patterns.completion_rate_30d * 100).toFixed(1)}%

## Completion by Intensity

${Object.entries(patterns.completion_by_intensity || {}).map(([intensity, stats]) => `
### ${intensity.replace(/_/g, ' ').toUpperCase()}
- **Planned**: ${stats.planned}
- **Completed**: ${stats.completed}
- **Completion Rate**: ${((stats.completed / stats.planned) * 100).toFixed(1)}%
${patterns.recent_feedback?.[intensity]?.length > 0 
  ? `- **Recent Feedback**: ${patterns.recent_feedback[intensity].slice(0, 3).join('; ')}` 
  : ''}`).join('\n')}

## Insights

${derivePatternInsights(patterns)}
`;
}

/**
 * Create the main ledger/index file
 */
function formatLedgerMD(date, profile) {
  return `# Training Context Ledger

**Date**: ${date}
**Athlete**: ${profile.name || profile.email || 'Unknown'}
**Generated**: ${new Date().toISOString()}

## Context Structure

This training context is organized into the following sections:

### 📋 [Athlete Profile](athlete-profile.md)
Core athlete information including goals, motivations, equipment, constraints, and physical capabilities.

### 💤 [Recovery Metrics](recovery-metrics.md)  
Current recovery state, HRV, resting heart rate, sleep quality, and recovery trends.

### 📊 [Training Load](training-load.md)
Weekly training load, acute/chronic load ratios, training stress balance, and load trends.

### 🏃 [Recent Training](recent-training.md)
Detailed history of the last 7 days of training, including activities, durations, and intensities.

### 📈 [Training Patterns](training-patterns.md)
30-day compliance data, completion rates by workout type, and behavioral insights.

### 🎯 [Training Mode](training-mode.md)
Current training mode configuration (base building, peak training, recovery, etc.) and recent mode switches.

### 📅 [Planned Activities](planned-activities.md)
Upcoming planned activities, commitments, and schedule constraints.

## Quick Summary

${generateQuickSummary(date, profile)}

## Coaching Directives

When generating workout recommendations:
1. **Review ALL sections** to understand the complete picture
2. **Prioritize recovery signals** - if HRV/RHR/sleep indicate fatigue, adjust intensity
3. **Respect constraints** - equipment availability, time limits, injury history
4. **Maintain progression** - align with current training mode and long-term goals
5. **Be specific** - provide exact durations, intensities, zones, and structure
6. **Provide alternatives** - offer 2-3 backup options for different scenarios
7. **Explain reasoning** - help athlete understand WHY this workout fits today

## Navigation

Start with the **Recovery Metrics** to assess readiness, then review **Training Load** for context. Cross-reference with **Training Patterns** to understand what works for this athlete.
`;
}

/**
 * Format training mode as markdown
 */
function formatTrainingModeMD(trainingMode) {
  if (!trainingMode) {
    return `# Training Mode\n\n_No training mode configured_`;
  }
  
  return `# Training Mode Configuration

## Current Mode: **${trainingMode.current_mode?.toUpperCase() || 'NOT SET'}**

${trainingMode.config ? `
### Mode Configuration

${Object.entries(trainingMode.config).map(([k, v]) => `- **${k}**: ${JSON.stringify(v)}`).join('\n')}
` : ''}

${trainingMode.history?.length > 0 ? `
## Recent Mode Switches

${trainingMode.history.slice(-5).reverse().map(h => `- **${h.date}**: Changed to ${h.mode} (${h.reason || 'No reason specified'})`).join('\n')}
` : ''}
`;
}

/**
 * Format planned activities as markdown
 */
function formatPlannedActivitiesMD(plannedActivities) {
  if (!plannedActivities || plannedActivities.length === 0) {
    return `# Planned Activities\n\n_No upcoming planned activities_`;
  }
  
  return `# Upcoming Planned Activities

${plannedActivities.map(pa => `
## ${pa.date}
- **Type**: ${pa.type}
- **Description**: ${pa.description}
${pa.options ? `- **Options**: ${JSON.stringify(pa.options)}` : ''}
`).join('\n')}
`;
}

// Helper functions

function getTodayRecoveryStatus(today, trends) {
  if (!today || !trends) return '⚠️ Unknown';
  
  const hrvDelta = today.hrv && trends.hrv_7d_avg 
    ? ((today.hrv - trends.hrv_7d_avg) / trends.hrv_7d_avg) * 100 
    : null;
  const rhrDelta = today.resting_hr && trends.rhr_7d_avg
    ? ((today.resting_hr - trends.rhr_7d_avg) / trends.rhr_7d_avg) * 100
    : null;
  
  if (hrvDelta !== null && hrvDelta < -10 && rhrDelta !== null && rhrDelta > 5) {
    return '🔴 Poor Recovery';
  }
  if (hrvDelta !== null && hrvDelta > 5 && rhrDelta !== null && rhrDelta < 0) {
    return '🟢 Excellent Recovery';
  }
  return '🟡 Moderate Recovery';
}

function getHRVTrend(current, avg) {
  if (!current || !avg) return '-';
  const delta = ((current - avg) / avg) * 100;
  if (delta > 5) return '📈 +' + delta.toFixed(1) + '%';
  if (delta < -5) return '📉 ' + delta.toFixed(1) + '%';
  return '➡️ Stable';
}

function getRHRTrend(current, avg) {
  if (!current || !avg) return '-';
  const delta = ((current - avg) / avg) * 100;
  if (delta > 3) return '📈 +' + delta.toFixed(1) + '% (elevated)';
  if (delta < -3) return '📉 ' + delta.toFixed(1) + '% (lower)';
  return '➡️ Stable';
}

function getSleepTrend(current, avg) {
  if (!current || !avg) return '-';
  const delta = current - avg;
  if (delta > 0.5) return '📈 +' + delta.toFixed(1) + ' hrs';
  if (delta < -0.5) return '📉 ' + delta.toFixed(1) + ' hrs';
  return '➡️ Normal';
}

function analyzeRecoveryState(today, trends) {
  const signals = [];
  
  if (today?.hrv && trends?.hrv_7d_avg) {
    const hrvDelta = ((today.hrv - trends.hrv_7d_avg) / trends.hrv_7d_avg) * 100;
    if (hrvDelta < -10) signals.push('⚠️ **HRV significantly below baseline** - indicates incomplete recovery');
    if (hrvDelta > 10) signals.push('✅ **HRV elevated** - good recovery state');
  }
  
  if (today?.resting_hr && trends?.rhr_7d_avg) {
    const rhrDelta = ((today.resting_hr - trends.rhr_7d_avg) / trends.rhr_7d_avg) * 100;
    if (rhrDelta > 5) signals.push('⚠️ **Elevated resting HR** - possible fatigue or stress');
    if (rhrDelta < -3) signals.push('✅ **Lower resting HR** - improved fitness/recovery');
  }
  
  if (today?.sleep_hours && today.sleep_hours < 7) {
    signals.push('⚠️ **Insufficient sleep** - may impact performance');
  }
  
  if (today?.stress_avg && today.stress_avg > 50) {
    signals.push('⚠️ **Elevated stress** - consider reducing training intensity');
  }
  
  if (today?.body_battery && today.body_battery < 30) {
    signals.push('⚠️ **Low body battery** - prioritize recovery');
  }
  
  return signals.length > 0 ? signals.join('\n') : '✅ No significant recovery concerns';
}

function interpretTrainingLoad(acuteLoad, last7Days) {
  const insights = [];
  
  if (acuteLoad > 150) {
    insights.push('⚠️ **High load** - monitor for fatigue signals');
  } else if (acuteLoad < 50) {
    insights.push('📊 **Low load** - opportunity for progression if recovered');
  }
  
  const hardDays = last7Days.filter(d => d.training_load && d.training_load > 100).length;
  if (hardDays >= 4) {
    insights.push('⚠️ **4+ hard days this week** - ensure recovery day soon');
  }
  
  const consecutiveZeroDays = last7Days.slice(-3).filter(d => !d.training_load || d.training_load === 0).length;
  if (consecutiveZeroDays >= 3) {
    insights.push('📅 **3+ rest days** - ready for training stimulus');
  }
  
  return insights.length > 0 ? insights.join('\n') : '✅ Load distribution looks balanced';
}

function derivePatternInsights(patterns) {
  const insights = [];
  
  if (patterns.completion_rate_30d < 0.5) {
    insights.push('⚠️ Low completion rate - consider adjusting workout difficulty or time commitments');
  }
  
  const intensityRates = Object.entries(patterns.completion_by_intensity || {});
  if (intensityRates.length > 0) {
    const lowestIntensity = intensityRates.reduce((min, [k, v]) => {
      const rate = v.completed / v.planned;
      return rate < min.rate ? { intensity: k, rate } : min;
    }, { intensity: null, rate: 1 });
    
    if (lowestIntensity.intensity && lowestIntensity.rate < 0.4) {
      insights.push(`📉 Struggles with **${lowestIntensity.intensity.replace(/_/g, ' ')}** workouts (${(lowestIntensity.rate * 100).toFixed(0)}% completion) - consider modifications`);
    }
  }
  
  return insights.length > 0 ? insights.join('\n') : '✅ Consistent training adherence across workout types';
}

function generateQuickSummary(date, profile) {
  return `
**Training Goals**: ${profile.goals?.slice(0, 2).join(', ') || 'Not specified'}
**Recent Activity**: Check [Recent Training](recent-training.md) for last 7 days
**Recovery State**: See [Recovery Metrics](recovery-metrics.md) for HRV/sleep/readiness
**Weekly Progress**: View [Training Load](training-load.md) for current week status
`;
}

/**
 * Main export: Convert context object to structured markdown files
 */
export function formatContextAsMarkdown(context) {
  // Handle both daily context (recent_history) and weekly context (recent_metrics)
  const recentData = context.recent_history || context.recent_metrics || [];
  
  const files = {
    'LEDGER.md': formatLedgerMD(context.date || context.week_start, context.profile),
    'athlete-profile.md': formatProfileMD(context.profile, context.date || context.week_start),
    'recovery-metrics.md': formatRecoveryMetricsMD(context.today, context.trends),
    'training-load.md': formatTrainingLoadMD(recentData, context.trends, context.current_week),
    'recent-training.md': formatRecentTrainingMD(recentData),
    'training-patterns.md': formatPatternsMD(context.patterns),
    'training-mode.md': formatTrainingModeMD(context.training_mode),
    'planned-activities.md': formatPlannedActivitiesMD(context.planned_activities)
  };
  
  return files;
}

/**
 * Format as single combined markdown for MCP response
 */
export function formatContextAsCombinedMarkdown(context) {
  const files = formatContextAsMarkdown(context);
  
  // Combine all files into one response with clear separators
  return Object.entries(files)
    .map(([filename, content]) => `# 📄 ${filename}\n\n${content}`)
    .join('\n\n---\n\n');
}
