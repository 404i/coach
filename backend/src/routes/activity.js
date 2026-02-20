import express from 'express';
import logger from '../utils/logger.js';
import {
  getActivityDistribution,
  getSportSpecificInsights,
  getSportSpecificWorkouts
} from '../services/activity-analysis.js';
import {
  getMostRecentActivity,
  getRecentActivities,
  verifyActivityExists,
  getActivityContext,
  verifyActivityClaim
} from '../services/activity-verification.js';

const router = express.Router();

// Get activity distribution by sport
router.get('/distribution', async (req, res) => {
  try {
    const email = req.query.email;
    const days = parseInt(req.query.days) || 30;

    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    const distribution = await getActivityDistribution(email, days);
    res.json(distribution);
  } catch (error) {
    logger.error('Error in /activity/distribution:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get sport-specific insights and recommendations
router.get('/insights', async (req, res) => {
  try {
    const email = req.query.email;
    const days = parseInt(req.query.days) || 30;

    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    const insights = await getSportSpecificInsights(email, days);
    res.json(insights);
  } catch (error) {
    logger.error('Error in /activity/insights:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get sport-specific structured workouts
router.get('/workouts/:sport', async (req, res) => {
  try {
    const email = req.query.email;
    const sport = req.params.sport;
    const intensity = req.query.intensity || 'moderate';

    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    const workouts = await getSportSpecificWorkouts(email, sport, intensity);
    res.json(workouts);
  } catch (error) {
    logger.error(`Error in /activity/workouts/${req.params.sport}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ACTIVITY VERIFICATION ENDPOINTS
// ============================================================================

// GET /api/activity/latest - Get most recent activity
router.get('/latest', async (req, res) => {
  try {
    const email = req.query.email;
    
    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }
    
    const latest = await getMostRecentActivity(email);
    res.json(latest);
  } catch (error) {
    logger.error('Error in /activity/latest:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/activity/recent - Get recent activities (last N days)
router.get('/recent', async (req, res) => {
  try {
    const email = req.query.email;
    const days = parseInt(req.query.days) || 7;
    
    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }
    
    const recent = await getRecentActivities(email, days);
    res.json(recent);
  } catch (error) {
    logger.error('Error in /activity/recent:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/activity/verify - Verify if specific activity exists
router.get('/verify', async (req, res) => {
  try {
    const email = req.query.email;
    const activityType = req.query.type;
    const startDate = req.query.start;
    const endDate = req.query.end || startDate;
    
    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }
    
    if (!activityType) {
      return res.status(400).json({ error: 'Activity type parameter is required' });
    }
    
    if (!startDate) {
      return res.status(400).json({ error: 'Start date parameter is required' });
    }
    
    const result = await verifyActivityExists(email, activityType, {
      start: startDate,
      end: endDate
    });
    
    res.json(result);
  } catch (error) {
    logger.error('Error in /activity/verify:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/activity/context - Get activity context for responses
router.get('/context', async (req, res) => {
  try {
    const email = req.query.email;
    
    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }
    
    const context = await getActivityContext(email);
    res.json(context);
  } catch (error) {
    logger.error('Error in /activity/context:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/activity/verify-claim - Verify a specific activity claim
router.post('/verify-claim', async (req, res) => {
  try {
    const { email, claim } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    if (!claim || !claim.type) {
      return res.status(400).json({ error: 'Claim with type is required' });
    }
    
    const result = await verifyActivityClaim(email, claim);
    res.json(result);
  } catch (error) {
    logger.error('Error in /activity/verify-claim:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
