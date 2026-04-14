import express from 'express';
import { loginGarmin, submitMFA, validateSession, syncDateRange } from '../services/garmin-sync.js';
import { authenticateAndStore, attemptAutoReauth, getStoredCredentials, withAutoReauth } from '../services/auth-improved.js';
import db from '../db/index.js';
import logger from '../utils/logger.js';

const router = express.Router();

// POST /api/garmin/login
router.post('/login', async (req, res) => {
  try {
    const { email, password, mfa_code } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const result = await authenticateAndStore(email, password, mfa_code);
    
    // Check if MFA is required
    if (result.mfa_required) {
      return res.status(202).json({
        mfa_required: true,
        email: result.email,
        message: result.message || 'MFA code required. Include "mfa_code" in request'
      });
    }
    
    res.json({
      success: true,
      username: result.username,
      message: result.message
    });
  } catch (error) {
    logger.error('Garmin login failed:', error);
    res.status(401).json({
      error: 'Login failed',
      message: error.message
    });
  }
});

// POST /api/garmin/mfa
router.post('/mfa', async (req, res) => {
  try {
    const { email, password, mfa_code } = req.body;
    
    if (!email || !password || !mfa_code) {
      return res.status(400).json({ 
        error: 'Email, password, and MFA code required' 
      });
    }
    
    const result = await submitMFA(email, password, mfa_code);
    
    res.json({
      success: true,
      username: result.username,
      message: 'MFA authentication successful'
    });
  } catch (error) {
    logger.error('MFA authentication failed:', error);
    res.status(401).json({
      error: 'MFA authentication failed',
      message: error.message
    });
  }
});

// POST /api/garmin/sync
router.post('/sync', async (req, res) => {
  try {
    const { email, start_date, end_date } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    // Use withAutoReauth to automatically re-authenticate if session expired
    const summary = await withAutoReauth(email, async () => {
      return await syncDateRange(
        email,
        start_date || yesterday,
        end_date || today
      );
    });
    
    res.json({
      success: true,
      synced_days: summary.dates_synced,
      data: summary
    });
  } catch (error) {
    logger.error('Garmin sync failed:', error);
    
    // Check if error is from failed reauth attempt
    try {
      const errorObj = JSON.parse(error.message);
      if (errorObj.action_required === 'mfa_prompt') {
        return res.status(202).json({
          error: 'MFA required',
          mfa_required: true,
          message: errorObj.message,
          email: email
        });
      }
      if (errorObj.action_required === 'manual_login') {
        return res.status(401).json({
          error: 'Authentication required',
          message: errorObj.message
        });
      }
    } catch {
      // Not a structured auth error - continue
    }
    
    res.status(500).json({
      error: 'Sync failed',
      message: error.message
    });
  }
});

// GET /api/garmin/status
router.get('/status', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    const status = await validateSession(email);
    
    res.json({
      email,
      session_valid: status.valid,
      error: status.error || null
    });
  } catch (error) {
    res.status(500).json({
      error: 'Status check failed',
      message: error.message
    });
  }
});

// POST /api/garmin/reauth - Re-authenticate using stored encrypted credentials
router.post('/reauth', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    // Attempt automatic re-authentication
    const result = await attemptAutoReauth(email);
    
    if (!result.success) {
      // Return appropriate status based on failure reason
      if (result.action_required === 'mfa_prompt') {
        return res.status(202).json({
          mfa_required: true,
          email: result.email,
          message: result.message,
          hint: 'Call POST /api/garmin/login with email, password, and mfa_code'
        });
      }
      
      if (result.action_required === 'manual_login') {
        return res.status(401).json({
          error: result.reason,
          message: result.message,
          hint: 'Call POST /api/garmin/login with email and password'
        });
      }
      
      return res.status(500).json({
        error: result.reason,
        message: result.message
      });
    }
    
    res.json({
      success: true,
      username: result.username,
      message: result.message
    });
  } catch (error) {
    logger.error('Re-authentication failed:', error);
    res.status(500).json({
      error: 'Re-authentication failed',
      message: error.message
    });
  }
});

// GET /api/garmin/metrics
router.get('/metrics', async (req, res) => {
  try {
    const { email, start_date, end_date } = req.query;
    
    if (!email && !start_date) {
      return res.status(400).json({ error: 'email or start_date required' });
    }
    
    // Build query
    let query = db('daily_metrics');
    
    if (start_date) {
      query = query.where('date', '>=', start_date);
    }
    if (end_date) {
      query = query.where('date', '<=', end_date);
    }
    
    query = query.orderBy('date', 'asc');
    
    const metrics = await query;
    
    res.json({
      success: true,
      count: metrics.length,
      data: metrics
    });
  } catch (error) {
    logger.error('Failed to fetch metrics:', error);
    res.status(500).json({
      error: 'Failed to fetch metrics',
      message: error.message
    });
  }
});

