/**
 * Goals Routes
 *
 * REST API for Smart Goals lifecycle management.
 *
 * POST   /api/goals                     Parse + create goal from free text
 * GET    /api/goals                     List active goals + latest progress
 * GET    /api/goals/weekly-review       Per-goal weekly summary
 * GET    /api/goals/:id                 Single goal with full history
 * PUT    /api/goals/:id                 Update goal fields
 * DELETE /api/goals/:id                 Soft-delete (status → abandoned)
 * GET    /api/goals/:id/progress        Full weekly progress history
 * POST   /api/goals/:id/adapt          Propose min-effective adaptation
 */

import express from 'express';
import db from '../db/index.js';
import {
  parseGoalFromText,
  createGoal,
  getActiveGoals,
  updateGoal,
  deleteGoal,
  evaluateGoalProgress,
  generateWeeklyGoalReview,
  getGoalProgressHistory
} from '../services/goal-service.js';
import {
  proposeMinEffectiveAlternative,
  balanceMultipleGoals
} from '../services/goal-adaptation.js';
import { getProfileIdFromEmail } from '../services/stats-service.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ── Helper ─────────────────────────────────────────────────────────────────

async function resolveProfileId(req) {
  const email = req.query.email || req.body?.email;
  if (!email) throw Object.assign(new Error('email is required'), { status: 400 });
  return getProfileIdFromEmail(email);
}

async function assertGoalOwnership(goalId, profileId) {
  const goal = await db('smart_goals').where({ id: goalId }).first();
  if (!goal) throw Object.assign(new Error('Goal not found'), { status: 404 });
  if (goal.profile_id !== profileId) throw Object.assign(new Error('Forbidden'), { status: 403 });
  return goal;
}

// ── POST /api/goals ────────────────────────────────────────────────────────
/**
 * Parse free text and create a new smart goal.
 * Body: { email, text, auto_confirm? }
 *
 * If auto_confirm=false (default if omitted is true), returns the parsed preview
 * without persisting — client must call again with confirm=true to save.
 */
router.post('/', async (req, res) => {
  try {
    const { email, text, confirm = true } = req.body;
    if (!email || !text) {
      return res.status(400).json({ error: 'email and text are required' });
    }

    const profileId = await getProfileIdFromEmail(email);
    const parsed = await parseGoalFromText(profileId, text);

    // Preview-only mode — return parsed goal without persisting
    if (!confirm) {
      return res.json({ preview: true, parsed });
    }

    const result = await createGoal(profileId, { ...parsed, raw_text: text });
    res.status(201).json({ success: true, ...result });
  } catch (error) {
    logger.error('POST /api/goals error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ── GET /api/goals ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const profileId = await resolveProfileId(req);
    const includeDraft = req.query.include_draft === 'true';
    const goals = await getActiveGoals(profileId, { includeDraft });
    res.json({ goals, count: goals.length });
  } catch (error) {
    logger.error('GET /api/goals error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ── GET /api/goals/weekly-review ───────────────────────────────────────────
// Must be defined BEFORE /:id route to avoid param conflict
router.get('/weekly-review', async (req, res) => {
  try {
    const profileId = await resolveProfileId(req);
    const weekStart = req.query.week_start || (() => {
      const d = new Date();
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
      return new Date(d.setDate(diff)).toISOString().split('T')[0];
    })();

    const review = await generateWeeklyGoalReview(profileId, weekStart);
    res.json({ week_start: weekStart, review });
  } catch (error) {
    logger.error('GET /api/goals/weekly-review error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ── GET /api/goals/balance ─────────────────────────────────────────────────
router.get('/balance', async (req, res) => {
  try {
    const profileId = await resolveProfileId(req);
    const context = {
      available_days_per_week: req.query.days_per_week ? parseInt(req.query.days_per_week) : undefined,
      recovery_score: req.query.recovery_score ? parseFloat(req.query.recovery_score) : undefined,
      current_load: req.query.current_load ? parseFloat(req.query.current_load) : undefined
    };
    const result = await balanceMultipleGoals(profileId, context);
    res.json(result);
  } catch (error) {
    logger.error('GET /api/goals/balance error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ── GET /api/goals/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const profileId = await resolveProfileId(req);
    const goal = await assertGoalOwnership(parseInt(req.params.id), profileId);
    const history = await getGoalProgressHistory(goal.id);
    const sub_goals = await db('smart_goals')
      .where({ parent_goal_id: goal.id })
      .orderBy('target_date', 'asc');

    res.json({
      goal,
      sub_goals,
      progress_history: history
    });
  } catch (error) {
    logger.error('GET /api/goals/:id error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ── PUT /api/goals/:id ─────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const profileId = await resolveProfileId(req);
    await assertGoalOwnership(parseInt(req.params.id), profileId);

    const updated = await updateGoal(parseInt(req.params.id), req.body);
    res.json({ success: true, goal: updated });
  } catch (error) {
    logger.error('PUT /api/goals/:id error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ── DELETE /api/goals/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const email = req.query.email || req.body?.email;
    if (!email) return res.status(400).json({ error: 'email is required' });

    const profileId = await getProfileIdFromEmail(email);
    await assertGoalOwnership(parseInt(req.params.id), profileId);
    await deleteGoal(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    logger.error('DELETE /api/goals/:id error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ── GET /api/goals/:id/progress ────────────────────────────────────────────
router.get('/:id/progress', async (req, res) => {
  try {
    const profileId = await resolveProfileId(req);
    const goal = await assertGoalOwnership(parseInt(req.params.id), profileId);
    const history = await getGoalProgressHistory(goal.id);
    res.json({ goal_id: goal.id, progress_history: history });
  } catch (error) {
    logger.error('GET /api/goals/:id/progress error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ── POST /api/goals/:id/evaluate ───────────────────────────────────────────
/**
 * Trigger a progress evaluation for a specific week.
 * Body: { email, week_start, completed_sessions[], disruptions[], recovery_signals{} }
 */
router.post('/:id/evaluate', async (req, res) => {
  try {
    const { email, week_start, completed_sessions, disruptions, recovery_signals } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    const profileId = await getProfileIdFromEmail(email);
    await assertGoalOwnership(parseInt(req.params.id), profileId);

    const weekStart = week_start || new Date().toISOString().split('T')[0];
    const progress = await evaluateGoalProgress(parseInt(req.params.id), weekStart, {
      completed_sessions: completed_sessions || [],
      disruptions: disruptions || [],
      recovery_signals: recovery_signals || {}
    });

    res.json({ success: true, progress });
  } catch (error) {
    logger.error('POST /api/goals/:id/evaluate error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ── POST /api/goals/:id/adapt ──────────────────────────────────────────────
/**
 * Propose a minimum-effective-dose adaptation when sessions are missed.
 * Body: { email, disruptions[], remaining_days[], recovery_signals{} }
 */
router.post('/:id/adapt', async (req, res) => {
  try {
    const { email, disruptions, remaining_days, recovery_signals } = req.body;
    if (!email || !disruptions?.length) {
      return res.status(400).json({ error: 'email and disruptions[] are required' });
    }

    const profileId = await getProfileIdFromEmail(email);
    await assertGoalOwnership(parseInt(req.params.id), profileId);

    const result = await proposeMinEffectiveAlternative(
      parseInt(req.params.id),
      disruptions,
      { remaining_days: remaining_days || [], recovery_signals: recovery_signals || {} }
    );

    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('POST /api/goals/:id/adapt error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

export default router;
