/**
 * Migration: Smart Goals
 *
 * Creates smart_goals and goal_progress tables.
 * Migrates existing athlete_profiles.training_goals free-text data into smart_goals rows.
 * Drops the training_goals column from athlete_profiles after migration.
 */

export async function up(knex) {
  // ── 1. smart_goals ────────────────────────────────────────────────────────
  await knex.schema.createTable('smart_goals', (table) => {
    table.increments('id').primary();
    table.integer('profile_id').notNullable()
      .references('id').inTable('athlete_profiles').onDelete('CASCADE');

    // Free-text input that was used to create this goal
    table.text('raw_text');

    // Parsed / structured fields
    table.string('title').notNullable();
    table.enum('goal_type', ['performance', 'consistency', 'health', 'skill', 'event']).notNullable();
    table.enum('hierarchy_level', ['long_term', 'block', 'weekly']).notNullable().defaultTo('long_term');

    // Self-referencing FK — block goals point to their long_term parent
    table.integer('parent_goal_id').references('id').inTable('smart_goals').onDelete('SET NULL');

    table.enum('status', ['draft', 'active', 'paused', 'completed', 'abandoned'])
      .notNullable().defaultTo('active');

    // Target
    table.date('target_date');
    table.json('target_metric');   // { name: string, value: number, unit: string }
    table.float('current_value');  // Latest known value for target_metric

    // LLM-derived metadata
    table.json('assumptions');     // string[] — what the system assumed when parsing
    table.float('confidence');     // 0–1 parse confidence
    table.json('weekly_kpis');     // { kpi: string, target: string }[]
    table.json('constraints');     // user-specified constraints captured during parsing

    // Soft-delete / audit
    table.timestamps(true, true);

    // Indexes
    table.index(['profile_id', 'status']);
    table.index(['profile_id', 'hierarchy_level']);
    table.index(['parent_goal_id']);
  });

  // ── 2. goal_progress ──────────────────────────────────────────────────────
  await knex.schema.createTable('goal_progress', (table) => {
    table.increments('id').primary();
    table.integer('goal_id').notNullable()
      .references('id').inTable('smart_goals').onDelete('CASCADE');

    table.date('week_start').notNullable();
    table.enum('status', ['on_track', 'at_risk', 'off_track']).notNullable();

    table.float('metric_value');        // Actual measured value this week
    table.json('kpis_snapshot');        // { kpi: string, achieved: boolean, value?: string }[]
    table.text('narrative');            // LLM plain-language coaching note
    table.json('min_effective_alt');    // Proposed alternative if disrupted { title, description, sessions[] }

    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index(['goal_id', 'week_start']);
    table.unique(['goal_id', 'week_start']);
  });

  // ── 3. Migrate existing training_goals data ───────────────────────────────
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
        goal_type: 'performance',   // safe default — will be re-parsed by LLM on first access
        hierarchy_level: 'long_term',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      }));

    if (rows.length > 0) {
      await knex('smart_goals').insert(rows);
    }
  }

  // ── 4. Drop training_goals column ─────────────────────────────────────────
  await knex.schema.alterTable('athlete_profiles', (table) => {
    table.dropColumn('training_goals');
  });
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