// GET /api/garmin/activities
router.get('/activities', async (req, res) => {
  try {
    const { email, start_date, end_date, limit = 50 } = req.query;
    
    if (!email && !start_date) {
      return res.status(400).json({ error: 'email or start_date required' });
    }
    
    // Get profile_id if email provided
    let query = db('activities');
    
    if (email) {
      const user = await db('users').where({ garmin_email: email }).first();
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      query = query.where('user_id', user.id);
    }
    
    if (start_date) {
      query = query.where('date', '>=', start_date);
    }
    if (end_date) {
      query = query.where('date', '<=', end_date);
    }
    
    query = query
      .orderBy('start_time', 'desc')
      .limit(Math.min(Math.max(parseInt(limit) || 50, 1), 500));
    
    const activities = await query;
    
    // Parse raw_activity_data for each activity
    const activitiesWithData = activities.map(act => ({
      ...act,
      raw_activity_data: act.raw_activity_data ? JSON.parse(act.raw_activity_data) : null
    }));
    
    res.json({
      success: true,
      count: activities.length,
      activities: activitiesWithData
    });
  } catch (error) {
    logger.error('Failed to fetch activities:', error);
    res.status(500).json({
      error: 'Failed to fetch activities',
      message: error.message
    });
  }
});

/**
 * POST /api/garmin/import
 * Bulk-upsert daily metrics from an external source (e.g. import_garmindb_to_coach.py).
 *
 * Body: { email: string, days: DailyMetricsObject[], overwrite?: boolean }
 * Each element of `days` is stored verbatim as metrics_data JSON, keyed by (profile_id, date).
 * If `overwrite` is false (default true), existing rows are left untouched.
 *
 * Returns: { success, upserted, skipped, total }
 */
router.post('/import', async (req, res) => {
  try {
    const { email, days, overwrite = true } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'email required' });
    }
    if (!Array.isArray(days) || days.length === 0) {
      return res.status(400).json({ error: 'days array required and must be non-empty' });
    }

    const user = await db('users').where({ garmin_email: email }).first();
    if (!user) {
      return res.status(404).json({ error: `User not found: ${email}` });
    }

    let upserted = 0;
    let skipped = 0;

    // Pre-fetch existing dates in one query to avoid N+1 when overwrite=false
    let existingDates = new Set();
    if (!overwrite) {
      const validDates = days.map(d => d.date).filter(Boolean);
      if (validDates.length > 0) {
        const rows = await db('daily_metrics')
          .where({ user_id: user.id })
          .whereIn('date', validDates)
          .select('date');
        existingDates = new Set(rows.map(r => r.date));
      }
    }

    for (const day of days) {
      const date = day.date;
      if (!date) continue;

      if (!overwrite && existingDates.has(date)) {
        skipped++;
        continue;
      }

      await db('daily_metrics')
        .insert({
          user_id: user.id,
          date,
          metrics_data: JSON.stringify(day),
          synced_at: db.fn.now(),
          updated_at: db.fn.now()
        })
        .onConflict(['user_id', 'date'])
        .merge(['metrics_data', 'synced_at', 'updated_at']);

      upserted++;
    }

    logger.info(`GarminDB import complete for ${email}: upserted=${upserted}, skipped=${skipped}`);

    res.json({
      success: true,
      email,
      upserted,
      skipped,
      total: days.length
    });
  } catch (error) {
    logger.error('Failed to import daily metrics:', error);
    res.status(500).json({
      error: 'Failed to import daily metrics',
      message: error.message
    });
  }
});

// GET /api/garmin/last-sync?email=
// Returns the most recent synced_at timestamp from daily_metrics for a user.
// Used by the MCP server to decide whether a fresh sync is needed.
router.get('/last-sync', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const user = await db('users').where({ garmin_email: email }).first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const row = await db('daily_metrics')
      .where({ user_id: user.id })
      .whereNotNull('synced_at')
      .orderBy('synced_at', 'desc')
      .select('synced_at')
      .first();

    res.json({
      email,
      last_sync: row ? row.synced_at : null
    });
  } catch (error) {
    logger.error('Failed to get last sync time:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

