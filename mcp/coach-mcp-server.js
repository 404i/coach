#!/usr/bin/env node

/**
 * Garmin AI Coach MCP Server
 * 
 * Provides MCP tools to chat with your AI coach:
 * - Get athlete profile and training data
 * - Fetch workout recommendations
 * - Access Garmin metrics
 * - Have coaching conversations
 * - Sync Garmin data
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { timingSafeEqual } from 'crypto';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MEMORIES_DIR = path.join(__dirname, 'memories');
const SYSTEM_PROMPT_PATH = path.join(__dirname, 'coach-system-prompt.md');
const STATE_FILE = path.join(__dirname, '.coach-mcp-state.json');

const API_BASE_URL = process.env.COACH_API_URL || 'http://localhost:8080';

// ─── Process-level crash guards ──────────────────────────────────────────────
// Prevent the MCP server from exiting on unhandled errors — losing all session
// state and forcing Claude Desktop to restart the process mid-conversation.
process.on('uncaughtException', (err) => {
  console.error('[MCP] Uncaught exception (server kept alive):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[MCP] Unhandled rejection (server kept alive):', reason?.message || reason);
});

// Date/time context utility
function getDateTimeContext() {
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const day = days[now.getDay()];
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].substring(0, 5);
  
  return {
    date,
    day,
    time,
    formatted: `${day}, ${date} at ${time}`,
    timestamp: now.getTime()
  };
}

// Load system prompt
let SYSTEM_PROMPT = '';
async function loadSystemPrompt() {
  try {
    SYSTEM_PROMPT = await fs.readFile(SYSTEM_PROMPT_PATH, 'utf-8');
  } catch (error) {
    SYSTEM_PROMPT = 'Expert AI endurance coach. Always be honest about missing data.';
  }
}
await loadSystemPrompt();
await loadAthleteState();

// Helper to call backend API
async function callAPI(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error (${response.status}): ${error}`);
  }

  return await response.json();
}

/**
 * Get last sync timestamp for an athlete
 */
async function getLastSyncTime(email) {
  try {
    const response = await callAPI(`/api/health?email=${encodeURIComponent(email)}`);
    // Check for last_sync field in response
    if (response.last_sync) {
      return new Date(response.last_sync).getTime();
    }
    // Fallback: check latest activity date as proxy
    const context = await getActivityContext(email);
    if (context.latest_activity_date) {
      return new Date(context.latest_activity_date).getTime();
    }
    return 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Check if data needs syncing based on last sync time (>1 hour = stale)
 * Returns true if sync was performed, false if data is fresh
 */
async function autoSyncIfNeeded(email) {
  try {
    const now = Date.now();
    const lastSyncTime = await getLastSyncTime(email);
    const hoursSinceSync = (now - lastSyncTime) / (1000 * 60 * 60);
    
    // If never synced or no activities, sync last 7 days
    if (lastSyncTime === 0) {
      console.error('⚠️  No sync history found - syncing last 7 days');
      await callAPI('/api/garmin/sync', {
        method: 'POST',
        body: JSON.stringify({
          email: email,
          start_date: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: new Date().toISOString().split('T')[0],
        }),
      });
      return true;
    }
    
    // If last sync was more than 1 hour ago, sync recent data
    if (hoursSinceSync > 1) {
      console.error(`ℹ️  Last sync was ${hoursSinceSync.toFixed(1)} hours ago - syncing recent data`);
      
      // Sync last 2 days to catch up
      await callAPI('/api/garmin/sync', {
        method: 'POST',
        body: JSON.stringify({
          email: email,
          start_date: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: new Date().toISOString().split('T')[0],
        }),
      });
      return true;
    }
    
    console.error(`✓ Data is fresh (synced ${hoursSinceSync.toFixed(1)} hours ago)`);
    return false; // Data is fresh
  } catch (error) {
    // If sync fails with auth error, try to reauth
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.error('🔑 Session expired - attempting re-authentication');
      
      try {
        const reauthResult = await callAPI('/api/garmin/reauth', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        
        if (reauthResult.success) {
          console.error('✓ Re-authentication successful - retrying sync');
          // Retry sync after reauth
          await callAPI('/api/garmin/sync', {
            method: 'POST',
            body: JSON.stringify({
              email: email,
              start_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              end_date: new Date().toISOString().split('T')[0],
            }),
          });
          return true;
        } else {
          // Reauth failed - might need MFA
          if (reauthResult.mfa_required) {
            throw new Error('MFA_REQUIRED: Please authenticate via POST /api/garmin/login with mfa_code');
          }
          throw new Error(`Re-authentication failed: ${reauthResult.message}`);
        }
      } catch (reauthError) {
        console.error('❌ Re-authentication failed:', reauthError.message);
        throw reauthError;
      }
    }
    
    // Not an auth error - log and continue
    console.error('⚠️  Auto-sync failed:', error.message);
    return false;
  }
}

// ============================================================================
// ACTIVITY VERIFICATION HELPERS - Prevent Hallucinations
// ============================================================================

/**
 * Get activity context - checks latest activity and sync status
 * 🚨 CRITICAL: Call this before referencing any activities to prevent hallucinations
 */
async function getActivityContext(email) {
  try {
    const context = await callAPI(`/api/activity/context?email=${encodeURIComponent(email)}`);
    return context;
  } catch (error) {
    return {
      latest_activity_date: null,
      days_since_last: null,
      warning: '⚠️  Could not verify activity status',
      sync_status: 'error'
    };
  }
}

/**
 * Get most recent activity with details
 */
async function getLatestActivity(email) {
  try {
    return await callAPI(`/api/activity/latest?email=${encodeURIComponent(email)}`);
  } catch (error) {
    return {
      exists: false,
      warning: '⚠️  Could not retrieve latest activity'
    };
  }
}

/**
 * Add verification context to any response
 * Use this to wrap responses with activity and data freshness context
 */
async function addVerificationContext(email, responseData) {
  const activityCtx = await getActivityContext(email);
  
  let contextNote = '';
  if (activityCtx.warning) {
    contextNote = `\n\n🚨 **ACTIVITY STATUS**: ${activityCtx.warning}`;
  }
  if (activityCtx.latest_activity_date) {
    contextNote += `\n📅 **Latest Activity**: ${activityCtx.latest_activity_date} (${activityCtx.days_since_last} days ago)`;
  }
  if (activityCtx.days_since_last > 2) {
    contextNote += `\n⚠️  **SYNC NEEDED**: No activities recorded in ${activityCtx.days_since_last} days. Garmin sync may be required.`;
  }
  
  return {
    activity_context: activityCtx,
    context_note: contextNote,
    data: responseData
  };
}

// Session state - stores current athlete context
// Persisted to STATE_FILE so it survives server restarts (e.g. crashes/updates)
let currentAthleteEmail = null;

async function loadAthleteState() {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf-8');
    const state = JSON.parse(raw);
    if (state.currentAthleteEmail) {
      currentAthleteEmail = state.currentAthleteEmail;
      console.error(`[MCP] Restored athlete context: ${currentAthleteEmail}`);
    }
  } catch {
    // State file missing or corrupt — start fresh, that's fine
  }
}

async function saveAthleteState() {
  try {
    await fs.writeFile(STATE_FILE, JSON.stringify({ currentAthleteEmail }, null, 2));
  } catch (err) {
    console.error('[MCP] Warning: could not persist athlete state:', err.message);
  }
}

function getCurrentAthlete() {
  if (!currentAthleteEmail) {
    throw new Error('No athlete context set. Please use set_current_athlete tool first or provide an email parameter.');
  }
  return currentAthleteEmail;
}

// Helper to get profile_id from email
async function getProfileId(email) {
  const data = await callAPI(`/api/profile?email=${encodeURIComponent(email)}`);
  if (!data.profile || !data.profile.profile_id) {
    throw new Error(`Profile not found for email: ${email}`);
  }
  return data.profile.profile_id;
}

// Helper to parse location string to coordinates
function parseLocationToCoords(location) {
  // Check if already in lat,lon format
  if (location.includes(',')) {
    const [lat, lon] = location.split(',').map(s => parseFloat(s.trim()));
    if (!isNaN(lat) && !isNaN(lon)) {
      return { lat, lon };
    }
  }
  
  // Default coordinates for common locations (fallback)
  const locations = {
    'sofia': { lat: 42.6977, lon: 23.3219 },
    'london': { lat: 51.5074, lon: -0.1278 },
    'new york': { lat: 40.7128, lon: -74.0060 },
    'paris': { lat: 48.8566, lon: 2.3522 },
    'berlin': { lat: 52.5200, lon: 13.4050 },
    'tokyo': { lat: 35.6762, lon: 139.6503 },
    'sydney': { lat: -33.8688, lon: 151.2093 },
    'default': { lat: 42.6977, lon: 23.3219 } // Sofia as default
  };
  
  const normalized = location.toLowerCase().trim();
  return locations[normalized] || locations['default'];
}

// Memory management functions
async function getMemoryPath(email) {
  const sanitizedEmail = email.replace(/[^a-zA-Z0-9@._-]/g, '_');
  return path.join(MEMORIES_DIR, `${sanitizedEmail}.json`);
}

// Initialize memory from athlete profile in database
async function initializeMemoryFromProfile(email) {
  try {
    const profileData = await callAPI(`/api/profile?email=${encodeURIComponent(email)}`);
    const profile = profileData.profile;
    
    if (!profile) {
      throw new Error('Profile not found');
    }
    
    // Build comprehensive memory from profile
    const memory = {
      email,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      
      // From onboarding
      name: profile.name || '',
      location: profile.location || {},
      favorite_sports: profile.favorite_sports || [],
      
      // Goals and motivations
      goals: profile.goals || [],
      motivations: profile.motivations || [],
      constraints: profile.constraints || [],
      goals_discussed: (profile.goals || []).map(g => ({
        timestamp: profile.created_at,
        goal: g
      })),
      
      // Training access and resources
      equipment: profile.access?.equipment || [],
      facilities: profile.access?.facilities || [],
      days_per_week: profile.access?.days_per_week || 3,
      minutes_per_session: profile.access?.minutes_per_session || 45,
      
      // Health and injury history
      injuries_conditions: profile.injuries_conditions || [],
      injuries_history: (profile.injuries_conditions || []).map(inj => ({
        timestamp: profile.created_at,
        injury: inj.name,
        status: inj.status,
        severity: inj.severity_0_10,
        contraindications: inj.contraindications || []
      })),
      
      // Baselines and physiological data
      baselines: profile.baselines || {},
      
      // Preferences
      preferences: {
        max_hard_days_per_week: profile.preferences?.max_hard_days_per_week || 2,
        preferred_training_time: profile.preferences?.preferred_training_time || 'either',
        likes_variety: profile.preferences?.likes_variety !== undefined ? profile.preferences.likes_variety : true,
        ...(profile.preferences || {})
      },
      
      // Conversation tracking
      conversation_history: [],
      important_notes: [],
      training_philosophy: [],
      
      // Metadata
      profile_id: profile.profile_id,
      profile_created_at: profile.created_at,
      last_synced_from_db: new Date().toISOString()
    };
    
    return memory;
  } catch (error) {
    // If API fails, return minimal structure
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
      constraints: []
    };
  }
}

