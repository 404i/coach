/**
 * Fix Foreign Key Constraints - Migration 20260403
 * 
 * CRITICAL FIX: activities.profile_id and daily_metrics.profile_id were incorrectly
 * defined with FK to athlete_profiles.id, but runtime code writes users.id to these columns.
 * 
 * This migration:
 * 1. Drops incorrect foreign keys
 * 2. Renames profile_id → user_id for clarity
 * 3. Adds correct foreign keys to users.id
 * 4. Validates data integrity before applying constraints
 */
export async function up(knex) {
  console.log('=== Starting Foreign Key Fix Migration ===');

  // SQLite doesn't support DROP CONSTRAINT or RENAME COLUMN directly
  // We need to recreate tables with correct schema
  
  // ── Step 1: Validate Data Integrity ────────────────────────────────────────
  console.log('Step 1: Validating data integrity...');
  
  // Check all activities.profile_id values exist in users.id
  const orphanedActivities = await knex.raw(`
    SELECT COUNT(*) as count 
    FROM activities a 
    LEFT JOIN users u ON a.profile_id = u.id 
    WHERE u.id IS NULL
  `);
  
  if (orphanedActivities[0].count > 0) {
    throw new Error(`Found ${orphanedActivities[0].count} activities with invalid profile_id (not in users.id). Cannot proceed with migration.`);
  }
  
  // Check all daily_metrics.profile_id values exist in users.id
  const orphanedMetrics = await knex.raw(`
    SELECT COUNT(*) as count 
    FROM daily_metrics dm 
    LEFT JOIN users u ON dm.profile_id = u.id 
    WHERE u.id IS NULL
  `);
  
  if (orphanedMetrics[0].count > 0) {
    throw new Error(`Found ${orphanedMetrics[0].count} daily_metrics with invalid profile_id (not in users.id). Cannot proceed with migration.`);
  }
  
  console.log('✓ Data integrity validated - all profile_id values exist in users.id');

  // ── Step 2: Recreate activities table ──────────────────────────────────────
  console.log('Step 2: Recreating activities table with correct schema...');
  
  await knex.schema.renameTable('activities', 'activities_old');
  
  // Drop old indexes (they persist after table rename in SQLite)
  await knex.raw('DROP INDEX IF EXISTS activities_activity_id_unique');
  await knex.raw('DROP INDEX IF EXISTS activities_profile_id_date_index');
  await knex.raw('DROP INDEX IF EXISTS activities_activity_id_index');
  
  await knex.schema.createTable('activities', (table) => {
    table.increments('id').primary();
    table.integer('user_id').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.string('activity_id').notNullable().unique(); // Garmin activity ID
    table.string('activity_name');
    table.string('activity_type');
    table.string('sport_type');
    table.date('date').notNullable();
    table.datetime('start_time');
    table.datetime('start_time_local');
    table.float('distance'); // meters
    table.float('duration'); // seconds
    table.float('moving_duration'); // seconds
    table.float('elevation_gain'); // meters
    table.float('elevation_loss'); // meters
    table.float('avg_speed'); // m/s
    table.float('max_speed'); // m/s
    table.float('avg_hr');
    table.float('max_hr');
    table.integer('calories');
    table.float('training_load');
    table.float('aerobic_effect');
    table.float('anaerobic_effect');
    table.json('raw_activity_data');
    table.datetime('synced_at');
    table.timestamps(true, true);
    
    table.index(['user_id', 'date']);
    table.index('activity_id');
  });
  
  // Copy data with renamed column
  await knex.raw(`
    INSERT INTO activities (
      id, user_id, activity_id, activity_name, activity_type, sport_type,
      date, start_time, distance, duration, moving_duration,
      elevation_gain, elevation_loss, avg_speed, max_speed, avg_hr, max_hr,
      calories, training_load, aerobic_effect, anaerobic_effect,
      raw_activity_data, synced_at, created_at, updated_at
    )
    SELECT 
      id, profile_id, activity_id, activity_name, activity_type, sport_type,
      date, start_time, distance, duration, moving_duration,
      elevation_gain, elevation_loss, avg_speed, max_speed, avg_hr, max_hr,
      calories, training_load, aerobic_effect, anaerobic_effect,
      raw_activity_data, synced_at, created_at, updated_at
    FROM activities_old
  `);
  
  await knex.schema.dropTable('activities_old');
  console.log('✓ Activities table recreated with user_id FK to users.id');

  // ── Step 3: Recreate daily_metrics table ───────────────────────────────────
  console.log('Step 3: Recreating daily_metrics table with correct schema...');
  
  await knex.schema.renameTable('daily_metrics', 'daily_metrics_old');
  
  // Drop old indexes (they persist after table rename in SQLite)
  await knex.raw('DROP INDEX IF EXISTS daily_metrics_profile_id_date_unique');
  await knex.raw('DROP INDEX IF EXISTS daily_metrics_profile_id_date_index');
  
  await knex.schema.createTable('daily_metrics', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.date('date').notNullable();
    table.json('metrics_data').notNullable();
    table.json('raw_garth_data');
    table.timestamp('synced_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['user_id', 'date']);
    table.index(['user_id', 'date']);
  });
  
  // Copy data with renamed column
  await knex.raw(`
    INSERT INTO daily_metrics (
      id, user_id, date, metrics_data, raw_garth_data, synced_at, created_at, updated_at
    )
    SELECT 
      id, profile_id, date, metrics_data, raw_garth_data, synced_at, created_at, updated_at
    FROM daily_metrics_old
  `);
  
  await knex.schema.dropTable('daily_metrics_old');
  console.log('✓ Daily metrics table recreated with user_id FK to users.id');

  console.log('=== Foreign Key Fix Migration Complete ===');
  console.log('Summary:');
  console.log('- activities.profile_id → activities.user_id (FK to users.id)');
  console.log('- daily_metrics.profile_id → daily_metrics.user_id (FK to users.id)');
  console.log('- All data migrated successfully');
}

