/**
 * Planned Activities Routes
 * 
 * API endpoints for managing future activities mentioned by the user
 */

import express from 'express';
import db from '../db/index.js';
import {
  addPlannedActivity,
  getUpcomingActivities,
  getAllPlannedActivities,
  updatePlannedActivity,
  markAsCompleted,
  deletePlannedActivity,
  getActivitiesForDate
} from '../services/planned-activities.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Helper to get profile by email
async function getProfileByEmail(email) {
  const profile = await db('athlete_profiles')
    .leftJoin('users', 'athlete_profiles.user_id', 'users.id')
    .where('users.garmin_email', email)
    .select('athlete_profiles.*')
    .first();
  return profile;
}

/**
 * POST /api/planned-activities
 * Add a new planned activity
 */
router.post('/', async (req, res) => {
  try {
    const { email, activityType, description, plannedDate, options } = req.body;

    if (!email || !activityType) {
      return res.status(400).json({ error: 'Email and activity type are required' });
    }

    const profile = await getProfileByEmail(email);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const activity = await addPlannedActivity({
      profileId: profile.id,
      activityType,
      description: description || activityType,
      plannedDate: plannedDate || new Date().toISOString().split('T')[0],
      options: options || {}
    });

    res.json({ success: true, activity });
  } catch (error) {
    logger.error('Error adding planned activity:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * GET /api/planned-activities/upcoming
 * Get upcoming planned activities
 */
router.get('/upcoming', async (req, res) => {
  try {
    const { email, daysAhead, fromDate, toDate } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const profile = await getProfileByEmail(email);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const activities = await getUpcomingActivities(profile.id, {
      daysAhead: daysAhead ? parseInt(daysAhead) : 30,
      fromDate,
      toDate
    });

    res.json({ activities, count: activities.length });
  } catch (error) {
    logger.error('Error getting upcoming activities:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * GET /api/planned-activities/date/:date
 * Get planned activities for a specific date
 */
router.get('/date/:date', async (req, res) => {
  try {
    const { email } = req.query;
    const { date } = req.params;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const profile = await getProfileByEmail(email);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const activities = await getActivitiesForDate(profile.id, date);
    res.json({ date, activities, count: activities.length });
  } catch (error) {
    logger.error('Error getting activities for date:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * GET /api/planned-activities
 * Get all planned activities with optional filtering
 */
router.get('/', async (req, res) => {
  try {
    const { email, status, activityType, fromDate, toDate } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const profile = await getProfileByEmail(email);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const activities = await getAllPlannedActivities(profile.id, {
      status,
      activityType,
      fromDate,
      toDate
    });

    res.json({ activities, count: activities.length });
  } catch (error) {
    logger.error('Error getting planned activities:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * PUT /api/planned-activities/:id
 * Update a planned activity
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const activity = await updatePlannedActivity(parseInt(id), updates);
    res.json({ success: true, activity });
  } catch (error) {
    logger.error('Error updating planned activity:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * POST /api/planned-activities/:id/complete
 * Mark a planned activity as completed
 */
router.post('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { actualActivityId, completedDate } = req.body;

    const activity = await markAsCompleted(
      parseInt(id),
      actualActivityId,
      completedDate || new Date().toISOString().split('T')[0]
    );

    res.json({ success: true, activity });
  } catch (error) {
    logger.error('Error marking activity as completed:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * DELETE /api/planned-activities/:id
 * Delete a planned activity
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await deletePlannedActivity(parseInt(id));
    res.json({ success: true, message: 'Activity deleted' });
  } catch (error) {
    logger.error('Error deleting planned activity:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

export default router;
