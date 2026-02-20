/**
 * Planned Activities Service
 * 
 * Manages future activities mentioned by the user to enable context sharing
 * between Claude, LM Studio, and other AI systems.
 */

import db from '../db/index.js';
import logger from '../utils/logger.js';

/**
 * Add a new planned activity
 * @param {Object} params
 * @param {number} params.profileId - Athlete profile ID
 * @param {string} params.activityType - Type of activity (yoga, mountain_biking, etc.)
 * @param {string} params.description - Description of the planned activity
 * @param {string} params.plannedDate - ISO date string (YYYY-MM-DD)
 * @param {Object} params.options - Additional options (priority, timeOfDay, etc.)
 * @returns {Promise<Object>} Created planned activity
 */
export async function addPlannedActivity({ profileId, activityType, description, plannedDate, options = {} }) {
  try {
    const activity = {
      profile_id: profileId,
      activity_type: activityType,
      description,
      planned_date: plannedDate,
      sport_category: options.sportCategory,
      planned_date_end: options.plannedDateEnd,
      time_of_day: options.timeOfDay,
      is_flexible: options.isFlexible !== undefined ? options.isFlexible : true,
      priority: options.priority || 'medium',
      is_social: options.isSocial || false,
      is_event: options.isEvent || false,
      constraints: options.constraints,
      context: options.context,
      notes: options.notes,
      metadata: options.metadata ? JSON.stringify(options.metadata) : null,
      status: options.status || 'mentioned'
    };

    const [id] = await db('planned_activities').insert(activity);
    const created = await db('planned_activities').where({ id }).first();
    
    logger.info(`Added planned activity: ${activityType} on ${plannedDate}`, { id, profileId });
    return created;
  } catch (error) {
    logger.error('Failed to add planned activity:', error);
    throw error;
  }
}

/**
 * Get upcoming planned activities
 * @param {number} profileId - Athlete profile ID
 * @param {Object} filters - Filtering options
 * @param {string} filters.fromDate - Start date (YYYY-MM-DD), default: today
 * @param {string} filters.toDate - End date (YYYY-MM-DD), optional
 * @param {string[]} filters.statuses - Array of statuses to include, default: ['mentioned', 'planned', 'scheduled']
 * @param {number} filters.daysAhead - Number of days to look ahead, default: 30
 * @returns {Promise<Array>} Array of planned activities
 */
export async function getUpcomingActivities(profileId, filters = {}) {
  try {
    const fromDate = filters.fromDate || new Date().toISOString().split('T')[0];
    const daysAhead = filters.daysAhead || 30;
    const toDate = filters.toDate || new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const statuses = filters.statuses || ['mentioned', 'planned', 'scheduled'];

    const query = db('planned_activities')
      .where({ profile_id: profileId })
      .whereIn('status', statuses)
      .where(function() {
        this.where(function() {
          // Activities with specific dates
          this.whereNotNull('planned_date')
            .where('planned_date', '>=', fromDate)
            .where('planned_date', '<=', toDate);
        }).orWhere(function() {
          // Multi-day activities that overlap with the date range
          this.whereNotNull('planned_date_end')
            .where(function() {
              this.where('planned_date', '<=', toDate)
                .where('planned_date_end', '>=', fromDate);
            });
        });
      })
      .orderBy('planned_date', 'asc')
      .orderBy('priority', 'desc');

    const activities = await query;
    logger.info(`Retrieved ${activities.length} upcoming activities for profile ${profileId}`);
    return activities;
  } catch (error) {
    logger.error('Failed to get upcoming activities:', error);
    throw error;
  }
}

/**
 * Get all planned activities (including past) with optional filtering
 * @param {number} profileId - Athlete profile ID
 * @param {Object} filters - Filtering options
 * @returns {Promise<Array>} Array of planned activities
 */
