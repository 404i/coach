import express from 'express';
import logger from '../utils/logger.js';
import {
  getWorkoutRecommendations,
  getWorkoutByIntensity
} from '../services/workout-recommendation.js';
import {
  generateWeeklyPlan
} from '../services/weekly-planning.js';

const router = express.Router();

// Get workout recommendations for today (or specific date)
router.get('/recommendations', async (req, res) => {
  try {
    const email = req.query.email;
    const date = req.query.date; // Optional: YYYY-MM-DD

    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    const recommendations = await getWorkoutRecommendations(email, date);
    res.json(recommendations);
  } catch (error) {
    logger.error('Error in /workout/recommendations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get specific workout by intensity level
router.get('/recommendations/:intensity', async (req, res) => {
  try {
    const email = req.query.email;
    const intensity = req.params.intensity; // recovery, easy, moderate, hard
    const date = req.query.date; // Optional: YYYY-MM-DD

    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    const workout = await getWorkoutByIntensity(email, intensity, date);
    res.json(workout);
  } catch (error) {
    logger.error(`Error in /workout/recommendations/${req.params.intensity}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Generate 7-day workout plan
router.get('/weekly-plan', async (req, res) => {
  try {
    const email = req.query.email;
    const startDate = req.query.start_date; // Optional: YYYY-MM-DD (defaults to tomorrow)

    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    const weeklyPlan = await generateWeeklyPlan(email, startDate);
    res.json(weeklyPlan);
  } catch (error) {
    logger.error('Error in /workout/weekly-plan:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
