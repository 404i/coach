import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables FIRST before any other imports
dotenv.config();

import logger from './utils/logger.js';
import { initDatabase } from './db/index.js';
import { scheduleDailySync } from './services/garmin-sync.js';

// Routes
import profileRoutes from './routes/profile.js';
import dailyRoutes from './routes/daily.js';
import recommendRoutes from './routes/recommend.js';
import garminRoutes from './routes/garmin.js';
import statsRoutes from './routes/stats.js';
import workoutRoutes from './routes/workout.js';
import activityRoutes from './routes/activity.js';
import diaryRoutes from './routes/diary.js';
import insightsRoutes from './routes/insights.js';
import loadRoutes from './routes/load.js';
import weatherRoutes from './routes/weather.js';
import chatRoutes from './routes/chat.js';
import healthRoutes from './routes/health.js';
import patternsRoutes from './routes/patterns.js';
import helpRoutes from './routes/help.js';
import plannedActivitiesRoutes from './routes/planned-activities.js';
import memoryRoutes from './routes/memory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false
}));
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? false 
    : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,                  // max 300 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);

// Tighter limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' }
});
app.use('/api/garmin/login', authLimiter);
app.use('/api/garmin/mfa', authLimiter);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { 
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// API Routes
app.use('/api/profile', profileRoutes);
app.use('/api/daily', dailyRoutes);
app.use('/api/recommend', recommendRoutes);
app.use('/api/garmin', garminRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/workout', workoutRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/diary', diaryRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/load', loadRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/patterns', patternsRoutes);
app.use('/api/help', helpRoutes);
app.use('/api/planned-activities', plannedActivitiesRoutes);
app.use('/api/memory', memoryRoutes);

// Serve static frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '../public')));
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../public/index.html'));
  });
}

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Initialize database and start server
async function start() {
  try {
    await initDatabase();
    logger.info('Database initialized');

    // Schedule daily Garmin sync
    const syncTime = process.env.GARMIN_SYNC_TIME || '06:00';
    const [hour, minute] = syncTime.split(':');
    cron.schedule(`${minute} ${hour} * * *`, async () => {
      logger.info('Running scheduled Garmin sync');
      try {
        await scheduleDailySync();
      } catch (err) {
        logger.error('Scheduled Garmin sync failed:', err);
      }
    });
    logger.info(`Scheduled daily Garmin sync at ${syncTime}`);

    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Garmin AI Coach API running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      const provider = process.env.LLM_PROVIDER || 'lmstudio';
      const llmUrl = provider === 'ollama' 
        ? process.env.OLLAMA_URL 
        : process.env.LM_STUDIO_URL;
      logger.info(`LLM Provider: ${provider} (${llmUrl})`);
      logger.info(`Model: ${process.env.LLM_MODEL}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

start();
