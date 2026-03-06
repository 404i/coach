/**
 * /api/memory — Coaching memory CRUD
 *
 * All persistent coaching memory (notes, conversation history, and profile
 * fields that were previously stored in flat JSON files) is served here.
 * The MCP server is the primary consumer.
 *
 * Endpoints:
 *   GET  /api/memory?email=…          assembled memory object
 *   POST /api/memory/notes            add a coaching note
 *   POST /api/memory/conversation     add a conversation entry
 *   PUT  /api/memory                  update profile memory fields
 */

import express from 'express';
import db from '../db/index.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve profile_id (integer PK) from an email address.
 * Returns null when not found so callers can send a 404 cleanly.
 */
async function getProfileId(email) {
  const user = await db('users').where({ garmin_email: email }).first();
  if (!user) return null;

  const profile = await db('athlete_profiles').where({ user_id: user.id }).first();
  if (!profile) return null;

  return profile.id;
}

/**
 * Parse a JSON column value that may be stored as a string or already an object.
 */
function parseJsonCol(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value;
}

/**
 * Build and return the full assembled memory object for an athlete.
 */
async function assembleMemory(email) {
  const user = await db('users').where({ garmin_email: email }).first();
  if (!user) return null;

  const profile = await db('athlete_profiles').where({ user_id: user.id }).first();
  if (!profile) return null;

  const notes = await db('coaching_notes')
    .where({ profile_id: profile.id })
    .orderBy('created_at', 'asc')
    .limit(500)
    .select('id', 'note', 'source', 'created_at');

  const history = await db('conversation_history')
    .where({ profile_id: profile.id })
    .orderBy('timestamp', 'asc')
    .limit(200)
    .select('id', 'topic', 'summary', 'timestamp');

  // profileData is the legacy JSON blob; kept as fallback for fields not yet
  // migrated to dedicated columns.
  const profileData = parseJsonCol(profile.profile_data) || {};

  return {
    email,
    profile_id: profile.profile_id,
    db_id: profile.id,
    name: profile.name_display || profileData.name || '',
    location: parseJsonCol(profile.location_json) || profileData.location || {},
    favorite_sports: parseJsonCol(profile.favorite_sports) || profileData.favorite_sports || [],
    goals: parseJsonCol(profile.goals) || profileData.goals || [],
    motivations: parseJsonCol(profile.motivations) || profileData.motivations || [],
    constraints: parseJsonCol(profile.constraints) || profileData.constraints || [],
    goals_discussed: parseJsonCol(profile.goals_discussed) || [],
    equipment: parseJsonCol(profile.equipment) || profileData.access?.equipment || [],
    facilities: parseJsonCol(profile.facilities) || profileData.access?.facilities || [],
    days_per_week: profile.days_per_week ?? profileData.access?.days_per_week ?? 3,
    minutes_per_session: profile.minutes_per_session ?? profileData.access?.minutes_per_session ?? 45,
    injuries_conditions: parseJsonCol(profile.injuries_conditions) || profileData.injuries_conditions || [],
    injuries_history: parseJsonCol(profile.injuries_history) || [],
    baselines: parseJsonCol(profile.baselines) || profileData.baselines || {},
    preferences: parseJsonCol(profile.preferences) || profileData.preferences || {},
    training_philosophy: parseJsonCol(profile.training_philosophy) || [],
    important_notes: notes.map(n => n.note),           // array of strings (legacy compat)
    important_notes_full: notes,                        // full rows for future use
    conversation_history: history.map(h => ({
      timestamp: h.timestamp,
      topic: h.topic,
      summary: h.summary,
    })),
    updated_at: profile.updated_at,
  };
}

// ─── GET /api/memory ──────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'email query param required' });

    const memory = await assembleMemory(email);
    if (!memory) return res.status(404).json({ error: 'Athlete not found' });

    res.json({ success: true, memory });
  } catch (error) {
    logger.error('GET /api/memory failed:', error);
    res.status(500).json({ error: 'Failed to fetch memory', message: error.message });
  }
});

// ─── POST /api/memory/notes ───────────────────────────────────────────────────

