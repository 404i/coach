/**
 * Smart Goals MCP tool handlers.
 * Exposes goal lifecycle management to Claude / MCP clients.
 */
import { callAPI } from '../api.js';
import { getCurrentAthlete } from '../state.js';

export const goalsHandlers = {

  /**
   * get_active_goals
   * Fetch all active smart goals with hierarchy and latest weekly progress.
   */
  async get_active_goals(args) {
    const email = args.email || getCurrentAthlete();
    if (!email) {
      return { content: [{ type: 'text', text: '⚠️ No athlete set. Use set_current_athlete first or provide email.' }] };
    }

    try {
      const data = await callAPI(`/api/goals?email=${encodeURIComponent(email)}&include_draft=${args.include_draft ? 'true' : 'false'}`);

      if (!data.goals || data.goals.length === 0) {
        return { content: [{ type: 'text', text: `No active goals found for ${email}. Use create_goal to add one.` }] };
      }

      let text = `# Active Training Goals for ${email}\n\n`;

      for (const goal of data.goals) {
        const status = goal.latest_progress?.status;
        const statusIcon = status === 'on_track' ? '✅' : status === 'at_risk' ? '⚠️' : status === 'off_track' ? '❌' : '📋';
        text += `## ${statusIcon} ${goal.title}\n`;
        text += `- **Type:** ${goal.goal_type} | **Level:** ${goal.hierarchy_level}\n`;
        if (goal.target_date) text += `- **Target Date:** ${goal.target_date} (${goal.weeks_remaining ?? '?'} weeks remaining)\n`;
        if (goal.target_metric) {
          text += `- **Target:** ${goal.target_metric.value} ${goal.target_metric.unit} (${goal.target_metric.name})\n`;
        }
        if (goal.latest_progress) {
          text += `- **This week:** ${goal.latest_progress.status?.replace('_', ' ')}\n`;
          if (goal.latest_progress.narrative) text += `  > ${goal.latest_progress.narrative}\n`;
        }
        if (goal.weekly_kpis?.length) {
          text += `- **Weekly KPIs:** ${goal.weekly_kpis.map(k => k.kpi).join(' · ')}\n`;
        }
        if (goal.sub_goals?.length) {
          const activeBlock = goal.sub_goals.find(b => b.status === 'active');
          if (activeBlock) text += `- **Current block:** ${activeBlock.title} (until ${activeBlock.target_date})\n`;
          const draftBlocks = goal.sub_goals.filter(b => b.status === 'draft');
          if (draftBlocks.length) text += `- **Draft blocks pending review:** ${draftBlocks.length}\n`;
        }
        text += '\n';
      }

      return { content: [{ type: 'text', text }], _structured: data.goals };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error fetching goals: ${error.message}` }] };
    }
  },

  /**
   * create_goal
   * Parse free-text goal and create a structured smart goal (with auto-decomposition).
   */
  async create_goal(args) {
    const email = args.email || getCurrentAthlete();
    if (!email || !args.text) {
      return { content: [{ type: 'text', text: '⚠️ email and text are required.' }] };
    }

    try {
      // Preview first if requested
      if (args.preview_only) {
        const data = await callAPI('/api/goals', {
          method: 'POST',
          body: JSON.stringify({ email, text: args.text, confirm: false })
        });
        const p = data.parsed;
        let text = `# Goal Preview\n\n`;
        text += `**Title:** ${p.title}\n`;
        text += `**Type:** ${p.goal_type}\n`;
        text += `**Interpreted as:** ${p.interpreted_intent}\n`;
        if (p.target_date) text += `**Target date:** ${p.target_date}\n`;
        if (p.target_metric) text += `**Target:** ${p.target_metric.value} ${p.target_metric.unit}\n`;
        text += `**Confidence:** ${Math.round((p.confidence || 0) * 100)}%\n`;
        if (p.assumptions?.length) text += `**Assumptions:** ${p.assumptions.join('; ')}\n`;
        if (p.weekly_kpis?.length) text += `**Weekly KPIs:** ${p.weekly_kpis.map(k => k.kpi).join(', ')}\n`;
        text += `\nCall create_goal again with confirm=true to save this goal.`;
        return { content: [{ type: 'text', text }], _structured: p };
      }

      const data = await callAPI('/api/goals', {
        method: 'POST',
        body: JSON.stringify({ email, text: args.text, confirm: true })
      });

      const g = data.goal;
      let text = `✅ Goal created: **${g.title}**\n`;
      text += `- Type: ${g.goal_type}\n`;
      if (g.target_date) text += `- Target date: ${g.target_date}\n`;
      if (g.target_metric) text += `- Target: ${g.target_metric.value} ${g.target_metric.unit}\n`;
      text += `\nBlock sub-goals are being generated in the background. Use get_active_goals to see them once ready.`;

      return { content: [{ type: 'text', text }], _structured: data };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error creating goal: ${error.message}` }] };
    }
  },

  /**
   * adapt_goals
   * Propose a minimum-effective adaptation when sessions have been missed.
   */
  async adapt_goals(args) {
    const email = args.email || getCurrentAthlete();
    if (!email || !args.goal_id || !args.disruptions?.length) {
      return { content: [{ type: 'text', text: '⚠️ email, goal_id, and disruptions[] are required.' }] };
    }

    try {
      const data = await callAPI(`/api/goals/${args.goal_id}/adapt`, {
        method: 'POST',
        body: JSON.stringify({
          email,
          disruptions: args.disruptions,
          remaining_days: args.remaining_days || [],
          recovery_signals: args.recovery_signals || {}
        })
      });

      const alt = data.min_effective_alt;
      let text = `# Goal Adaptation: ${data.original_goal?.title}\n\n`;
      text += `**Disruptions:** ${args.disruptions.join(', ')}\n\n`;

      if (alt?.sessions?.length) {
        text += `## Minimum-Effective Alternative\n`;
        text += `${alt.rationale || ''}\n\n`;
        for (const s of alt.sessions) {
          text += `- **${s.title}** (${s.sport}, ${s.duration_min} min, ${s.intensity}) — ${s.day}\n`;
          if (s.description) text += `  ${s.description}\n`;
        }
      } else {
        text += `No additional sessions needed — rest is the right call.`;
      }

      if (alt?.kpis_still_achievable?.length) {
        text += `\n**Still achievable this week:** ${alt.kpis_still_achievable.join(', ')}`;
      }

      return { content: [{ type: 'text', text }], _structured: data };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error adapting goal: ${error.message}` }] };
    }
  },

  /**
   * get_weekly_goal_review
   * Per-goal weekly progress summary with on_track / at_risk / off_track status.
   */
  async get_weekly_goal_review(args) {
    const email = args.email || getCurrentAthlete();
    if (!email) {
      return { content: [{ type: 'text', text: '⚠️ No athlete set. Provide email or use set_current_athlete.' }] };
    }

    try {
      const qs = args.week_start ? `&week_start=${args.week_start}` : '';
      const data = await callAPI(`/api/goals/weekly-review?email=${encodeURIComponent(email)}${qs}`);

      if (!data.review?.length) {
        return { content: [{ type: 'text', text: `No goal review available for week of ${data.week_start}.` }] };
      }

      let text = `# Weekly Goal Review — ${data.week_start}\n\n`;

      for (const item of data.review) {
        const g = item.goal;
        const p = item.progress;
        const statusIcon = p?.status === 'on_track' ? '✅' : p?.status === 'at_risk' ? '⚠️' : p?.status === 'off_track' ? '❌' : '📋';
        text += `## ${statusIcon} ${g.title}\n`;
        if (p) {
          text += `**Status:** ${p.status?.replace('_', ' ') || 'Not evaluated'}\n`;
          if (p.narrative) text += `\n${p.narrative}\n`;
          if (p.kpis_snapshot?.length) {
            text += `\n**KPIs:**\n`;
            for (const kpi of p.kpis_snapshot) {
              text += `- ${kpi.achieved ? '✓' : '✗'} ${kpi.kpi}${kpi.value ? ` (${kpi.value})` : ''}\n`;
            }
          }
          if (p.min_effective_alt) {
            text += `\n**Suggested recovery plan:** ${p.min_effective_alt.title}\n`;
            text += `${p.min_effective_alt.description}\n`;
          }
        } else {
          text += `_No progress recorded for this week yet._\n`;
        }
        text += '\n';
      }

      return { content: [{ type: 'text', text }], _structured: data.review };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error fetching goal review: ${error.message}` }] };
    }
  }
};
