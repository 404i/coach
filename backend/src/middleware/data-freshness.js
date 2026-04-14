/**
 * Data Freshness Middleware
 * 
 * Adds data context to all API responses showing:
 * - Data date
 * - Data age in hours
 * - Whether data is current
 * - Warnings if data is stale
 */

import db from '../db/index.js';
import { differenceInHours, format } from 'date-fns';
import logger from '../utils/logger.js';

/**
 * Get the latest data date and sync timestamp for a given email
 */
async function getLatestDataDate(email) {
  try {
    const user = await db('users').where('garmin_email', email).first();
    if (!user) {
      return { date: null, syncTimestamp: null };
    }

    // Get latest metrics date (daily_metrics uses user_id, not profile_id)
    const latest = await db('daily_metrics')
      .where('user_id', user.id)
      .orderBy('date', 'desc')
      .first();

    return { 
      date: latest ? latest.date : null,
      syncTimestamp: user.last_successful_sync || null
    };
  } catch (error) {
    logger.error('Error getting latest data date:', error);
    return { date: null, syncTimestamp: null };
  }
}

/**
 * Get the latest activity date for a given email
 */
async function getLatestActivityDate(email) {
  try {
    const user = await db('users').where('garmin_email', email).first();
    if (!user) return null;

    // Get latest activity date (activities uses user_id, not profile_id)
    const latest = await db('activities')
      .where('user_id', user.id)
      .orderBy('date', 'desc')
      .first();

    return latest ? latest.date : null;
  } catch (error) {
    logger.error('Error getting latest activity date:', error);
    return null;
  }
}

/**
 * Create data context object
 */
export function createDataContext(dataDate, activityDate = null, systemDate = null, syncTimestamp = null) {
  const now = new Date();
  const currentDate = systemDate ? new Date(systemDate) : now;
  const currentDateStr = format(currentDate, 'yyyy-MM-dd');
  
  // ── Check Recent Sync First ─────────────────────────────────────────────
  // If sync completed within last 5 minutes, data is fresh (avoids race condition)
  if (syncTimestamp) {
    const syncDate = new Date(syncTimestamp);
    const syncAgeMinutes = differenceInHours(now, syncDate) * 60;
    
    if (syncAgeMinutes < 5) {
      // Recent sync completed - trust it's fresh even if data timestamps lag
      return {
        data_date: dataDate,
        activity_date: activityDate,
        system_date: currentDateStr,
        data_age_hours: dataDate ? differenceInHours(now, new Date(dataDate)) : null,
        activity_age_hours: activityDate ? differenceInHours(now, new Date(activityDate)) : null,
        is_current: true,
        activity_data_stale: false,
        needs_sync: false,
        last_sync: format(syncDate, 'yyyy-MM-dd HH:mm:ss'),
        sync_age_minutes: Math.floor(syncAgeMinutes),
        timezone: process.env.TZ || 'UTC',
        warning: null,
        activity_warning: null
      };
    }
  }
  
  // ── Fall Back to Data Age Calculation ───────────────────────────────────
  
  if (!dataDate) {
    return {
      data_date: null,
      system_date: currentDateStr,
      data_age_hours: null,
      is_current: false,
      timezone: process.env.TZ || 'UTC',
      warning: '⚠️  No data available'
    };
  }
  
  const dataDateTime = new Date(dataDate);
  const ageHours = differenceInHours(now, dataDateTime);
  
  let warning = null;
  let needs_sync = false;
  if (ageHours >= 48) {
    warning = `⚠️  Data is ${Math.floor(ageHours / 24)} days old`;
    needs_sync = true;
  } else if (ageHours >= 24) {
    warning = '⚠️  Data is 1 day old';
    needs_sync = true;
  } else if (ageHours >= 2) {
    warning = `⚠️  Data is ${ageHours} hours old — consider syncing`;
    needs_sync = true;
  }
  
  // Activity data freshness
  let activityWarning = null;
  let activityAgeHours = null;
  let activityDataStale = true;
  if (activityDate) {
    activityAgeHours = differenceInHours(now, new Date(activityDate));
    activityDataStale = activityAgeHours >= 48;
    if (activityDataStale) {
      activityWarning = `⚠️  Activity data is ${Math.floor(activityAgeHours / 24)} days old — training load calculations may be unreliable`;
    }
  } else {
    activityWarning = '⚠️  No activity data available — training load calculations will use defaults';
  }

  return {
    data_date: dataDate,
    activity_date: activityDate,
    system_date: currentDateStr,
    data_age_hours: ageHours,
    activity_age_hours: activityAgeHours,
    is_current: ageHours < 2,
    activity_data_stale: activityDataStale,
    needs_sync,
    timezone: process.env.TZ || 'UTC',
    warning,
    activity_warning: activityWarning
  };
}

