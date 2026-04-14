/**
 * Database Integrity Checks
 * 
 * Validates database integrity for zero-error-tolerance requirements:
 * - Foreign key constraints are enabled
 * - No orphaned records (referential integrity)
 * - No duplicate users
 * - No null values in critical fields
 * 
 * Run on server startup to fail fast if database is corrupted.
 */

import db from './index.js';
import logger from '../utils/logger.js';

/**
 * Check if SQLite foreign key enforcement is enabled
 */
export async function checkForeignKeysEnabled() {
  const result = await db.raw('PRAGMA foreign_keys');
  const enabled = result[0]?.foreign_keys === 1;
  
  if (!enabled) {
    throw new Error('CRITICAL: Foreign key constraints are NOT enabled. Database integrity cannot be guaranteed.');
  }
  
  logger.info('✓ Foreign key constraints enabled');
  return true;
}

/**
 * Check for orphaned activities (user_id not in users table)
 */
export async function checkOrphanedActivities() {
  const result = await db.raw(`
    SELECT COUNT(*) as count 
    FROM activities a 
    LEFT JOIN users u ON a.user_id = u.id 
    WHERE u.id IS NULL
  `);
  
  const count = result[0].count;
  
  if (count > 0) {
    throw new Error(`CRITICAL: Found ${count} orphaned activities with invalid user_id. Run data migration or restore from backup.`);
  }
  
  logger.info('✓ No orphaned activities');
  return true;
}

/**
 * Check for orphaned daily_metrics (user_id not in users table)
 */
export async function checkOrphanedDailyMetrics() {
  const result = await db.raw(`
    SELECT COUNT(*) as count 
    FROM daily_metrics dm 
    LEFT JOIN users u ON dm.user_id = u.id 
    WHERE u.id IS NULL
  `);
  
  const count = result[0].count;
  
  if (count > 0) {
    throw new Error(`CRITICAL: Found ${count} orphaned daily_metrics with invalid user_id. Run data migration or restore from backup.`);
  }
  
  logger.info('✓ No orphaned daily_metrics');
  return true;
}

/**
 * Check for orphaned athlete_profiles (user_id not in users table)
 */
export async function checkOrphanedAthleteProfiles() {
  const result = await db.raw(`
    SELECT COUNT(*) as count 
    FROM athlete_profiles ap 
    LEFT JOIN users u ON ap.user_id = u.id 
    WHERE u.id IS NULL
  `);
  
  const count = result[0].count;
  
  if (count > 0) {
    throw new Error(`CRITICAL: Found ${count} orphaned athlete_profiles with invalid user_id. Run data migration or restore from backup.`);
  }
  
  logger.info('✓ No orphaned athlete_profiles');
  return true;
}

/**
 * Check for duplicate user emails
 */
export async function checkDuplicateUsers() {
  const result = await db.raw(`
    SELECT garmin_email, COUNT(*) as count 
    FROM users 
    GROUP BY garmin_email 
    HAVING count > 1
  `);
  
  if (result.length > 0) {
    const duplicates = result.map(r => `${r.garmin_email} (${r.count} entries)`).join(', ');
    throw new Error(`CRITICAL: Duplicate user emails found: ${duplicates}. Run user consolidation script.`);
  }
  
  logger.info('✓ No duplicate users');
  return true;
}

/**
 * Check for null user_id values in activities
 */
export async function checkNullUserIdsInActivities() {
  const result = await db('activities')
    .whereNull('user_id')
    .count('* as count')
    .first();
  
  if (result.count > 0) {
    throw new Error(`CRITICAL: Found ${result.count} activities with NULL user_id. Data corruption detected.`);
  }
  
  logger.info('✓ No NULL user_id in activities');
  return true;
}

/**
 * Check for null user_id values in daily_metrics
 */
export async function checkNullUserIdsInDailyMetrics() {
  const result = await db('daily_metrics')
    .whereNull('user_id')
    .count('* as count')
    .first();
  
  if (result.count > 0) {
    throw new Error(`CRITICAL: Found ${result.count} daily_metrics with NULL user_id. Data corruption detected.`);
  }
  
  logger.info('✓ No NULL user_id in daily_metrics');
  return true;
}

/**
 * Get database statistics for health check endpoint
 */
