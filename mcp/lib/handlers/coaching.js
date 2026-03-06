/**
 * Chat / coaching tool handler.
 */
import { callAPI } from '../api.js';
import { getCurrentAthlete } from '../state.js';
import { ensureFreshData } from '../sync.js';
import { getActivityContext } from '../activity-context.js';
import { readMemory } from '../memory.js';

export const coachingHandlers = {
  async chat_with_coach(args) {
    const email = args.email || getCurrentAthlete();
    const freshnessNote = await ensureFreshData(email);
    const profile = await callAPI(`/api/profile?email=${encodeURIComponent(email)}`);
    const memory = await readMemory(email);

    const activityCtx = await getActivityContext(email);

    let recentActivities = null;
    try {
      const activitiesData = await callAPI(
        `/api/garmin/activities?email=${encodeURIComponent(email)}&limit=10`
      );
      if (activitiesData.activities && activitiesData.activities.length > 0) {
        recentActivities = activitiesData.activities.map(act => ({
          date: act.date,
          activity_name: act.activity_name,
          activity_type: act.activity_type,
          duration: act.duration,
          distance: act.distance,
          avg_hr: act.avg_hr,
          max_hr: act.max_hr,
          calories: act.calories,
          training_load: act.training_load,
          aerobic_effect: act.aerobic_effect,
          elevation_gain: act.elevation_gain,
        }));
      }
    } catch {
      // Activities endpoint might not be available yet
    }

    let activitiesSummary = '';
    if (recentActivities && recentActivities.length > 0) {
      activitiesSummary = `\n\n**Recent Activities (Last 10):**\n📅 Latest: ${activityCtx.latest_activity_date}\n⏱️  Days since: ${activityCtx.days_since_last}\n\n${JSON.stringify(recentActivities, null, 2)}`;
    } else {
      activitiesSummary = `\n\n🚨 **NO ACTIVITY RECORDS AVAILABLE**\n`;
      if (activityCtx.latest_activity_date) {
        activitiesSummary += `📅 Last activity: ${activityCtx.latest_activity_date} (${activityCtx.days_since_last} days ago)\n`;
      }
      activitiesSummary += `⚠️  The athlete has no recent recorded workouts. Garmin sync may be needed.`;
    }

    const profileSection = JSON.stringify(profile.profile, null, 2);
    const memorySection = JSON.stringify(memory, null, 2);
    const estimatedChars = profileSection.length + memorySection.length + activitiesSummary.length;
    const estimatedTokens = Math.ceil(estimatedChars / 4);
    const sizeNote = `\n📊 Context size: ~${estimatedTokens} tokens across profile, memory, and activities`;

    return {
      content: [{
        type: "text",
        text: `${freshnessNote}${sizeNote}\n\nCoach AI is processing your message: "${args.message}"\n\n--- SECTION 1: ATHLETE PROFILE ---\n${profileSection}\n\n--- SECTION 2: PERSONAL MEMORY/CONTEXT ---\n${memorySection}\n\n--- SECTION 3: ACTIVITIES ---${activitiesSummary}\n\n🚨 **CRITICAL ANTI-HALLUCINATION INSTRUCTIONS**:\n1. Follow the coaching principles in the "Coach System Prompt" resource\n2. If any metric shows null/undefined, state "NO DATA AVAILABLE for [field name]"\n3. 🚨 NEVER invent, estimate, or hallucinate values for missing metrics\n4. 🚨 NEVER reference activities that are not in the "Recent Activities" list above\n5. 🚨 If latest activity is >2 days old, DO NOT assume recent workouts exist\n6. Reference the athlete's goals, constraints, injuries, and preferences from their profile\n7. Be completely honest about data gaps and ask for subjective input when data is missing\n8. Recent activities are included above - ONLY use this data to answer questions about workouts\n9. ${activityCtx.warning || 'Activity data is current'}`,
      }],
    };
  },
};
