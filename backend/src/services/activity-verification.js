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

import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { subDays, format, differenceInDays } from 'date-fns';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to GarminDB activities database
const garminActivityDbPath = process.env.GARMIN_ACTIVITIES_DB || 
  join(__dirname, '../../../data/garmin/HealthData/DBs/garmin_activities.db');

/**
 * Get a promisified connection to GarminDB
 */
function getGarminDB() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(garminActivityDbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        logger.error('Failed to open GarminDB:', err);
        reject(err);
      } else {
        resolve(db);
      }
    });
  });
}

/**
 * Promisify database operations
 */
function dbAll(db, query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function dbGet(db, query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Get the most recent activity from database
 */
export async function getMostRecentActivity(email) {
  let db;
  try {
    db = await getGarminDB();
    
    const query = `
      SELECT 
        date(start_time) as date,
        time(start_time) as time,
        sport,
        sub_sport,
        name,
        distance,
        calories,
        elapsed_time
      FROM activities
      ORDER BY start_time DESC
      LIMIT 1
    `;
    
    const activity = await dbGet(db, query);
    
    if (!activity) {
      return {
        exists: false,
        message: "No activities found in database",
        warning: "⚠️  GarminDB may need re-authentication"
      };
    }
    
    const activityDate = new Date(activity.date);
    const now = new Date();
    const daysSince = differenceInDays(now, activityDate);
    
    return {
      exists: true,
      activity: {
        date: activity.date,
        time: activity.time,
        sport: activity.sport,
        sub_sport: activity.sub_sport,
        name: activity.name,
        distance: activity.distance,
        calories: activity.calories,
        elapsed_time: activity.elapsed_time
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
      warning: "⚠️  Could not access GarminDB activities"
    };
  } finally {
    if (db) {
      db.close();
    }
  }
}

/**
 * Get recent activities within a date range
 */
export async function getRecentActivities(email, days = 7) {
  let db;
  try {
    db = await getGarminDB();
    
    const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
    const endDate = format(new Date(), 'yyyy-MM-dd');
    
    const query = `
      SELECT 
        date(start_time) as date,
        time(start_time) as time,
        sport,
        sub_sport,
        name,
        distance,
        calories,
        elapsed_time
      FROM activities
      WHERE date(start_time) >= date(?)
      ORDER BY start_time DESC
    `;
    
    const activities = await dbAll(db, query, [startDate]);
    
    let latestDate = null;
    let daysSinceLast = null;
    
    if (activities.length > 0) {
      latestDate = activities[0].date;
      const latestActivityDate = new Date(latestDate);
      daysSinceLast = differenceInDays(new Date(), latestActivityDate);
    }
    
    return {
      activities: activities,
      count: activities.length,
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
  } finally {
    if (db) {
      db.close();
    }
  }
}

/**
 * Verify if a specific activity type exists in date range
 */
export async function verifyActivityExists(email, activityType, dateRange) {
  let db;
  try {
    db = await getGarminDB();
    
    const query = `
      SELECT 
        date(start_time) as date,
        sport,
        sub_sport,
        name,
        distance,
        calories
      FROM activities
      WHERE date(start_time) BETWEEN date(?) AND date(?)
        AND (sport LIKE ? OR sub_sport LIKE ? OR name LIKE ?)
      ORDER BY start_time DESC
    `;
    
    const searchPattern = `%${activityType}%`;
    const activities = await dbAll(db, query, [
      dateRange.start,
      dateRange.end,
      searchPattern,
      searchPattern,
      searchPattern
    ]);
    
    return {
      exists: activities.length > 0,
      activities: activities,
      count: activities.length,
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
  } finally {
    if (db) {
      db.close();
    }
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
