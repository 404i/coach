/**
 * Activity Verification Service
 * 
 * CRITICAL: Prevents hallucinations by verifying all activity claims against database
 * 
 * Rules:
 * 1. NEVER reference activities without verification
 * 2. ALWAYS show actual data date 
 * 3. Acknowledge data gaps
 * 4. Database truth > Conversation memory ALWAYS
 */

import { subDays, format, differenceInDays } from 'date-fns';
import logger from '../utils/logger.js';
import db from '../db/index.js';
import { mapAppActivityToGarminSchema } from '../utils/activity-schema-mapper.js';

/**
 * Get the most recent activity from database
 */
export async function getMostRecentActivity(email) {
  try {
    // Get user ID - activities table uses user.id as profile_id, not athlete_profile.id
    const user = await db('users').where('garmin_email', email).first();
    if (!user) {
      return {
        exists: false,
        message: "User not found",
        warning: "⚠️  User not found in database"
      };
    }
    
    const activity = await db('activities')
      .where({ user_id: user.id })
      .orderBy('start_time', 'desc')
      .first();
    
    if (!activity) {
      return {
        exists: false,
        message: "No activities found in database",
        warning: "⚠️  Garmin sync may be needed"
      };
    }
    
    // Map to legacy schema for backward compatibility
    const mapped = mapAppActivityToGarminSchema(activity);
    
    const activityDate = new Date(activity.date);
    const now = new Date();
    const daysSince = differenceInDays(now, activityDate);
    
    // Format time from timestamp
    const startTime = new Date(activity.start_time);
    const timeStr = startTime.toTimeString().split(' ')[0]; // HH:MM:SS
    
    return {
      exists: true,
      activity: {
        date: activity.date,
        time: timeStr,
        sport: mapped.sport,
        sub_sport: mapped.sub_sport,
        name: mapped.name,
        distance: activity.distance,
        calories: activity.calories,
        elapsed_time: activity.duration
      },
      days_since: daysSince,
      is_recent: daysSince <= 1,
      is_stale: daysSince > 2,
      warning: daysSince > 2 ? `⚠️  Last activity was ${daysSince} days ago. Sync may be needed.` : null
    };
  } catch (error) {
    logger.error('Error getting most recent activity:', error);
    return {
      exists: false,
      error: error.message,
      warning: "⚠️  Could not access activities database"
    };
  }
}

/**
 * Get recent activities within a date range
 */
export async function getRecentActivities(email, days = 7) {
  try {
    // Get user ID - activities table uses user.id as profile_id
    const user = await db('users').where('garmin_email', email).first();
    if (!user) {
      return {
        activities: [],
        count: 0,
        error: 'User not found'
      };
    }
    
    const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
    const endDate = format(new Date(), 'yyyy-MM-dd');
    
    const activities = await db('activities')
      .where({ user_id: user.id })
      .where('date', '>=', startDate)
      .orderBy('start_time', 'desc');
    
    // Map activities to legacy schema and format
    const mapped = activities.map(activity => {
      const mappedActivity = mapAppActivityToGarminSchema(activity);
      const startTime = new Date(activity.start_time);
      const timeStr = startTime.toTimeString().split(' ')[0];
      
      return {
        date: activity.date,
        time: timeStr,
        sport: mappedActivity.sport,
        sub_sport: mappedActivity.sub_sport,
        name: mappedActivity.name,
        distance: activity.distance,
        calories: activity.calories,
        elapsed_time: activity.duration
      };
    });
    
    let latestDate = null;
    let daysSinceLast = null;
    
    if (mapped.length > 0) {
      latestDate = mapped[0].date;
      const latestActivityDate = new Date(latestDate);
      daysSinceLast = differenceInDays(new Date(), latestActivityDate);
    }
    
    return {
      activities: mapped,
      count: mapped.length,
      date_range: {
        start: startDate,
        end: endDate,
        days: days
      },
      latest_activity_date: latestDate,
      days_since_last: daysSinceLast,
      is_stale: daysSinceLast !== null && daysSinceLast > 2,
      warning: daysSinceLast !== null && daysSinceLast > 2 
        ? `⚠️  No activities in last ${daysSinceLast} days` 
        : null
    };
  } catch (error) {
    logger.error('Error getting recent activities:', error);
    return {
      activities: [],
      count: 0,
      error: error.message
    };
  }
}

