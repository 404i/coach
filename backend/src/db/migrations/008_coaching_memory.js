/**
 * Migration: Coaching Memory
 *
 * Consolidates all flat-file coaching memory into coach.db:
 *
 * 1. coaching_notes       — persistent important notes about the athlete
 * 2. conversation_history — summary of past coaching conversations
 * 3. athlete_profiles     — adds first-class columns for the fields that were
 *                           only stored inside the profile_data JSON blob
 *
 * The new columns mirror the top-level keys in mcp/memories/<email>.json so
 * that the MCP server can write to the DB via the /api/memory HTTP API instead
 * of writing JSON files on disk.
 */

export async function up(knex) {
  // ── 1. coaching_notes ──────────────────────────────────────────────────────
  await knex.schema.createTable('coaching_notes', table => {
    table.increments('id').primary();
    table.integer('profile_id').notNullable();
    table.text('note').notNullable();
    table.string('source', 20).defaultTo('manual'); // 'manual' | 'llm' | 'import'
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('profile_id').references('athlete_profiles.id').onDelete('CASCADE');
    table.index(['profile_id', 'created_at']);
  });

  // ── 2. conversation_history ────────────────────────────────────────────────
  await knex.schema.createTable('conversation_history', table => {
    table.increments('id').primary();
    table.integer('profile_id').notNullable();
    table.text('topic').notNullable();
    table.text('summary').notNullable();
    table.timestamp('timestamp').defaultTo(knex.fn.now());

    table.foreign('profile_id').references('athlete_profiles.id').onDelete('CASCADE');
    table.index(['profile_id', 'timestamp']);
  });

  // ── 3. New columns on athlete_profiles ────────────────────────────────────
  // These mirror the top-level keys stored in mcp/memories/<email>.json.
  // The existing profile_data JSON blob is kept; these columns are kept in sync
  // on every write so queries can filter / read individual fields efficiently.
  await knex.schema.alterTable('athlete_profiles', table => {
    table.string('name_display', 255);           // free-text name from MCP memory
    table.json('location_json');                 // { label, latitude, longitude, timezone }
    table.json('favorite_sports');               // string[]
    table.json('goals');                         // string[]
    table.json('motivations');                   // string[]
    table.json('constraints');                   // string[]
    table.json('goals_discussed');               // string[]
    table.json('equipment');                     // string[]
    table.json('facilities');                    // string[]
    table.integer('days_per_week');
    table.integer('minutes_per_session');
    table.json('injuries_conditions');           // string[]
    table.json('injuries_history');              // string[]
    table.json('baselines');                     // { resting_hr_bpm_14d, hrv_ms_7d, … }
    table.json('preferences');                   // { max_hard_days_per_week, … }
    table.json('training_philosophy');           // string[]
  });
}

export async function down(knex) {
  // Remove added columns from athlete_profiles
  await knex.schema.alterTable('athlete_profiles', table => {
    table.dropColumn('name_display');
    table.dropColumn('location_json');
    table.dropColumn('favorite_sports');
    table.dropColumn('goals');
    table.dropColumn('motivations');
    table.dropColumn('constraints');
    table.dropColumn('goals_discussed');
    table.dropColumn('equipment');
    table.dropColumn('facilities');
    table.dropColumn('days_per_week');
    table.dropColumn('minutes_per_session');
    table.dropColumn('injuries_conditions');
    table.dropColumn('injuries_history');
    table.dropColumn('baselines');
    table.dropColumn('preferences');
    table.dropColumn('training_philosophy');
  });

  await knex.schema.dropTableIfExists('conversation_history');
  await knex.schema.dropTableIfExists('coaching_notes');
}
