/**
 * Smart Goals Service
 *
 * Handles the full lifecycle of structured training goals:
 *   - Parsing free-text into structured goal objects via LLM
 *   - Persisting goals and auto-decomposing into block sub-goals
 *   - Evaluating weekly progress and persisting goal_progress rows
 *   - Generating plain-language weekly goal reviews
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { format, differenceInWeeks, addWeeks, startOfWeek } from 'date-fns';
import db from '../db/index.js';
import { callLLM } from './llm-coach.js';
import { extractJSON } from '../utils/json-extractor.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROMPTS_DIR = join(__dirname, '../prompts');

let GOAL_PARSE_PROMPT, GOAL_DECOMPOSE_PROMPT, GOAL_PROGRESS_PROMPT, SYSTEM_PROMPT;
try {
  GOAL_PARSE_PROMPT = readFileSync(join(PROMPTS_DIR, 'goal-parse.txt'), 'utf-8');
  GOAL_DECOMPOSE_PROMPT = readFileSync(join(PROMPTS_DIR, 'goal-decompose.txt'), 'utf-8');
  GOAL_PROGRESS_PROMPT = readFileSync(join(PROMPTS_DIR, 'goal-progress.txt'), 'utf-8');
  SYSTEM_PROMPT = readFileSync(join(PROMPTS_DIR, 'coach-system.txt'), 'utf-8');
} catch (error) {
  logger.warn('Could not load goal prompt templates:', error.message);
}

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Fetch and return a slim profile context for LLM prompts (avoids sensitive data).
 */
async function getProfileContext(profileId) {
  const profile = await db('athlete_profiles').where({ id: profileId }).first();
  if (!profile) throw new Error(`Profile ${profileId} not found`);
  const data = typeof profile.profile_data === 'string'
    ? JSON.parse(profile.profile_data)
    : (profile.profile_data || {});
  return {
    favorite_sports: data.favorite_sports || [],
    injuries: (data.injuries_conditions || []).filter(i => i.status === 'active'),
    days_per_week: data.access?.days_per_week || data.availability?.days_per_week || 3,
    minutes_per_session: data.access?.minutes_per_session || 45,
    constraints: data.constraints || [],
    baselines: data.baselines || {}
  };
}

function serializeJSON(val) {
  return val == null ? null : JSON.stringify(val);
}

function parseJSON(val) {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
}

