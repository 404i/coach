import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from '../utils/logger.js';
import db from '../db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GARTH_SCRIPT = join(__dirname, 'garth-wrapper.py');
const PYTHON_PATH = process.env.PYTHON_PATH || join(__dirname, '../../../.venv/bin/python');

/**
 * Execute garth Python script and return parsed result
 */
function executeGarth(command, args = {}) {
  return new Promise((resolve, reject) => {
    const pythonArgs = [GARTH_SCRIPT, command];
    
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined && value !== null) {
        pythonArgs.push(`--${key}`, String(value));
      }
    }
    
    const process = spawn(PYTHON_PATH, pythonArgs);
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      if (code !== 0) {
        try {
          const error = JSON.parse(stderr);
          reject(new Error(error.error || 'Garth command failed'));
        } catch {
          reject(new Error(stderr || 'Unknown garth error'));
        }
        return;
      }
      
      try {
        const result = JSON.parse(stdout);
        if (result.success) {
          resolve(result.data);
        } else {
          reject(new Error(result.error || 'Garth command failed'));
        }
      } catch (error) {
        reject(new Error(`Failed to parse garth response: ${error.message}`));
      }
    });
    
    process.on('error', (error) => {
      reject(new Error(`Failed to spawn garth process: ${error.message}`));
    });
  });
}

/**
 * Authenticate with Garmin Connect
 */
export async function loginGarmin(email, password) {
  try {
    logger.info(`Attempting Garmin login for ${email}`);
    const result = await executeGarth('login', { email, password });
    
    // Check if MFA is required
    if (result.mfa_required) {
      logger.info(`MFA required for ${email}`);
      return { mfa_required: true, email: result.email, message: result.message };
    }
    
    // Store session in database
    await db('users')
      .insert({
        garmin_email: email,
        garth_session: JSON.stringify(result.session),
        updated_at: db.fn.now()
      })
      .onConflict('garmin_email')
      .merge(['garth_session', 'updated_at']);
    
    logger.info(`Garmin login successful for ${email}`);
    return { success: true, username: result.username };
  } catch (error) {
    logger.error('Garmin login failed:', error);
    throw error;
  }
}

/**
 * Submit MFA code to complete authentication
 */
export async function submitMFA(email, password, mfaCode) {
  try {
    logger.info(`Submitting MFA code for ${email}`);
    const result = await executeGarth('mfa', { 
      email, 
      password, 
      'mfa-code': mfaCode 
    });
    
    // Store session in database
    await db('users')
      .insert({
        garmin_email: email,
        garth_session: JSON.stringify(result.session),
        updated_at: db.fn.now()
      })
      .onConflict('garmin_email')
      .merge(['garth_session', 'updated_at']);
    
    logger.info(`MFA authentication successful for ${email}`);
    return { success: true, username: result.username };
  } catch (error) {
    logger.error('MFA authentication failed:', error);
    throw error;
  }
}

/**
 * Get stored Garmin session for user
 */
async function getSession(email) {
  const user = await db('users')
    .where({ garmin_email: email })
    .first();
  
  if (!user || !user.garth_session) {
    throw new Error('No Garmin session found. Please login first.');
  }
  
  return JSON.parse(user.garth_session);
}

/**
 * Validate session is still active
 */
export async function validateSession(email) {
  try {
    const session = await getSession(email);
    await executeGarth('resume', { session });
    return { valid: true };
  } catch (error) {
    logger.warn(`Session validation failed for ${email}:`, error);
    return { valid: false, error: error.message };
  }
}

/**
 * Sync data for date range
 */