/**
 * Middleware to add data context to responses
 * Usage: router.get('/endpoint', addDataContext, async (req, res) => {...})
 */
export async function addDataContext(req, res, next) {
  try {
    const email = req.query.email || req.body?.email;
    
    if (!email) {
      // No email provided, skip data context
      return next();
    }
    
    const [latestData, latestActivityDate] = await Promise.all([
      getLatestDataDate(email),
      getLatestActivityDate(email)
    ]);
    const context = createDataContext(
      latestData.date, 
      latestActivityDate, 
      null, 
      latestData.syncTimestamp
    );
    
    // Attach to request for use in route handlers
    req.dataContext = context;
    
    // Also attach helper function to add context to response
    req.addDataContext = (data) => {
      return {
        data_context: context,
        ...data
      };
    };
    
    next();
  } catch (error) {
    logger.error('Error in data context middleware:', error);
    // Don't block request on middleware error
    next();
  }
}

/**
 * Helper function to add data context to any response
 * Can be used in services/controllers
 */
export async function addDataContextToResponse(email, responseData) {
  try {
    const [latestData, latestActivityDate] = await Promise.all([
      getLatestDataDate(email),
      getLatestActivityDate(email)
    ]);
    const context = createDataContext(
      latestData.date, 
      latestActivityDate, 
      null, 
      latestData.syncTimestamp
    );
    
    return {
      data_context: context,
      ...responseData
    };
  } catch (error) {
    logger.error('Error adding data context:', error);
    return responseData; // Return original data on error
  }
}

/**
 * Helper function to add data context using profile_id instead of email
 * Useful for services that work with profile_id
 */
export async function addDataContextToResponseByProfileId(profileId, responseData) {
  try {
    // Get email from profile_id
    const profile = await db('athlete_profiles').where('id', profileId).first();
    if (!profile) {
      logger.warn(`Profile not found for id ${profileId}`);
      return responseData;
    }

    const user = await db('users').where('id', profile.user_id).first();
    if (!user || !user.garmin_email) {
      logger.warn(`User or email not found for profile ${profileId}`);
      return responseData;
    }

    // Use existing helper with email
    return await addDataContextToResponse(user.garmin_email, responseData);
  } catch (error) {
    logger.error('Error adding data context by profile id:', error);
    return responseData; // Return original data on error
  }
}

/**
 * Check if data exists for a specific date
 */
export async function checkDateExists(email, date) {
  try {
    const user = await db('users').where('garmin_email', email).first();
    if (!user) return false;

    const profile = await db('athlete_profiles').where('user_id', user.id).first();
    if (!profile) return false;

    const exists = await db('daily_metrics')
      .where('profile_id', profile.id)
      .where('date', date)
      .first();

    return !!exists;
  } catch (error) {
    logger.error('Error checking date exists:', error);
    return false;
  }
}

export default {
  createDataContext,
  addDataContext,
  addDataContextToResponse,
  getLatestDataDate,
  checkDateExists
};
