/**
 * Training Diary Service
 * Handles diary entries, pattern analysis, and AI-generated insights
 */
import db from '../db/index.js';
import axios from 'axios';
import logger from '../utils/logger.js';
import { getProfileIdFromEmail, getUserIdFromEmail } from '../services/stats-service.js';
import { generateWeeklyGoalReview } from './goal-service.js';

/**
 * Simple LLM call helper
 */
async function callLLM(prompt, options = {}) {
  const config = {
    url: process.env.LM_STUDIO_URL || 'http://localhost:1234/v1',
    model: process.env.LLM_MODEL || 'local-model',
    temperature: options.temperature || 0.7,
    maxTokens: options.max_tokens || 500
  };
  
  try {
    const response = await axios.post(
      `${config.url}/chat/completions`,
      {
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: config.temperature,
        max_tokens: config.maxTokens
      },
      { timeout: 60000 }
    );
    
    return response.data.choices[0].message.content;
  } catch (error) {
    logger.error('LLM call failed:', error.message);
    return null;
  }
}

/**
 * Create or update diary entry
 */
export async function saveDiaryEntry(email, entryData) {
  try {
    const profileId = await getProfileIdFromEmail(email);
    
    const entry = {
      profile_id: profileId,
      date: entryData.date,
      activity_id: entryData.activity_id || null,
      rpe: entryData.rpe || null,
      overall_feel: entryData.overall_feel || null,
      sleep_quality: entryData.sleep_quality || null,
      stress_level: entryData.stress_level || null,
      motivation: entryData.motivation || null,
      soreness: entryData.soreness || null,
      energy: entryData.energy || null,
      notes: entryData.notes || null,
      highlights: entryData.highlights || null,
      challenges: entryData.challenges || null,
      tags: entryData.tags ? JSON.stringify(entryData.tags) : null
    };

    // Check if entry exists for this date
    const existing = await db('diary_entries')
      .where({ profile_id: profileId, date: entryData.date })
      .first();

    if (existing) {
      // Update existing entry
      await db('diary_entries')
        .where({ id: existing.id })
        .update(entry);
      
      // Fetch updated entry
      const updated = await db('diary_entries')
        .where({ id: existing.id })
        .first();
      
      if (updated.tags && typeof updated.tags === 'string') {
        updated.tags = JSON.parse(updated.tags);
      }
      
      return updated;
    } else {
      // Create new entry
      const [id] = await db('diary_entries').insert(entry);
      
      // Fetch created entry
      const created = await db('diary_entries')
        .where({ id })
        .first();
      
      if (created.tags && typeof created.tags === 'string') {
        created.tags = JSON.parse(created.tags);
      }
      
      return created;
    }
  } catch (error) {
    logger.error('Error saving diary entry:', error);
    throw error;
  }
}

/**
 * Get diary entries with optional filters
 */
