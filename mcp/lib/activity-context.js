/**
 * Activity verification helpers — prevent LLM hallucinations about workouts.
 */
import { callAPI } from './api.js';

/**
 * Get activity context - checks latest activity and sync status.
 * CRITICAL: Call this before referencing any activities to prevent hallucinations.
 */
export async function getActivityContext(email) {
  try {
    return await callAPI(`/api/activity/context?email=${encodeURIComponent(email)}`);
  } catch {
    return {
      latest_activity_date: null,
      days_since_last: null,
      warning: '⚠️  Could not verify activity status',
      sync_status: 'error',
    };
  }
}

/** Get most recent activity with details. */
export async function getLatestActivity(email) {
  try {
    return await callAPI(`/api/activity/latest?email=${encodeURIComponent(email)}`);
  } catch {
    return { exists: false, warning: '⚠️  Could not retrieve latest activity' };
  }
}

/**
 * Add verification context to any response.
 * Use this to wrap responses with activity and data freshness context.
 */
export async function addVerificationContext(email, responseData) {
  const activityCtx = await getActivityContext(email);

  let contextNote = '';
  if (activityCtx.warning) {
    contextNote = `\n\n🚨 **ACTIVITY STATUS**: ${activityCtx.warning}`;
  }
  if (activityCtx.latest_activity_date) {
    contextNote += `\n📅 **Latest Activity**: ${activityCtx.latest_activity_date} (${activityCtx.days_since_last} days ago)`;
  }
  if (activityCtx.days_since_last > 2) {
    contextNote += `\n⚠️  **SYNC NEEDED**: No activities recorded in ${activityCtx.days_since_last} days. Garmin sync may be required.`;
  }

  return {
    activity_context: activityCtx,
    context_note: contextNote,
    data: responseData,
  };
}
