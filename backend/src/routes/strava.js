/**
 * Strava API Routes
 *
 * Endpoints:
 *   POST /api/strava/connect      – bootstrap connection using env refresh token
 *   POST /api/strava/disconnect   – remove connection
 *   GET  /api/strava/status       – connection & token status
 *   POST /api/strava/sync         – pull activities from Strava
 *   GET  /api/strava/activities   – query locally-stored Strava activities
 *   GET  /api/strava/athlete      – fetch Strava athlete profile
 */

import express from 'express';
import logger from '../utils/logger.js';
import {
  resolveProfileId,
  connectStrava,
  disconnectStrava,
  getConnectionStatus,
  syncStravaActivities,
  getLocalActivities,
  getStravaAthlete,
} from '../services/strava-sync.js';

const router = express.Router();

// POST /api/strava/connect
router.post('/connect', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const profileId = await resolveProfileId(email);
    if (!profileId) return res.status(404).json({ error: 'User/profile not found. Authenticate with Garmin first.' });

    const result = await connectStrava(profileId);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Strava connect failed:', error);
    res.status(500).json({ error: 'Strava connection failed', message: error.message });
  }
});

// POST /api/strava/disconnect
router.post('/disconnect', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const profileId = await resolveProfileId(email);
    if (!profileId) return res.status(404).json({ error: 'User/profile not found' });

    const result = await disconnectStrava(profileId);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Strava disconnect failed:', error);
    res.status(500).json({ error: 'Strava disconnect failed', message: error.message });
  }
});

// GET /api/strava/status?email=...
router.get('/status', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const profileId = await resolveProfileId(email);
    if (!profileId) return res.status(404).json({ error: 'User/profile not found' });

    const status = await getConnectionStatus(profileId);
    res.json(status);
  } catch (error) {
    logger.error('Strava status check failed:', error);
    res.status(500).json({ error: 'Status check failed', message: error.message });
  }
});

// POST /api/strava/sync
router.post('/sync', async (req, res) => {
  try {
    const { email, after, before, per_page } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const profileId = await resolveProfileId(email);
    if (!profileId) return res.status(404).json({ error: 'User/profile not found' });

    const status = await getConnectionStatus(profileId);
    if (!status.connected) {
      return res.status(400).json({
        error: 'Strava not connected',
        message: 'Connect Strava first via POST /api/strava/connect',
      });
    }

    const summary = await syncStravaActivities(profileId, { after, before, per_page });
    res.json({ success: true, ...summary });
  } catch (error) {
    logger.error('Strava sync failed:', error);
    res.status(500).json({ error: 'Strava sync failed', message: error.message });
  }
});

// GET /api/strava/activities?email=...&limit=30&start_date=...&end_date=...&type=...
router.get('/activities', async (req, res) => {
  try {
    const { email, limit, start_date, end_date, type } = req.query;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const profileId = await resolveProfileId(email);
    if (!profileId) return res.status(404).json({ error: 'User/profile not found' });

    const activities = await getLocalActivities(profileId, {
      limit: parseInt(limit) || 30,
      start_date,
      end_date,
      type,
    });

    // Format activities with correct field mapping (DB columns → response fields)
    const formatted = activities.map(a => ({
      id: a.activity_id,
      strava_id: a.strava_id,
      name: a.name,
      type: a.type,
      sport_type: a.sport_type,
      date: a.activity_date,
      distance: a.distance_km,
      duration: a.duration_sec,
      elevation_gain: a.elevation_gain_m,
      avg_hr: a.avg_hr,
      max_hr: a.max_hr,
      avg_power: a.avg_power,
      normalized_power: a.normalized_power,
      training_load: a.training_load,
      synced_at: a.synced_at,
    }));

    res.json({ activities: formatted, total: formatted.length });
  } catch (error) {
    logger.error('Strava activities query failed:', error);
    res.status(500).json({ error: 'Query failed', message: error.message });
  }
});

// GET /api/strava/athlete?email=...
router.get('/athlete', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const profileId = await resolveProfileId(email);
    if (!profileId) return res.status(404).json({ error: 'User/profile not found' });

    const athlete = await getStravaAthlete(profileId);
    res.json(athlete);
  } catch (error) {
    logger.error('Strava athlete fetch failed:', error);
    res.status(500).json({ error: 'Athlete fetch failed', message: error.message });
  }
});

export default router;
