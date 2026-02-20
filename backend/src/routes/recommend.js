import express from 'express';
import { buildDailyContext, buildWeeklyContext } from '../services/context-builder.js';
import { generateDailyWorkouts, generateWeeklyPlan } from '../services/llm-coach.js';
import { generateSafeFallback } from '../services/validator.js';
import logger from '../utils/logger.js';

const router = express.Router();

// POST /api/recommend - Generate today's workout
router.post('/', async (req, res) => {
  try {
    const { profile_id, date } = req.body;
    
    if (!profile_id || !date) {
      return res.status(400).json({ error: 'profile_id and date required' });
    }
    
    // Build context
    const context = await buildDailyContext(profile_id, date);
    context.profile_id = profile_id; // Add for logging
    
    // Generate workouts via LLM
    let recommendation;
    try {
      recommendation = await generateDailyWorkouts(context);
    } catch (error) {
      logger.error('LLM generation failed, using fallback:', error);
      
      if (process.env.ENABLE_RULE_BASED_FALLBACK === 'true') {
        recommendation = generateSafeFallback(context);
      } else {
        throw error;
      }
    }
    
    res.json({
      success: true,
      date,
      recommendation
    });
  } catch (error) {
    logger.error('Recommendation generation failed:', error);
    res.status(500).json({
      error: 'Failed to generate recommendation',
      message: error.message
    });
  }
});

// GET /api/recommend/week - Generate weekly plan
router.get('/week', async (req, res) => {
  try {
    const { profile_id, week_start } = req.query;
    
    if (!profile_id || !week_start) {
      return res.status(400).json({ error: 'profile_id and week_start required' });
    }
    
    const context = await buildWeeklyContext(profile_id, week_start);
    context.profile_id = profile_id;
    
    const weeklyPlan = await generateWeeklyPlan(context);
    
    res.json({
      success: true,
      week_start,
      plan: weeklyPlan,
      is_fallback: weeklyPlan.week_summary?.phase === 'recovery' && weeklyPlan.coach_message?.includes('temporarily unavailable')
    });
  } catch (error) {
    logger.error('Weekly plan generation failed:', error);
    
    // Last resort fallback
    const { generateSafeWeeklyFallback } = await import('../services/validator.js');
    const fallbackPlan = generateSafeWeeklyFallback(context);
    
    res.json({
      success: true,
      week_start,
      plan: fallbackPlan,
      is_fallback: true,
      fallback_reason: error.message
    });
  }
});

export default router;
