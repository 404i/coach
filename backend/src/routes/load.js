/**
 * Training Load Optimization Routes
 */
import express from 'express';
import logger from '../utils/logger.js';
import { 
  getLoadOptimization,
  getOptimizationRecommendation 
} from '../services/load-optimization.js';

const router = express.Router();

/**
 * GET /api/load/optimization
 * Comprehensive load optimization analysis
 */
router.get('/optimization', async (req, res) => {
  try {
    const { email, weeks = 12 } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const optimization = await getLoadOptimization(email, parseInt(weeks));
    res.json(optimization);
  } catch (error) {
    logger.error('Error getting load optimization:', error);
    res.status(500).json({ error: 'Failed to get load optimization' });
  }
});

/**
 * GET /api/load/ramp-rate
 * Ramp rate analysis only
 */
router.get('/ramp-rate', async (req, res) => {
  try {
    const { email, weeks = 12 } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const optimization = await getLoadOptimization(email, parseInt(weeks));
    
    res.json({
      analysis_period: optimization.analysis_period,
      ramp_rate: optimization.ramp_rate,
      recommendations: optimization.recommendations.filter(r => 
        r.category === 'ramp_rate' || r.category === 'consistency'
      )
    });
  } catch (error) {
    logger.error('Error getting ramp rate:', error);
    res.status(500).json({ error: 'Failed to get ramp rate analysis' });
  }
});

/**
 * GET /api/load/distribution
 * Sport distribution analysis
 */
router.get('/distribution', async (req, res) => {
  try {
    const { email, weeks = 12 } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const optimization = await getLoadOptimization(email, parseInt(weeks));
    
    res.json({
      analysis_period: optimization.analysis_period,
      sport_distribution: optimization.sport_distribution,
      recommendations: optimization.recommendations.filter(r => 
        r.category === 'cross_training'
      )
    });
  } catch (error) {
    logger.error('Error getting sport distribution:', error);
    res.status(500).json({ error: 'Failed to get distribution analysis' });
  }
});

/**
 * GET /api/load/volume-intensity
 * Volume vs intensity balance
 */
router.get('/volume-intensity', async (req, res) => {
  try {
    const { email, weeks = 12 } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const optimization = await getLoadOptimization(email, parseInt(weeks));
    
    res.json({
      analysis_period: optimization.analysis_period,
      volume_intensity: optimization.volume_intensity,
      recommendations: optimization.recommendations.filter(r => 
        r.category === 'polarization'
      )
    });
  } catch (error) {
    logger.error('Error getting volume/intensity:', error);
    res.status(500).json({ error: 'Failed to get volume/intensity analysis' });
  }
});

/**
 * GET /api/load/fitness-fatigue
 * Fitness-fatigue model
 */
router.get('/fitness-fatigue', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const optimization = await getLoadOptimization(email);
    
    res.json({
      analysis_period: optimization.analysis_period,
      fitness_fatigue: optimization.fitness_fatigue,
      recommendations: optimization.recommendations.filter(r => 
        r.category === 'recovery' || r.category === 'progression'
      )
    });
  } catch (error) {
    logger.error('Error getting fitness-fatigue:', error);
    res.status(500).json({ error: 'Failed to get fitness-fatigue analysis' });
  }
});

/**
 * GET /api/load/recommendation/:category
 * Get specific recommendation by category
 */
router.get('/recommendation/:category', async (req, res) => {
  try {
    const { email } = req.query;
    const { category } = req.params;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const recommendation = await getOptimizationRecommendation(email, category);
    res.json(recommendation);
  } catch (error) {
    logger.error('Error getting recommendation:', error);
    res.status(500).json({ error: 'Failed to get recommendation' });
  }
});

export default router;
