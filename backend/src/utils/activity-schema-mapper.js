/**
 * Activity Schema Mapper
 * 
 * Maps between app database schema and legacy GarminDB schema for backward compatibility.
 * This allows analytics services to migrate off the legacy GarminDB SQLite file
 * while maintaining compatible data structures.
 */

/**
 * Garmin Sport Type ID to Human-Readable Name Mapping
 * Source: Garmin Connect API, GarminDB schema
 */
const GARMIN_SPORT_TYPE_MAP = {
  0: 'generic',
  1: 'running',
  2: 'cycling',
  4: 'transition',
  5: 'fitness_equipment',
  6: 'swimming',
  8: 'basketball',
  9: 'soccer',
  10: 'tennis',
  11: 'american_football',
  13: 'training',
  15: 'walking',
  17: 'hiking',
  19: 'rowing',
  20: 'mountaineering',
  21: 'indoor_cycling',
  22: 'track_cycling',
  25: 'yoga',
  26: 'strength_training',
  27: 'warm_up',
  28: 'match',
  29: 'exercise',
  30: 'climbing',
  31: 'multi_sport',
  // Add more as discovered in data
};

/**
 * Map Garmin sport_type_id (integer) to human-readable name
 * @param {string|number} sportTypeId - Numeric sport type ID from Garmin
 * @returns {string} Human-readable sport name
 */
function mapSportTypeId(sportTypeId) {
  if (!sportTypeId) return 'other';
  const id = parseInt(sportTypeId);
  return GARMIN_SPORT_TYPE_MAP[id] || `unknown_${id}`;
}

/**
 * Map app database activity to legacy GarminDB schema
 * 
 * App DB fields → Legacy GarminDB fields:
 * - activity_name → name
 * - activity_type → sub_sport (specific activity type like "yoga", "running")
 * - sport_type → sport (general category like "training", "running")
 * - start_time → start_time
 * - duration → elapsed_time
 * - distance, calories, training_load → same
 * 
 * @param {Object} appActivity - Activity from app database (db('activities'))
 * @returns {Object} Activity in legacy GarminDB schema
 */
export function mapAppActivityToGarminSchema(appActivity) {
  if (!appActivity) return null;
  
  return {
    // Core fields
    name: appActivity.activity_name,
    sub_sport: appActivity.activity_type || null,
    sport: mapSportTypeId(appActivity.sport_type),
    start_time: appActivity.start_time,
    
    // Metrics
    distance: appActivity.distance,
    calories: appActivity.calories,
    elapsed_time: appActivity.duration, // app DB uses 'duration', legacy uses 'elapsed_time'
    
    // Training metrics
    training_load: appActivity.training_load,
    avg_hr: appActivity.avg_hr,
    max_hr: appActivity.max_hr,
    avg_speed: appActivity.avg_speed,
    max_speed: appActivity.max_speed,
    
    // Elevation
    elevation_gain: appActivity.elevation_gain,
    elevation_loss: appActivity.elevation_loss,
    
    // Effects
    aerobic_effect: appActivity.aerobic_effect,
    anaerobic_effect: appActivity.anaerobic_effect,
    
    // Moving time (app DB specific)
    moving_duration: appActivity.moving_duration,
    
    // Timestamps
    date: appActivity.date,
    
    // Raw data (for fallback/debugging)
    raw_data: appActivity.raw_activity_data
  };
}

/**
 * Map array of app activities to legacy schema
 */
export function mapAppActivitiesToGarminSchema(appActivities) {
  if (!Array.isArray(appActivities)) return [];
  return appActivities.map(mapAppActivityToGarminSchema);
}

/**
 * Format elapsed time from seconds to HH:MM:SS (for display compatibility)
 */
export function formatElapsedTime(seconds) {
  if (!seconds) return '00:00:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Parse elapsed time from HH:MM:SS or seconds to seconds
 */
export function parseElapsedTime(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  
  const parts = String(value).split(':');
  if (parts.length === 3) {
    const hours = parseInt(parts[0]) || 0;
    const minutes = parseInt(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }
  
  return parseFloat(value) || 0;
}

/**
 * Export the sport type mapper for use in other services
 */
export { mapSportTypeId };
