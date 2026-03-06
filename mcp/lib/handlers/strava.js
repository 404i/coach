/**
 * Strava connection, sync, and activity tool handlers for MCP.
 */
import { callAPI } from '../api.js';
import { getCurrentAthlete } from '../state.js';
import { getDateTimeContext } from '../datetime.js';

export const stravaHandlers = {

  // ── Connect Strava ──────────────────────────────────────────────────────
  async connect_strava(args) {
    const email = args.email || getCurrentAthlete();
    const datetime = getDateTimeContext();

    try {
      const result = await callAPI('/api/strava/connect', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });

      if (result.already_connected) {
        return {
          content: [{
            type: 'text',
            text: `ℹ️ **Strava Already Connected**\n\n📅 ${datetime.formatted}\n\nAthlete ID: ${result.strava_athlete_id}\n\nUse \`sync_strava_data\` to pull latest activities.`,
          }],
        };
      }

      const athlete = result.athlete || {};
      return {
        content: [{
          type: 'text',
          text: `✅ **Strava Connected Successfully!**\n\n📅 ${datetime.formatted}\n\n**Athlete:** ${athlete.firstname || ''} ${athlete.lastname || ''}\n**Location:** ${athlete.city || 'N/A'}, ${athlete.country || 'N/A'}\n**Premium:** ${athlete.premium ? 'Yes' : 'No'}\n\nUse \`sync_strava_data\` to pull your activities.`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ **Strava Connection Failed**\n\n📅 ${datetime.formatted}\n\nError: ${error.message}\n\n**Troubleshooting:**\n1. Check that STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REFRESH_TOKEN are set in .env\n2. Verify the refresh token is valid (tokens expire if unused for 6 months)\n3. Check Strava API status at https://status.strava.com`,
        }],
      };
    }
  },

  // ── Sync Strava Activities ─────────────────────────────────────────────
  async sync_strava_data(args) {
    const email = args.email || getCurrentAthlete();
    const days  = args.days || 30;
    const datetime = getDateTimeContext();

    const after  = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    const before = new Date().toISOString().split('T')[0];

    try {
      // Check connection first
      const status = await callAPI(`/api/strava/status?email=${encodeURIComponent(email)}`);
      if (!status.connected) {
        return {
          content: [{
            type: 'text',
            text: `⚠️ **Strava Not Connected**\n\n📅 ${datetime.formatted}\n\nUse \`connect_strava\` first to link your Strava account.`,
          }],
        };
      }

      const result = await callAPI('/api/strava/sync', {
        method: 'POST',
        body: JSON.stringify({ email, after, before }),
      });

      return {
        content: [{
          type: 'text',
          text: `✅ **Strava Sync Complete!**\n\n📅 ${datetime.formatted}\n📆 Range: ${result.date_range?.after || after} → ${result.date_range?.before || before}\n\n📊 **Summary:**\n- Total synced: ${result.total_synced}\n- New activities: ${result.new_activities}\n- Updated: ${result.updated_activities}\n\nUse \`get_strava_activities\` to view synced data.`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ **Strava Sync Failed**\n\n📅 ${datetime.formatted}\n\nError: ${error.message}\n\nThe Strava API token may have expired. Try \`connect_strava\` to re-establish the connection.`,
        }],
      };
    }
  },

  // ── Get Strava Activities ──────────────────────────────────────────────
  async get_strava_activities(args) {
    const email = args.email || getCurrentAthlete();
    const limit = args.limit || 20;
    const type  = args.type || null;
    const datetime = getDateTimeContext();

    let url = `/api/strava/activities?email=${encodeURIComponent(email)}&limit=${limit}`;
    if (args.start_date)  url += `&start_date=${encodeURIComponent(args.start_date)}`;
    if (args.end_date)    url += `&end_date=${encodeURIComponent(args.end_date)}`;
    if (type)             url += `&type=${encodeURIComponent(type)}`;

    try {
      const data = await callAPI(url);

      if (!data.activities || data.activities.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `📭 **No Strava Activities Found**\n\n📅 ${datetime.formatted}\n\nNo activities match the query. Try:\n- Expanding the date range\n- Running \`sync_strava_data\` to pull latest data\n- Checking if Strava is connected with \`connect_strava\``,
          }],
        };
      }

      // Build summary
      const activities = data.activities;
      const types = [...new Set(activities.map(a => a.sport_type || a.type))];
      let text = `🏋️ **Strava Activities** (${activities.length} found)\n\n`;
      text += `📅 ${datetime.formatted}\n`;
      text += `🏷️ Types: ${types.join(', ')}\n\n`;

      for (const act of activities) {
        const dist = act.distance_m ? (act.distance_m / 1000).toFixed(1) : '?';
        const time = act.moving_time_sec ? `${Math.floor(act.moving_time_sec / 60)}min` : '?';
        const elev = act.total_elevation_gain ? `${Math.round(act.total_elevation_gain)}m` : '';
        const hr   = act.average_heartrate ? `❤️ ${act.average_heartrate}bpm` : '';
        const date = act.start_date ? act.start_date.split('T')[0] : '?';

        text += `**${act.name}** (${act.sport_type || act.type})\n`;
        text += `  📅 ${date} | 📏 ${dist}km | ⏱️ ${time} | ⬆️ ${elev} ${hr}\n\n`;
      }

      return { content: [{ type: 'text', text }] };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ **Failed to query Strava activities**\n\nError: ${error.message}`,
        }],
      };
    }
  },

  // ── Get Strava Athlete Profile ─────────────────────────────────────────
  async get_strava_athlete(args) {
    const email = args.email || getCurrentAthlete();
    const datetime = getDateTimeContext();

    try {
      const athlete = await callAPI(`/api/strava/athlete?email=${encodeURIComponent(email)}`);

      let text = `👤 **Strava Athlete Profile**\n\n📅 ${datetime.formatted}\n\n`;
      text += `**Name:** ${athlete.firstname || ''} ${athlete.lastname || ''}\n`;
      text += `**City:** ${athlete.city || 'N/A'}\n`;
      text += `**Country:** ${athlete.country || 'N/A'}\n`;
      text += `**Premium:** ${athlete.premium ? 'Yes' : 'No'}\n`;
      text += `**Created:** ${athlete.created_at || 'N/A'}\n`;
      if (athlete.weight) text += `**Weight:** ${athlete.weight}kg\n`;
      if (athlete.ftp)    text += `**FTP:** ${athlete.ftp}W\n`;

      return { content: [{ type: 'text', text }] };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ **Failed to fetch Strava athlete profile**\n\nError: ${error.message}\n\nMake sure Strava is connected (\`connect_strava\`).`,
        }],
      };
    }
  },
};
