/**
 * Migration: Pattern Recognition System
 * 
 * Creates tables for:
 * - training_patterns: Detecting athlete habits
 * - pattern_breaks: When established patterns break
 * - multi_activity_days: Multiple workouts per day
 * - performance_gaps: Missing training modalities
 */

export async function up(knex) {
  // 1. training_patterns table
  await knex.schema.createTable('training_patterns', table => {
    table.increments('pattern_id').primary();
    table.integer('profile_id').notNullable();
    
    // Pattern definition
    table.enu('pattern_type', ['daily_habit', 'weekly_staple', 'time_of_day', 'multi_activity']).notNullable();
    table.string('sport', 50);
    table.string('activity_type', 100);
    
    // Frequency metrics
    table.decimal('frequency_days_per_week', 3, 1); // e.g., 6.5
    table.integer('typical_duration_min');
    table.string('typical_intensity', 20);
    table.string('time_slot', 20); // 'morning', 'midday', 'evening'
    
    // Pattern strength
    table.integer('pattern_confidence').defaultTo(0); // 0-100
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
    
    // Indexes
    table.index(['profile_id', 'status']);
    table.index(['profile_id', 'sport']);
    table.index('pattern_type');
  });
  
  // 2. pattern_breaks table
  await knex.schema.createTable('pattern_breaks', table => {
    table.increments('break_id').primary();
    table.integer('pattern_id').notNullable();
    table.integer('profile_id').notNullable();
    
    // Break details
    table.date('break_started').notNullable();
    table.date('break_ended');
    table.integer('break_duration_days').notNullable();
    
    // Severity
    table.enu('severity', ['low', 'medium', 'high', 'critical']).notNullable();
    table.integer('impact_score').defaultTo(0); // 0-100
    
    // Detection
    table.timestamp('detected_at').defaultTo(knex.fn.now());
    
    // Nudging
    table.boolean('nudge_sent').defaultTo(false);
    table.timestamp('nudge_sent_at');
    table.boolean('nudge_accepted').defaultTo(false);
    table.timestamp('nudge_accepted_at');
    
    // Context
    table.string('break_reason', 100);
    table.json('concurrent_factors');
    
    // Foreign keys
    table.foreign('pattern_id').references('training_patterns.pattern_id').onDelete('CASCADE');
    
    // Indexes
    table.index(['profile_id', 'severity']);
    table.index(['pattern_id', 'break_ended']);
    table.index('nudge_sent');
  });
  
  // 3. multi_activity_days table
  await knex.schema.createTable('multi_activity_days', table => {
    table.increments('multi_day_id').primary();
    table.integer('profile_id').notNullable();
    table.date('date').notNullable();
    
    // Activities (stored as JSON array of activity IDs)
    table.json('activity_ids').notNullable();
    table.integer('activity_count').notNullable();
    
    // Timing
    table.json('time_slots'); // ['morning', 'evening']
    table.integer('total_duration_min').notNullable();
    
    // Load calculation
    table.json('individual_loads'); // [15, 85, 55]
    table.integer('base_total_load').notNullable();
    table.integer('multi_activity_penalty').notNullable();
    table.integer('adjusted_total_load').notNullable();
    
    // Patterns
    table.string('activity_combo', 200); // 'yoga_cycling_strength'
    table.boolean('is_typical_combo').defaultTo(false);
    
    // Recovery impact
    table.integer('recovery_deficit');
    table.integer('predicted_next_day_recovery');
    
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['profile_id', 'date']);
    table.index(['profile_id', 'activity_count']);
    table.unique(['profile_id', 'date']); // One record per athlete per day
  });
  
  // 4. performance_gaps table
  await knex.schema.createTable('performance_gaps', table => {
    table.increments('gap_id').primary();
    table.integer('profile_id').notNullable();
    
    // Missing modality
    table.string('modality', 50).notNullable(); // 'strength', 'hiit', 'flexibility'
    
    // Gap metrics
    table.integer('days_absent').notNullable();
    table.date('last_performed');
    table.string('typical_frequency', 50);
    table.string('current_frequency', 50);
    
    // Impact assessment
    table.enu('gap_severity', ['minor', 'moderate', 'significant', 'critical']).notNullable();
    table.integer('performance_impact').defaultTo(0); // 0-100
    table.integer('injury_risk_increase').defaultTo(0); // 0-100
    
    // Recommendations
    table.string('recommended_frequency', 50);
    table.integer('recommended_duration');
    table.string('recommended_timing', 100);
    
    // Benefits if addressed
    table.json('benefits');
    table.json('estimated_improvement');
    
    // Nudging
    table.integer('nudge_priority').defaultTo(5); // 1-10
    table.boolean('nudge_sent').defaultTo(false);
    table.timestamp('nudge_sent_at');
    
    table.timestamp('detected_at').defaultTo(knex.fn.now());
    table.timestamp('resolved_at');
    
    // Indexes
    table.index(['profile_id', 'modality']);
    table.index(['profile_id', 'gap_severity']);
    table.index('nudge_sent');
  });
};

export async function down(knex) {
  await knex.schema.dropTableIfExists('performance_gaps');
  await knex.schema.dropTableIfExists('multi_activity_days');
  await knex.schema.dropTableIfExists('pattern_breaks');
  await knex.schema.dropTableIfExists('training_patterns');
};