async function readMemory(email) {
  const memoryPath = await getMemoryPath(email);
  try {
    const data = await fs.readFile(memoryPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // First access - initialize from database profile
      const initialMemory = await initializeMemoryFromProfile(email);
      await writeMemory(email, initialMemory);
      return initialMemory;
    }
    throw error;
  }
}

async function writeMemory(email, memoryData) {
  const memoryPath = await getMemoryPath(email);
  memoryData.updated_at = new Date().toISOString();
  await fs.mkdir(MEMORIES_DIR, { recursive: true });
  await fs.writeFile(memoryPath, JSON.stringify(memoryData, null, 2), 'utf-8');
  return memoryData;
}

async function updateMemory(email, updates) {
  const memory = await readMemory(email);
  const updatedMemory = { ...memory, ...updates };
  return await writeMemory(email, updatedMemory);
}

async function appendToMemoryArray(email, arrayKey, item) {
  const memory = await readMemory(email);
  if (!Array.isArray(memory[arrayKey])) {
    memory[arrayKey] = [];
  }
  memory[arrayKey].push({
    timestamp: new Date().toISOString(),
    ...item
  });
  return await writeMemory(email, memory);
}

// Create a fresh MCP server instance per SSE session to avoid shared-transport collisions
function createMCPServer() {
const server = new Server(
  {
    name: "garmin-ai-coach",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Tool definitions
const TOOLS = [
  {
    name: "set_current_athlete",
    description: "Set the current athlete context for this session. Call this at the start of a conversation to establish who you're coaching. After calling this, other tools won't require the email parameter.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email address (coach account identifier)",
        },
      },
      required: ["email"],
    },
  },
  {
    name: "get_athlete_profile",
    description: "Get the athlete's complete profile including goals, sports, baselines, injuries, and training preferences. Use this to understand the athlete before giving advice.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email address (optional if current athlete is set)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_today_workout",
    description: "Generate today's workout recommendation based on the athlete's profile, recent training, and recovery status. Returns 4 workout options at different intensities.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email address (optional if current athlete is set)",
        },
        date: {
          type: "string",
          description: "Date in YYYY-MM-DD format (defaults to today)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_weekly_plan",
    description: "Get the 7-day workout plan for the current week. Shows the complete training schedule with workout details for each day.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email address (optional if current athlete is set)",
        },
        week_start: {
          type: "string",
          description: "Monday of the week in YYYY-MM-DD format (optional, defaults to current week)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_training_metrics",
    description: "Get Garmin training metrics (heart rate, activities, sleep, etc.) for a specific time period. Returns data for visualization and analysis. CRITICAL: If any metric shows null/undefined, state 'NO DATA AVAILABLE' for that metric - NEVER invent or estimate values.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email address (optional if current athlete is set)",
        },
        days: {
          type: "number",
          description: "Number of days to fetch (default: 30)",
          default: 30,
        },
      },
      required: [],
    },
  },
  {
    name: "sync_garmin_data",
    description: "Sync latest Garmin data for the athlete. Fetches recent activities, heart rate, sleep, and other metrics from Garmin Connect. Will automatically check if data is stale (>1 hour old) and sync if needed.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email address (optional if current athlete is set)",
        },
        days: {
          type: "number",
          description: "Number of days to sync (default: 3)",
          default: 3,
        },
      },
      required: [],
    },
  },
  {
    name: "confirm_garmin_auth",
    description: "Call this AFTER the user has run the authentication terminal command and confirms they've completed the MFA process. This will retry the sync operation.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email address (optional if current athlete is set)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_activities",
    description: "Get detailed workout/activity records (cycling, running, swimming, yoga, etc.) including distance, duration, heart rate, power, training load, and performance metrics. Use this to answer questions about specific workouts or training history.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email address (optional if current athlete is set)",
        },
        limit: {
          type: "number",
          description: "Maximum number of activities to return (default: 20)",
          default: 20,
        },
        start_date: {
          type: "string",
          description: "Filter activities from this date (YYYY-MM-DD format, optional)",
        },
        end_date: {
          type: "string",
          description: "Filter activities to this date (YYYY-MM-DD format, optional)",
        },
      },
      required: [],
    },
  },
  {
    name: "chat_with_coach",
    description: "Have a natural conversation with the AI coach. Ask questions, discuss training, get advice on nutrition, recovery, race prep, or any training-related topics. CRITICAL: NEVER invent or hallucinate data. If metrics are null/missing, explicitly state 'NO DATA AVAILABLE' - do not make up values.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email address (optional if current athlete is set)",
        },
        message: {
          type: "string",
          description: "Your question or message to the coach",
        },
      },
      required: ["message"],
    },
  },
  {
    name: "add_equipment",
    description: "Record equipment the athlete mentions (shoes, watch, bike, etc.). This helps personalize training advice.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        equipment: {
          type: "string",
          description: "Equipment to add (e.g., 'Garmin Forerunner 945', 'road bike', 'Hoka Clifton 9')",
        },
      },
      required: ["equipment"],
    },
  },
  {
    name: "update_preferences",
    description: "Update athlete preferences learned during conversations (workout times, training style, etc.)",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        preference_key: {
          type: "string",
          description: "Preference key (e.g., 'workout_time', 'training_style', 'motivation')",
        },
        preference_value: {
          type: "string",
          description: "Preference value",
        },
      },
      required: ["preference_key", "preference_value"],
    },
  },
  {
    name: "add_conversation_note",
    description: "Record important topics discussed in coaching conversations for future reference.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        topic: {
          type: "string",
          description: "Conversation topic or subject",
        },
        summary: {
          type: "string",
          description: "Brief summary of what was discussed",
        },
      },
      required: ["topic", "summary"],
    },
  },
  {
    name: "add_important_note",
    description: "Record important coaching notes (restrictions, preferences, injury warnings, etc.)",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        note: {
          type: "string",
          description: "Important note to remember",
        },
      },
      required: ["note"],
    },
  },
  {
    name: "refresh_athlete_memory",
    description: "Refresh athlete memory from their database profile. Use this if you suspect the profile has been updated (new goals, changed preferences, etc.) or to ensure you have the latest athlete information.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_training_load_trend",
    description: "Get training load trend analysis including acute load (7-day avg), chronic load (42-day avg), and acute:chronic ratio. Shows if athlete is in optimal training zone, overreaching, or detraining. Status values: 'detraining' (ACR < 0.8), 'optimal' (0.8-1.3), 'building' (1.3-1.5), 'high_risk' (>1.5).",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        days: {
          type: "number",
          description: "Number of days to analyze (default: 60)",
          default: 60,
        },
      },
      required: [],
    },
  },
  {
    name: "get_recovery_trend",
    description: "Get recovery score trends including 7-day and 30-day averages, trend direction (improving/declining/stable), and factor breakdown (HRV%, sleep%, stress%, recovery_time%). Identifies the limiting factor affecting recovery.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        days: {
          type: "number",
          description: "Number of days to analyze (default: 60)",
          default: 60,
        },
      },
      required: [],
    },
  },
  {
    name: "get_hrv_baseline",
    description: "Get HRV baseline analysis including personal mean, standard deviation, percentiles (p10/p25/p50/p75/p90), and current HRV status. Shows if current HRV is very_low (<p10), low (<p25), normal (p25-p75), high (>p75), or very_high (>p90).",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        days: {
          type: "number",
          description: "Number of days to analyze (default: 60)",
          default: 60,
        },
      },
      required: [],
    },
  },
  {
    name: "get_training_stress_balance",
    description: "Get Training Stress Balance (TSB) showing fitness level, fatigue level, and form status. TSB = Fitness - Fatigue. Form values: 'rested' (TSB>10), 'fresh' (-10 to 10), 'fatigued' (-30 to -10), 'overreached' (<-30). Helps determine if athlete needs rest or can handle hard training.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        days: {
          type: "number",
          description: "Number of days to analyze (default: 60)",
          default: 60,
        },
      },
      required: [],
    },
  },
  {
    name: "get_stats_summary",
    description: "Get comprehensive stats summary in one call: training load trend, recovery trend, HRV baseline, and training stress balance. Provides complete overview of athlete's current fitness, fatigue, and recovery status for holistic coaching insights.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_workout_recommendations",
    description: "Get intelligent workout recommendations based on current readiness, training load, recovery, HRV, and TSB. Returns 4 workout options (recovery/easy/moderate/hard) with activities, durations, intensity guidelines, and warnings. Includes TRAINING READINESS SCORE (0-100, a composite metric combining Recovery 35% + ACR 25% + HRV 20% + TSB 20%, NOT just recovery alone), with detailed breakdown showing each component's contribution, readiness interpretation, recommended intensity level, and limiting factors analysis. Use this to recommend what the athlete should do TODAY.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        date: {
          type: "string",
          description: "Optional date (YYYY-MM-DD format). Defaults to today.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_weekly_workout_plan",
    description: "Generate an intelligent 7-day training plan based on current fitness, fatigue, and recovery. Uses polarized training principles (80% easy, 20% hard). Automatically schedules recovery weeks when needed, manages progressive load increases to avoid injury (ACR spikes), and balances hard/moderate/easy/rest days. Returns daily workouts with activities, durations, targets, plus coaching notes and weekly strategy. Use this for MULTI-DAY planning and strategic training guidance.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        start_date: {
          type: "string",
          description: "Optional start date (YYYY-MM-DD format). Defaults to tomorrow.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_activity_distribution",
    description: "Analyze training distribution across sports (running/cycling/swimming/etc). Shows breakdown by percentage of load and duration, frequency, averages, and recent activities per sport. Use this to understand training balance and identify if athlete is over-focused on one sport.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        days: {
          type: "number",
          description: "Number of days to analyze (default: 30)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_sport_insights",
    description: "Get comprehensive activity insights: training balance, sport-specific patterns, frequency issues, intensity balance (80/20 rule), and cross-training recommendations. Returns insights with severity levels and actionable recommendations. Use this for strategic coaching on training variety and balance.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        days: {
          type: "number",
          description: "Number of days to analyze (default: 30)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_sport_specific_workout",
    description: "Generate structured workouts for a specific sport (running/cycling/swimming). Returns sport-appropriate workout structures with pace/power/HR targets, interval timing, technique focus, and coaching cues. Workouts are tailored to athlete's recent baseline performance. Use this when recommending SPECIFIC workout structures rather than generic guidance.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        sport: {
          type: "string",
          description: "Sport type (running, cycling, swimming, training, etc)",
        },
        intensity: {
          type: "string",
          description: "Intensity level: recovery, easy, moderate, or hard (default: moderate)",
        },
      },
      required: ["sport"],
    },
  },
  {
    name: "add_diary_entry",
    description: "Create or update a training diary entry. Logs subjective feelings, energy, motivation, sleep quality, stress, soreness, and free-form notes. Use this to help athletes reflect on training sessions and track how they feel day-to-day. Accepts ratings on 1-10 scale plus text notes.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        date: {
          type: "string",
          description: "Date of entry (YYYY-MM-DD format). Defaults to today.",
        },
        overall_feel: {
          type: "number",
          description: "Overall feeling rating 1-10 (1=terrible, 10=amazing)",
        },
        energy: {
          type: "number",
          description: "Energy level 1-10 (1=exhausted, 10=fully energized)",
        },
        motivation: {
          type: "number",
          description: "Motivation to train 1-10 (1=no motivation, 10=extremely motivated)",
        },
        sleep_quality: {
          type: "number",
          description: "Sleep quality last night 1-10 (1=terrible, 10=excellent)",
        },
        stress_level: {
          type: "number",
          description: "Mental stress level 1-10 (1=very relaxed, 10=extremely stressed)",
        },
        soreness: {
          type: "number",
          description: "Muscle soreness 1-10 (1=no soreness, 10=very sore)",
        },
        rpe: {
          type: "number",
          description: "Rate of Perceived Exertion for workout 1-10",
        },
        notes: {
          type: "string",
          description: "Free-form training notes, thoughts, observations",
        },
        highlights: {
          type: "string",
          description: "What went well today",
        },
        challenges: {
          type: "string",
          description: "What was difficult or challenging",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags like 'breakthrough', 'tough', 'fun', 'race'",
        },
      },
      required: [],
    },
  },
  {
    name: "get_diary_entries",
    description: "Retrieve training diary entries with optional date filtering. Returns subjective ratings, notes, and observations logged by the athlete. Use this to review recent training experiences and understand how the athlete has been feeling.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        start_date: {
          type: "string",
          description: "Start date for filtering (YYYY-MM-DD format)",
        },
        end_date: {
          type: "string",
          description: "End date for filtering (YYYY-MM-DD format)",
        },
        limit: {
          type: "number",
          description: "Maximum number of entries to return (default: 30)",
        },
      },
      required: [],
    },
  },
  {
    name: "analyze_diary_patterns",
    description: "AI-powered analysis of patterns between diary entries and objective metrics. Correlates subjective feelings (energy, motivation, mood) with objective data (HRV, recovery, training load). Returns statistical patterns and AI-generated insights about what conditions lead to best/worst training days. Use this to help athletes understand their personal recovery patterns.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        days: {
          type: "number",
          description: "Number of days to analyze (default: 60)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_weekly_summary",
    description: "Generate or retrieve AI-powered weekly training summary. Provides narrative summary of the week's training, key insights, patterns detected, and recommendations for the coming week. Combines objective metrics with diary entries for comprehensive weekly review.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        week_start: {
          type: "string",
          description: "Monday of the week (YYYY-MM-DD format)",
        },
      },
      required: ["week_start"],
    },
  },
  {
    name: "get_insights_and_alerts",
    description: "Get all current insights, alerts, and milestones. Returns proactive warnings (injury risk, overtraining, recovery issues), positive insights (consistency, trends), and achievements (streaks, volume PRs). Use this to check training health status and celebrate wins.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_alerts_by_type",
    description: "Get specific type of alerts. Types: injury_risk, overtraining, poor_recovery, sleep_issues, hrv_decline, hrv_low, detraining_risk, consistency, recovery, hrv_trend, streak, volume_pr, high_volume, consistency_milestone. Use to focus on specific concerns.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        type: {
          type: "string",
          description: "Alert type to filter by (e.g., 'injury_risk', 'overtraining', 'streak')",
        },
      },
      required: ["type"],
    },
  },
  {
    name: "get_load_optimization",
    description: "Get comprehensive training load optimization analysis including ramp rate, sport distribution, volume/intensity balance, fitness-fatigue modeling, and smart recommendations. Identifies training load issues and opportunities.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        weeks: {
          type: "number",
          description: "Number of weeks to analyze (default: 12)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_ramp_rate_analysis",
    description: "Analyze weekly training load progression (ramp rate). Identifies aggressive load increases (>10%/week) that increase injury risk. Provides safe progression recommendations (5-10% per week).",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        weeks: {
          type: "number",
          description: "Number of weeks to analyze (default: 12)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_sport_distribution",
    description: "Analyze training load distribution across sports (cycling, running, swimming, etc). Identifies over-concentration in single sport which increases overuse injury risk. Recommends cross-training balance.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        weeks: {
          type: "number",
          description: "Number of weeks to analyze (default: 12)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_volume_intensity_balance",
    description: "Analyze volume vs intensity balance. Checks adherence to 80/20 rule (80% easy, 20% hard training). Identifies polarization issues that can lead to overtraining or undertraining.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        weeks: {
          type: "number",
          description: "Number of weeks to analyze (default: 12)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_weather_safety",
    description: "Get weather safety assessment for outdoor training. Analyzes temperature, wind, precipitation, visibility. Provides safety score (0-100) and risk level. Critical for planning outdoor workouts safely.",
    inputSchema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "Location name (city) or 'lat,lon' coordinates (e.g., '42.36,-71.06')",
        },
      },
      required: ["location"],
    },
  },
  {
    name: "get_weather_adjusted_workout",
    description: "Get workout plan automatically adjusted for current weather conditions. Modifies intensity, duration, gear recommendations, and provides indoor alternatives when needed. Essential for safe, effective outdoor training.",
    inputSchema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "Location name (city) or 'lat,lon' coordinates",
        },
        sport: {
          type: "string",
          description: "Sport type: cycling, running, swimming (default: cycling)",
        },
        duration: {
          type: "number",
          description: "Planned duration in minutes (default: 60)",
        },
      },
      required: ["location"],
    },
  },
  {
    name: "check_weather_forecast",
    description: "Check current weather and short-term forecast with training-specific analysis. Shows conditions, feels-like temperature, precipitation, wind. Useful for multi-hour workout planning.",
    inputSchema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "Location name (city) or 'lat,lon' coordinates",
        },
      },
      required: ["location"],
    },
  },
  {
    name: "get_training_patterns",
    description: "Get athlete's established training patterns including daily habits (e.g., yoga 6x/week), weekly staples (e.g., HIIT on Tuesdays), time-of-day preferences (morning runs), and multi-activity patterns (yoga + ride combos). Shows pattern confidence, frequency, and how long each pattern has been established. Use this to understand athlete's training routine and consistency.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_pattern_breaks",
    description: "Identify when athlete stops doing regular activities, such as no yoga in 7 days when they usually do it daily, or no HIIT in 3 weeks when it was a weekly staple. Returns breaks with severity levels (low/medium/high/critical), impact scores, and days since last occurrence. Critical for proactive coaching when habits break.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_nudges",
    description: "Get all coaching nudges including pattern breaks (stopped yoga, missing HIIT) and performance gaps (no strength training). Returns prioritized nudges with actionable messages, severity levels, and expected benefits of addressing each issue. Use this to proactively guide athletes back to beneficial habits.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
      },
      required: [],
    },
  },
  {
    name: "suggest_multi_activity",
    description: "Suggest second or third workout for today based on what's already completed and current recovery status. Handles multi-activity days intelligently with load adjustments and recovery predictions. Recommends complementary activities (e.g., yoga after ride, strength after morning run) with load impact and timing guidance.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        date: {
          type: "string",
          description: "Date to analyze (YYYY-MM-DD). Defaults to today.",
        },
      },
      required: [],
    },
  },
  {
    name: "analyze_performance_gaps",
    description: "Identify missing training modalities such as strength training, HIIT intervals, or flexibility work. Shows days absent, typical frequency expected, gap severity, and performance/injury risk impacts. Critical for identifying weaknesses in training program and suggesting high-value additions.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_performance_multipliers",
    description: "Show specific quantified benefits athlete would gain from adding a missing modality. For strength: +10-15% power, -30% injury risk. For HIIT: +5-10% VO2max, +2-5% race speed. For yoga: -20% soreness, +15% sleep quality. Includes timeline estimates and recommended frequency/duration. Use this to motivate athletes with concrete performance improvements.",
    inputSchema: {
      type: "object",
      properties: {
        modality: {
          type: "string",
          description: "Training modality: strength, hiit, or yoga",
        },
      },
      required: ["modality"],
    },
  },
  {
    name: "add_planned_activity",
    description: "Record a future activity mentioned by the athlete (e.g., 'yoga tonight', 'DH park next weekend', 'bike race in 2 weeks'). This creates shared context between Claude and LM Studio so all AI systems know about upcoming plans. Use this whenever athlete mentions future training intentions.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        activityType: {
          type: "string",
          description: "Type of activity: yoga, mountain_biking, cycling, running, swimming, strength, etc.",
        },
        description: {
          type: "string",
          description: "Description of the planned activity (e.g., 'DH park session', 'yoga retreat', 'local criterium race')",
        },
        plannedDate: {
          type: "string",
          description: "Date in YYYY-MM-DD format (required)",
        },
        options: {
          type: "object",
          description: "Optional details",
          properties: {
            timeOfDay: {
              type: "string",
              description: "morning, afternoon, evening",
            },
            priority: {
              type: "string",
              description: "low, medium, high, committed",
            },
            isEvent: {
              type: "boolean",
              description: "Is this an organized event/race?",
            },
            isSocial: {
              type: "boolean",
              description: "Is this a group/social activity?",
            },
            context: {
              type: "string",
              description: "Original conversation context",
            },
          },
        },
      },
      required: ["activityType", "plannedDate"],
    },
  },
  {
    name: "get_upcoming_activities",
    description: "Retrieve future activities the athlete has mentioned (e.g., planned yoga sessions, upcoming races, bike park trips). Use this to check what's already scheduled before making recommendations, and to inform weekly/daily planning. Shows athlete's actual intentions rather than just historic data.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Athlete's email (optional if current athlete is set)",
        },
        daysAhead: {
          type: "number",
          description: "How many days ahead to look (default: 30)",
          default: 30,
        },
      },
      required: [],
    },
  },
  {
    name: "update_planned_activity",
    description: "Update or mark a planned activity as completed, cancelled, or rescheduled. Use this when athlete completes a planned activity or changes their plans.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "Planned activity ID (from get_upcoming_activities)",
        },
        status: {
          type: "string",
          description: "New status: completed, cancelled, rescheduled, planned, scheduled",
        },
        completedDate: {
          type: "string",
          description: "Date completed (YYYY-MM-DD), if marking as completed",
        },
        notes: {
          type: "string",
          description: "Additional notes about the update",
        },
      },
      required: ["id"],
    },
  },
];

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

