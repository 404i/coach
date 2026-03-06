/**
 * Session state — current athlete + sync cache.
 * Persisted to disk so the MCP server survives restarts.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.join(__dirname, '..', '.coach-mcp-state.json');

let currentAthleteEmail = null;
let lastSyncCache = { email: null, timestamp: 0, fetchedAt: 0 };

// ── Getters / setters ────────────────────────────────────────────────────────

export function getCurrentAthlete() {
  if (!currentAthleteEmail) {
    throw new Error(
      'No athlete context set. Please use set_current_athlete tool first or provide an email parameter.'
    );
  }
  return currentAthleteEmail;
}

export function setCurrentAthlete(email) {
  currentAthleteEmail = email;
}

/** Return a *reference* so callers can read fields without copying. */
export function getSyncCache() {
  return lastSyncCache;
}

export function setSyncCache(cache) {
  lastSyncCache = cache;
}

// ── Persistence ──────────────────────────────────────────────────────────────

export async function loadAthleteState() {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf-8');
    const state = JSON.parse(raw);
    if (state.currentAthleteEmail) {
      currentAthleteEmail = state.currentAthleteEmail;
      console.error(`[MCP] Restored athlete context: ${currentAthleteEmail}`);
    }
    if (state.lastSyncCache && typeof state.lastSyncCache === 'object') {
      lastSyncCache = state.lastSyncCache;
      console.error(
        `[MCP] Restored last sync cache for ${lastSyncCache.email}: ${new Date(lastSyncCache.timestamp).toISOString()}`
      );
    }
  } catch {
    // State file missing or corrupt — start fresh
  }
}

export async function saveAthleteState() {
  try {
    await fs.writeFile(
      STATE_FILE,
      JSON.stringify({ currentAthleteEmail, lastSyncCache }, null, 2)
    );
  } catch (err) {
    console.error('[MCP] Warning: could not persist athlete state:', err.message);
  }
}