/**
 * Verify if a specific activity type exists in date range
 */
export async function verifyActivityExists(email, activityType, dateRange) {
  try {
    // Get user ID - activities table uses user.id as profile_id
    const user = await db('users').where('garmin_email', email).first();
    if (!user) {
      return {
        exists: false,
        error: 'User not found',
        activities: [],
        count: 0
      };
    }
    
    const searchPattern = `%${activityType}%`;
    
    const activities = await db('activities')
      .where({ user_id: user.id })
      .whereBetween('date', [dateRange.start, dateRange.end])
      .where(function() {
        this.where('sport_type', 'like', searchPattern)
          .orWhere('activity_type', 'like', searchPattern)
          .orWhere('activity_name', 'like', searchPattern);
      })
      .orderBy('start_time', 'desc');
    
    // Map to legacy schema
    const mapped = activities.map(activity => {
      const mappedActivity = mapAppActivityToGarminSchema(activity);
      return {
        date: activity.date,
        sport: mappedActivity.sport,
        sub_sport: mappedActivity.sub_sport,
        name: mappedActivity.name,
        distance: activity.distance,
        calories: activity.calories
      };
    });
    
    return {
      exists: mapped.length > 0,
      activities: mapped,
      count: mapped.length,
      date_range: dateRange,
      verified_at: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Error verifying activity:', error);
    return {
      exists: false,
      error: error.message,
      activities: [],
      count: 0
    };
  }
}

/**
 * Get activity context for all responses
 * This should be included in every response that references activities
 */
export async function getActivityContext(email) {
  try {
    const latest = await getMostRecentActivity(email);
    const recent = await getRecentActivities(email, 7);
    
    return {
      latest_activity_date: latest.activity?.date || null,
      days_since_last: latest.days_since || null,
      recent_count: recent.count,
      is_stale: latest.is_stale || false,
      warning: latest.warning || null,
      sync_status: latest.exists ? 'ok' : 'needs_sync'
    };
  } catch (error) {
    logger.error('Error getting activity context:', error);
    return {
      latest_activity_date: null,
      days_since_last: null,
      recent_count: 0,
      is_stale: true,
      warning: "⚠️  Could not check activity status",
      sync_status: 'error'
    };
  }
}

/**
 * Verify activity claim before returning response
 * Use this in all tools/services that reference specific activities
 */
export async function verifyActivityClaim(email, claim) {
  // Extract activity type and date from claim
  // claim format: { type: 'climbing', date: '2026-02-18', timeframe: 'yesterday' }
  
  const { type, date, timeframe } = claim;
  
  let dateRange;
  if (date) {
    dateRange = { start: date, end: date };
  } else if (timeframe === 'yesterday') {
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    dateRange = { start: yesterday, end: yesterday };
  } else if (timeframe === 'today') {
    const today = format(new Date(), 'yyyy-MM-dd');
    dateRange = { start: today, end: today };
  } else if (timeframe === 'last_night') {
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    dateRange = { start: yesterday, end: yesterday };
  } else {
    // Default: last 7 days
    const start = format(subDays(new Date(), 7), 'yyyy-MM-dd');
    const end = format(new Date(), 'yyyy-MM-dd');
    dateRange = { start, end };
  }
  
  const result = await verifyActivityExists(email, type, dateRange);
  
  if (!result.exists) {
    // Activity not found - return correction
    const latest = await getMostRecentActivity(email);
    return {
      verified: false,
      message: `I don't see a ${type} activity recorded for ${timeframe || dateRange.start}. ` +
               `Latest activity: ${latest.activity?.sport || 'none'} on ${latest.activity?.date || 'unknown'} ` +
               `(${latest.days_since || '?'} days ago).`,
      correction: {
        claimed_activity: type,
        claimed_timeframe: timeframe || dateRange.start,
        actual_latest: latest.activity?.sport || null,
        actual_date: latest.activity?.date || null,
        days_since: latest.days_since || null
      }
    };
  }
  
  return {
    verified: true,
    activities: result.activities,
    message: `Verified: ${result.count} ${type} activity(ies) in timeframe`
  };
}

export default {
  getMostRecentActivity,
  getRecentActivities,
  verifyActivityExists,
  getActivityContext,
  verifyActivityClaim
};
