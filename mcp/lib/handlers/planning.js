/**
 * Workout planning and recommendation tool handlers.
 */
import { callAPI } from '../api.js';
import { getCurrentAthlete } from '../state.js';
import { ensureFreshData } from '../sync.js';
import { getActivityContext } from '../activity-context.js';
import { getProfileId } from '../utils.js';

export const planningHandlers = {
  async get_today_workout(args) {
    const email = args.email || getCurrentAthlete();
    const freshnessNote = await ensureFreshData(email);
    const profile_id = await getProfileId(email);
    const date = args.date || new Date().toISOString().split('T')[0];
    const data = await callAPI('/api/recommend', {
      method: 'POST',
      body: JSON.stringify({ profile_id, date }),
    });
    return {
      content: [{ type: "text", text: `${freshnessNote}\n\n${JSON.stringify(data, null, 2)}` }],
    };
  },

  async get_weekly_plan(args) {
    const email = args.email || getCurrentAthlete();
    const freshnessNote = await ensureFreshData(email);
    const profile_id = await getProfileId(email);
    let week_start = args.week_start;
    if (!week_start) {
      const today = new Date();
      const monday = new Date(today);
      monday.setDate(today.getDate() - today.getDay() + 1);
      week_start = monday.toISOString().split('T')[0];
    }
    const data = await callAPI(
      `/api/recommend/week?profile_id=${encodeURIComponent(profile_id)}&week_start=${encodeURIComponent(week_start)}`
    );
    return {
      content: [{ type: "text", text: `${freshnessNote}\n\n${JSON.stringify(data, null, 2)}` }],
    };
  },

  async get_workout_recommendations(args) {
    const email = args.email || getCurrentAthlete();
    const freshnessNote = await ensureFreshData(email);
    const dateParam = args.date ? `&date=${encodeURIComponent(args.date)}` : '';
    const activityCtx = await getActivityContext(email);

    const data = await callAPI(
      `/api/workout/recommendations?email=${encodeURIComponent(email)}${dateParam}`
    );

    let response = `${freshnessNote}\n\n` + JSON.stringify(data, null, 2);
    if (activityCtx.warning) {
      response = `${freshnessNote}\n\n🚨 **ACTIVITY VERIFICATION**:\n${activityCtx.warning}\n\n` +
        `📅 Latest activity: ${activityCtx.latest_activity_date || 'unknown'}\n` +
        `⏱️  Days since last: ${activityCtx.days_since_last || 'unknown'}\n\n` +
        (activityCtx.days_since_last > 2
          ? `⚠️  **NO RECENT ACTIVITIES** - Garmin sync may be needed. Recommendations based on metrics only.\n\n`
          : '') +
        `**WORKOUT RECOMMENDATIONS**:\n${response}`;
    }
    return { content: [{ type: "text", text: response }] };
  },

  async get_weekly_workout_plan(args) {
    const email = args.email || getCurrentAthlete();
    const freshnessNote = await ensureFreshData(email);
    const startDateParam = args.start_date ? `&start_date=${encodeURIComponent(args.start_date)}` : '';
    const activityCtx = await getActivityContext(email);

    const data = await callAPI(
      `/api/workout/weekly-plan?email=${encodeURIComponent(email)}${startDateParam}`
    );

    let response = `${freshnessNote}\n\n` + JSON.stringify(data, null, 2);
    if (activityCtx.days_since_last > 2) {
      response = `${freshnessNote}\n\n⚠️  **ACTIVITY SYNC**: Last activity was ${activityCtx.days_since_last} days ago (${activityCtx.latest_activity_date}). Plan based on metrics only.\n\n` + JSON.stringify(data, null, 2);
    }
    return { content: [{ type: "text", text: response }] };
  },

  async add_planned_activity(args) {
    const email = args.email || getCurrentAthlete();
    const { activityType, description, plannedDate, options } = args;
    if (!activityType || !plannedDate) {
      throw new Error("activityType and plannedDate are required");
    }
    const data = await callAPI('/api/planned-activities', {
      method: 'POST',
      body: JSON.stringify({
        email,
        activityType,
        description: description || activityType,
        plannedDate,
        options: options || {},
      }),
    });
    return {
      content: [{ type: "text", text: `✓ Planned activity recorded:\n${JSON.stringify(data.activity, null, 2)}\n\n💡 This will now be visible to all AI systems (Claude, LM Studio, etc.) for better planning.` }],
    };
  },

  async get_upcoming_activities(args) {
    const email = args.email || getCurrentAthlete();
    const daysAhead = args.daysAhead || 30;
    const data = await callAPI(
      `/api/planned-activities/upcoming?email=${encodeURIComponent(email)}&daysAhead=${daysAhead}`
    );
    let response = `📅 **UPCOMING PLANNED ACTIVITIES** (next ${daysAhead} days)\n\n`;
    if (data.count === 0) {
      response += `No upcoming activities planned.\n\n💡 Use add_planned_activity when athlete mentions future plans.`;
    } else {
      response += `Found ${data.count} planned activities:\n\n`;
      response += JSON.stringify(data.activities, null, 2);
    }
    return { content: [{ type: "text", text: response }] };
  },

  async update_planned_activity(args) {
    const { id, status, completedDate, notes } = args;
    if (!id) throw new Error("Activity ID is required");
    const updates = {};
    if (status) updates.status = status;
    if (completedDate) updates.completedDate = completedDate;
    if (notes) updates.notes = notes;
    const data = await callAPI(`/api/planned-activities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return {
      content: [{ type: "text", text: `✓ Planned activity updated:\n${JSON.stringify(data.activity, null, 2)}` }],
    };
  },
};
