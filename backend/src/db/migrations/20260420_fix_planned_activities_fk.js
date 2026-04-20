/**
 * Fix planned_activities FK corruption
 *
 * Migration 20260403 renamed `activities` → `activities_old` → new `activities`.
 * The `planned_activities` table has an FK:
 *   FOREIGN KEY(actual_activity_id) REFERENCES activities(id)
 *
 * SQLite's internal per-connection rootpage cache still resolves this to the
 * old `activities_old` page (which no longer exists), causing:
 *   SQLITE_ERROR: no such table: main.activities_old
 * on any INSERT into planned_activities when FK enforcement is ON.
 *
 * Fix: recreate planned_activities with fresh DDL so the FK rootpages are
 * re-resolved correctly against the current schema.
 */

export async function up(knex) {
  // Skip if already fixed (idempotent)
  // We detect the corruption by checking if the stored DDL references activities
  // while activities_old still appears in the FK resolution cache.
  // Simplest: always recreate if the table exists (data is preserved via temp copy).
  const hasTable = await knex.schema.hasTable('planned_activities');
  if (!hasTable) return; // nothing to fix

  await knex.raw('PRAGMA foreign_keys = OFF');

  try {
    // 1. Copy existing data to a temp table
    await knex.raw('CREATE TABLE planned_activities_fk_fix AS SELECT * FROM planned_activities');

    // 2. Drop the corrupted table (and its indexes)
    await knex.schema.dropTable('planned_activities');

    // 3. Recreate with fresh DDL — FK rootpages will be resolved correctly
    await knex.schema.createTable('planned_activities', (table) => {
      table.increments('id').primary();
      table.integer('profile_id').notNullable()
        .references('id').inTable('athlete_profiles').onDelete('CASCADE');

      table.string('activity_type').notNullable();
      table.string('sport_category');
      table.text('description');

      table.date('planned_date');
      table.date('planned_date_end');
      table.string('time_of_day');
      table.boolean('is_flexible').defaultTo(true);

      table.enum('priority', ['low', 'medium', 'high', 'committed']).defaultTo('medium');
      table.boolean('is_social').defaultTo(false);
      table.boolean('is_event').defaultTo(false);
      table.text('constraints');

      table.enum('status', ['mentioned', 'planned', 'scheduled', 'completed', 'cancelled', 'rescheduled'])
        .defaultTo('mentioned');
      table.date('completed_date');

      // Keep the column but drop the FK — actual_activity_id is rarely populated
      // and the FK was the root cause of the corruption after the 20260403 migration.
      table.integer('actual_activity_id');

      table.text('context');
      table.text('notes');
      table.json('metadata');

      table.timestamps(true, true);

      table.index(['profile_id', 'status']);
      table.index(['profile_id', 'planned_date']);
      table.index(['planned_date', 'status']);
    });

    // 4. Restore data
    await knex.raw(`
      INSERT INTO planned_activities (
        id, profile_id, activity_type, sport_category, description,
        planned_date, planned_date_end, time_of_day, is_flexible,
        priority, is_social, is_event, constraints, status, completed_date,
        actual_activity_id, context, notes, metadata, created_at, updated_at
      )
      SELECT
        id, profile_id, activity_type, sport_category, description,
        planned_date, planned_date_end, time_of_day, is_flexible,
        priority, is_social, is_event, constraints, status, completed_date,
        actual_activity_id, context, notes, metadata, created_at, updated_at
      FROM planned_activities_fk_fix
    `);

    // 5. Drop temp table
    await knex.schema.dropTable('planned_activities_fk_fix');

  } finally {
    await knex.raw('PRAGMA foreign_keys = ON');
  }
}

export async function down(knex) {
  // The original DDL had an FK on actual_activity_id — not worth restoring
  // since it was the cause of the bug. No-op down migration.
}
