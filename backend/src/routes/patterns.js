/**
 * Pattern Recognition API Routes
 * 
 * Endpoints for:
 * - Pattern discovery and viewing
 * - Pattern breaks and nudges
 * - Multi-activity day tracking
 * - Performance gaps
 */

import express from 'express';
import db from '../db/index.js';
import {
  discoverPatterns,
  savePatterns,
  updatePatterns,
  trackMultiActivityDay,
  detectPerformanceGaps
} from '../services/pattern-recognition.js';
import { differenceInDays, format, subDays } from 'date-fns';

const router = express.Router();

// ============================================================================
// PATTERN DISCOVERY & VIEWING
// ============================================================================

/**
 * GET /api/patterns?email=user@example.com
 * Get all active patterns for an athlete
 */
router.get('/', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email parameter required' });
    }
    
    // Get profile ID
    const profile = await db('athlete_profiles')
      .select('id')
      .whereIn('user_id', db('users').select('id').where({ garmin_email: email }))
      .first();
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const patterns = await db('training_patterns')
      .where({ profile_id: profile.id })
      .orderBy('pattern_confidence', 'desc');
    
    res.json({
      patterns,
      count: patterns.length,
      active_count: patterns.filter(p => p.status === 'active').length
    });
  } catch (error) {
    console.error('Error fetching patterns:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/patterns/discover
 * Discover patterns from historical data
 */
router.post('/discover', async (req, res) => {
  try {
    const { email, lookback_days = 90 } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    const profile = await db('athlete_profiles')
      .select('id')
      .whereIn('user_id', db('users').select('id').where({ garmin_email: email }))
      .first();
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    // Discover patterns
    const discovery = await discoverPatterns(profile.id, lookback_days);
    
    // Save to database
    const savedPatterns = await savePatterns(profile.id, discovery.patterns);
    
    res.json({
      data_context: discovery.data_context,
      message: 'Pattern discovery complete',
      discovered: discovery.patterns.length,
      saved: savedPatterns.length,
      patterns: savedPatterns,
      activities_analyzed: discovery.activities_analyzed
    });
  } catch (error) {
    console.error('Error discovering patterns:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/patterns/update
 * Update pattern status (check for breaks)
 */
router.post('/update', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    const profile = await db('athlete_profiles')
      .select('id')
      .whereIn('user_id', db('users').select('id').where({ garmin_email: email }))
      .first();
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const updates = await updatePatterns(profile.id);
    
    res.json({
      message: 'Patterns updated',
      updates,
      broken_count: updates.filter(u => u.status === 'broken').length
    });
  } catch (error) {
    console.error('Error updating patterns:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// PATTERN BREAKS & NUDGES
// ============================================================================

/**
 * GET /api/patterns/breaks?email=user@example.com
 * Get current pattern breaks
 */
router.get('/breaks', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email parameter required' });
    }
    
    const profile = await db('athlete_profiles')
      .select('id')
      .whereIn('user_id', db('users').select('id').where({ garmin_email: email }))
      .first();
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    // Get ongoing breaks with pattern details
    const breaks = await db('pattern_breaks as pb')
      .select(
        'pb.*',
        'tp.sport',
        'tp.pattern_type',
        'tp.frequency_days_per_week',
        'tp.typical_duration_min'
      )
      .join('training_patterns as tp', 'pb.pattern_id', 'tp.pattern_id')
      .where({ 'pb.profile_id': profile.id, 'pb.break_ended': null })
      .orderBy('pb.impact_score', 'desc');
    
    // Generate nudge messages
    const breaksWithNudges = breaks.map(breakRecord => ({
      ...breakRecord,
      nudge: generatePatternBreakNudge(breakRecord)
    }));
    
    res.json({
      breaks: breaksWithNudges,
      count: breaks.length
    });
  } catch (error) {
    console.error('Error fetching pattern breaks:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/patterns/nudges?email=user@example.com
 * Get all nudges (pattern breaks + performance gaps)
 */
router.get('/nudges', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email parameter required' });
    }
    
    const profile = await db('athlete_profiles')
      .select('id')
      .whereIn('user_id', db('users').select('id').where({ garmin_email: email }))
      .first();
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const nudges = [];
    
    // Get pattern breaks
    const breaks = await db('pattern_breaks as pb')
      .select('pb.*', 'tp.sport', 'tp.pattern_type', 'tp.frequency_days_per_week')
      .join('training_patterns as tp', 'pb.pattern_id', 'tp.pattern_id')
      .where({ 'pb.profile_id': profile.id, 'pb.break_ended': null })
      .orderBy('pb.impact_score', 'desc');
    
    for (const breakRecord of breaks) {
      nudges.push({
        type: 'pattern_break',
        ...generatePatternBreakNudge(breakRecord),
        break_id: breakRecord.break_id
      });
    }
    
    // Get performance gaps
    const gaps = await db('performance_gaps')
      .where({ profile_id: profile.id, resolved_at: null })
      .orderBy('nudge_priority', 'desc');
    
    for (const gap of gaps) {
      nudges.push({
        type: 'performance_gap',
        ...generatePerformanceGapNudge(gap),
        gap_id: gap.gap_id
      });
    }
    
    // Sort by priority
    nudges.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    res.json({
      nudges,
      count: nudges.length,
      pattern_breaks: breaks.length,
      performance_gaps: gaps.length
    });
  } catch (error) {
    console.error('Error fetching nudges:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/patterns/nudges/:id/acknowledge
 * Mark nudge as seen
 */
router.post('/nudges/:id/acknowledge', async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body; // 'pattern_break' or 'performance_gap'
    
    if (type === 'pattern_break') {
      await db('pattern_breaks')
        .where({ break_id: id })
        .update({ nudge_sent: true, nudge_sent_at: new Date() });
    } else if (type === 'performance_gap') {
      await db('performance_gaps')
        .where({ gap_id: id })
        .update({ nudge_sent: true, nudge_sent_at: new Date() });
    }
    
    res.json({ message: 'Nudge acknowledged' });
  } catch (error) {
    console.error('Error acknowledging nudge:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/patterns/nudges/:id/accept
 * User acted on nudge
 */
router.post('/nudges/:id/accept', async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body;
    
    if (type === 'pattern_break') {
      await db('pattern_breaks')
        .where({ break_id: id })
        .update({
          nudge_accepted: true,
          nudge_accepted_at: new Date(),
          break_ended: new Date()
        });
      
      // Restore pattern status
      const breakRecord = await db('pattern_breaks').where({ break_id: id }).first();
      await db('training_patterns')
        .where({ pattern_id: breakRecord.pattern_id })
        .update({ status: 'active' });
    } else if (type === 'performance_gap') {
      await db('performance_gaps')
        .where({ gap_id: id })
        .update({ resolved_at: new Date() });
    }
    
    res.json({ message: 'Nudge accepted, pattern resumed' });
  } catch (error) {
    console.error('Error accepting nudge:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// MULTI-ACTIVITY DAYS
// ============================================================================

/**
 * GET /api/patterns/multi-activity/today?email=user@example.com
 * Get today's activities and suggestions
 */
router.get('/multi-activity/today', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email parameter required' });
    }
    
    const profile = await db('athlete_profiles')
      .select('id')
      .whereIn('user_id', db('users').select('id').where({ garmin_email: email }))
      .first();
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const today = format(new Date(), 'yyyy-MM-dd');
    
    // Check for multi-activity record today
    const multiDay = await db('multi_activity_days')
      .where({ profile_id: profile.id, date: today })
      .first();
    
    if (multiDay) {
      res.json({
        date: today,
        has_multi_activities: true,
        ...multiDay,
        suggestion: generateMultiActivitySuggestion(multiDay)
      });
    } else {
      res.json({
        date: today,
        has_multi_activities: false,
        message: 'No multi-activity day recorded yet',
        suggestion: 'Track activities to get personalized suggestions'
      });
    }
  } catch (error) {
    console.error('Error fetching multi-activity day:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/patterns/multi-activity/history?email=user@example.com&days=30
 * Get multi-activity day history
 */
router.get('/multi-activity/history', async (req, res) => {
  try {
    const { email, days = 30 } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email parameter required' });
    }
    
    const profile = await db('athlete_profiles')
      .select('id')
      .whereIn('user_id', db('users').select('id').where({ garmin_email: email }))
      .first();
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const sinceDate = format(subDays(new Date(), parseInt(days)), 'yyyy-MM-dd');
    
    const history = await db('multi_activity_days')
      .where({ profile_id: profile.id })
      .andWhere('date', '>=', sinceDate)
      .orderBy('date', 'desc');
    
    // Calculate statistics
    const avgLoad = history.length > 0
      ? Math.round(history.reduce((sum, d) => sum + d.adjusted_total_load, 0) / history.length)
      : 0;
    
    const commonCombos = {};
    history.forEach(d => {
      commonCombos[d.activity_combo] = (commonCombos[d.activity_combo] || 0) + 1;
    });
    
    res.json({
      history,
      count: history.length,
      avg_activities_per_day: history.length > 0
        ? (history.reduce((sum, d) => sum + d.activity_count, 0) / history.length).toFixed(1)
        : 0,
      avg_adjusted_load: avgLoad,
      common_combos: commonCombos
    });
  } catch (error) {
    console.error('Error fetching multi-activity history:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// PERFORMANCE GAPS
// ============================================================================

/**
 * GET /api/patterns/performance/gaps?email=user@example.com
 * Get current performance gaps
 */
router.get('/performance/gaps', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email parameter required' });
    }
    
    const profile = await db('athlete_profiles')
      .select('id')
      .whereIn('user_id', db('users').select('id').where({ garmin_email: email }))
      .first();
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const gaps = await db('performance_gaps')
      .where({ profile_id: profile.id, resolved_at: null })
      .orderBy('nudge_priority', 'desc');
    
    // Parse JSON fields
    const gapsWithDetails = gaps.map(gap => ({
      ...gap,
      benefits: typeof gap.benefits === 'string' ? JSON.parse(gap.benefits) : gap.benefits,
      estimated_improvement: typeof gap.estimated_improvement === 'string' 
        ? JSON.parse(gap.estimated_improvement) 
        : gap.estimated_improvement
    }));
    
    res.json({
      gaps: gapsWithDetails,
      count: gaps.length
    });
  } catch (error) {
    console.error('Error fetching performance gaps:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/patterns/performance/detect
 * Detect performance gaps
 */
router.post('/performance/detect', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    const profile = await db('athlete_profiles')
      .select('id')
      .whereIn('user_id', db('users').select('id').where({ garmin_email: email }))
      .first();
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const result = await detectPerformanceGaps(profile.id);
    
    res.json({
      data_context: result.data_context,
      message: 'Performance gap detection complete',
      gaps: result.gaps,
      count: result.count
    });
  } catch (error) {
    console.error('Error detecting performance gaps:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/patterns/performance/benefits/:modality
 * Get detailed benefits for a modality
 */
router.get('/performance/benefits/:modality', async (req, res) => {
  try {
    const { modality } = req.params;
    
    const benefits = getModalityDetails(modality);
    
    res.json(benefits);
  } catch (error) {
    console.error('Error fetching modality benefits:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generatePatternBreakNudge(breakRecord) {
  const { sport, break_duration_days, severity, frequency_days_per_week } = breakRecord;
  
  const nudgeTemplates = {
    yoga: {
      low: `Haven't done yoga in ${break_duration_days} days. Your flexibility and recovery might be affected.`,
      medium: `It's been ${break_duration_days} days without yoga. You usually do it ${frequency_days_per_week}x/week. Missing flexibility work can increase injury risk.`,
      high: `⚠️ You've stopped your daily yoga practice (${break_duration_days} days). This was helping your recovery. Resume today?`,
      critical: `🚨 ${break_duration_days} days without yoga! Your recovery scores are declining. Consider a gentle 20min session today.`
    },
    hiit: {
      medium: `No HIIT intervals in ${break_duration_days} days. You're missing out on VO2 max gains and race speed improvements.`,
      high: `It's been ${break_duration_days} days since your last HIIT session. Your lactate threshold is likely stagnating. Schedule 1-2 interval sessions this week?`,
      critical: `You've gone ${break_duration_days} days without high-intensity work. Race performance will decline. Plan a HIIT workout when recovered.`
    },
    strength: {
      medium: `${break_duration_days} days without strength training. Power and injury resistance are declining.`,
      high: `⚠️ No strength work in ${break_duration_days} days. This increases injury risk by ~30%. Schedule 2 sessions this week?`,
      critical: `🚨 ${break_duration_days} days without strength training! Resume with 2x45min sessions this week.`
    }
  };
  
  const sportKey = sport.toLowerCase();
  const message = nudgeTemplates[sportKey]?.[severity] || 
    `You haven't done ${sport} in ${break_duration_days} days. This was part of your regular routine.`;
  
  return {
    title: `Missing: ${sport}`,
    message,
    severity,
    action: `Schedule ${sport} workout`,
    priority: severity === 'critical' ? 10 : severity === 'high' ? 7 : 5
  };
}

function generatePerformanceGapNudge(gap) {
  const { modality, days_absent, benefits, estimated_improvement } = gap;
  
  const parsedBenefits = typeof benefits === 'string' ? JSON.parse(benefits) : benefits;
  const parsedImprovements = typeof estimated_improvement === 'string' 
    ? JSON.parse(estimated_improvement) 
    : estimated_improvement;
  
  const messages = {
    strength: {
      title: `💪 Missing Strength Training`,
      message: `It's been ${days_absent} days without strength work. You're leaving gains on the table.`,
      action: `Schedule 2x45min strength sessions this week`
    },
    hiit: {
      title: `⚡ No High-Intensity Work`,
      message: `${days_absent} days without HIIT intervals. Your race performance is stagnating.`,
      action: `Add 1-2 interval sessions this week`
    },
    yoga: {
      title: `🧘 Missing Flexibility Work`,
      message: `No yoga in ${days_absent} days. Your body is tightening up.`,
      action: `Resume daily 20-30min yoga`
    }
  };
  
  const template = messages[modality] || {
    title: `Missing: ${modality}`,
    message: `Consider adding ${modality} back to your routine`,
    action: `Schedule ${modality} workout`
  };
  
  return {
    ...template,
    benefits: parsedBenefits,
    estimated_improvement: parsedImprovements,
    priority: gap.nudge_priority
  };
}

function generateMultiActivitySuggestion(multiDay) {
  if (multiDay.activity_count === 1) {
    return 'One workout done. Consider a light activity later if recovered.';
  }
  
  if (multiDay.activity_count >= 2) {
    return `You've completed ${multiDay.activity_count} workouts today (load: ${multiDay.adjusted_total_load}). Rest and recover!`;
  }
  
  return 'Track your activities to get personalized suggestions.';
}

function getModalityDetails(modality) {
  const details = {
    strength: {
      modality: 'strength',
      benefits: [
        'Injury prevention: -30% risk',
        'Power output: +10-15% on climbs',
        'Bone density maintenance',
        'Core stability for endurance sports'
      ],
      frequency: '2x per week',
      duration: '45 minutes',
      timing: 'After hard rides or separate day',
      improvements: {
        power_gain_pct: 12,
        timeline_weeks: 6,
        injury_reduction_pct: 30
      }
    },
    hiit: {
      modality: 'hiit',
      benefits: [
        'VO2 max improvement: +5-10% in 8 weeks',
        'Lactate threshold increase',
        'Time efficiency',
        'Race performance: +2-5% speed'
      ],
      frequency: '1-2x per week',
      duration: '30 minutes',
      timing: 'When well recovered (TSB > -10)',
      improvements: {
        vo2_gain_pct: 8,
        timeline_weeks: 8,
        race_speed_gain_pct: 3
      }
    },
    yoga: {
      modality: 'yoga',
      benefits: [
        'Recovery acceleration: -20% soreness',
        'Injury prevention',
        'Range of motion improvement',
        'Sleep quality: +15% deep sleep'
      ],
      frequency: 'Daily or 5-6x per week',
      duration: '30 minutes',
      timing: 'Evening or post-workout',
      improvements: {
        flexibility_gain_pct: 30,
        timeline_weeks: 4,
        recovery_improvement_pct: 20
      }
    }
  };
  
  return details[modality] || { modality, message: 'Modality not found' };
}

export default router;