function weeksRemaining(targetDate) {
  if (!targetDate) return null;
  const diff = differenceInWeeks(new Date(targetDate), new Date());
  return diff < 0 ? 0 : diff;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse a free-text goal string into a structured ParsedGoal object.
 * Returns the parsed object WITHOUT persisting — caller decides whether to create.
 *
 * @param {number} profileId  - athlete_profiles.id
 * @param {string} text       - free-text goal from the user
 * @returns {object}          - ParsedGoal matching schemas/smart_goal.v1.json#/definitions/ParsedGoal
 */
export async function parseGoalFromText(profileId, text) {
  const profileCtx = await getProfileContext(profileId);

  const userPrompt = GOAL_PARSE_PROMPT
    .replace('{{PROFILE_CONTEXT}}', JSON.stringify(profileCtx, null, 2))
    .replace('{{GOAL_TEXT}}', text);

  const { content } = await callLLM(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    { maxTokens: 1200 }
  );

  const parsed = extractJSON(content);

  // Basic sanity check
  if (!parsed.title || !parsed.goal_type) {
    throw new Error('Goal parse returned incomplete structure');
  }

  return parsed;
}

/**
 * Create a new smart goal, then asynchronously decompose it into block sub-goals.
 *
 * @param {number} profileId   - athlete_profiles.id
 * @param {object} goalData    - either a raw ParsedGoal or { raw_text, …fields }
 * @returns {object}           - { goal, sub_goals_queued: true }
 */
export async function createGoal(profileId, goalData) {
  const now = new Date();

  const [id] = await db('smart_goals').insert({
    profile_id: profileId,
    raw_text: goalData.raw_text || goalData.interpreted_intent || null,
    title: goalData.title,
    goal_type: goalData.goal_type,
    hierarchy_level: 'long_term',
    parent_goal_id: null,
    status: 'active',
    target_date: goalData.target_date || null,
    target_metric: serializeJSON(goalData.target_metric),
    current_value: null,
    assumptions: serializeJSON(goalData.assumptions || []),
    confidence: goalData.confidence ?? null,
    weekly_kpis: serializeJSON(goalData.weekly_kpis || []),
    constraints: serializeJSON(goalData.constraints || null),
    created_at: now,
    updated_at: now
  });

  const goal = await db('smart_goals').where({ id }).first();

  // Fire-and-forget async decomposition — do not await (non-blocking)
  decomposeGoal(goal).catch(err =>
    logger.error(`Goal decomposition failed for goal ${id}:`, err.message)
  );

  return { goal: formatGoal(goal), sub_goals_queued: true };
}

/**
 * Decompose a long-term goal into block sub-goals via LLM.
 * Sub-goals are persisted with status='draft'.
 *
 * @param {object} goal - Row from smart_goals table
 * @returns {object[]}  - Array of created sub-goal rows
 */
export async function decomposeGoal(goal) {
  logger.info(`Decomposing goal ${goal.id}: "${goal.title}"`);

  const profileCtx = await getProfileContext(goal.profile_id);
  const today = format(new Date(), 'yyyy-MM-dd');

  const goalObj = {
    title: goal.title,
    goal_type: goal.goal_type,
    target_date: goal.target_date,
    target_metric: parseJSON(goal.target_metric),
    raw_text: goal.raw_text
  };

  const userPrompt = GOAL_DECOMPOSE_PROMPT
    .replace('{{GOAL}}', JSON.stringify(goalObj, null, 2))
    .replace('{{PROFILE_CONTEXT}}', JSON.stringify(profileCtx, null, 2))
    .replace('{{TODAY}}', today);

  const { content } = await callLLM(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    { maxTokens: 1500 }
  );

  const parsed = extractJSON(content);
  if (!Array.isArray(parsed.blocks) || parsed.blocks.length === 0) {
    logger.warn(`Goal decomposition for ${goal.id} returned no blocks`);
    return [];
  }

  const now = new Date();
  const insertedIds = [];

  for (const block of parsed.blocks) {
    const blockStart = addWeeks(now, block.start_week_offset || 0);
    const blockEnd = addWeeks(blockStart, block.duration_weeks || 4);

    const [blockId] = await db('smart_goals').insert({
      profile_id: goal.profile_id,
      raw_text: null,
      title: block.title,
      goal_type: goal.goal_type,
      hierarchy_level: 'block',
      parent_goal_id: goal.id,
      status: 'draft',
      target_date: format(blockEnd, 'yyyy-MM-dd'),
      target_metric: serializeJSON(block.target_metric || null),
      current_value: null,
      assumptions: serializeJSON([]),
      confidence: null,
      weekly_kpis: serializeJSON(block.weekly_kpis || []),
      constraints: serializeJSON({ focus: block.focus, avoid: block.avoid || [] }),
      created_at: now,
      updated_at: now
    });

    insertedIds.push(blockId);
  }

  logger.info(`Goal ${goal.id} decomposed into ${insertedIds.length} block sub-goals`);

  return await db('smart_goals').whereIn('id', insertedIds);
}

/**
 * Fetch all active (and optionally draft) goals for a profile, with latest progress.
 *
 * @param {number} profileId
 * @param {object} [opts]
 * @param {boolean} [opts.includeDraft=false]
 * @returns {object[]} Goals with latest_progress and sub_goals attached
 */
export async function getActiveGoals(profileId, { includeDraft = false } = {}) {
  const statusFilter = includeDraft
    ? ['active', 'draft']
    : ['active'];

  const goals = await db('smart_goals')
    .where({ profile_id: profileId, hierarchy_level: 'long_term' })
    .whereIn('status', statusFilter)
    .orderBy('created_at', 'asc');

  // Fetch block sub-goals for each long-term goal
  const allBlockGoals = await db('smart_goals')
    .where({ profile_id: profileId, hierarchy_level: 'block' })
    .whereIn('status', [...statusFilter, 'paused'])
    .orderBy('target_date', 'asc');

  // Latest progress per goal
  const goalIds = [
    ...goals.map(g => g.id),
    ...allBlockGoals.map(g => g.id)
  ];

  const latestProgress = goalIds.length > 0
    ? await db('goal_progress')
        .whereIn('goal_id', goalIds)
        .orderBy('week_start', 'desc')
    : [];

  const progressByGoal = {};
  for (const p of latestProgress) {
    if (!progressByGoal[p.goal_id]) {
      progressByGoal[p.goal_id] = formatProgress(p);
    }
  }

  const blocksByParent = {};
  for (const b of allBlockGoals) {
    const pid = b.parent_goal_id;
    if (!blocksByParent[pid]) blocksByParent[pid] = [];
    blocksByParent[pid].push({
      ...formatGoal(b),
      latest_progress: progressByGoal[b.id] || null
    });
  }

  return goals.map(g => ({
    ...formatGoal(g),
    weeks_remaining: weeksRemaining(g.target_date),
    latest_progress: progressByGoal[g.id] || null,
    sub_goals: blocksByParent[g.id] || []
  }));
}

/**
 * Fetch the full goal hierarchy for a profile (used in context building).
 * Returns slim objects to avoid bloating context tokens.
 *
 * @param {number} profileId
 * @returns {object[]}
 */
export async function getGoalHierarchy(profileId) {
  const goals = await getActiveGoals(profileId, { includeDraft: false });

  return goals.map(g => ({
    id: g.id,
    title: g.title,
    goal_type: g.goal_type,
    hierarchy_level: g.hierarchy_level,
    status: g.status,
    target_date: g.target_date,
    target_metric: g.target_metric,
    current_value: g.current_value,
    weeks_remaining: g.weeks_remaining,
    latest_progress_status: g.latest_progress?.status || null,
    weekly_kpis: g.weekly_kpis,
    sub_goals: (g.sub_goals || []).map(b => ({
      id: b.id,
      title: b.title,
      target_date: b.target_date,
      target_metric: b.target_metric,
      status: b.status,
      latest_progress_status: b.latest_progress?.status || null,
      weekly_kpis: b.weekly_kpis
    }))
  }));
}

/**
 * Update fields on an existing goal.
 *
 * @param {number} goalId
 * @param {object} updates  - subset of smart_goals fields
 * @returns {object}        - updated formatted goal
 */
export async function updateGoal(goalId, updates) {
  const allowed = [
    'title', 'goal_type', 'status', 'target_date',
    'target_metric', 'current_value', 'weekly_kpis',
    'constraints', 'assumptions', 'confidence'
  ];

  const patch = { updated_at: new Date() };
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      patch[key] = ['target_metric', 'weekly_kpis', 'constraints', 'assumptions'].includes(key)
        ? serializeJSON(updates[key])
        : updates[key];
    }
  }

  await db('smart_goals').where({ id: goalId }).update(patch);
  const updated = await db('smart_goals').where({ id: goalId }).first();
  return formatGoal(updated);
}

