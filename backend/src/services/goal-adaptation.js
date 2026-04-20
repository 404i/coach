/**
 * Goal Adaptation Service
 *
 * Handles smart fallback logic when the training week is disrupted:
 *   - proposeMinEffectiveAlternative: revised weekly targets without breaking the plan
 *   - balanceMultipleGoals: multi-objective priority logic with conflict detection
 */

import db from '../db/index.js';
import { callLLM } from './llm-coach.js';
import { extractJSON } from '../utils/json-extractor.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let SYSTEM_PROMPT, GOAL_PROGRESS_PROMPT;
try {
  SYSTEM_PROMPT = readFileSync(join(__dirname, '../prompts/coach-system.txt'), 'utf-8');
  GOAL_PROGRESS_PROMPT = readFileSync(join(__dirname, '../prompts/goal-progress.txt'), 'utf-8');
} catch (err) {
  logger.warn('Could not load prompts for goal-adaptation:', err.message);
}

function parseJSON(val) {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
}

/**
 * Propose a minimum-effective-dose alternative when the weekly plan has been disrupted.
 *
 * This preserves the INTENT of the goal while reducing volume to what is realistically
 * achievable. The rest of the plan is left intact — this is a targeted adjustment only.
 *
 * @param {number}   goalId       - smart_goals.id
 * @param {string[]} disruptions  - Array of disruption descriptions
 *                                  e.g. ["missed Tuesday tempo", "travel Thursday-Friday"]
 * @param {object}   [context]    - Optional additional context:
 *                                    { remaining_days: string[], recovery_signals: object }
 * @returns {object}              - { original_goal, min_effective_alt, rationale }
 */
export async function proposeMinEffectiveAlternative(goalId, disruptions, context = {}) {
  const goal = await db('smart_goals').where({ id: goalId }).first();
  if (!goal) throw new Error(`Goal ${goalId} not found`);

  const weeklyKpis = parseJSON(goal.weekly_kpis) || [];
  const targetMetric = parseJSON(goal.target_metric);

  const prompt = `
You are an expert endurance coach. A training week has been disrupted and you need to propose
the MINIMUM EFFECTIVE alternative that preserves the athlete's training intent without overloading them.

GOAL: ${JSON.stringify({ title: goal.title, goal_type: goal.goal_type, target_date: goal.target_date, target_metric: targetMetric }, null, 2)}

WEEKLY KPIs FOR THIS GOAL:
${JSON.stringify(weeklyKpis, null, 2)}

DISRUPTIONS THIS WEEK:
${disruptions.map((d, i) => `${i + 1}. ${d}`).join('\n')}

REMAINING DAYS AVAILABLE: ${JSON.stringify(context.remaining_days || [], null, 2)}

RECOVERY SIGNALS: ${JSON.stringify(context.recovery_signals || {}, null, 2)}

INSTRUCTIONS:
1. Identify which goal-specific KPIs are still achievable given the disruptions.
2. Propose 1-3 minimal sessions that preserve the core training stimulus for this goal.
3. These sessions should be shorter or easier than the original plan — minimum effective dose only.
4. Do NOT add sessions on rest days or days already used.
5. The rest of the weekly plan is NOT affected by this — only goal-specific adjustments.
6. Be realistic: if illness/injury caused the disruption, the minimum effective dose may be REST.

Return ONLY valid JSON:
{
  "original_kpis_at_risk": ["kpi descriptions that are now at risk"],
  "sessions": [
    {
      "day": "remaining day name or 'any remaining day'",
      "title": "Session title",
      "sport": "run|bike|swim|strength|yoga|walk|rest",
      "duration_min": 30,
      "intensity": "easy_aerobic|tempo_threshold|rest",
      "description": "Specific instructions"
    }
  ],
  "kpis_still_achievable": ["kpi descriptions still achievable"],
  "rationale": "Why this minimum dose preserves the goal intent",
  "impact_on_goal": "minimal|moderate|significant"
}
`.trim();

  const { content } = await callLLM(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    { maxTokens: 700 }
  ).catch(err => {
    if (err.message.includes('timed out') || err.message.includes('not reachable') || err.message.includes('ECONNREFUSED')) {
      logger.warn('LLM unavailable for goal adaptation — using rule-based fallback:', err.message);
      return { content: null };
    }
    throw err;
  });

  // Rule-based fallback when LLM is down
  if (!content) {
    return {
      original_goal: { id: goal.id, title: goal.title, goal_type: goal.goal_type, weekly_kpis: weeklyKpis },
      min_effective_alt: {
        weeks_missed: disruptions.length,
        sessions: [],
        rationale: `LLM unavailable — reschedule ${disruptions.join(', ')} to the next available window. Focus on completing any remaining sessions at easy intensity.`,
        impact_on_goal: 'moderate',
        original_kpis_at_risk: [],
        kpis_still_achievable: weeklyKpis.map(k => typeof k === 'object' ? k.kpi : k)
      },
      rationale: 'LLM unavailable — rule-based fallback applied',
      _fallback: true
    };
  }

  const result = extractJSON(content);

  return {
    original_goal: {
      id: goal.id,
      title: goal.title,
      goal_type: goal.goal_type,
      weekly_kpis: weeklyKpis
    },
    min_effective_alt: result,
    rationale: result.rationale
  };
}

