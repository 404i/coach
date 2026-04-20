/**
 * Athlete memory CRUD — persisted in backend DB via API.
 */
import { callAPI } from './api.js';

/**
 * Initialize a full memory object from the athlete's DB profile.
 */
export async function initializeMemoryFromProfile(email) {
  try {
    const profileData = await callAPI(`/api/profile?email=${encodeURIComponent(email)}`);
    const profile = profileData.profile;
    if (!profile) throw new Error('Profile not found');

    // Merge structured fields with top-level legacy fields from the raw profile row
    const favoriteSports = (profile.favorite_sports && profile.favorite_sports.length > 0)
      ? profile.favorite_sports
      : (profile.sport_type ? [profile.sport_type] : []);

    const goals = (profile.goals && profile.goals.length > 0)
      ? profile.goals
      : (Array.isArray(profile.training_goals) ? profile.training_goals : []);

    return {
      email,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      name: profile.name || '',
      location: profile.location || {},
      favorite_sports: favoriteSports,
      goals,
      motivations: profile.motivations || [],
      constraints: profile.constraints || [],
      goals_discussed: (goals).map(g => ({
        timestamp: profile.created_at,
        goal: g,
      })),
      equipment: profile.access?.equipment || [],
      facilities: profile.access?.facilities || [],
      days_per_week: profile.access?.days_per_week || profile.weekly_hours || 3,
      minutes_per_session: profile.access?.minutes_per_session || 45,
      injuries_conditions: profile.injuries_conditions || profile.recent_injuries || [],
      injuries_history: (profile.injuries_conditions || profile.recent_injuries || []).map(inj => ({
        timestamp: profile.created_at,
        injury: typeof inj === 'string' ? inj : inj.name,
        status: inj.status || 'unknown',
        severity: inj.severity_0_10,
        contraindications: inj.contraindications || [],
      })),
      baselines: { ...(profile.baselines || {}), hrv: profile.baseline_hrv || undefined },
      preferences: {
        max_hard_days_per_week: profile.preferences?.max_hard_days_per_week || 2,
        preferred_training_time: profile.preferences?.preferred_training_time || 'either',
        likes_variety: profile.preferences?.likes_variety !== undefined ? profile.preferences.likes_variety : true,
        ...(profile.preferences || {}),
      },
      training_mode: profile.training_mode || null,
      weekly_hours: profile.weekly_hours || null,
      conversation_history: [],
      important_notes: [],
      training_philosophy: [],
      profile_id: profile.profile_id,
      profile_created_at: profile.created_at,
      last_synced_from_db: new Date().toISOString(),
    };
  } catch {
    return {
      email,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      equipment: [],
      preferences: {},
      conversation_history: [],
      important_notes: [],
      training_philosophy: [],
      goals_discussed: [],
      injuries_history: [],
      favorite_sports: [],
      goals: [],
      motivations: [],
      constraints: [],
    };
  }
}

export async function readMemory(email) {
  try {
    const data = await callAPI(`/api/memory?email=${encodeURIComponent(email)}`);
    return data.memory;
  } catch (error) {
    if (error.message.includes('404') || error.message.includes('not found')) {
      const initialMemory = await initializeMemoryFromProfile(email);
      await writeMemory(email, initialMemory);
      return initialMemory;
    }
    console.error('[MCP] readMemory API error:', error.message);
    return {
      email,
      equipment: [],
      preferences: {},
      conversation_history: [],
      important_notes: [],
      training_philosophy: [],
      goals_discussed: [],
      injuries_history: [],
      favorite_sports: [],
      goals: [],
      motivations: [],
      constraints: [],
    };
  }
}

export async function writeMemory(email, memoryData) {
  const updates = {};
  const PROFILE_FIELDS = [
    'name', 'location', 'favorite_sports', 'goals', 'motivations',
    'constraints', 'goals_discussed', 'equipment', 'facilities',
    'days_per_week', 'minutes_per_session', 'injuries_conditions',
    'injuries_history', 'baselines', 'preferences', 'training_philosophy',
  ];
  for (const field of PROFILE_FIELDS) {
    if (memoryData[field] !== undefined) updates[field] = memoryData[field];
  }

  try {
    const data = await callAPI('/api/memory', {
      method: 'PUT',
      body: JSON.stringify({ email, updates }),
    });
    return data.memory || memoryData;
  } catch (error) {
    console.error('[MCP] writeMemory API error:', error.message);
    return memoryData;
  }
}

export async function updateMemory(email, updates) {
  try {
    const data = await callAPI('/api/memory', {
      method: 'PUT',
      body: JSON.stringify({ email, updates }),
    });
    return data.memory;
  } catch (error) {
    console.error('[MCP] updateMemory API error:', error.message);
    return null;
  }
}

export async function appendToMemoryArray(email, arrayKey, item) {
  if (arrayKey === 'conversation_history') {
    try {
      await callAPI('/api/memory/conversation', {
        method: 'POST',
        body: JSON.stringify({ email, topic: item.topic, summary: item.summary }),
      });
    } catch (error) {
      console.error('[MCP] appendToMemoryArray (conversation) API error:', error.message);
    }
    return;
  }
  const memory = await readMemory(email);
  if (!Array.isArray(memory[arrayKey])) memory[arrayKey] = [];
  memory[arrayKey].push({ timestamp: new Date().toISOString(), ...item });
  await writeMemory(email, memory);
}