export async function getAllPlannedActivities(profileId, filters = {}) {
  try {
    let query = db('planned_activities').where({ profile_id: profileId });

    if (filters.status) {
      query = query.where({ status: filters.status });
    }
    if (filters.activityType) {
      query = query.where({ activity_type: filters.activityType });
    }
    if (filters.fromDate) {
      query = query.where('planned_date', '>=', filters.fromDate);
    }
    if (filters.toDate) {
      query = query.where('planned_date', '<=', filters.toDate);
    }

    const activities = await query.orderBy('planned_date', 'desc');
    return activities;
  } catch (error) {
    logger.error('Failed to get all planned activities:', error);
    throw error;
  }
}

/**
 * Update a planned activity
 * @param {number} id - Planned activity ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated activity
 */
export async function updatePlannedActivity(id, updates) {
  try {
    const updateData = {};
    
    // Map camelCase to snake_case
    if (updates.status) updateData.status = updates.status;
    if (updates.plannedDate) updateData.planned_date = updates.plannedDate;
    if (updates.plannedDateEnd) updateData.planned_date_end = updates.plannedDateEnd;
    if (updates.completedDate) updateData.completed_date = updates.completedDate;
    if (updates.actualActivityId) updateData.actual_activity_id = updates.actualActivityId;
    if (updates.priority) updateData.priority = updates.priority;
    if (updates.notes) updateData.notes = updates.notes;
    if (updates.constraints) updateData.constraints = updates.constraints;
    if (updates.description) updateData.description = updates.description;
    if (updates.timeOfDay !== undefined) updateData.time_of_day = updates.timeOfDay;
    if (updates.isFlexible !== undefined) updateData.is_flexible = updates.isFlexible;
    if (updates.isSocial !== undefined) updateData.is_social = updates.isSocial;
    if (updates.isEvent !== undefined) updateData.is_event = updates.isEvent;

    await db('planned_activities').where({ id }).update(updateData);
    const updated = await db('planned_activities').where({ id }).first();
    
    logger.info(`Updated planned activity ${id}`, { updates });
    return updated;
  } catch (error) {
    logger.error(`Failed to update planned activity ${id}:`, error);
    throw error;
  }
}

/**
 * Mark a planned activity as completed and link to actual activity
 * @param {number} id - Planned activity ID
 * @param {number} actualActivityId - ID from activities table
 * @param {string} completedDate - Date completed (YYYY-MM-DD)
 * @returns {Promise<Object>} Updated activity
 */
export async function markAsCompleted(id, actualActivityId, completedDate) {
  try {
    return await updatePlannedActivity(id, {
      status: 'completed',
      completedDate,
      actualActivityId
    });
  } catch (error) {
    logger.error(`Failed to mark activity ${id} as completed:`, error);
    throw error;
  }
}

/**
 * Delete a planned activity
 * @param {number} id - Planned activity ID
 * @returns {Promise<boolean>} Success status
 */
export async function deletePlannedActivity(id) {
  try {
    await db('planned_activities').where({ id }).del();
    logger.info(`Deleted planned activity ${id}`);
    return true;
  } catch (error) {
    logger.error(`Failed to delete planned activity ${id}:`, error);
    throw error;
  }
}

/**
 * Get planned activities for a specific date
 * @param {number} profileId - Athlete profile ID
 * @param {string} date - Date (YYYY-MM-DD)
 * @returns {Promise<Array>} Array of planned activities for that date
 */
export async function getActivitiesForDate(profileId, date) {
  try {
    const activities = await db('planned_activities')
      .where({ profile_id: profileId })
      .whereIn('status', ['mentioned', 'planned', 'scheduled'])
      .where(function() {
        this.where('planned_date', date)
          .orWhere(function() {
            // Multi-day activities that include this date
            this.where('planned_date', '<=', date)
              .where('planned_date_end', '>=', date);
          });
      })
      .orderBy('priority', 'desc');

    return activities;
  } catch (error) {
    logger.error(`Failed to get activities for date ${date}:`, error);
    throw error;
  }
}

export default {
  addPlannedActivity,
  getUpcomingActivities,
  getAllPlannedActivities,
  updatePlannedActivity,
  markAsCompleted,
  deletePlannedActivity,
  getActivitiesForDate
};
