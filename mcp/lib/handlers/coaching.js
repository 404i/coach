/**
 * Chat / coaching tool handler.
 *
 * Strategy:
 *   1. Gather fresh profile + metrics (last 14 days, sorted DESC) + activities.
 *   2. Try to get an actual LLM coaching answer via POST /api/chat.
 *   3. If the LLM is unavailable/times out, fall back to returning the raw
 *      context block so the calling AI can synthesize its own answer.
 */
import { callAPI } from '../api.js';
import { getCurrentAthlete } from '../state.js';

export const coachingHandlers = {
  async chat_with_coach(args) {
    const email = args.email || getCurrentAthlete();
    const message = args.message;
    
    if (!message) {
      return {
        content: [{
          type: "text",
          text: "⚠️ No message provided. Please include a message to chat with your coach.",
        }],
      };
    }

    try {
      // ── 1. Gather fresh context ──────────────────────────────────────────
      const profile = await callAPI(`/api/profile?email=${encodeURIComponent(email)}`);

      // Compute a proper date range — the metrics endpoint does NOT support a
      // ?days= shorthand; it requires start_date and end_date.
      const today = new Date().toISOString().split('T')[0];
      const daysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const metricsData = await callAPI(
        `/api/garmin/metrics?email=${encodeURIComponent(email)}&start_date=${daysAgo}&end_date=${today}`
      );
      const activitiesData = await callAPI(
        `/api/garmin/activities?email=${encodeURIComponent(email)}&limit=10`
      );

      // Metrics are returned asc — reverse so index 0 is most recent
      const recentMetrics = (metricsData.data || []).reverse().slice(0, 7);
      const recentActivities = activitiesData.activities || [];

      // ── 2. Try LLM-backed coaching answer ─────────────────────────────
      const profileId = profile.profile?.id;
      if (profileId) {
        try {
          const chatResp = await callAPI('/api/chat', {
            method: 'POST',
            body: JSON.stringify({
              profile_id: profileId,
              message,
              history: args.history || []
            })
          });

          if (chatResp.success && chatResp.response) {
            return {
              content: [{ type: "text", text: chatResp.response }],
            };
          }
        } catch (llmErr) {
          // LLM unavailable or timed out — fall through to context fallback
          console.error('[chat_with_coach] LLM endpoint failed, using context fallback:', llmErr.message);
        }
      }

      // ── 3. Context-block fallback ────────────────────────────────────
      // Build a rich but concise context block for the calling AI to use.
      let text = `📋 **Coaching Context** (LLM unavailable — synthesize your answer from this data)\n\n`;
      text += `**Question:** ${message}\n\n`;

      // Profile
      const p = profile.profile || {};
      text += `**Athlete:** ${p.name || email}`;
      if (p.sport_type) text += ` | Sport: ${p.sport_type}`;
      if (p.training_mode) text += ` | Mode: ${p.training_mode}`;
      text += `\n\n`;

      // Most recent metrics (sorted newest-first)
      if (recentMetrics.length > 0) {
        text += `**Recent Metrics (newest first):**\n`;
        for (const m of recentMetrics.slice(0, 5)) {
          const md = typeof m.metrics_data === 'string' ? JSON.parse(m.metrics_data) : (m.metrics_data || {});
          const parts = [];
          if (md.sleep_score) parts.push(`Sleep ${md.sleep_score}`);
          if (md.recovery_score) parts.push(`Recovery ${md.recovery_score}`);
          if (md.training_load) parts.push(`Load ${md.training_load}`);
          if (md.hrv) parts.push(`HRV ${md.hrv}`);
          if (md.rhr) parts.push(`RHR ${md.rhr}`);
          text += `- ${m.date}: ${parts.length ? parts.join(' | ') : 'no data'}\n`;
        }
        text += `\n`;
      } else {
        text += `**Recent Metrics:** none in last 14 days\n\n`;
      }

      // Recent activities
      if (recentActivities.length > 0) {
        text += `**Recent Activities:**\n`;
        for (const act of recentActivities.slice(0, 5)) {
          const dist = act.distance != null ? `${Number(act.distance).toFixed(1)}km` : '';
          const mins = act.duration != null ? `${Math.floor(act.duration / 60)}min` : '';
          const date = act.date ? String(act.date).slice(0, 10) : '';
          text += `- ${date} ${act.activity_name || act.name || ''} (${act.activity_type || act.sport_type || '?'}): ${dist} ${mins}\n`;
        }
        text += `\n`;
      } else {
        text += `**Recent Activities:** none found\n\n`;
      }

      return {
        content: [{ type: "text", text: text.trim() }],
      };

    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to gather coaching context**\n\n${error.message}\n\n💡 Try:\n- Sync data: \`sync_garmin_data\`\n- Check backend: http://localhost:8088/api/health`,
        }],
      };
    }
  },
};