router.post('/notes', async (req, res) => {
  try {
    const { email, note, source = 'manual' } = req.body;
    if (!email || !note) {
      return res.status(400).json({ error: 'email and note are required' });
    }

    const profileId = await getProfileId(email);
    if (!profileId) return res.status(404).json({ error: 'Athlete not found' });

    const [id] = await db('coaching_notes').insert({ profile_id: profileId, note, source });

    logger.info('Coaching note added', { email, id });
    res.json({ success: true, id });
  } catch (error) {
    logger.error('POST /api/memory/notes failed:', error);
    res.status(500).json({ error: 'Failed to add note', message: error.message });
  }
});

// ─── POST /api/memory/conversation ───────────────────────────────────────────

router.post('/conversation', async (req, res) => {
  try {
    const { email, topic, summary } = req.body;
    if (!email || !topic || !summary) {
      return res.status(400).json({ error: 'email, topic, and summary are required' });
    }

    const profileId = await getProfileId(email);
    if (!profileId) return res.status(404).json({ error: 'Athlete not found' });

    const [id] = await db('conversation_history').insert({
      profile_id: profileId,
      topic,
      summary,
      timestamp: new Date().toISOString(),
    });

    logger.info('Conversation entry added', { email, id, topic });
    res.json({ success: true, id });
  } catch (error) {
    logger.error('POST /api/memory/conversation failed:', error);
    res.status(500).json({ error: 'Failed to add conversation entry', message: error.message });
  }
});

// ─── PUT /api/memory ──────────────────────────────────────────────────────────
// Updates the new dedicated columns AND keeps profile_data JSON blob in sync.

router.put('/', async (req, res) => {
  try {
    const { email, updates } = req.body;
    if (!email || !updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'email and updates object are required' });
    }

    const user = await db('users').where({ garmin_email: email }).first();
    if (!user) return res.status(404).json({ error: 'Athlete not found' });

    const profile = await db('athlete_profiles').where({ user_id: user.id }).first();
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    // Map incoming update keys to DB column names and blob fields
    const columnUpdates = {};
    const JSON_COLUMNS = [
      'favorite_sports', 'goals', 'motivations', 'constraints',
      'goals_discussed', 'equipment', 'facilities', 'injuries_conditions',
      'injuries_history', 'baselines', 'preferences', 'training_philosophy',
    ];

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'name') {
        columnUpdates.name_display = value;
      } else if (key === 'location') {
        columnUpdates.location_json = JSON.stringify(value);
      } else if (JSON_COLUMNS.includes(key)) {
        columnUpdates[key] = JSON.stringify(value);
      } else if (key === 'days_per_week' || key === 'minutes_per_session') {
        columnUpdates[key] = value;
      }
      // Unknown keys are silently ignored (they may live only in profile_data)
    }

    // Also keep the profile_data blob in sync
    const profileData = parseJsonCol(profile.profile_data) || {};
    const mergedBlob = { ...profileData };

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'equipment' || key === 'facilities' || key === 'days_per_week' || key === 'minutes_per_session') {
        mergedBlob.access = mergedBlob.access || {};
        if (key === 'equipment') mergedBlob.access.equipment = value;
        else if (key === 'facilities') mergedBlob.access.facilities = value;
        else if (key === 'days_per_week') mergedBlob.access.days_per_week = value;
        else if (key === 'minutes_per_session') mergedBlob.access.minutes_per_session = value;
      } else {
        mergedBlob[key] = value;
      }
    }
    mergedBlob.updated_at = new Date().toISOString();

    await db('athlete_profiles')
      .where({ id: profile.id })
      .update({
        ...columnUpdates,
        profile_data: JSON.stringify(mergedBlob),
        updated_at: db.fn.now(),
      });

    logger.info('Memory updated', { email, keys: Object.keys(updates) });

    const memory = await assembleMemory(email);
    res.json({ success: true, memory });
  } catch (error) {
    logger.error('PUT /api/memory failed:', error);
    res.status(500).json({ error: 'Failed to update memory', message: error.message });
  }
});

export default router;
