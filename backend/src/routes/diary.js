import express from 'express';
import logger from '../utils/logger.js';
import {
  saveDiaryEntry,
  getDiaryEntries,
  getDiaryEntry,
  analyzeDiaryPatterns,
  getWeeklySummary,
  deleteDiaryEntry
} from '../services/diary-service.js';

const router = express.Router();

// Create or update diary entry
router.post('/entry', async (req, res) => {
  try {
    const email = req.body.email;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const entry = await saveDiaryEntry(email, req.body);
    res.json(entry);
  } catch (error) {
    logger.error('Error in POST /diary/entry:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get diary entries
router.get('/entries', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    const options = {
      startDate: req.query.start_date,
      endDate: req.query.end_date,
      limit: req.query.limit ? parseInt(req.query.limit) : undefined
    };

    const entries = await getDiaryEntries(email, options);
    res.json(entries);
  } catch (error) {
    logger.error('Error in GET /diary/entries:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single diary entry by date
router.get('/entry/:date', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    const entry = await getDiaryEntry(email, req.params.date);
    if (!entry) {
      return res.status(404).json({ error: 'Diary entry not found' });
    }
    
    res.json(entry);
  } catch (error) {
    logger.error('Error in GET /diary/entry/:date:', error);
    res.status(500).json({ error: error.message });
  }
});

// Analyze diary patterns with AI
router.get('/analysis', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    const days = req.query.days ? parseInt(req.query.days) : 60;
    const analysis = await analyzeDiaryPatterns(email, days);
    res.json(analysis);
  } catch (error) {
    logger.error('Error in GET /diary/analysis:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get weekly summary
router.get('/weekly-summary', async (req, res) => {
  try {
    const email = req.query.email;
    const weekStart = req.query.week_start;
    
    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }
    if (!weekStart) {
      return res.status(400).json({ error: 'week_start parameter is required (YYYY-MM-DD format, Monday)' });
    }

    const summary = await getWeeklySummary(email, weekStart);
    res.json(summary);
  } catch (error) {
    logger.error('Error in GET /diary/weekly-summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete diary entry
router.delete('/entry/:date', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    const deleted = await deleteDiaryEntry(email, req.params.date);
    if (!deleted) {
      return res.status(404).json({ error: 'Diary entry not found' });
    }
    
    res.json({ message: 'Diary entry deleted', date: req.params.date });
  } catch (error) {
    logger.error('Error in DELETE /diary/entry/:date:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