// List available resources (memories)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  try {
    const resources = [
      {
        uri: 'prompt://coach-system-prompt',
        name: 'Coach System Prompt',
        description: 'Comprehensive coaching philosophy, principles, and instructions for the AI coach',
        mimeType: 'text/markdown'
      }
    ];
    
    const files = await fs.readdir(MEMORIES_DIR);
    const memoryFiles = files.filter(f => f.endsWith('.json'));
    
    memoryFiles.forEach(file => {
      const email = file.replace('.json', '').replace(/_/g, '');
      resources.push({
        uri: `memory://${file.replace('.json', '')}`,
        name: `Athlete Profile: ${email}`,
        description: `Complete profile, memories, preferences, equipment, and conversation history for ${email}`,
        mimeType: "application/json",
      });
    });
    
    return { resources };
  } catch (error) {
    return { resources: [] };
  }
});

// Read resource (memory or prompt)
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  
  if (uri === 'prompt://coach-system-prompt') {
    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: SYSTEM_PROMPT,
        },
      ],
    };
  }
  
  if (uri.startsWith('memory://')) {
    const emailKey = uri.replace('memory://', '');
    const email = emailKey.replace(/_/g, '');
    
    try {
      const memory = await readMemory(email);
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(memory, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to read memory: ${error.message}`);
    }
  }
  
  throw new Error('Invalid resource URI');
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "set_current_athlete": {
        currentAthleteEmail = args.email;
        await saveAthleteState();
        // Verify the athlete exists
        const data = await callAPI(`/api/profile?email=${encodeURIComponent(args.email)}`);
        const datetime = getDateTimeContext();
        
        // Check if sync is needed
        const lastSyncTime = await getLastSyncTime(args.email);
        const hoursSinceSync = lastSyncTime > 0 ? (Date.now() - lastSyncTime) / (1000 * 60 * 60) : null;
        let syncStatus = '';
        if (hoursSinceSync === null) {
          syncStatus = '⚠️  No sync history - consider syncing data';
        } else if (hoursSinceSync > 1) {
          syncStatus = `⏰ Last sync: ${hoursSinceSync.toFixed(1)} hours ago - data may be stale`;
        } else {
          syncStatus = `✓ Data synced ${hoursSinceSync.toFixed(1)} hours ago (fresh)`;
        }
        
        return {
          content: [
            {
              type: "text",
              text: `✓ Athlete context set to: ${args.email}\n\n📅 ${datetime.formatted}\nProfile: ${data.profile.name || 'N/A'}\n${syncStatus}\n\nAll subsequent commands will use this athlete's data automatically.`,
            },
          ],
        };
      }

      case "get_athlete_profile": {
        const email = args.email || getCurrentAthlete();
        const data = await callAPI(`/api/profile?email=${encodeURIComponent(email)}`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data.profile, null, 2),
            },
          ],
        };
      }

      case "get_today_workout": {
        const email = args.email || getCurrentAthlete();
        const profile_id = await getProfileId(email);
        const date = args.date || new Date().toISOString().split('T')[0];
        const data = await callAPI('/api/recommend', {
          method: 'POST',
          body: JSON.stringify({
            profile_id: profile_id,
            date: date,
          }),
        });
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case "get_weekly_plan": {
        const email = args.email || getCurrentAthlete();
        const profile_id = await getProfileId(email);
        
        // Calculate Monday of current week if not provided
        let week_start = args.week_start;
        if (!week_start) {
          const today = new Date();
          const monday = new Date(today);
          monday.setDate(today.getDate() - today.getDay() + 1);
          week_start = monday.toISOString().split('T')[0];
        }
        
        const data = await callAPI(
          `/api/recommend/week?profile_id=${encodeURIComponent(profile_id)}&week_start=${encodeURIComponent(week_start)}`
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case "get_training_metrics": {
        const email = args.email || getCurrentAthlete();
        const days = args.days || 30;
        
        // Calculate date range
        const end_date = new Date().toISOString().split('T')[0];
        const start_date = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const data = await callAPI(
          `/api/garmin/metrics?email=${encodeURIComponent(email)}&start_date=${encodeURIComponent(start_date)}&end_date=${encodeURIComponent(end_date)}`
        );
        
        // Strip out raw_garth_data to reduce payload size (causes data size errors in Claude Desktop)
        if (data.data && Array.isArray(data.data)) {
          data.data.forEach(metric => {
            delete metric.raw_garth_data;
          });
        }
        
        // Check for missing data and explicitly mark it
        let missingFields = [];
        if (data.data && Array.isArray(data.data)) {
          data.data.forEach(metric => {
            const metrics = metric.metrics_data || {};
            const nullFields = [];
            if (metrics.sleep_hours === null || metrics.sleep_hours === undefined) nullFields.push('sleep_hours');
            if (metrics.sleep_score === null || metrics.sleep_score === undefined) nullFields.push('sleep_score');
            if (metrics.training_load === null || metrics.training_load === undefined) nullFields.push('training_load');
            if (metrics.recovery_score === null || metrics.recovery_score === undefined) nullFields.push('recovery_score');
            if (metrics.hrv === null || metrics.hrv === undefined) nullFields.push('hrv');
            if (metrics.rhr === null || metrics.rhr === undefined) nullFields.push('rhr');
            if (nullFields.length > 0) {
              metric._missing_data = nullFields.join(', ');
            }
          });
          // Collect all unique missing fields
          const allMissing = new Set();
          data.data.forEach(m => {
            if (m._missing_data) m._missing_data.split(', ').forEach(f => allMissing.add(f));
          });
          if (allMissing.size > 0) {
            missingFields = Array.from(allMissing);
          }
        }
        
        let responseText = JSON.stringify(data, null, 2);
        if (missingFields.length > 0) {
          responseText = `⚠️ WARNING: The following metrics are NOT AVAILABLE and show null values:\n${missingFields.join(', ')}\n\n**DO NOT invent or estimate these values. State clearly: "NO DATA AVAILABLE for ${missingFields.join(', ')}"**\n\n` + responseText;
        }
        
        return {
          content: [
            {
              type: "text",
              text: responseText,
            },
          ],
        };
      }

      case "sync_garmin_data": {
        const email = args.email || getCurrentAthlete();
        const days = args.days || 3;
        
        // Calculate date range
        const end_date = new Date().toISOString().split('T')[0];
        const start_date = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        try {
          const response = await callAPI('/api/garmin/sync', {
            method: 'POST',
            body: JSON.stringify({
              email: email,
              start_date: start_date,
              end_date: end_date,
            }),
          });
          
          // Backend now returns a summary, not full raw data
          const summary = response.data || response;
          
          return {
            content: [
              {
                type: "text",
                text: `✓ Garmin sync completed successfully!\n\n${JSON.stringify(summary, null, 2)}\n\nUse get_training_metrics or get_activities to view the synced data.`,
              },
            ],
          };
        } catch (error) {
          // Handle auth errors with automatic reauth
          if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            console.error('🔑 Session expired during sync - attempting re-authentication');
            
            try {
              const reauthResult = await callAPI('/api/garmin/reauth', {
                method: 'POST',
                body: JSON.stringify({ email }),
              });
              
              if (reauthResult.success) {
                console.error('✓ Re-authentication successful - retrying sync');
                // Retry sync
                const retryResponse = await callAPI('/api/garmin/sync', {
                  method: 'POST',
                  body: JSON.stringify({
                    email: email,
                    start_date: start_date,
                    end_date: end_date,
                  }),
                });
                
                const summary = retryResponse.data || retryResponse;
                return {
                  content: [
                    {
                      type: "text",
                      text: `✓ Session re-authenticated and sync completed!\n\n${JSON.stringify(summary, null, 2)}\n\nUse get_training_metrics or get_activities to view the synced data.`,
                    },
                  ],
                };
              } else if (reauthResult.mfa_required) {
                const datetime = getDateTimeContext();
                return {
                  content: [
                    {
                      type: "text",
                      text: `🔐 **MFA Required for Garmin Authentication**\n\n📅 ${datetime.formatted}\n\nYour Garmin session has expired and requires Multi-Factor Authentication.\n\n**Please run this command in your terminal:**\n\n\`\`\`bash\ncurl -X POST "http://localhost:8080/api/garmin/login" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "email": "${email}",\n    "password": "YOUR_GARMIN_PASSWORD",\n    "mfa_code": "WAIT_FOR_EMAIL"\n  }'\n\`\`\`\n\n**Steps:**\n1. Check your email for Garmin MFA code\n2. Replace \`YOUR_GARMIN_PASSWORD\` with your actual password\n3. Replace \`WAIT_FOR_EMAIL\` with the 6-digit code from your email\n4. Run the command\n5. Then tell me \"I've authenticated\" and I'll retry the sync\n\n⚠️  The MFA code expires quickly, so have it ready before running the command.`,
                    },
                  ],
                };
              }
              
              throw new Error(`Re-authentication failed: ${reauthResult.message}`);
            } catch (reauthError) {
              return {
                content: [
                  {
                    type: "text",
                    text: `❌ Sync Failed - Re-authentication Error\n\nError: ${reauthError.message}\n\nPlease check your Garmin credentials and try manual authentication.`,
                  },
                ],
              };
            }
          }
          
          // Other errors - return as is
          throw error;
        }
      }

      case "confirm_garmin_auth": {
        const email = args.email || getCurrentAthlete();
        const datetime = getDateTimeContext();
        
        try {
          // User has completed auth - sync last 3 days
          console.error('🔄 User confirmed authentication - attempting sync');
          
          const response = await callAPI('/api/garmin/sync', {
            method: 'POST',
            body: JSON.stringify({
              email: email,
              start_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              end_date: new Date().toISOString().split('T')[0],
            }),
          });
          
          const summary = response.data || response;
          
          return {
            content: [
              {
                type: "text",
                text: `✅ **Authentication Confirmed - Sync Complete!**\n\n📅 ${datetime.formatted}\n\n${JSON.stringify(summary, null, 2)}\n\nYour Garmin data is now up to date. Use get_training_metrics or get_activities to view the synced data.`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ **Sync Failed After Authentication**\n\n📅 ${datetime.formatted}\n\nError: ${error.message}\n\nPlease verify:\n1. The authentication command completed successfully\n2. You received a success response\n3. Your credentials are correct\n\nIf the problem persists, try running the authentication command again.`,
              },
            ],
          };
        }
      }

      case "get_activities": {
        const email = args.email || getCurrentAthlete();
        const limit = args.limit || 20;
        
        // � AUTO-SYNC: Check if data is stale and sync if needed
        try {
          const synced = await autoSyncIfNeeded(email);
          if (synced) {
            console.error('✓ Auto-sync completed - fetching updated activities');
          }
        } catch (syncError) {
          console.error('⚠️  Auto-sync failed:', syncError.message);
          // Continue to fetch whatever data we have
        }
        
        // �🚨 CRITICAL: Check activity context first
        const activityCtx = await getActivityContext(email);
        
        let url = `/api/garmin/activities?email=${encodeURIComponent(email)}&limit=${limit}`;
        if (args.start_date) url += `&start_date=${encodeURIComponent(args.start_date)}`;
        if (args.end_date) url += `&end_date=${encodeURIComponent(args.end_date)}`;
        
        const data = await callAPI(url);
        
        // Strip raw_activity_data to reduce payload size
        if (data.activities && Array.isArray(data.activities)) {
          data.activities.forEach(activity => {
            delete activity.raw_activity_data;
          });
        }
        
        // Add comprehensive summary with verification
        let summaryText = `🏃 **ACTIVITIES QUERY**\n`;
        summaryText += `📅 Latest activity: ${activityCtx.latest_activity_date || 'NONE'}\n`;
        summaryText += `⏱️  Days since last: ${activityCtx.days_since_last || 'N/A'}\n`;
        if (activityCtx.warning) {
          summaryText += `${activityCtx.warning}\n`;
        }
        summaryText += `\n`;
        
        if (data.activities && data.activities.length > 0) {
          const activityTypes = [...new Set(data.activities.map(a => a.activity_type))];
          summaryText += `✓ Found ${data.activities.length} activities. Types: ${activityTypes.join(', ')}.\n\n`;
        } else {
          summaryText += '🚨 **NO ACTIVITIES FOUND**. The athlete has no recorded workouts in this date range.\n';
          summaryText += '⚠️  **ACTION**: Check if Garmin sync is needed or if athlete is new to system.\n\n';
        }
        
        return {
          content: [
            {
              type: "text",
              text: summaryText + JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case "chat_with_coach": {
        const email = args.email || getCurrentAthlete();
        const profile = await callAPI(`/api/profile?email=${encodeURIComponent(email)}`);
        const memory = await readMemory(email);
        
        // 🚨 CRITICAL: Verify activity context BEFORE fetching activities
        const activityCtx = await getActivityContext(email);
        
        // Fetch recent activities automatically
        let recentActivities = null;
        try {
          const activitiesData = await callAPI(
            `/api/garmin/activities?email=${encodeURIComponent(email)}&limit=10`
          );
          if (activitiesData.activities && activitiesData.activities.length > 0) {
            // Strip raw_activity_data to reduce payload
            recentActivities = activitiesData.activities.map(act => ({
              date: act.date,
              activity_name: act.activity_name,
              activity_type: act.activity_type,
              duration: act.duration,
              distance: act.distance,
              avg_hr: act.avg_hr,
              max_hr: act.max_hr,
              calories: act.calories,
              training_load: act.training_load,
              aerobic_effect: act.aerobic_effect,
              elevation_gain: act.elevation_gain,
            }));
          }
        } catch (err) {
          // Activities endpoint might not be available yet
        }
        
        let activitiesSummary = '';
        if (recentActivities && recentActivities.length > 0) {
          activitiesSummary = `\n\n**Recent Activities (Last 10):**\n📅 Latest: ${activityCtx.latest_activity_date}\n⏱️  Days since: ${activityCtx.days_since_last}\n\n${JSON.stringify(recentActivities, null, 2)}`;
        } else {
          activitiesSummary = `\n\n🚨 **NO ACTIVITY RECORDS AVAILABLE**\n`;
          if (activityCtx.latest_activity_date) {
            activitiesSummary += `📅 Last activity: ${activityCtx.latest_activity_date} (${activityCtx.days_since_last} days ago)\n`;
          }
          activitiesSummary += `⚠️  The athlete has no recent recorded workouts. Garmin sync may be needed.`;
        }
        
        return {
          content: [
            {
              type: "text",
              text: `Coach AI is processing your message: "${args.message}"\n\n**Athlete Profile:**\n${JSON.stringify(profile.profile, null, 2)}\n\n**Personal Memory/Context:**\n${JSON.stringify(memory, null, 2)}${activitiesSummary}\n\n🚨 **CRITICAL ANTI-HALLUCINATION INSTRUCTIONS**:\n1. Follow the coaching principles in the "Coach System Prompt" resource\n2. If any metric shows null/undefined, state "NO DATA AVAILABLE for [field name]"\n3. 🚨 NEVER invent, estimate, or hallucinate values for missing metrics\n4. 🚨 NEVER reference activities that are not in the "Recent Activities" list above\n5. 🚨 If latest activity is >2 days old, DO NOT assume recent workouts exist\n6. Reference the athlete's goals, constraints, injuries, and preferences from their profile\n7. Be completely honest about data gaps and ask for subjective input when data is missing\n8. Recent activities are included above - ONLY use this data to answer questions about workouts\n9. ${activityCtx.warning || 'Activity data is current'}`,
            },
          ],
        };
      }

      case "add_equipment": {
        const email = args.email || getCurrentAthlete();
        const memory = await readMemory(email);
        
        if (!memory.equipment.includes(args.equipment)) {
          memory.equipment.push(args.equipment);
          await writeMemory(email, memory);
        }
        
        return {
          content: [
            {
              type: "text",
              text: `✓ Equipment recorded: ${args.equipment}\n\nAll equipment: ${memory.equipment.join(', ')}`,
            },
          ],
        };
      }

      case "update_preferences": {
        const email = args.email || getCurrentAthlete();
        const memory = await readMemory(email);
        
        memory.preferences[args.preference_key] = args.preference_value;
        await writeMemory(email, memory);
        
        return {
          content: [
            {
              type: "text",
              text: `✓ Preference updated: ${args.preference_key} = ${args.preference_value}`,
            },
          ],
        };
      }

      case "add_conversation_note": {
        const email = args.email || getCurrentAthlete();
        await appendToMemoryArray(email, 'conversation_history', {
          topic: args.topic,
          summary: args.summary,
        });
        
        return {
          content: [
            {
              type: "text",
              text: `✓ Conversation recorded: ${args.topic}\n${args.summary}`,
            },
          ],
        };
      }

      case "add_important_note": {
        const email = args.email || getCurrentAthlete();
        const memory = await readMemory(email);
        
        if (!memory.important_notes.includes(args.note)) {
          memory.important_notes.push(args.note);
          await writeMemory(email, memory);
        }
        
        return {
          content: [
            {
              type: "text",
              text: `✓ Important note added: ${args.note}`,
            },
          ],
        };
      }

      case "refresh_athlete_memory": {
        const email = args.email || getCurrentAthlete();
        
        // Re-fetch profile from database and rebuild memory
        const freshMemory = await initializeMemoryFromProfile(email);
        
        // Preserve existing conversation history and notes
        const existingMemory = await readMemory(email).catch(() => ({}));
        freshMemory.conversation_history = existingMemory.conversation_history || [];
        freshMemory.important_notes = existingMemory.important_notes || [];
        
        // Write updated memory
        await writeMemory(email, freshMemory);
        
        return {
          content: [
            {
              type: "text",
              text: `✓ Athlete profile refreshed from database\n\nUpdated information:\n- Name: ${freshMemory.name}\n- Sports: ${freshMemory.favorite_sports.join(', ')}\n- Goals: ${freshMemory.goals.length} goal(s)\n- Equipment: ${freshMemory.equipment.length} item(s)\n- Injuries: ${freshMemory.injuries_conditions.length} tracked\n- Last synced: ${freshMemory.last_synced_from_db}`,
            },
          ],
        };
      }

      case "get_training_load_trend": {
        const email = args.email || getCurrentAthlete();
        const days = args.days || 60;
        
        // Check activity context for training load data
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/stats/training-load-trend?email=${encodeURIComponent(email)}&days=${days}`
        );
        
        let response = `📊 **TRAINING LOAD TREND** (${days} days)\n`;
        if (activityCtx.latest_activity_date) {
          response += `📅 Data through: ${activityCtx.latest_activity_date}\n`;
        }
        if (activityCtx.days_since_last > 2) {
          response += `⚠️  Training load may be incomplete - last activity ${activityCtx.days_since_last} days ago\n`;
        }
        response += `\n${JSON.stringify(data, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "get_recovery_trend": {
        const email = args.email || getCurrentAthlete();
        const days = args.days || 60;
        
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/stats/recovery-trend?email=${encodeURIComponent(email)}&days=${days}`
        );
        
        let response = `💚 **RECOVERY TREND** (${days} days)\n`;
        if (activityCtx.latest_activity_date) {
          response += `📅 Data through: ${activityCtx.latest_activity_date}\n`;
        }
        response += `\n${JSON.stringify(data, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "get_hrv_baseline": {
        const email = args.email || getCurrentAthlete();
        const days = args.days || 60;
        
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/stats/hrv-baseline?email=${encodeURIComponent(email)}&days=${days}`
        );
        
        let response = `❤️  **HRV BASELINE** (${days} days)\n`;
        if (activityCtx.latest_activity_date) {
          response += `📅 Data through: ${activityCtx.latest_activity_date}\n`;
        }
        response += `\n${JSON.stringify(data, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "get_training_stress_balance": {
        const email = args.email || getCurrentAthlete();
        const days = args.days || 60;
        
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/stats/training-stress-balance?email=${encodeURIComponent(email)}&days=${days}`
        );
        
        let response = `⚖️ **TRAINING STRESS BALANCE (TSB)** (${days} days)\n`;
        response += `📚 Need explanation? Use get_help tool with topic="tsb"\n`;
        if (activityCtx.latest_activity_date) {
          response += `📅 Data through: ${activityCtx.latest_activity_date}\n`;
        }
        if (activityCtx.days_since_last > 2) {
          response += `⚠️  TSB may be inaccurate - last training ${activityCtx.days_since_last} days ago\n`;
        }
        response += `\n${JSON.stringify(data, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "get_stats_summary": {
        const email = args.email || getCurrentAthlete();
        
        // Check activity context
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/stats/summary?email=${encodeURIComponent(email)}`
        );
        
        let response = `📊 **STATS SUMMARY**\n`;
        if (activityCtx.latest_activity_date) {
          response += `📅 Data through: ${activityCtx.latest_activity_date}\n`;
        }
        if (activityCtx.warning) {
          response += `${activityCtx.warning}\n`;
        }
        response += `\n${JSON.stringify(data, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "get_workout_recommendations": {
        const email = args.email || getCurrentAthlete();
        const dateParam = args.date ? `&date=${encodeURIComponent(args.date)}` : '';
        
        // 🚨 CRITICAL: Check activity context before making recommendations
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/workout/recommendations?email=${encodeURIComponent(email)}${dateParam}`
        );
        
        // Build context-aware response
        let response = JSON.stringify(data, null, 2);
        
        // Add activity context warning if needed
        if (activityCtx.warning) {
          response = `🚨 **ACTIVITY VERIFICATION**:\n${activityCtx.warning}\n\n` +
                    `📅 Latest activity: ${activityCtx.latest_activity_date || 'unknown'}\n` +
                    `⏱️  Days since last: ${activityCtx.days_since_last || 'unknown'}\n\n` +
                    (activityCtx.days_since_last > 2 
                      ? `⚠️  **NO RECENT ACTIVITIES** - Garmin sync may be needed. Recommendations based on metrics only.\n\n`
                      : '') +
                    `**WORKOUT RECOMMENDATIONS**:\n${response}`;
        }
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "get_weekly_workout_plan": {
        const email = args.email || getCurrentAthlete();
        const startDateParam = args.start_date ? `&start_date=${encodeURIComponent(args.start_date)}` : '';
        
        // 🚨 CRITICAL: Check activity context for training history
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/workout/weekly-plan?email=${encodeURIComponent(email)}${startDateParam}`
        );
        
        let response = JSON.stringify(data, null, 2);
        
        // Add context if activities are stale
        if (activityCtx.days_since_last > 2) {
          response = `⚠️  **ACTIVITY SYNC**: Last activity was ${activityCtx.days_since_last} days ago (${activityCtx.latest_activity_date}). Plan based on metrics only.\n\n` + response;
        }
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "get_activity_distribution": {
        const email = args.email || getCurrentAthlete();
        const days = args.days || 30;
        
        // Check activity context
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/activity/distribution?email=${encodeURIComponent(email)}&days=${days}`
        );
        
        let response = `📊 **ACTIVITY DISTRIBUTION** (Last ${days} days)\n`;
        if (activityCtx.latest_activity_date) {
          response += `📅 Through: ${activityCtx.latest_activity_date}\n`;
        }
        if (activityCtx.warning) {
          response += `${activityCtx.warning}\n`;
        }
        response += `\n${JSON.stringify(data, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "get_sport_insights": {
        const email = args.email || getCurrentAthlete();
        const days = args.days || 30;
        
        // Check activity context
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/activity/insights?email=${encodeURIComponent(email)}&days=${days}`
        );
        
        let response = `🎯 **SPORT INSIGHTS** (Last ${days} days)\n`;
        if (activityCtx.latest_activity_date) {
          response += `📅 Through: ${activityCtx.latest_activity_date}\n`;
        }
        if (activityCtx.warning) {
          response += `${activityCtx.warning}\n`;
        }
        response += `\n${JSON.stringify(data, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "get_sport_specific_workout": {
        const email = args.email || getCurrentAthlete();
        const sport = args.sport;
        const intensity = args.intensity || 'moderate';
        
        // Check recent sport-specific activities
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/activity/workouts/${encodeURIComponent(sport)}?email=${encodeURIComponent(email)}&intensity=${intensity}`
        );
        
        let response = `🏃 **${sport.toUpperCase()} WORKOUT** (${intensity} intensity)\n`;
        if (activityCtx.latest_activity_date) {
          response += `📅 Based on activities through: ${activityCtx.latest_activity_date}\n`;
        }
        if (activityCtx.days_since_last > 3) {
          response += `⚠️  Last activity: ${activityCtx.days_since_last} days ago - workout may need adjustment\n`;
        }
        response += `\n${JSON.stringify(data, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "add_diary_entry": {
        const email = args.email || getCurrentAthlete();
        const entryData = {
          date: args.date || new Date().toISOString().split('T')[0],
          activity_id: args.activity_id,
          overall_feel: args.overall_feel,
          energy: args.energy,
          motivation: args.motivation,
          sleep_quality: args.sleep_quality,
          stress_level: args.stress_level,
          soreness: args.soreness,
          rpe: args.rpe,
          notes: args.notes,
          highlights: args.highlights,
          challenges: args.challenges,
          tags: args.tags,
          email: email
        };
        
        const data = await callAPI('/api/diary/entry', {
          method: 'POST',
          body: JSON.stringify(entryData)
        });
        
        return {
          content: [
            {
              type: "text",
              text: `Diary entry saved for ${entryData.date}:\n` + JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case "get_diary_entries": {
        const email = args.email || getCurrentAthlete();
        const queryParams = new URLSearchParams({
          email: email
        });
        
        if (args.start_date) queryParams.append('start_date', args.start_date);
        if (args.end_date) queryParams.append('end_date', args.end_date);
        if (args.limit) queryParams.append('limit', args.limit.toString());
        
        const data = await callAPI(`/api/diary/entries?${queryParams.toString()}`);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case "analyze_diary_patterns": {
        const email = args.email || getCurrentAthlete();
        const days = args.days || 60;
        
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/diary/analysis?email=${encodeURIComponent(email)}&days=${days}`
        );
        
        let response = `📝 **DIARY PATTERNS ANALYSIS** (${days} days)\n`;
        if (activityCtx.latest_activity_date) {
          response += `📅 Analysis through: ${activityCtx.latest_activity_date}\n`;
        }
        response += `\n${JSON.stringify(data, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "get_weekly_summary": {
        const email = args.email || getCurrentAthlete();
        const weekStart = args.week_start;
        
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/diary/weekly-summary?email=${encodeURIComponent(email)}&week_start=${weekStart}`
        );
        
        let response = `📊 **WEEKLY SUMMARY** (Week of ${weekStart})\n`;
        if (activityCtx.latest_activity_date) {
          response += `📅 Activities through: ${activityCtx.latest_activity_date}\n`;
        }
        if (activityCtx.days_since_last > 3) {
          response += `⚠️  Week summary incomplete - last activity ${activityCtx.days_since_last} days ago\n`;
        }
        response += `\n${JSON.stringify(data, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "get_insights_and_alerts": {
        const email = args.email || getCurrentAthlete();
        
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/insights?email=${encodeURIComponent(email)}`
        );
        
        let response = `🚨 **INSIGHTS & ALERTS**\n`;
        if (activityCtx.latest_activity_date) {
          response += `📅 Based on data through: ${activityCtx.latest_activity_date}\n`;
        }
        if (activityCtx.warning) {
          response += `${activityCtx.warning}\n`;
        }
        response += `\n${JSON.stringify(data, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "get_alerts_by_type": {
        const email = args.email || getCurrentAthlete();
        const type = args.type;
        
        const data = await callAPI(
          `/api/insights/type/${encodeURIComponent(type)}?email=${encodeURIComponent(email)}`
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case "get_load_optimization": {
        const email = args.email || getCurrentAthlete();
        const weeks = args.weeks || 12;
        
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/load/optimization?email=${encodeURIComponent(email)}&weeks=${weeks}`
        );
        
        let response = `🎯 **LOAD OPTIMIZATION** (${weeks} weeks)\n`;
        if (activityCtx.latest_activity_date) {
          response += `📅 Analysis through: ${activityCtx.latest_activity_date}\n`;
        }
        if (activityCtx.days_since_last > 3) {
          response += `⚠️  Analysis incomplete - last activity ${activityCtx.days_since_last} days ago\n`;
        }
        response += `\n${JSON.stringify(data, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "get_ramp_rate_analysis": {
        const email = args.email || getCurrentAthlete();
        const weeks = args.weeks || 12;
        
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/load/ramp-rate?email=${encodeURIComponent(email)}&weeks=${weeks}`
        );
        
        let response = `📈 **RAMP RATE ANALYSIS** (${weeks} weeks)\n`;
        if (activityCtx.latest_activity_date) {
          response += `📅 Analysis through: ${activityCtx.latest_activity_date}\n`;
        }
        if (activityCtx.days_since_last > 3) {
          response += `⚠️  Ramp rate incomplete - last activity ${activityCtx.days_since_last} days ago\n`;
        }
        response += `\n${JSON.stringify(data, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "get_sport_distribution": {
        const email = args.email || getCurrentAthlete();
        const weeks = args.weeks || 12;
        
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/load/distribution?email=${encodeURIComponent(email)}&weeks=${weeks}`
        );
        
        let response = `🎮 **SPORT DISTRIBUTION** (${weeks} weeks)\n`;
        if (activityCtx.latest_activity_date) {
          response += `📅 Distribution through: ${activityCtx.latest_activity_date}\n`;
        }
        if (activityCtx.days_since_last > 2) {
          response += `⚠️  Distribution may not reflect current week - last activity ${activityCtx.days_since_last} days ago\n`;
        }
        response += `\n${JSON.stringify(data, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "get_volume_intensity_balance": {
        const email = args.email || getCurrentAthlete();
        const weeks = args.weeks || 12;
        
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/load/volume-intensity?email=${encodeURIComponent(email)}&weeks=${weeks}`
        );
        
        let response = `⚖️ **VOLUME/INTENSITY BALANCE** (${weeks} weeks)\n`;
        if (activityCtx.latest_activity_date) {
          response += `📅 Balance through: ${activityCtx.latest_activity_date}\n`;
        }
        if (activityCtx.days_since_last > 3) {
          response += `⚠️  Balance analysis incomplete - last activity ${activityCtx.days_since_last} days ago\n`;
        }
        response += `\n${JSON.stringify(data, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "get_weather_safety": {
        const location = args.location;
        const coords = parseLocationToCoords(location);
        
        const data = await callAPI(
          `/api/weather/safety?lat=${coords.lat}&lon=${coords.lon}`
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case "get_weather_adjusted_workout": {
        const location = args.location;
        const sport = args.sport || 'cycling';
        const duration = args.duration || 60;
        const coords = parseLocationToCoords(location);
        
        const data = await callAPI(
          `/api/weather/adjustment-preview?lat=${coords.lat}&lon=${coords.lon}&sport=${sport}&duration=${duration}`
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case "check_weather_forecast": {
        const location = args.location;
        const coords = parseLocationToCoords(location);
        
        const data = await callAPI(
          `/api/weather/current?lat=${coords.lat}&lon=${coords.lon}`
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case "get_training_patterns": {
        const email = args.email || getCurrentAthlete();
        
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/patterns?email=${encodeURIComponent(email)}`
        );
        
        let response = `🔍 **TRAINING PATTERNS**\n`;
        if (activityCtx.latest_activity_date) {
          response += `📅 Patterns through: ${activityCtx.latest_activity_date}\n`;
        }
        if (activityCtx.days_since_last > 3) {
          response += `⚠️  Patterns may be incomplete - last activity ${activityCtx.days_since_last} days ago\n`;
        }
        response += `\n${JSON.stringify(data, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "get_pattern_breaks": {
        const email = args.email || getCurrentAthlete();
        
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/patterns/breaks?email=${encodeURIComponent(email)}`
        );
        
        let response = `🚫 **PATTERN BREAKS**\n`;
        if (activityCtx.latest_activity_date) {
          response += `📅 Analysis through: ${activityCtx.latest_activity_date}\n`;
        }
        if (activityCtx.days_since_last > 2) {
          response += `⚠️  Current break detected: ${activityCtx.days_since_last} days since last activity\n`;
        }
        response += `\n${JSON.stringify(data, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "get_nudges": {
        const email = args.email || getCurrentAthlete();
        
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/patterns/nudges?email=${encodeURIComponent(email)}`
        );
        
        let response = `👉 **NUDGES & SUGGESTIONS**\n`;
        if (activityCtx.latest_activity_date) {
          response += `📅 Based on data through: ${activityCtx.latest_activity_date}\n`;
        }
        if (activityCtx.days_since_last > 2) {
          response += `⚠️  👉 🏃 PRIMARY NUDGE: Last activity was ${activityCtx.days_since_last} days ago. Time to get moving!\n`;
        }
        response += `\n${JSON.stringify(data, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "suggest_multi_activity": {
        const email = args.email || getCurrentAthlete();
        const date = args.date || new Date().toISOString().split('T')[0];
        
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/patterns/multi-activity/today?email=${encodeURIComponent(email)}&date=${date}`
        );
        
        let response = `🏋️ **MULTI-ACTIVITY SUGGESTION**\n`;
        if (activityCtx.latest_activity_date) {
          response += `📅 Based on patterns through: ${activityCtx.latest_activity_date}\n`;
        }
        response += `\n${JSON.stringify(data, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "analyze_performance_gaps": {
        const email = args.email || getCurrentAthlete();
        
        const activityCtx = await getActivityContext(email);
        
        const data = await callAPI(
          `/api/patterns/performance/gaps?email=${encodeURIComponent(email)}`
        );
        
        let response = `🔍 **PERFORMANCE GAPS ANALYSIS**\n`;
        if (activityCtx.latest_activity_date) {
          response += `📅 Analysis through: ${activityCtx.latest_activity_date}\n`;
        }
        if (activityCtx.days_since_last > 3) {
          response += `⚠️  Gap analysis may be incomplete - last activity ${activityCtx.days_since_last} days ago\n`;
        }
        response += `\n${JSON.stringify(data, null, 2)}`;
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "get_performance_multipliers": {
        const modality = args.modality;
        
        if (!modality) {
          throw new Error("Modality parameter is required (strength, hiit, or yoga)");
        }
        
        const data = await callAPI(
          `/api/patterns/performance/benefits/${modality}`
        );
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case "add_planned_activity": {
        const email = args.email || getCurrentAthlete();
        const { activityType, description, plannedDate, options } = args;
        
        if (!activityType || !plannedDate) {
          throw new Error("activityType and plannedDate are required");
        }
        
        const data = await callAPI('/api/planned-activities', {
          method: 'POST',
          body: JSON.stringify({
            email,
            activityType,
            description: description || activityType,
            plannedDate,
            options: options || {}
          })
        });
        
        return {
          content: [
            {
              type: "text",
              text: `✓ Planned activity recorded:\n${JSON.stringify(data.activity, null, 2)}\n\n💡 This will now be visible to all AI systems (Claude, LM Studio, etc.) for better planning.`,
            },
          ],
        };
      }

      case "get_upcoming_activities": {
        const email = args.email || getCurrentAthlete();
        const daysAhead = args.daysAhead || 30;
        
        const data = await callAPI(
          `/api/planned-activities/upcoming?email=${encodeURIComponent(email)}&daysAhead=${daysAhead}`
        );
        
        let response = `📅 **UPCOMING PLANNED ACTIVITIES** (next ${daysAhead} days)\n\n`;
        
        if (data.count === 0) {
          response += `No upcoming activities planned.\n\n💡 Use add_planned_activity when athlete mentions future plans.`;
        } else {
          response += `Found ${data.count} planned activities:\n\n`;
          response += JSON.stringify(data.activities, null, 2);
        }
        
        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "update_planned_activity": {
        const { id, status, completedDate, notes } = args;
        
        if (!id) {
          throw new Error("Activity ID is required");
        }
        
        const updates = {};
        if (status) updates.status = status;
        if (completedDate) updates.completedDate = completedDate;
        if (notes) updates.notes = notes;
        
        const data = await callAPI(`/api/planned-activities/${id}`, {
          method: 'PUT',
          body: JSON.stringify(updates)
        });
        
        return {
          content: [
            {
              type: "text",
              text: `✓ Planned activity updated:\n${JSON.stringify(data.activity, null, 2)}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

  return server;
} // end createMCPServer()

// ─── HTTP / SSE mode ──────────────────────────────────────────────────────────
async function startHttpServer() {
  const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;
  const PORT      = parseInt(process.env.MCP_PORT || '3001', 10);
  const HOST      = process.env.MCP_BIND_HOST || '0.0.0.0';
  const RATE_MAX  = parseInt(process.env.MCP_RATE_LIMIT || '60', 10);
  const ALLOWED_IPS = process.env.MCP_ALLOWED_IPS
    ? process.env.MCP_ALLOWED_IPS.split(',').map(s => s.trim()).filter(Boolean)
    : null;

  if (!AUTH_TOKEN || AUTH_TOKEN.length < 32) {
    console.error('FATAL: MCP_AUTH_TOKEN is not set or is too short (min 32 chars).');
    console.error('Generate one with:  openssl rand -hex 32');
    process.exit(1);
  }

  const app = express();
  const activeSessions = new Map(); // sessionId -> SSEServerTransport

  // ── Rate limiter (per IP, sliding window) ──────────────────────────────────
  const rateLimits = new Map();
  const RATE_WINDOW_MS = 60_000;

  function rateLimit(req, res, next) {
    const ip  = (req.ip || '').replace('::ffff:', '');
    const now = Date.now();
    let   entry = rateLimits.get(ip);
    if (!entry || now > entry.reset) {
      entry = { count: 0, reset: now + RATE_WINDOW_MS };
    }
    entry.count++;
    rateLimits.set(ip, entry);
    if (entry.count > RATE_MAX) {
      res.setHeader('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    next();
  }

  // ── Bearer-token auth (timing-safe compare) ────────────────────────────────
  function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'] || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization header (Bearer token required)' });
    }
    const provided = authHeader.slice(7);
    try {
      const expected = Buffer.from(AUTH_TOKEN, 'utf8');
      const received = Buffer.from(provided.padEnd(AUTH_TOKEN.length, '\0'), 'utf8');
      const match = expected.length === received.length &&
                    timingSafeEqual(expected, received);
      if (!match) throw new Error('mismatch');
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
    next();
  }

  // ── Optional IP allowlist ──────────────────────────────────────────────────
  function ipAllowlist(req, res, next) {
    if (!ALLOWED_IPS) return next();
    const ip = (req.ip || '').replace('::ffff:', '');
    if (!ALLOWED_IPS.includes(ip)) {
      console.error(`[MCP] Blocked: ${ip} not in allowlist`);
      return res.status(403).json({ error: 'IP not allowed' });
    }
    next();
  }

  // ── Security headers ───────────────────────────────────────────────────────
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  // ── Health (unauthenticated) ───────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      server: 'garmin-ai-coach-mcp',
      transport: 'sse',
      sessions: activeSessions.size,
    });
  });

  // ── SSE endpoint – GET establishes the stream ──────────────────────────────
  app.get('/mcp', rateLimit, ipAllowlist, authenticate, async (req, res) => {
    const transport = new SSEServerTransport('/mcp/message', res);
    activeSessions.set(transport._sessionId, transport);

    transport.onclose = () => {
      activeSessions.delete(transport._sessionId);
      console.error(`[MCP] Session closed: ${transport._sessionId}`);
    };

    try {
      const sessionServer = createMCPServer();
      await sessionServer.connect(transport);
      console.error(`[MCP] Session opened: ${transport._sessionId} from ${(req.ip || '').replace('::ffff:', '')}`);
    } catch (err) {
      activeSessions.delete(transport._sessionId);
      console.error('[MCP] Connection error:', err.message);
    }
  });

  // ── Message endpoint – POST carries tool calls ─────────────────────────────
  app.post('/mcp/message', rateLimit, ipAllowlist, authenticate, async (req, res) => {
    const sessionId = req.query.sessionId;
    const transport = activeSessions.get(sessionId);
    if (!transport) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }
    try {
      await transport.handlePostMessage(req, res);
    } catch (err) {
      console.error('[MCP] Message error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── 404 catch-all ─────────────────────────────────────────────────────────
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  createServer(app).listen(PORT, HOST, () => {
    console.error(`[MCP] HTTP server listening on ${HOST}:${PORT}`);
    console.error(`[MCP] SSE endpoint : http://<your-ip>:${PORT}/mcp`);
    console.error(`[MCP] Health check : http://<your-ip>:${PORT}/health`);
    console.error('[MCP] Auth         : Bearer token required on /mcp and /mcp/message');
    if (ALLOWED_IPS) console.error(`[MCP] IP allowlist : ${ALLOWED_IPS.join(', ')}`);
  });
}

// ─── Entry point ──────────────────────────────────────────────────────────────
async function main() {
  const httpMode = process.env.MCP_HTTP_MODE === 'true' || !!process.env.MCP_PORT;

  if (httpMode) {
    await startHttpServer();
  } else {
    const transport = new StdioServerTransport();
    await createMCPServer().connect(transport);
    console.error('Garmin AI Coach MCP server running on stdio');
  }
}

main().catch((error) => {
  console.error('[MCP] Fatal startup error:', error);
  process.exit(1);
});
