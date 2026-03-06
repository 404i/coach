#!/usr/bin/env node
/**
 * migrate_memory_to_db.js
 *
 * One-time migration: reads every JSON file in mcp/memories/ and imports
 * the data into coach.db via the /api/memory HTTP API.
 *
 * Run AFTER the backend has applied migration 008_coaching_memory (i.e. after
 * a `docker compose restart coach` or a fresh `node backend/src/server.js`).
 *
 * Usage:
 *   node scripts/migrate_memory_to_db.js [--api-url http://localhost:8080] [--dry-run]
 *
 * The script is idempotent: notes and conversation entries whose text matches
 * an existing row are skipped (checked via the GET /api/memory response before
 * inserting).
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const MEMORIES_DIR = path.join(__dirname, '..', 'mcp', 'memories');
const DEFAULT_API  = 'http://localhost:8080';

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const apiIndex = args.indexOf('--api-url');
const API_URL  = apiIndex !== -1 ? args[apiIndex + 1] : DEFAULT_API;

// ─── helpers ──────────────────────────────────────────────────────────────────

async function apiGet(path) {
  const res = await fetch(`${API_URL}${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost(path, body) {
  if (DRY_RUN) {
    console.log(`  [dry-run] POST ${path}`, JSON.stringify(body).slice(0, 120));
    return { success: true, id: -1 };
  }
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPut(path, body) {
  if (DRY_RUN) {
    console.log(`  [dry-run] PUT  ${path}`, JSON.stringify(body).slice(0, 120));
    return { success: true };
  }
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── per-file migration ────────────────────────────────────────────────────────

async function migrateFile(filePath) {
  const filename = path.basename(filePath);
  const email    = filename.replace('.json', '');

  console.log(`\n── ${email} ──`);

  let memJson;
  try {
    memJson = JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch (err) {
    console.error(`  ERROR reading file: ${err.message}`);
    return { email, status: 'error', reason: err.message };
  }

  // ── Check the athlete exists in the DB ──────────────────────────────────
  const existing = await apiGet(`/api/memory?email=${encodeURIComponent(email)}`);
  if (!existing) {
    console.log(`  SKIP — no athlete profile found in DB for ${email}`);
    console.log(`         Create the profile first via POST /api/profile`);
    return { email, status: 'skipped', reason: 'no_profile' };
  }

  const dbMemory = existing.memory;

  // ── 1. Profile fields (PUT /api/memory) ─────────────────────────────────
  const PROFILE_FIELDS = [
    'name', 'location', 'favorite_sports', 'goals', 'motivations',
    'constraints', 'goals_discussed', 'equipment', 'facilities',
    'days_per_week', 'minutes_per_session', 'injuries_conditions',
    'injuries_history', 'baselines', 'preferences', 'training_philosophy',
  ];

  const updates = {};
  for (const field of PROFILE_FIELDS) {
    const val = memJson[field];
    if (val !== undefined && val !== null) {
      updates[field] = val;
    }
  }

  if (Object.keys(updates).length > 0) {
    console.log(`  Updating ${Object.keys(updates).length} profile field(s): ${Object.keys(updates).join(', ')}`);
    await apiPut('/api/memory', { email, updates });
  } else {
    console.log(`  No profile field updates needed`);
  }

  // ── 2. Important notes ───────────────────────────────────────────────────
  const existingNotes  = new Set(dbMemory.important_notes || []);
  const incomingNotes  = memJson.important_notes || [];
  let   notesAdded     = 0;
  let   notesSkipped   = 0;

  for (const note of incomingNotes) {
    if (existingNotes.has(note)) {
      notesSkipped++;
      continue;
    }
    await apiPost('/api/memory/notes', { email, note, source: 'import' });
    notesAdded++;
  }
  console.log(`  Notes: ${notesAdded} added, ${notesSkipped} already present`);

  // ── 3. Conversation history ──────────────────────────────────────────────
  const existingTopics = new Set(
    (dbMemory.conversation_history || []).map(h => `${h.topic}::${h.summary}`)
  );
  const incomingHistory = memJson.conversation_history || [];
  let   histAdded       = 0;
  let   histSkipped     = 0;

  for (const entry of incomingHistory) {
    const key = `${entry.topic}::${entry.summary}`;
    if (existingTopics.has(key)) {
      histSkipped++;
      continue;
    }
    await apiPost('/api/memory/conversation', {
      email,
      topic:   entry.topic,
      summary: entry.summary,
    });
    histAdded++;
  }
  console.log(`  Conversation: ${histAdded} added, ${histSkipped} already present`);

  return { email, status: 'ok', notesAdded, notesSkipped, histAdded, histSkipped };
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`migrate_memory_to_db.js`);
  console.log(`  API URL  : ${API_URL}`);
  console.log(`  Memories : ${MEMORIES_DIR}`);
  if (DRY_RUN) console.log(`  Mode     : DRY RUN (no writes)`);
  console.log('');

  // Verify backend is reachable
  try {
    const health = await fetch(`${API_URL}/api/health`);
    if (!health.ok) throw new Error(`status ${health.status}`);
    console.log('Backend reachable ✓\n');
  } catch (err) {
    console.error(`ERROR: Cannot reach backend at ${API_URL}`);
    console.error(`       ${err.message}`);
    console.error(`\nStart the backend first, then re-run this script.`);
    process.exit(1);
  }

  // Read memory files
  let files;
  try {
    files = (await fs.readdir(MEMORIES_DIR)).filter(f => f.endsWith('.json'));
  } catch (err) {
    console.error(`ERROR reading memories dir: ${err.message}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log('No memory files found — nothing to migrate.');
    process.exit(0);
  }

  console.log(`Found ${files.length} memory file(s): ${files.join(', ')}\n`);

  const results = [];
  for (const file of files) {
    const result = await migrateFile(path.join(MEMORIES_DIR, file));
    results.push(result);
  }

  // Summary
  console.log('\n── Summary ───────────────────────────────────────────────');
  for (const r of results) {
    if (r.status === 'ok') {
      console.log(`  ✓ ${r.email}: ${r.notesAdded} notes, ${r.histAdded} conversations migrated`);
    } else if (r.status === 'skipped') {
      console.log(`  - ${r.email}: skipped (${r.reason})`);
    } else {
      console.log(`  ✗ ${r.email}: error — ${r.reason}`);
    }
  }

  const errors = results.filter(r => r.status === 'error');
  if (errors.length > 0) {
    console.log(`\n${errors.length} file(s) failed — check errors above.`);
    process.exit(1);
  }

  console.log(`\nMigration complete.`);
  if (!DRY_RUN) {
    console.log(`The mcp/memories/ directory can now be removed from docker-compose.yml.`);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
