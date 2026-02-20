import express from 'express';
import logger from '../utils/logger.js';
import {
  getInsightsAndAlerts,
  getAlertsByType,
  acknowledgeAlert
} from '../services/insights-alerts.js';

const router = express.Router();

// Get all insights, alerts, and milestones
router.get('/', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    const data = await getInsightsAndAlerts(email);
    res.json(data);
  } catch (error) {
    logger.error('Error in GET /insights:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get alerts by specific type
router.get('/type/:type', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    const data = await getAlertsByType(email, req.params.type);
    res.json(data);
  } catch (error) {
    logger.error('Error in GET /insights/type/:type:', error);
    res.status(500).json({ error: error.message });
  }
});

// Acknowledge an alert
router.post('/acknowledge', async (req, res) => {
  try {
    const email = req.body.email;
    const alertType = req.body.alert_type;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!alertType) {
      return res.status(400).json({ error: 'alert_type is required' });
    }

    const result = await acknowledgeAlert(email, alertType);
    res.json(result);
  } catch (error) {
    logger.error('Error in POST /insights/acknowledge:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
