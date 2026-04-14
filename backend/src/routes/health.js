import express from 'express';
import { checkLMStudioHealth } from '../services/llm-coach.js';
import db from '../db/index.js';
import { getIntegrityCheckResults, getDatabaseStats } from '../db/integrity-checks.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    // Check database connection
    let dbStatus = 'ok';
    let dbError = null;
    try {
      await db.raw('SELECT 1');
    } catch (error) {
      dbStatus = 'error';
      dbError = error.message;
    }
    
    // Run integrity checks (non-throwing version)
    const integrityChecks = await getIntegrityCheckResults();
    
    // Get database statistics
    const dbStats = dbStatus === 'ok' ? await getDatabaseStats() : null;
    
    // Check LM Studio
    const lmStudio = await checkLMStudioHealth();
    
    // Determine overall health status
    let status = 'healthy';
    if (dbStatus === 'error' || !integrityChecks.all_passed) {
      status = 'unhealthy';
    } else if (!lmStudio.available) {
      status = 'degraded';
    }
    
    const health = {
      status,
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        lm_studio: lmStudio.available ? 'available' : 'unavailable',
        garmin_sync: 'ready'
      },
      database: {
        connection: dbStatus,
        foreign_keys_enabled: integrityChecks.fk_enabled,
        integrity_checks: {
          all_passed: integrityChecks.all_passed,
          orphaned_activities: integrityChecks.orphaned_activities,
          orphaned_daily_metrics: integrityChecks.orphaned_daily_metrics,
          orphaned_athlete_profiles: integrityChecks.orphaned_athlete_profiles,
          duplicate_users: integrityChecks.duplicate_users,
          null_user_ids: integrityChecks.null_user_ids_activities + integrityChecks.null_user_ids_daily_metrics
        },
        statistics: dbStats,
        error: dbError
      },
      version: '1.0.0'
    };
    
    // Return appropriate status code
    const statusCode = status === 'unhealthy' ? 503 : 200;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

export default router;
