/**
 * Migration: Smart Goals
 *
 * Creates smart_goals and goal_progress tables.
 * Migrates existing athlete_profiles.training_goals free-text data into smart_goals rows.
 * Drops the training_goals column from athlete_profiles after migration.
 *
 * Idempotent: guarded by hasTable/hasColumn checks so restarts after partial
 * failures don't re-run steps that already completed.
 *
 * Column drop uses raw SQL instead of Knex's alterTable().dropColumn() which
 * does a full table recreation and can fail when the SQLite schema cache has
 * stale references to tables from previous migrations (e.g. activities_old).
 */

export async function up(knex) {
  // ── 1. smart_goals ────────────────────────────────────────────────────────
  const hasSmartGoals = await knex.schema.hasTable('smart_goals');
  if (!hasSmartGoals) {
    await knex.schema.createTable('smart_goals', (table) => {
      table.increments('id').primary();
      table.integer('profile_id').notNullable()
        .references('id').inTable('athlete_profiles').onDelete('CASCADE');

      table.text('raw_text');

      table.string('title').notNullable();
      table.enum('goal_type', ['performance', 'consistency', 'health', 'skill', 'event']).notNullable();
      table.enum('hierarchy_level', ['long_term', 'block', 'weekly']).notNullable().defaultTo('long_term');

      table.integer('parent_goal_id').references('id').inTable('smart_goals').onDelete('SET NULL');

      table.enum('status', ['draft', 'active', 'paused', 'completed', 'abandoned'])
        .notNullable().defaultTo('active');

      table.date('target_date');
      table.json('target_metric');
      table.float('current_value');

      table.json('assumptions');
      table.float('confidence');
      table.json('weekly_kpis');
      table.json('constraints');

      table.timestamps(true, true);

      table.index(['profile_id', 'status']);
      table.index(['profile_id', 'hierarchy_level']);
      table.index(['parent_goal_id']);
    });
  }

  // ── 2. goal_progress ──────────────────────────────────────────────────────
  const hasGoalProgress = await knex.schema.hasTable('goal_progress');
  if (!hasGoalProgress) {
    await knex.schema.createTable('goal_progress', (table) => {
      table.increments('id').primary();
      table.integer('goal_id').notNullable()
        .references('id').inTable('smart_goals').onDelete('CASCADE');

      table.date('week_start').notNullable();
      table.enum('status', ['on_track', 'at_risk', 'off_track']).notNullable();

      table.float('metric_value');
      table.json('kpis_snapshot');
      table.text('narrative');
      table.json('min_effective_alt');

      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index(['goal_id', 'week_start']);
      table.unique(['goal_id', 'week_start']);
    });
  }

  // ── 3+4. Migrate data + drop column (only if column still exists) ─────────
  const hasTrainingGoals = await knex.schema.hasColumn('athlete_profiles', 'training_goals');
  if (hasTrainingGoals) {
    const profiles = await knex('athlete_profiles')
      .whereNotNull('training_goals')
      .select('id', 'training_goals');

    for (const profile of profiles) {
      let goals;
      try {
        goals = typeof profile.training_goals === 'string'
          ? JSON.parse(profile.training_goals)
          : profile.training_goals;
      } catch {
        continue;
      }

      if (!Array.isArray(goals) || goals.length === 0) continue;

      const rows = goals
        .filter(g => typeof g === 'string' && g.trim().length > 0)
        .map(g => ({
          profile_id: profile.id,
          raw_text: g.trim(),
          title: g.trim().length > 80 ? g.trim().slice(0, 77) + '...' : g.trim(),
          goal_type: 'performance',
          hierarchy_level: 'long_term',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date()
        }));

      if (rows.length > 0) {
        await knex('smart_goals').insert(rows);
      }
    }

    // Use raw SQL — Knex's alterTable().dropColumn() recreates the whole table
    // which fails when the SQLite schema cache contains stale table references
    // (e.g. activities_old left by migration 20260403 FK fix).
    await knex.raw('ALTER TABLE athlete_profiles DROP COLUMN training_goals');
  }
}

export async function down(knex) {
  // Re-add the dropped column
  await knex.schema.alterTable('athlete_profiles', (table) => {
    table.json('training_goals');
  });

  // Restore data from smart_goals back into training_goals (long_term goals only)
  const profileGoals = await knex('smart_goals')
    .where({ hierarchy_level: 'long_term' })
    .select('profile_id', 'raw_text');

  const byProfile = {};
  for (const row of profileGoals) {
    if (!byProfile[row.profile_id]) byProfile[row.profile_id] = [];
    byProfile[row.profile_id].push(row.raw_text || row.title);
  }

  for (const [profileId, goals] of Object.entries(byProfile)) {
    await knex('athlete_profiles')
      .where({ id: parseInt(profileId) })
      .update({ training_goals: JSON.stringify(goals) });
  }

  await knex.schema.dropTableIfExists('goal_progress');
  await knex.schema.dropTableIfExists('smart_goals');
}