/**
 * Soft-delete a goal by setting status = 'abandoned'.
 * Also soft-deletes all block sub-goals.
 *
 * @param {number} goalId
 */
export async function deleteGoal(goalId) {
  const now = new Date();
  await db('smart_goals')
    .where({ parent_goal_id: goalId })
    .update({ status: 'abandoned', updated_at: now });
  await db('smart_goals')
    .where({ id: goalId })
    .update({ status: 'abandoned', updated_at: now });
}

/**
 * Evaluate weekly progress for a single goal and persist a goal_progress row.
 * Uses LLM to assess on_track / at_risk / off_track.
 *
 * @param {number} goalId
 * @param {string} weekStart  - 'YYYY-MM-DD'
 * @param {object} weekData   - { completed_sessions[], disruptions[], recovery_signals{} }
 * @returns {object}          - created goal_progress row
 */
export async function evaluateGoalProgress(goalId, weekStart, weekData = {}) {
  const goal = await db('smart_goals').where({ id: goalId }).first();
  if (!goal) throw new Error(`Goal ${goalId} not found`);

  // Determine which block goal is active for this week (if any)
  const today = new Date(weekStart);
  const activeBlock = await db('smart_goals')
    .where({ parent_goal_id: goalId, hierarchy_level: 'block', status: 'active' })
    .where('target_date', '>=', format(today, 'yyyy-MM-dd'))
    .orderBy('target_date', 'asc')
    .first();

  const weeklyKpis = parseJSON(activeBlock?.weekly_kpis || goal.weekly_kpis) || [];
  const weeksLeft = weeksRemaining(goal.target_date);

  const userPrompt = GOAL_PROGRESS_PROMPT
    .replace('{{GOAL}}', JSON.stringify({
      id: goal.id,
      title: goal.title,
      goal_type: goal.goal_type,
      target_date: goal.target_date,
      target_metric: parseJSON(goal.target_metric),
      current_value: goal.current_value
    }, null, 2))
    .replace('{{CURRENT_BLOCK}}', activeBlock
      ? JSON.stringify({ title: activeBlock.title, target_date: activeBlock.target_date, focus: parseJSON(activeBlock.constraints)?.focus }, null, 2)
      : 'null')
    .replace('{{WEEKLY_KPIS}}', JSON.stringify(weeklyKpis, null, 2))
    .replace('{{WEEK_START}}', weekStart)
    .replace('{{WEEKS_REMAINING}}', weeksLeft != null ? String(weeksLeft) : 'unknown')
    .replace('{{COMPLETED_SESSIONS}}', JSON.stringify(weekData.completed_sessions || [], null, 2))
    .replace('{{DISRUPTIONS}}', JSON.stringify(weekData.disruptions || [], null, 2))
    .replace('{{RECOVERY_SIGNALS}}', JSON.stringify(weekData.recovery_signals || {}, null, 2));

  const { content } = await callLLM(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    { maxTokens: 800 }
  );

  const llmResult = extractJSON(content);

  // Upsert goal_progress row
  const existing = await db('goal_progress')
    .where({ goal_id: goalId, week_start: weekStart })
    .first();

  const progressRow = {
    goal_id: goalId,
    week_start: weekStart,
    status: llmResult.status || 'at_risk',
    metric_value: llmResult.metric_value ?? null,
    kpis_snapshot: serializeJSON(llmResult.kpis_snapshot || []),
    narrative: llmResult.plain_language_summary || null,
    min_effective_alt: serializeJSON(llmResult.min_effective_alt || null),
    created_at: new Date()
  };

  if (existing) {
    await db('goal_progress').where({ id: existing.id }).update(progressRow);
    return formatProgress({ ...existing, ...progressRow });
  } else {
    const [id] = await db('goal_progress').insert(progressRow);
    return formatProgress({ id, ...progressRow });
  }
}