export async function getDiaryEntries(email, options = {}) {
  try {
    const profileId = await getProfileIdFromEmail(email);
    
    let query = db('diary_entries')
      .where({ profile_id: profileId });
    
    if (options.startDate) {
      query = query.where('date', '>=', options.startDate);
    }
    if (options.endDate) {
      query = query.where('date', '<=', options.endDate);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    const entries = await query.orderBy('date', 'desc');
    
    // Parse JSON fields
    entries.forEach(entry => {
      if (entry.tags && typeof entry.tags === 'string') {
        entry.tags = JSON.parse(entry.tags);
      }
    });
    
    return entries;
  } catch (error) {
    logger.error('Error getting diary entries:', error);
    throw error;
  }
}

/**
 * Get single diary entry by date
 */
export async function getDiaryEntry(email, date) {
  try {
    const profileId = await getProfileIdFromEmail(email);
    
    const entry = await db('diary_entries')
      .where({ profile_id: profileId, date })
      .first();
    
    if (entry && entry.tags && typeof entry.tags === 'string') {
      entry.tags = JSON.parse(entry.tags);
    }
    
    return entry || null;
  } catch (error) {
    logger.error('Error getting diary entry:', error);
    throw error;
  }
}

/**
 * Analyze patterns between subjective diary entries and objective metrics
 */
export async function analyzeDiaryPatterns(email, days = 60) {
  try {
    const profileId = await getProfileIdFromEmail(email);
    const userId = await getUserIdFromEmail(email);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Get diary entries
    const entries = await db('diary_entries')
      .where({ profile_id: profileId })
      .where('date', '>=', startDate)
      .orderBy('date', 'desc');
    
    // Get corresponding daily metrics
    const metrics = await db('daily_metrics')
      .where({ user_id: userId })
      .where('date', '>=', startDate)
      .orderBy('date', 'desc');
    
    // Combine entries with metrics
    const combined = entries.map(entry => {
      const metric = metrics.find(m => m.date === entry.date);
      if (!metric) return null;
      
      const metricsData = typeof metric.metrics_data === 'string' 
        ? JSON.parse(metric.metrics_data) 
        : metric.metrics_data;
      
      return {
        date: entry.date,
        diary: {
          rpe: entry.rpe,
          overall_feel: entry.overall_feel,
          sleep_quality: entry.sleep_quality,
          stress_level: entry.stress_level,
          motivation: entry.motivation,
          soreness: entry.soreness,
          energy: entry.energy
        },
        metrics: {
          hrv: metricsData.hrv,
          resting_hr: metricsData.resting_hr,
          sleep_score: metricsData.sleep_score,
          recovery_score: metricsData.recovery_score,
          training_load: metricsData.training_load,
          stress_score: metricsData.stress_score
        }
      };
    }).filter(Boolean);
    
    if (combined.length < 5) {
      return {
        message: 'Not enough diary entries to detect patterns. Keep logging!',
        entries_count: combined.length,
        minimum_needed: 5
      };
    }
    
    // Calculate correlations
    const patterns = findPatterns(combined);
    
    // Generate AI insights
    const aiInsights = await generatePatternInsights(combined, patterns);
    
    return {
      analysis_period_days: days,
      entries_analyzed: combined.length,
      patterns,
      ai_insights: aiInsights,
      data_points: combined
    };
  } catch (error) {
    logger.error('Error analyzing diary patterns:', error);
    throw error;
  }
}

/**
 * Find statistical patterns in diary + metrics data
 */
function findPatterns(data) {
  const patterns = [];
  
  // Filter data with overall_feel ratings
  const withFeel = data.filter(d => d.diary.overall_feel !== null);
  
  if (withFeel.length < 5) {
    return patterns;
  }
  
  // Separate good days (feel >= 7) from bad days (feel <= 4)
  const goodDays = withFeel.filter(d => d.diary.overall_feel >= 7);
  const badDays = withFeel.filter(d => d.diary.overall_feel <= 4);
  
  // HRV correlation
  if (goodDays.length >= 3 && badDays.length >= 2) {
    const goodHrv = goodDays.filter(d => d.metrics.hrv).map(d => d.metrics.hrv);
    const badHrv = badDays.filter(d => d.metrics.hrv).map(d => d.metrics.hrv);
    
    if (goodHrv.length >= 2 && badHrv.length >= 2) {
      const avgGoodHrv = goodHrv.reduce((a, b) => a + b, 0) / goodHrv.length;
      const avgBadHrv = badHrv.reduce((a, b) => a + b, 0) / badHrv.length;
      
      if (avgGoodHrv > avgBadHrv + 5) {
        patterns.push({
          type: 'hrv_feel_correlation',
          insight: `You feel better when HRV is higher. Good days: ${Math.round(avgGoodHrv)}ms avg, Bad days: ${Math.round(avgBadHrv)}ms avg`,
          recommendation: 'Monitor HRV trends. Consider easy training when HRV drops significantly.'
        });
      }
    }
  }
  
  // Sleep correlation
  const withSleep = data.filter(d => d.diary.sleep_quality !== null && d.metrics.sleep_score !== null);
  if (withSleep.length >= 5) {
    const sleepMatches = withSleep.filter(d => 
      (d.diary.sleep_quality >= 7 && d.metrics.sleep_score >= 70) ||
      (d.diary.sleep_quality <= 4 && d.metrics.sleep_score <= 60)
    );
    
    if (sleepMatches.length / withSleep.length > 0.6) {
      patterns.push({
        type: 'sleep_awareness',
        insight: 'Your subjective sleep quality aligns well with measured sleep scores.',
        recommendation: 'Trust your sleep perception. Prioritize rest when you feel under-slept.'
      });
    }
  }
  
  // Recovery and motivation correlation
  const withMotivation = data.filter(d => d.diary.motivation !== null && d.metrics.recovery_score !== null);
  if (withMotivation.length >= 5) {
    const highMotivation = withMotivation.filter(d => d.diary.motivation >= 7);
    const lowMotivation = withMotivation.filter(d => d.diary.motivation <= 4);
    
    if (highMotivation.length >= 2 && lowMotivation.length >= 2) {
      const avgHighRecovery = highMotivation.map(d => d.metrics.recovery_score).reduce((a, b) => a + b, 0) / highMotivation.length;
      const avgLowRecovery = lowMotivation.map(d => d.metrics.recovery_score).reduce((a, b) => a + b, 0) / lowMotivation.length;
      
      if (avgHighRecovery > avgLowRecovery + 10) {
        patterns.push({
          type: 'recovery_motivation_link',
          insight: `Motivation correlates with recovery. High motivation days: ${Math.round(avgHighRecovery)}% recovery, Low motivation: ${Math.round(avgLowRecovery)}%`,
          recommendation: 'Low motivation may indicate inadequate recovery. Consider rest days.'
        });
      }
    }
  }
  
  // Soreness and training load
  const withSoreness = data.filter(d => d.diary.soreness !== null && d.metrics.training_load !== null);
  if (withSoreness.length >= 5) {
    const avgSoreness = withSoreness.reduce((sum, d) => sum + d.diary.soreness, 0) / withSoreness.length;
    const avgLoad = withSoreness.reduce((sum, d) => sum + d.metrics.training_load, 0) / withSoreness.length;
    
    const highSoreness = withSoreness.filter(d => d.diary.soreness >= 7);
    if (highSoreness.length >= 2) {
      patterns.push({
        type: 'soreness_tracking',
        insight: `${highSoreness.length} days with high soreness (7+/10). Average soreness: ${avgSoreness.toFixed(1)}/10`,
        recommendation: 'Monitor soreness patterns. Persistent high soreness may indicate overtraining.'
      });
    }
  }
  
  return patterns;
}

/**
 * Generate AI insights from patterns using LLM
 */
async function generatePatternInsights(data, patterns) {
  try {
    const prompt = `You are an AI endurance coach analyzing training diary patterns. 

Data Summary:
- Analysis period: ${data.length} days
- Patterns detected: ${patterns.length}

Detected Patterns:
${patterns.map((p, i) => `${i + 1}. ${p.type}: ${p.insight}`).join('\n')}

Recent Data Points (last 7 days):
${data.slice(0, 7).map(d => `
Date: ${d.date}
Feel: ${d.diary.overall_feel || 'N/A'}/10, Energy: ${d.diary.energy || 'N/A'}/10, Motivation: ${d.diary.motivation || 'N/A'}/10
HRV: ${d.metrics.hrv || 'N/A'}ms, Recovery: ${d.metrics.recovery_score || 'N/A'}%, Training Load: ${d.metrics.training_load || 'N/A'}
`).join('\n')}

Provide 2-3 actionable insights in a conversational tone. Focus on:
1. What the data reveals about this athlete's training patterns
2. Specific recommendations to optimize training and recovery
3. Any warning signs or positive trends

Keep insights concise (2-3 sentences each) and practical.`;

    const response = await callLLM(prompt, {
      max_tokens: 500,
      temperature: 0.7
    });
    
    return response || 'AI insights temporarily unavailable. Pattern data is available above.';
  } catch (error) {
    logger.error('Error generating AI insights:', error);
    return 'AI insights temporarily unavailable. Pattern data is available above.';
  }
}

/**
 * Generate or retrieve weekly summary
 */
export async function getWeeklySummary(email, weekStart) {
  try {
    const profileId = await getProfileIdFromEmail(email);
    
    // Calculate week end (Sunday)
    const weekStartDate = new Date(weekStart);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 6);
    const weekEnd = weekEndDate.toISOString().split('T')[0];
    
    // Generate new summary (don't save to DB for now since table structure is different)
    const summary = await generateWeeklySummary(email, weekStart, weekEnd);

    // Fetch per-goal progress for the week
    let goals = [];
    try {
      goals = await generateWeeklyGoalReview(profileId, weekStart);
    } catch (goalErr) {
      logger.warn('Could not fetch goal review for weekly summary:', goalErr.message);
    }

    return { 
      ...summary, 
      profile_id: profileId, 
      week_start: weekStart, 
      week_end: weekEnd,
      generated_at: new Date().toISOString(),
      goals
    };
  } catch (error) {
    logger.error('Error getting weekly summary:', error);
    throw error;
  }
}

