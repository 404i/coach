/**
 * Garmin sync, auth, activities, and metrics tool handlers.
 */
import { callAPI } from '../api.js';
import { getDateTimeContext } from '../datetime.js';
import { getCurrentAthlete } from '../state.js';
import { autoSyncIfNeeded, ensureFreshData } from '../sync.js';
import { getActivityContext } from '../activity-context.js';

export const garminHandlers = {
  async sync_garmin_data(args) {
    const email = args.email || getCurrentAthlete();
    const days = args.days || 3;
    const end_date = new Date().toISOString().split('T')[0];
    const start_date = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    try {
      const response = await callAPI('/api/garmin/sync', {
        method: 'POST',
        body: JSON.stringify({ email, start_date, end_date }),
      });
      const summary = response.data || response;
      return {
        content: [{ type: "text", text: `✓ Garmin sync completed successfully!\n\n${JSON.stringify(summary, null, 2)}\n\nUse get_training_metrics or get_activities to view the synced data.` }],
      };
    } catch (error) {
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        console.error('🔑 Session expired during sync - attempting re-authentication');
        try {
          const reauthResult = await callAPI('/api/garmin/reauth', {
            method: 'POST',
            body: JSON.stringify({ email }),
          });
          if (reauthResult.success) {
            console.error('✓ Re-authentication successful - retrying sync');
            const retryResponse = await callAPI('/api/garmin/sync', {
              method: 'POST',
              body: JSON.stringify({ email, start_date, end_date }),
            });
            const summary = retryResponse.data || retryResponse;
            return {
              content: [{ type: "text", text: `✓ Session re-authenticated and sync completed!\n\n${JSON.stringify(summary, null, 2)}\n\nUse get_training_metrics or get_activities to view the synced data.` }],
            };
          } else if (reauthResult.mfa_required) {
            const datetime = getDateTimeContext();
            return {
              content: [{
                type: "text",
                text: `🔐 **MFA Required for Garmin Authentication**\n\n📅 ${datetime.formatted}\n\nYour Garmin session has expired and requires Multi-Factor Authentication.\n\n**Please run this command in your terminal:**\n\n\`\`\`bash\ncurl -X POST "http://localhost:8080/api/garmin/login" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "email": "${email}",\n    "password": "YOUR_GARMIN_PASSWORD",\n    "mfa_code": "WAIT_FOR_EMAIL"\n  }'\n\`\`\`\n\n**Steps:**\n1. Check your email for Garmin MFA code\n2. Replace \`YOUR_GARMIN_PASSWORD\` with your actual password\n3. Replace \`WAIT_FOR_EMAIL\` with the 6-digit code from your email\n4. Run the command\n5. Then tell me "I've authenticated" and I'll retry the sync\n\n⚠️  The MFA code expires quickly, so have it ready before running the command.`,
              }],
            };
          }
          throw new Error(`Re-authentication failed: ${reauthResult.message}`);
        } catch (reauthError) {
          return {
            content: [{ type: "text", text: `❌ Sync Failed - Re-authentication Error\n\nError: ${reauthError.message}\n\nPlease check your Garmin credentials and try manual authentication.` }],
          };
        }
      }
      throw error;
    }
  },

  async confirm_garmin_auth(args) {
    const email = args.email || getCurrentAthlete();
    const datetime = getDateTimeContext();
    try {
      console.error('🔄 User confirmed authentication - attempting sync');
      const response = await callAPI('/api/garmin/sync', {
        method: 'POST',
        body: JSON.stringify({
          email,
          start_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: new Date().toISOString().split('T')[0],
        }),
      });
      const summary = response.data || response;
      return {
        content: [{ type: "text", text: `✅ **Authentication Confirmed - Sync Complete!**\n\n📅 ${datetime.formatted}\n\n${JSON.stringify(summary, null, 2)}\n\nYour Garmin data is now up to date. Use get_training_metrics or get_activities to view the synced data.` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `❌ **Sync Failed After Authentication**\n\n📅 ${datetime.formatted}\n\nError: ${error.message}\n\nPlease verify:\n1. The authentication command completed successfully\n2. You received a success response\n3. Your credentials are correct\n\nIf the problem persists, try running the authentication command again.` }],
      };
    }
  },

  async get_activities(args) {
    const email = args.email || getCurrentAthlete();
    const limit = args.limit || 20;

    try {
      await autoSyncIfNeeded(email);
    } catch (syncError) {
      console.error('⚠️  Auto-sync failed:', syncError.message);
    }

    const activityCtx = await getActivityContext(email);

    let url = `/api/garmin/activities?email=${encodeURIComponent(email)}&limit=${limit}`;
    if (args.start_date) url += `&start_date=${encodeURIComponent(args.start_date)}`;
    if (args.end_date) url += `&end_date=${encodeURIComponent(args.end_date)}`;

    const data = await callAPI(url);

    if (data.activities && Array.isArray(data.activities)) {
      data.activities.forEach(a => { delete a.raw_activity_data; });
    }

    let summaryText = `🏃 **ACTIVITIES QUERY**\n`;
    summaryText += `📅 Latest activity: ${activityCtx.latest_activity_date || 'NONE'}\n`;
    summaryText += `⏱️  Days since last: ${activityCtx.days_since_last || 'N/A'}\n`;
    if (activityCtx.warning) summaryText += `${activityCtx.warning}\n`;
    summaryText += `\n`;

    if (data.activities && data.activities.length > 0) {
      const types = [...new Set(data.activities.map(a => a.activity_type))];
      summaryText += `✓ Found ${data.activities.length} activities. Types: ${types.join(', ')}.\n\n`;
    } else {
      summaryText += '🚨 **NO ACTIVITIES FOUND**. The athlete has no recorded workouts in this date range.\n';
      summaryText += '⚠️  **ACTION**: Check if Garmin sync is needed or if athlete is new to system.\n\n';
    }

    return { content: [{ type: "text", text: summaryText + JSON.stringify(data, null, 2) }] };
  },

  async get_training_metrics(args) {
    const email = args.email || getCurrentAthlete();
    const freshnessNote = await ensureFreshData(email);
    const days = args.days || 30;
    const end_date = new Date().toISOString().split('T')[0];
    const start_date = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const data = await callAPI(
      `/api/garmin/metrics?email=${encodeURIComponent(email)}&start_date=${encodeURIComponent(start_date)}&end_date=${encodeURIComponent(end_date)}`
    );

    if (data.data && Array.isArray(data.data)) {
      data.data.forEach(metric => { delete metric.raw_garth_data; });
    }

    let missingFields = [];
    if (data.data && Array.isArray(data.data)) {
      const allMissing = new Set();
      data.data.forEach(metric => {
        const m = metric.metrics_data || {};
        const nulls = [];
        if (m.sleep_hours == null) nulls.push('sleep_hours');
        if (m.sleep_score == null) nulls.push('sleep_score');
        if (m.training_load == null) nulls.push('training_load');
        if (m.recovery_score == null) nulls.push('recovery_score');
        if (m.hrv == null) nulls.push('hrv');
        if (m.rhr == null) nulls.push('rhr');
        if (nulls.length > 0) metric._missing_data = nulls.join(', ');
        nulls.forEach(f => allMissing.add(f));
      });
      if (allMissing.size > 0) missingFields = Array.from(allMissing);
    }

    let responseText = `${freshnessNote}\n\n` + JSON.stringify(data, null, 2);
    if (missingFields.length > 0) {
      responseText = `${freshnessNote}\n\n⚠️ WARNING: The following metrics are NOT AVAILABLE and show null values:\n${missingFields.join(', ')}\n\n**DO NOT invent or estimate these values. State clearly: "NO DATA AVAILABLE for ${missingFields.join(', ')}"**\n\n` + JSON.stringify(data, null, 2);
    }

    return { content: [{ type: "text", text: responseText }] };
  },
};