/**
 * Generate a weekly review across all active goals for a profile.
 * Fetches the latest progress rows and returns structured per-goal review.
 *
 * @param {number} profileId
 * @param {string} weekStart - 'YYYY-MM-DD'
 * @returns {object[]}       - Array of { goal, progress } objects
 */
export async function generateWeeklyGoalReview(profileId, weekStart) {
  const goals = await db('smart_goals')
    .where({ profile_id: profileId, hierarchy_level: 'long_term', status: 'active' });

  const review = [];

  for (const goal of goals) {
    const progress = await db('goal_progress')
      .where({ goal_id: goal.id, week_start: weekStart })
      .first();

    review.push({
      goal: formatGoal(goal),
      progress: progress ? formatProgress(progress) : null
    });
  }

  return review;
}

/**
 * Get full weekly progress history for a single goal.
 *
 * @param {number} goalId
 * @returns {object[]}
 */
export async function getGoalProgressHistory(goalId) {
  const rows = await db('goal_progress')
    .where({ goal_id: goalId })
    .orderBy('week_start', 'asc');
  return rows.map(formatProgress);
}

// ── Formatting helpers ──────────────────────────────────────────────────────

function formatGoal(row) {
  return {
    id: row.id,
    profile_id: row.profile_id,
    raw_text: row.raw_text,
    title: row.title,
    goal_type: row.goal_type,
    hierarchy_level: row.hierarchy_level,
    parent_goal_id: row.parent_goal_id,
    status: row.status,
    target_date: row.target_date,
    target_metric: parseJSON(row.target_metric),
    current_value: row.current_value,
    assumptions: parseJSON(row.assumptions),
    confidence: row.confidence,
    weekly_kpis: parseJSON(row.weekly_kpis),
    constraints: parseJSON(row.constraints),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function formatProgress(row) {
  return {
    id: row.id,
    goal_id: row.goal_id,
    week_start: row.week_start,
    status: row.status,
    metric_value: row.metric_value,
    kpis_snapshot: parseJSON(row.kpis_snapshot),
    narrative: row.narrative,
    min_effective_alt: parseJSON(row.min_effective_alt),
    created_at: row.created_at
  };
}
