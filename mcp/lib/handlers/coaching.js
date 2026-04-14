/**
 * Chat / coaching tool handler.
 * Returns structured coaching context data for the AI client to process.
 * The AI client (OpenCode/Claude/etc) will use its configured model to generate coaching advice.
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
      // Gather all coaching context data
      const profile = await callAPI(`/api/profile?email=${encodeURIComponent(email)}`);
      
      // Get recent training metrics (last 7 days)
      const metricsData = await callAPI(`/api/garmin/metrics?email=${encodeURIComponent(email)}&days=7`);
      
      // Get recent activities (last 10)
      const activitiesData = await callAPI(`/api/strava/activities?email=${encodeURIComponent(email)}&limit=10`);

      // Build structured coaching context
      const context = {
        athlete_profile: profile.profile || {},
        recent_metrics: metricsData.data || [],
        recent_activities: activitiesData.activities || [],
        question: message,
        conversation_history: args.history || []
      };

      // Format context as readable text for the AI to process
      let text = `🏋️ **Coaching Context for ${email}**\n\n`;
      
      // Athlete question
      text += `**Question:** ${message}\n\n`;
      
      // Profile summary
      const p = context.athlete_profile;
      if (p.name) {
        text += `**Athlete Profile:**\n`;
        text += `- Name: ${p.name}\n`;
        if (p.age) text += `- Age: ${p.age}\n`;
        if (p.weight) text += `- Weight: ${p.weight}kg\n`;
        if (p.ftp) text += `- FTP: ${p.ftp}W\n`;
        if (p.activity_level) text += `- Activity Level: ${p.activity_level}\n`;
        text += `\n`;
      }

      // Recent metrics
      if (context.recent_metrics.length > 0) {
        text += `**Recent Training Metrics (Last 7 Days):**\n`;
        for (const m of context.recent_metrics.slice(0, 5)) {
          const md = typeof m.metrics_data === 'string' ? JSON.parse(m.metrics_data) : m.metrics_data;
          text += `- ${m.date}: `;
          if (md.sleep_score) text += `Sleep ${md.sleep_score} `;
          if (md.recovery_score) text += `Recovery ${md.recovery_score} `;
          if (md.training_load) text += `Load ${md.training_load} `;
          if (md.hrv) text += `HRV ${md.hrv} `;
          if (md.rhr) text += `RHR ${md.rhr}`;
          text += `\n`;
        }
        text += `\n`;
      }

      // Recent activities
      if (context.recent_activities.length > 0) {
        text += `**Recent Activities (Last 10):**\n`;
        for (const act of context.recent_activities.slice(0, 10)) {
          const dist = act.distance != null ? `${Number(act.distance).toFixed(1)}km` : '';
          const time = act.duration != null ? `${Math.floor(act.duration / 60)}min` : '';
          const date = act.date ? act.date.split('T')[0] : '';
          text += `- ${date} ${act.name} (${act.sport_type || act.type}): ${dist} ${time}\n`;
        }
        text += `\n`;
      }

      // Coaching prompt for AI
      text += `**Instructions for AI:**\n`;
      text += `Based on the above athlete data, provide personalized coaching advice to answer their question. `;
      text += `Consider their recent training load, recovery metrics, activity patterns, and fitness level. `;
      text += `Give practical, actionable guidance that helps them achieve their training goals safely and effectively.\n`;

      return {
        content: [{
          type: "text",
          text: text,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `❌ **Failed to gather coaching context**\n\n${error.message}\n\n💡 **Troubleshooting:**\n- Ensure profile exists: \`get_profile\`\n- Try syncing data first: \`sync_garmin_data\`\n- Check backend is running: http://localhost:8088`,
        }],
      };
    }
  },
};