/**
 * Generate weekly summary with AI
 */
async function generateWeeklySummary(email, weekStart, weekEnd) {
  const profileId = await getProfileIdFromEmail(email);
  const userId = await getUserIdFromEmail(email);
  
  // Get week's metrics
  const metrics = await db('daily_metrics')
    .where({ user_id: userId })
    .whereBetween('date', [weekStart, weekEnd])
    .orderBy('date');
  
  // Get week's diary entries
  const diaryEntries = await db('diary_entries')
    .where({ profile_id: profileId })
    .whereBetween('date', [weekStart, weekEnd])
    .orderBy('date');
  
  // Calculate aggregate stats
  let totalLoad = 0;
  let totalHours = 0;
  let avgHrv = 0;
  let avgRecovery = 0;
  let hrvCount = 0;
  let recoveryCount = 0;
  
  metrics.forEach(m => {
    const data = typeof m.metrics_data === 'string' ? JSON.parse(m.metrics_data) : m.metrics_data;
    totalLoad += data.training_load || 0;
    // Try multiple field names for duration (seconds)
    const durationSeconds = data.total_duration_seconds || data.duration || data.total_duration || 0;
    totalHours += durationSeconds / 3600;
    if (data.hrv) {
      avgHrv += data.hrv;
      hrvCount++;
    }
    if (data.recovery_score) {
      avgRecovery += data.recovery_score;
      recoveryCount++;
    }
  });
  
  // If metrics don't have duration, query activities directly
  if (totalHours === 0) {
    const activities = await db('activities')
      .where({ user_id: userId })
      .whereBetween('date', [weekStart, weekEnd]);
    
    totalHours = activities.reduce((sum, a) => sum + (a.duration || 0), 0) / 3600;
    logger.info(`Weekly summary: Retrieved duration from activities (${totalHours.toFixed(1)}h)`);
  }
  
  avgHrv = hrvCount > 0 ? Math.round(avgHrv / hrvCount) : null;
  avgRecovery = recoveryCount > 0 ? Math.round(avgRecovery / recoveryCount) : null;
  
  const weekStats = {
    days_tracked: metrics.length,
    total_training_load: Math.round(totalLoad),
    total_hours: parseFloat(totalHours.toFixed(1)),
    avg_hrv: avgHrv,
    avg_recovery: avgRecovery,
    diary_entries: diaryEntries.length
  };
  
  // Generate AI summary
  const prompt = `You are an AI endurance coach writing a weekly training summary.

Week: ${weekStart} to ${weekEnd}

Training Stats:
- Training Load: ${weekStats.total_training_load}
- Total Hours: ${weekStats.total_hours}h
- Average HRV: ${weekStats.avg_hrv}ms
- Average Recovery: ${weekStats.avg_recovery}%
- Days Tracked: ${weekStats.days_tracked}/7

Diary Entries: ${diaryEntries.length}
${diaryEntries.map(e => `
${e.date}: Feel ${e.overall_feel || 'N/A'}/10, Energy ${e.energy || 'N/A'}/10${e.notes ? `, Notes: ${e.notes.substring(0, 100)}` : ''}
`).join('')}

Write:
1. A 2-3 sentence weekly summary highlighting key achievements and patterns
2. 2-3 specific insights about this week's training
3. 2 forward-looking recommendations for next week

Be conversational, specific, and encouraging. Use the athlete's actual data.`;

  const aiResponse = await callLLM(prompt, {
    max_tokens: 600,
    temperature: 0.8
  });
  
  if (!aiResponse) {
    return {
      week_stats: weekStats,
      summary: `Training week with ${weekStats.total_training_load} load, ${weekStats.total_hours}h`,
      insights: ['Continue monitoring your training patterns'],
      recommendations: ['Keep up the consistent training']
    };
  }
  
  // Parse AI response (simple parsing, assuming structured format)
  const sections = aiResponse.split('\n\n');
  const summary = sections[0] || aiResponse;
  const insights = sections.length > 1 ? [sections[1]] : ['Continue monitoring your training patterns'];
  const recommendations = sections.length > 2 ? [sections[2]] : ['Keep up the consistent training'];
  
  return {
    week_stats: weekStats,
    summary,
    insights,
    recommendations
  };
}

/**
 * Delete diary entry
 */
export async function deleteDiaryEntry(email, date) {
  try {
    const profileId = await getProfileIdFromEmail(email);
    
    const deleted = await db('diary_entries')
      .where({ profile_id: profileId, date })
      .delete();
    
    return deleted > 0;
  } catch (error) {
    logger.error('Error deleting diary entry:', error);
    throw error;
  }
}