/**
 * Balance multiple competing goals for a profile.
 *
 * Detects conflicts (e.g., high endurance volume vs. strict strength target)
 * and returns a prioritized recommendation with any conflict warnings.
 *
 * @param {number} profileId  - athlete_profiles.id
 * @param {object} context    - { available_days_per_week, recovery_score, current_load }
 * @returns {object}          - { priority_order, conflicts[], weekly_allocation, recommendations }
 */
export async function balanceMultipleGoals(profileId, context = {}) {
  const goals = await db('smart_goals')
    .where({ profile_id: profileId, hierarchy_level: 'long_term', status: 'active' });

  if (goals.length === 0) {
    return { priority_order: [], conflicts: [], weekly_allocation: [], recommendations: [] };
  }

  if (goals.length === 1) {
    return {
      priority_order: [{ id: goals[0].id, title: goals[0].title, rank: 1 }],
      conflicts: [],
      weekly_allocation: [],
      recommendations: ['Only one active goal — no balancing needed.']
    };
  }

  const goalSummaries = goals.map(g => ({
    id: g.id,
    title: g.title,
    goal_type: g.goal_type,
    target_date: g.target_date,
    weekly_kpis: parseJSON(g.weekly_kpis) || [],
    constraints: parseJSON(g.constraints)
  }));

  const prompt = `
You are an expert endurance coach. An athlete has multiple active training goals that must be balanced
within their available training time.

ACTIVE GOALS:
${JSON.stringify(goalSummaries, null, 2)}

ATHLETE CONTEXT:
- Available training days per week: ${context.available_days_per_week || 4}
- Current recovery score: ${context.recovery_score ?? 'unknown'}
- Current training load: ${context.current_load ?? 'unknown'}

INSTRUCTIONS:
1. Check for conflicts: Do any goals require incompatible training stimuli or too much total volume?
   (e.g., "build FTP" requires high intensity, conflicts with "train 6 days/week at easy aerobic")
2. Rank the goals by importance/urgency (consider target_date proximity, goal_type).
3. Propose a weekly allocation: how many sessions per week should serve each goal.
4. Give 2-4 brief coaching recommendations for managing these goals together.

Return ONLY valid JSON:
{
  "priority_order": [
    { "id": 1, "title": "...", "rank": 1, "reason": "Most urgent — event in 6 weeks" }
  ],
  "conflicts": [
    {
      "goal_ids": [1, 2],
      "description": "High-volume endurance conflicts with max strength gains",
      "severity": "low|moderate|high",
      "mitigation": "Schedule strength sessions after easy endurance days"
    }
  ],
  "weekly_allocation": [
    { "goal_id": 1, "sessions_per_week": 3, "typical_session_types": ["long ride", "threshold"] },
    { "goal_id": 2, "sessions_per_week": 2, "typical_session_types": ["core circuit", "mobility"] }
  ],
  "recommendations": [
    "Prioritise goal 1 during the next 6 weeks given the approaching event."
  ]
}
`.trim();

  const { content } = await callLLM(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    { maxTokens: 900 }
  );

  return extractJSON(content);
}