export async function getDatabaseStats() {
  const userCount = await db('users').count('* as count').first();
  const activityCount = await db('activities').count('* as count').first();
  const metricsCount = await db('daily_metrics').count('* as count').first();
  const profileCount = await db('athlete_profiles').count('* as count').first();
  
  // Get most recent sync timestamp
  const lastSync = await db('activities')
    .whereNotNull('synced_at')
    .orderBy('synced_at', 'desc')
    .select('synced_at')
    .first();
  
  return {
    user_count: userCount.count,
    activity_count: activityCount.count,
    daily_metrics_count: metricsCount.count,
    athlete_profile_count: profileCount.count,
    last_sync: lastSync?.synced_at || null
  };
}

/**
 * Run all integrity checks
 * Throws error on first failure (fail-fast)
 */
export async function runAllIntegrityChecks() {
  logger.info('=== Running Database Integrity Checks ===');
  
  try {
    await checkForeignKeysEnabled();
    await checkOrphanedActivities();
    await checkOrphanedDailyMetrics();
    await checkOrphanedAthleteProfiles();
    await checkDuplicateUsers();
    await checkNullUserIdsInActivities();
    await checkNullUserIdsInDailyMetrics();
    
    logger.info('=== All Database Integrity Checks Passed ===');
    return { success: true, checks_passed: 7 };
  } catch (error) {
    logger.error('=== Database Integrity Check FAILED ===');
    logger.error(error.message);
    throw error;
  }
}

/**
 * Run integrity checks and return results (non-throwing version for health endpoint)
 */
export async function getIntegrityCheckResults() {
  const results = {
    fk_enabled: false,
    orphaned_activities: 0,
    orphaned_daily_metrics: 0,
    orphaned_athlete_profiles: 0,
    duplicate_users: 0,
    null_user_ids_activities: 0,
    null_user_ids_daily_metrics: 0,
    all_passed: false
  };
  
  try {
    // Check foreign keys
    const fkResult = await db.raw('PRAGMA foreign_keys');
    results.fk_enabled = fkResult[0]?.foreign_keys === 1;
    
    // Check orphaned activities
    const orphanedActivities = await db.raw(`
      SELECT COUNT(*) as count 
      FROM activities a 
      LEFT JOIN users u ON a.user_id = u.id 
      WHERE u.id IS NULL
    `);
    results.orphaned_activities = orphanedActivities[0].count;
    
    // Check orphaned daily_metrics
    const orphanedMetrics = await db.raw(`
      SELECT COUNT(*) as count 
      FROM daily_metrics dm 
      LEFT JOIN users u ON dm.user_id = u.id 
      WHERE u.id IS NULL
    `);
    results.orphaned_daily_metrics = orphanedMetrics[0].count;
    
    // Check orphaned athlete_profiles
    const orphanedProfiles = await db.raw(`
      SELECT COUNT(*) as count 
      FROM athlete_profiles ap 
      LEFT JOIN users u ON ap.user_id = u.id 
      WHERE u.id IS NULL
    `);
    results.orphaned_athlete_profiles = orphanedProfiles[0].count;
    
    // Check duplicate users
    const duplicateUsers = await db.raw(`
      SELECT COUNT(*) as count
      FROM (
        SELECT garmin_email 
        FROM users 
        GROUP BY garmin_email 
        HAVING COUNT(*) > 1
      )
    `);
    results.duplicate_users = duplicateUsers[0].count;
    
    // Check null user_ids in activities
    const nullActivities = await db('activities').whereNull('user_id').count('* as count').first();
    results.null_user_ids_activities = nullActivities.count;
    
    // Check null user_ids in daily_metrics
    const nullMetrics = await db('daily_metrics').whereNull('user_id').count('* as count').first();
    results.null_user_ids_daily_metrics = nullMetrics.count;
    
    // All checks passed if all counts are 0 and FK enabled
    results.all_passed = results.fk_enabled &&
      results.orphaned_activities === 0 &&
      results.orphaned_daily_metrics === 0 &&
      results.orphaned_athlete_profiles === 0 &&
      results.duplicate_users === 0 &&
      results.null_user_ids_activities === 0 &&
      results.null_user_ids_daily_metrics === 0;
    
    return results;
  } catch (error) {
    logger.error('Error running integrity checks:', error);
    return { ...results, error: error.message };
  }
}