export async function down(knex) {
  console.log('=== Rolling back Foreign Key Fix Migration ===');
  
  // Recreate original tables with profile_id (wrong FK, but allows rollback)
  await knex.schema.renameTable('activities', 'activities_new');
  
  await knex.schema.createTable('activities', (table) => {
    table.increments('id').primary();
    table.integer('profile_id').notNullable()
      .references('id').inTable('athlete_profiles').onDelete('CASCADE');
    table.string('activity_id').notNullable().unique();
    table.string('activity_name');
    table.string('activity_type');
    table.string('sport_type');
    table.date('date').notNullable();
    table.datetime('start_time');
    table.datetime('start_time_local');
    table.float('distance');
    table.float('duration');
    table.float('moving_duration');
    table.float('elevation_gain');
    table.float('elevation_loss');
    table.float('avg_speed');
    table.float('max_speed');
    table.float('avg_hr');
    table.float('max_hr');
    table.integer('calories');
    table.float('training_load');
    table.float('aerobic_effect');
    table.float('anaerobic_effect');
    table.json('raw_activity_data');
    table.datetime('synced_at');
    table.timestamps(true, true);
    table.index(['profile_id', 'date']);
    table.index('activity_id');
  });
  
  await knex.raw(`
    INSERT INTO activities SELECT * FROM activities_new WHERE 1=1
  `);
  
  await knex.schema.dropTable('activities_new');
  
  // Rollback daily_metrics
  await knex.schema.renameTable('daily_metrics', 'daily_metrics_new');
  
  await knex.schema.createTable('daily_metrics', (table) => {
    table.increments('id').primary();
    table.integer('profile_id').unsigned().notNullable()
      .references('id').inTable('athlete_profiles').onDelete('CASCADE');
    table.date('date').notNullable();
    table.json('metrics_data').notNullable();
    table.json('raw_garth_data');
    table.timestamp('synced_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['profile_id', 'date']);
    table.index(['profile_id', 'date']);
  });
  
  await knex.raw(`
    INSERT INTO daily_metrics SELECT * FROM daily_metrics_new WHERE 1=1
  `);
  
  await knex.schema.dropTable('daily_metrics_new');
  
  console.log('=== Rollback Complete ===');
}
