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
    
    try {
      // Call LLM generation endpoint for structured workout
      const data = await callAPI('/api/recommend', {
        method: 'POST',
        body: JSON.stringify({ profile_id, date }),
      });
      
      if (!data.success || !data.recommendation) {
        throw new Error('Invalid workout response from backend');
      }
      
      const workout = data.recommendation;
      
      // Format structured response
      let response = `${freshnessNote}\n\n`;
      response += `# 🏋️ Today's Workout Recommendation\n`;
      response += `**Date**: ${date}\n\n`;
      
      // Recovery assessment
      if (workout.recovery_assessment) {
        response += `## Recovery Status: ${workout.recovery_assessment.status || 'Unknown'}\n`;
        response += `${workout.recovery_assessment.reasoning || ''}\n\n`;
      }
      
      // Recommended state
      if (workout.recommended_state) {
        response += `**Recommended Training State**: ${workout.recommended_state}\n\n`;
      }
      
      // Workout options (Plan A, B, C, D)
      response += `## Workout Options\n\n`;
      
      const plans = [
        { key: 'plan_a', label: '🔥 Plan A (Optimal)' },
        { key: 'plan_b', label: '⚡ Plan B (Moderate)' },
        { key: 'plan_c', label: '🌊 Plan C (Easy)' },
        { key: 'plan_d', label: '🛌 Plan D (Recovery)' }
      ];
      
      for (const {key, label} of plans) {
        const plan = workout[key];
        if (plan) {
          response += `### ${label}\n`;
          response += `**${plan.title || plan.sport}**\n`;
          response += `- Sport: ${plan.sport}\n`;
          response += `- Duration: ${plan.duration_min || 0} minutes\n`;
          response += `- Intensity: ${plan.intensity}\n`;
          if (plan.location) response += `- Location: ${plan.location}\n`;
          if (plan.rationale) response += `- Rationale: ${plan.rationale}\n`;
          response += `\n`;
        }
      }
      
      // Coaching notes
      if (workout.coach_message) {
        response += `## 💡 Coach's Notes\n${workout.coach_message}\n`;
      }
      
      return {
        content: [{ type: "text", text: response }],
        _structured: workout // Include raw structure for programmatic access
      };
      
    } catch (error) {
      // Fallback: provide basic error message
      return {
        content: [{ 
          type: "text", 
          text: `${freshnessNote}\n\n⚠️ **Unable to generate workout**: ${error.message}\n\nPlease try:\n- Ensure Garmin data is synced\n- Check LLM service availability\n- Use get_workout_recommendations for basic recommendations` 
        }]
      };
    }
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
    
    try {
      // Call LLM generation endpoint for structured weekly plan
      const data = await callAPI(
        `/api/recommend/week?profile_id=${encodeURIComponent(profile_id)}&week_start=${encodeURIComponent(week_start)}`
      );
      
      if (!data.success || !data.plan) {
        throw new Error('Invalid weekly plan response from backend');
      }
      
      const plan = data.plan;
      
      // Format structured response
      let response = `${freshnessNote}\n\n`;
      response += `# 📅 Weekly Training Plan\n`;
      response += `**Week Starting**: ${week_start}\n`;
      
      if (data.is_fallback) {
        response += `⚠️ *Using fallback plan - LLM unavailable*\n`;
      }
      response += `\n`;
      
      // Week summary
      if (plan.week_summary) {
        response += `## Week Overview\n`;
        response += `**Phase**: ${plan.week_summary.phase || 'Maintenance'}\n`;
        response += `**Theme**: ${plan.week_summary.overall_theme || 'N/A'}\n`;
        if (plan.week_summary.total_volume) {
          response += `**Total Volume**: ${plan.week_summary.total_volume} minutes\n`;
        }
        response += `\n`;
      }
      
      // Daily workouts
      if (plan.days && Array.isArray(plan.days)) {
        response += `## Daily Breakdown\n\n`;
        
        plan.days.forEach((day, index) => {
          const workout = day.primary_workout || {};
          const dayNum = index + 1;
          
          response += `### ${day.day_name || `Day ${dayNum}`} (${day.date || ''})\n`;
          
          if (workout.sport === 'rest' || workout.intensity === 'rest') {
            response += `🛌 **Rest Day**\n`;
          } else {
            response += `**${workout.title || workout.sport || 'Workout'}**\n`;
            response += `- Sport: ${workout.sport || 'N/A'}\n`;
            response += `- Duration: ${workout.duration_min || 0} minutes\n`;
            response += `- Intensity: ${workout.intensity || 'N/A'}\n`;
            if (workout.focus) response += `- Focus: ${workout.focus}\n`;
          }
          
          if (day.rationale) {
            response += `📝 *${day.rationale}*\n`;
          }
          
          response += `\n`;
        });
      }
      
      // Coach message
      if (plan.coach_message) {
        response += `## 💡 Coach's Notes\n${plan.coach_message}\n`;
      }
      
      // Volume comparison
      if (plan.volume_comparison) {
        response += `\n## 📊 Volume Analysis\n`;
        const vc = plan.volume_comparison;
        if (vc.previous_week) response += `Previous week: ${vc.previous_week} min\n`;
        if (vc.this_week) response += `This week: ${vc.this_week} min\n`;
        if (vc.change_pct) response += `Change: ${vc.change_pct > 0 ? '+' : ''}${vc.change_pct}%\n`;
      }
      
      return {
        content: [{ type: "text", text: response }],
        _structured: plan // Include raw structure for programmatic access
      };
      
    } catch (error) {
      // Fallback: provide basic error message
      return {
        content: [{ 
          type: "text", 
          text: `${freshnessNote}\n\n⚠️ **Unable to generate weekly plan**: ${error.message}\n\nPlease try:\n- Ensure Garmin data is synced\n- Check LLM service availability\n- Use get_weekly_workout_plan for rule-based planning` 
        }]
      };
    }
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
        (activityCtx.days_since_last > 7
          ? `⚠️  **SYNC RECOMMENDED** - No activities in ${activityCtx.days_since_last} days. Recommendations based on metrics only.\n\n`
          : activityCtx.days_since_last > 2
            ? `📅 Last activity was ${activityCtx.days_since_last} days ago (${activityCtx.latest_activity_date}) — recommendations incorporate recent history.\n\n`
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