export async function syncDateRange(email, startDate, endDate) {
  try {
    const session = await getSession(email);
    logger.info(`Syncing Garmin data for ${email} from ${startDate} to ${endDate}`);
    
    const data = await executeGarth('sync', {
      session,
      'start-date': startDate,
      'end-date': endDate
    });
    
    // Log any API errors that occurred during sync
    if (data.errors && data.errors.length > 0) {
      logger.warn(`Garmin API errors during sync for ${email}:`);
      data.errors.forEach(err => logger.warn(`  - ${err}`));
    }
    
    // Get user profile_id
    const user = await db('users').where('garmin_email', email).first();
    if (!user) {
      throw new Error(`User not found: ${email}`);
    }
    
    // Pre-fetch all activities for every date in one query to avoid N+1
    const allSyncDates = Object.keys(data.dates);
    const allActivities = allSyncDates.length > 0
      ? await db('activities')
          .where('profile_id', user.id)
          .whereRaw(
            `DATE(date) IN (${allSyncDates.map(() => '?').join(',')})`,
            allSyncDates
          )
          .select('date', 'training_load')
      : [];
    const activitiesByDate = {};
    for (const act of allActivities) {
      const d = String(act.date).slice(0, 10);
      (activitiesByDate[d] = activitiesByDate[d] || []).push(act);
    }

    // Store metrics in database
    for (const [date, metrics] of Object.entries(data.dates)) {
      logger.info(`Processing date ${date}. Metrics keys: ${Object.keys(metrics).join(', ')}`);

      // Extract key metrics from Garmin API response structure
      // Sleep data is nested in dailySleepDTO
      const sleepDto = metrics.sleep?.dailySleepDTO;

      // Calculate training load from activities for this date (pre-fetched above)
      const activitiesForDate = activitiesByDate[date] || [];

      const dailyTrainingLoad = activitiesForDate.reduce((sum, act) => {
        return sum + (act.training_load || 0);
      }, 0);
      
      const metricsData = {
        sleep_score: sleepDto?.sleepScores?.overall?.value || null,
        sleep_hours: sleepDto?.sleepTimeSeconds ? sleepDto.sleepTimeSeconds / 3600 : null,
        hrv: metrics.sleep?.avgOvernightHrv || null,
        rhr: metrics.sleep?.restingHeartRate || null,
        stress_avg: metrics.summary?.avgStressLevel || null,
        body_battery_start: sleepDto?.bodyBatteryChange ? (100 - sleepDto.bodyBatteryChange) : null,
        body_battery_charged: metrics.summary?.bodyBatteryChargedValue || 0,
        body_battery_drained: metrics.summary?.bodyBatteryDrainedValue || null,
        training_load: metrics.training_readiness?.acute_load || (dailyTrainingLoad > 0 ? dailyTrainingLoad : null),
        recovery_score: metrics.training_readiness?.score || null,
        recovery_time: metrics.training_readiness?.recovery_time || null,
        // Training readiness factor breakdown
        hrv_factor_percent: metrics.training_readiness?.hrv_factor_percent || null,
        sleep_factor_percent: metrics.training_readiness?.sleep_score_factor_percent || null,
        stress_factor_percent: metrics.training_readiness?.stress_history_factor_percent || null,
        recovery_time_factor_percent: metrics.training_readiness?.recovery_time_factor_percent || null,
        readiness_feedback: metrics.training_readiness?.feedback_short || null
      };
      
      const dailyMetric = {
        profile_id: user.id,
        date,
        metrics_data: JSON.stringify(metricsData),
        raw_garth_data: JSON.stringify(metrics),
        synced_at: db.fn.now(),
        updated_at: db.fn.now()
      };
      
      await db('daily_metrics')
        .insert(dailyMetric)
        .onConflict(['profile_id', 'date'])
        .merge(['metrics_data', 'raw_garth_data', 'synced_at', 'updated_at']);
    }
    
    // Process activities (returned at top level, not per-date)
    if (data.activities) {
      logger.info(`Processing activities: type=${typeof data.activities}, isArray=${Array.isArray(data.activities)}`);
      
      let activityList = [];
      
      // Handle different activity response formats
      if (Array.isArray(data.activities)) {
        activityList = data.activities;
      } else if (data.activities.activities && Array.isArray(data.activities.activities)) {
        // Garmin API returns { activities: [...], totalFound: N }
        activityList = data.activities.activities;
      }
      
      logger.info(`Found ${activityList.length} activities to import`);
      
      for (const activity of activityList) {
        try {
          // Extract date from activity
          const activityDate = activity.startTimeLocal 
            ? activity.startTimeLocal.split('T')[0] 
            : (activity.startTimeGMT ? activity.startTimeGMT.split('T')[0] : null);
          
          if (!activityDate) {
            logger.warn(`Activity ${activity.activityId} has no date, skipping`);
            continue;
          }
          
          logger.info(`Inserting activity: ${activity.activityId} - ${activity.activityName} on ${activityDate}`);
          
          const activityData = {
            profile_id: user.id,
            activity_id: String(activity.activityId),
            activity_name: activity.activityName,
            activity_type: activity.activityType?.typeKey || null,
            sport_type: String(activity.sportTypeId || ''),
            date: activityDate,
            start_time: activity.startTimeGMT ? new Date(activity.startTimeGMT) : null,
            distance: activity.distance || null,
            duration: activity.duration || null,
            moving_duration: activity.movingDuration || null,
            elevation_gain: activity.elevationGain || null,
            elevation_loss: activity.elevationLoss || null,
            avg_speed: activity.averageSpeed || null,
            max_speed: activity.maxSpeed || null,
            avg_hr: activity.averageHR || null,
            max_hr: activity.maxHR || null,
            calories: activity.calories || null,
            training_load: activity.activityTrainingLoad || null,
            aerobic_effect: activity.aerobicTrainingEffect || null,
            anaerobic_effect: activity.anaerobicTrainingEffect || null,
            raw_activity_data: JSON.stringify(activity),
            synced_at: db.fn.now(),
            updated_at: db.fn.now()
          };
          
          await db('activities')
            .insert(activityData)
            .onConflict('activity_id')
            .merge(['activity_name', 'distance', 'duration', 'moving_duration', 'elevation_gain', 'elevation_loss',
                    'avg_speed', 'max_speed', 'avg_hr', 'max_hr', 'calories', 'training_load', 
                    'aerobic_effect', 'anaerobic_effect', 'raw_activity_data', 'synced_at', 'updated_at']);
          
          logger.info(`✓ Inserted activity ${activity.activityId}`);
        } catch (actError) {
          logger.error(`Failed to insert activity ${activity.activityId}:`, actError);
        }
      }
    } else {
      logger.info('No activities in sync response');
    }

    
    logger.info(`Successfully synced and stored ${Object.keys(data.dates).length} days of data`);
    
    // Return only a summary instead of full raw data (avoids 1MB response issues)
    const summary = {
      success: true,
      dates_synced: Object.keys(data.dates).length,
      date_range: {
        start: startDate,
        end: endDate
      },
      dates: Object.keys(data.dates),
      activities_count: data.activities ? 
        (Array.isArray(data.activities) ? data.activities.length : 
         (data.activities.activities ? data.activities.activities.length : 0)) : 0,
      errors: data.errors || []
    };
    
    return summary;
  } catch (error) {
    logger.error('Garmin sync failed:', error);
    throw error;
  }
}

/**
 * Get sleep data for specific date
 */
export async function getSleepData(email, date) {
  const session = await getSession(email);
  return executeGarth('sleep', { session, date });
}

/**
 * Get resting heart rate for specific date
 */
export async function getRHRData(email, date) {
  const session = await getSession(email);
  return executeGarth('rhr', { session, date });
}

/**
 * Get recent activities
 */
export async function getActivities(email, startIndex = 0, limit = 20) {
  const session = await getSession(email);
  return executeGarth('activities', { session, 'start-index': startIndex, limit });
}

/**
 * Get daily summary (training readiness, stress, body battery)
 */
export async function getDailySummary(email, date) {
  const session = await getSession(email);
  return executeGarth('summary', { session, date });
}

/**
 * Schedule daily sync for all users
 */
export async function scheduleDailySync() {
  try {
    const users = await db('users').select('garmin_email');
    
    for (const user of users) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        
        await syncDateRange(user.garmin_email, yesterday, today);
        logger.info(`Daily sync completed for ${user.garmin_email}`);
      } catch (error) {
        logger.error(`Daily sync failed for ${user.garmin_email}:`, error);
      }
    }
  } catch (error) {
    logger.error('Scheduled daily sync failed:', error);
  }
}
