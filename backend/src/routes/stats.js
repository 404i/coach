import express from 'express';
import logger from '../utils/logger.js';
import {
  getTrainingLoadTrend,
  getRecoveryTrend,
  getHrvBaseline,
  getTrainingStressBalance
} from '../services/stats-service.js';

const router = express.Router();

// Get training load trend (acute vs chronic load)
router.get('/training-load-trend', async (req, res) => {
  try {
    const email = req.query.email;
    const days = parseInt(req.query.days) || 60;

    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    const trend = await getTrainingLoadTrend(email, days);
    res.json(trend);
  } catch (error) {
    logger.error('Error in /stats/training-load-trend:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get recovery trend analysis
router.get('/recovery-trend', async (req, res) => {
  try {
    const email = req.query.email;
    const days = parseInt(req.query.days) || 60;

    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    const trend = await getRecoveryTrend(email, days);
    res.json(trend);
  } catch (error) {
    logger.error('Error in /stats/recovery-trend:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get HRV baseline and percentile analysis
router.get('/hrv-baseline', async (req, res) => {
  try {
    const email = req.query.email;
    const days = parseInt(req.query.days) || 60;

    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    const baseline = await getHrvBaseline(email, days);
    res.json(baseline);
  } catch (error) {
    logger.error('Error in /stats/hrv-baseline:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Training Stress Balance (TSB)
router.get('/training-stress-balance', async (req, res) => {
  try {
    const email = req.query.email;
    const days = parseInt(req.query.days) || 60;

    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    const tsb = await getTrainingStressBalance(email, days);
    res.json(tsb);
  } catch (error) {
    logger.error('Error in /stats/training-stress-balance:', error);
    res.status(500).json({ error: error.message });
  }
});

// Summary endpoint with all key stats
router.get('/summary', async (req, res) => {
  try {
    const email = req.query.email;

    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    // Fetch all stats in parallel
    const [loadTrend, recoveryTrend, hrvBaseline, tsb] = await Promise.all([
      getTrainingLoadTrend(email, 60),
      getRecoveryTrend(email, 60),
      getHrvBaseline(email, 60),
      getTrainingStressBalance(email, 60)
    ]);

    res.json({
      training_load: loadTrend.current,
      recovery: recoveryTrend.current,
      hrv: hrvBaseline.current,
      training_stress_balance: tsb.current
    });
  } catch (error) {
    logger.error('Error in /stats/summary:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
