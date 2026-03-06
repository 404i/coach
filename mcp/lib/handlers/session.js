/**
 * Session / profile / memory tool handlers.
 */
import { callAPI } from '../api.js';
import { getDateTimeContext } from '../datetime.js';
import { getCurrentAthlete, setCurrentAthlete, saveAthleteState } from '../state.js';
import { autoSyncIfNeeded, getLastSyncTime } from '../sync.js';
import { readMemory, writeMemory, updateMemory, initializeMemoryFromProfile } from '../memory.js';

export const sessionHandlers = {
  async set_current_athlete(args) {
    setCurrentAthlete(args.email);
    await saveAthleteState();
    const data = await callAPI(`/api/profile?email=${encodeURIComponent(args.email)}`);
    const datetime = getDateTimeContext();

    const synced = await autoSyncIfNeeded(args.email);
    const lastSyncTime = await getLastSyncTime(args.email);
    const hoursSinceSync = lastSyncTime > 0 ? (Date.now() - lastSyncTime) / (1000 * 60 * 60) : null;

    let syncStatus = '';
    if (synced) {
      syncStatus = '✓ Auto-synced fresh data from Garmin';
    } else if (hoursSinceSync === null) {
      syncStatus = '⚠️  No sync history - consider syncing data';
    } else if (hoursSinceSync > 2) {
      syncStatus = `⏰ Last sync: ${hoursSinceSync.toFixed(1)} hours ago - data is stale`;
    } else {
      syncStatus = `✓ Data synced ${hoursSinceSync.toFixed(1)} hours ago (fresh)`;
    }

    return {
      content: [{
        type: "text",
        text: `✓ Athlete context set to: ${args.email}\n\n📅 ${datetime.formatted}\nProfile: ${data.profile.name || 'N/A'}\n${syncStatus}\n\nAll subsequent commands will use this athlete's data automatically.`,
      }],
    };
  },

  async get_athlete_profile(args) {
    const email = args.email || getCurrentAthlete();
    const data = await callAPI(`/api/profile?email=${encodeURIComponent(email)}`);
    return { content: [{ type: "text", text: JSON.stringify(data.profile, null, 2) }] };
  },

  async add_equipment(args) {
    const email = args.email || getCurrentAthlete();
    const memory = await readMemory(email);
    if (!memory.equipment.includes(args.equipment)) {
      memory.equipment.push(args.equipment);
      await updateMemory(email, { equipment: memory.equipment });
    }
    return {
      content: [{ type: "text", text: `✓ Equipment recorded: ${args.equipment}\n\nAll equipment: ${memory.equipment.join(', ')}` }],
    };
  },

  async update_preferences(args) {
    const email = args.email || getCurrentAthlete();
    const memory = await readMemory(email);
    const updatedPreferences = { ...memory.preferences, [args.preference_key]: args.preference_value };
    await updateMemory(email, { preferences: updatedPreferences });
    return {
      content: [{ type: "text", text: `✓ Preference updated: ${args.preference_key} = ${args.preference_value}` }],
    };
  },

  async add_conversation_note(args) {
    const email = args.email || getCurrentAthlete();
    try {
      await callAPI('/api/memory/conversation', {
        method: 'POST',
        body: JSON.stringify({ email, topic: args.topic, summary: args.summary }),
      });
    } catch (error) {
      console.error('[MCP] add_conversation_note API error:', error.message);
    }
    return {
      content: [{ type: "text", text: `✓ Conversation recorded: ${args.topic}\n${args.summary}` }],
    };
  },

  async add_important_note(args) {
    const email = args.email || getCurrentAthlete();
    try {
      await callAPI('/api/memory/notes', {
        method: 'POST',
        body: JSON.stringify({ email, note: args.note, source: 'llm' }),
      });
    } catch (error) {
      console.error('[MCP] add_important_note API error:', error.message);
    }
    return {
      content: [{ type: "text", text: `✓ Important note added: ${args.note}` }],
    };
  },

  async refresh_athlete_memory(args) {
    const email = args.email || getCurrentAthlete();
    const freshMemory = await initializeMemoryFromProfile(email);
    await writeMemory(email, freshMemory);
    const assembled = await readMemory(email);
    return {
      content: [{
        type: "text",
        text: `✓ Athlete profile refreshed from database\n\nUpdated information:\n- Name: ${assembled.name || freshMemory.name}\n- Sports: ${(assembled.favorite_sports || freshMemory.favorite_sports || []).join(', ')}\n- Goals: ${(assembled.goals || freshMemory.goals || []).length} goal(s)\n- Equipment: ${(assembled.equipment || freshMemory.equipment || []).length} item(s)\n- Injuries: ${(assembled.injuries_conditions || freshMemory.injuries_conditions || []).length} tracked\n- Last synced: ${freshMemory.last_synced_from_db}`,
      }],
    };
  },
};
