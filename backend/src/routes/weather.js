import express from 'express';
import axios from 'axios';
import logger from '../utils/logger.js';
import {
  getWeatherData,
  analyzeWeatherConditions,
  getWeatherAwareWorkout
} from '../services/weather-aware.js';

const router = express.Router();
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const OPENWEATHER_URL = 'https://api.openweathermap.org/data/2.5';

/**
 * GET /api/weather/forecast
 * Get basic weather forecast (legacy endpoint)
 */
router.get('/forecast', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    
    if (!lat || !lon) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }
    
    if (!OPENWEATHER_API_KEY) {
      return res.status(503).json({ error: 'Weather API key not configured' });
    }
    
    const response = await axios.get(`${OPENWEATHER_URL}/forecast`, {
      params: {
        lat,
        lon,
        appid: OPENWEATHER_API_KEY,
        units: 'metric'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    logger.error('Weather forecast error:', error);
    res.status(500).json({
      error: 'Weather fetch failed',
      message: error.message
    });
  }
});

/**
 * GET /api/weather/current
 * Get current weather with analysis
 */
router.get('/current', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    
    if (!lat || !lon) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }
    
    const weather = await getWeatherData(lat, lon);
    const analysis = analyzeWeatherConditions(weather);
    
    res.json({
      current: weather.current,
      forecast: weather.forecast.slice(0, 8),
      analysis
    });
  } catch (error) {
    logger.error('Current weather error:', error);
    res.status(500).json({
      error: 'Weather analysis failed',
      message: error.message
    });
  }
});

/**
 * GET /api/weather/safety
 * Get weather safety assessment only
 */
router.get('/safety', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    
    if (!lat || !lon) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }
    
    const weather = await getWeatherData(lat, lon);
    const analysis = analyzeWeatherConditions(weather);
    
    res.json({
      safety_score: analysis.safety_score,
      risk_level: analysis.risk_level,
      warnings: analysis.warnings,
      concerns: analysis.concerns,
      advantages: analysis.advantages,
      conditions: {
        temp: weather.current.temp,
        feels_like: weather.current.feels_like,
        condition: weather.current.description,
        wind: weather.current.wind_speed
      }
    });
  } catch (error) {
    logger.error('Weather safety error:', error);
    res.status(500).json({
      error: 'Safety assessment failed',
      message: error.message
    });
  }
});

/**
 * POST /api/weather/adjust-workout
 * Get workout adjusted for weather conditions
 */
router.post('/adjust-workout', async (req, res) => {
  try {
    const { lat, lon, workout } = req.body;
    
    if (!lat || !lon) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }
    
    if (!workout) {
      return res.status(400).json({ error: 'Workout plan required' });
    }
    
    const weatherWorkout = await getWeatherAwareWorkout(lat, lon, workout);
    
    res.json(weatherWorkout);
  } catch (error) {
    logger.error('Weather adjustment error:', error);
    res.status(500).json({
      error: 'Workout adjustment failed',
      message: error.message
    });
  }
});

/**
 * GET /api/weather/adjustment-preview
 * Preview weather adjustments without full workout plan
 */
router.get('/adjustment-preview', async (req, res) => {
  try {
    const { lat, lon, sport = 'cycling', duration = 60 } = req.query;
    
    if (!lat || !lon) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }
    
    const plannedWorkout = {
      sport,
      duration: parseInt(duration),
      type: 'endurance'
    };
    
    const weatherWorkout = await getWeatherAwareWorkout(lat, lon, plannedWorkout);
    
    res.json(weatherWorkout);
  } catch (error) {
    logger.error('Weather preview error:', error);
    res.status(500).json({
      error: 'Adjustment preview failed',
      message: error.message
    });
  }
});

export default router;
