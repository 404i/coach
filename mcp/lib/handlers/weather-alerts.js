/**
 * Weather, insights, and alerts tool handlers.
 */
import { callAPI } from '../api.js';
import { getCurrentAthlete } from '../state.js';
import { ensureFreshData } from '../sync.js';
import { getActivityContext } from '../activity-context.js';
import { parseLocationToCoords } from '../utils.js';

export const weatherAlertsHandlers = {
  // ── Weather ──────────────────────────────────────────────────────────────
  async get_weather_safety(args) {
    const coords = parseLocationToCoords(args.location);
    const data = await callAPI(`/api/weather/safety?lat=${coords.lat}&lon=${coords.lon}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },

  async get_weather_adjusted_workout(args) {
    const sport = args.sport || 'cycling';
    const duration = args.duration || 60;
    const coords = parseLocationToCoords(args.location);
    const data = await callAPI(
      `/api/weather/adjustment-preview?lat=${coords.lat}&lon=${coords.lon}&sport=${sport}&duration=${duration}`
    );
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },

  async check_weather_forecast(args) {
    const coords = parseLocationToCoords(args.location);
    const data = await callAPI(`/api/weather/current?lat=${coords.lat}&lon=${coords.lon}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },

  // ── Insights & Alerts ────────────────────────────────────────────────────
  async get_insights_and_alerts(args) {
    const email = args.email || getCurrentAthlete();
    const freshnessNote = await ensureFreshData(email);
    const activityCtx = await getActivityContext(email);
    const data = await callAPI(`/api/insights?email=${encodeURIComponent(email)}`);

    let response = `${freshnessNote}\n\n🚨 **INSIGHTS & ALERTS**\n`;
    if (activityCtx.latest_activity_date) response += `📅 Based on data through: ${activityCtx.latest_activity_date}\n`;
    if (activityCtx.warning) response += `${activityCtx.warning}\n`;
    response += `\n${JSON.stringify(data, null, 2)}`;
    return { content: [{ type: "text", text: response }] };
  },

  async get_alerts_by_type(args) {
    const email = args.email || getCurrentAthlete();
    const type = args.type;
    const data = await callAPI(
      `/api/insights/type/${encodeURIComponent(type)}?email=${encodeURIComponent(email)}`
    );
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
};
