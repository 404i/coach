/**
 * Migration: Add 'occasional' pattern type for Issue #8
 * 
 * Adds 'occasional' to pattern_type enum to support low-frequency activities (0.5-1x/week)
 * 
 * SQLite doesn't support ALTER TABLE for CHECK constraints, so we need to:
 * 1. Create new table with updated constraint
 * 2. Copy data
 * 3. Drop old table
 * 4. Rename new table
 */

export async function up(knex) {
  // Create new table with updated pattern_type enum
  await knex.schema.createTable('training_patterns_new', table => {
    table.increments('pattern_id').primary();
    table.integer('profile_id').notNullable();
    
    // Pattern definition - UPDATED enum with 'occasional'
    table.enu('pattern_type', ['daily_habit', 'weekly_staple', 'occasional', 'time_of_day', 'multi_activity']).notNullable();
    table.string('sport', 50);
    table.string('activity_type', 100);
    
    // Frequency metrics
    table.decimal('frequency_days_per_week', 3, 1);
    table.integer('typical_duration_min');
    table.string('typical_intensity', 20);
    table.string('time_slot', 20);
    
    // Pattern strength
    table.integer('pattern_confidence').defaultTo(0);
    table.integer('pattern_age_days').defaultTo(0);
    table.date('last_occurrence');
    
    // Statistics
    table.integer('total_occurrences').defaultTo(0);
    table.integer('streak_current').defaultTo(0);
    table.integer('streak_longest').defaultTo(0);
    
    // Metadata
    table.timestamp('discovered_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.enu('status', ['active', 'broken', 'dormant']).defaultTo('active');
  });
  
  // Copy existing data
  await knex.raw(`
    INSERT INTO training_patterns_new 
    SELECT * FROM training_patterns
  `);
  
  // Drop old table
  await knex.schema.dropTable('training_patterns');
  
  // Rename new table
  await knex.schema.renameTable('training_patterns_new', 'training_patterns');
  
  // Recreate indexes
  await knex.schema.alterTable('training_patterns', table => {
    table.index(['profile_id', 'status']);
    table.index(['profile_id', 'sport']);
    table.index('pattern_type');
  });
}

export async function down(knex) {
  // Create table with old enum (no 'occasional')
  await knex.schema.createTable('training_patterns_old', table => {
    table.increments('pattern_id').primary();
    table.integer('profile_id').notNullable();
    
    // Pattern definition - OLD enum without 'occasional'
    table.enu('pattern_type', ['daily_habit', 'weekly_staple', 'time_of_day', 'multi_activity']).notNullable();
    table.string('sport', 50);
    table.string('activity_type', 100);
    
    table.decimal('frequency_days_per_week', 3, 1);
    table.integer('typical_duration_min');
    table.string('typical_intensity', 20);
    table.string('time_slot', 20);
    
    table.integer('pattern_confidence').defaultTo(0);
    table.integer('pattern_age_days').defaultTo(0);
    table.date('last_occurrence');
    
    table.integer('total_occurrences').defaultTo(0);
    table.integer('streak_current').defaultTo(0);
    table.integer('streak_longest').defaultTo(0);
    
    table.timestamp('discovered_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.enu('status', ['active', 'broken', 'dormant']).defaultTo('active');
  });
  
  // Copy data, filtering out 'occasional' patterns
  await knex.raw(`
    INSERT INTO training_patterns_old 
    SELECT * FROM training_patterns 
    WHERE pattern_type != 'occasional'
  `);
  
  await knex.schema.dropTable('training_patterns');
  await knex.schema.renameTable('training_patterns_old', 'training_patterns');
  
  await knex.schema.alterTable('training_patterns', table => {
    table.index(['profile_id', 'status']);
    table.index(['profile_id', 'sport']);
    table.index('pattern_type');
  });
}
