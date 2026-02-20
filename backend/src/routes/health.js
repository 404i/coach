import express from 'express';
import { checkLMStudioHealth } from '../services/llm-coach.js';
import db from '../db/index.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    // Check database
    let dbStatus = 'ok';
    try {
      await db.raw('SELECT 1');
    } catch (error) {
      dbStatus = 'error';
    }
    
    // Check LM Studio
    const lmStudio = await checkLMStudioHealth();
    
    const health = {
      status: dbStatus === 'ok' && lmStudio.available ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        lm_studio: lmStudio.available ? 'available' : 'unavailable',
        garmin_sync: 'ready'
      },
      version: '1.0.0'
    };
    
    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

export default router;
