/**
 * Initial schema for Garmin AI Coach
 * Creates tables: users, athlete_profiles, daily_metrics, llm_decisions, workout_history, weekly_summaries
 */
export async function up(knex) {
  // Users table - stores Garmin authentication
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('garmin_email').notNullable().unique();
    table.json('garth_session'); // Encrypted garth session
    table.string('location_label');
    table.decimal('latitude', 10, 7);
    table.decimal('longitude', 10, 7);
    table.string('timezone').defaultTo('UTC');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Athlete profiles - stores training preferences and baselines
  await knex.schema.createTable('athlete_profiles', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('profile_id').notNullable().unique();
    table.json('profile_data').notNullable(); // JSON matching athlete_profile.v1.json schema
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Daily metrics - stores Garmin sync data and manual entries
  await knex.schema.createTable('daily_metrics', (table) => {
    table.increments('id').primary();
    table.integer('profile_id').unsigned().notNullable().references('id').inTable('athlete_profiles').onDelete('CASCADE');
    table.date('date').notNullable();
    table.json('metrics_data').notNullable(); // JSON matching daily_metrics.v1.json schema
    table.json('raw_garth_data'); // Original garth response for debugging
    table.timestamp('synced_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['profile_id', 'date']);
    table.index(['profile_id', 'date']);
  });

  // LLM decisions - audit trail of all AI coaching decisions
  await knex.schema.createTable('llm_decisions', (table) => {
    table.increments('id').primary();
    table.integer('profile_id').unsigned().notNullable().references('id').inTable('athlete_profiles').onDelete('CASCADE');
    table.date('date').notNullable();
    table.enum('decision_type', ['daily_workout', 'weekly_plan', 'guardrail_check', 'chat_response']).notNullable();
    table.json('context_json').notNullable(); // Full context sent to LLM
    table.json('llm_response_json'); // Parsed LLM response
    table.text('reasoning_text'); // LLM's explanation
    table.integer('tokens_used');
    table.integer('response_time_ms');
    table.boolean('validation_passed').defaultTo(true);
    table.json('validation_errors');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.index(['profile_id', 'date', 'decision_type']);
  });

  // Workout history - tracks user's workout completion and feedback
  await knex.schema.createTable('workout_history', (table) => {
    table.increments('id').primary();
    table.integer('profile_id').unsigned().notNullable().references('id').inTable('athlete_profiles').onDelete('CASCADE');
    table.integer('llm_decision_id').unsigned().references('id').inTable('llm_decisions').onDelete('SET NULL');
    table.date('date').notNullable();
    table.json('selected_plan'); // Which of the 4 options user chose
    table.boolean('completed').defaultTo(false);
    table.text('user_feedback');
    table.integer('perceived_difficulty_1_10');
    table.integer('enjoyment_1_10');
    table.timestamp('completed_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.index(['profile_id', 'date']);
  });

  // Weekly summaries - aggregated training data per week
  await knex.schema.createTable('weekly_summaries', (table) => {
    table.increments('id').primary();
    table.integer('profile_id').unsigned().notNullable().references('id').inTable('athlete_profiles').onDelete('CASCADE');
    table.date('week_start').notNullable(); // Monday of the week
    table.json('llm_generated_plan'); // Full 7-day plan from LLM
    table.integer('planned_volume_minutes');
    table.integer('actual_volume_minutes');
    table.decimal('compliance_pct', 5, 2);
    table.json('llm_adjustments'); // LLM's week-over-week changes
    table.text('llm_summary'); // LLM's narrative of the week
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['profile_id', 'week_start']);
    table.index(['profile_id', 'week_start']);
  });

  // Training modes - tracks user's periodization preferences
  await knex.schema.createTable('training_modes', (table) => {
    table.increments('id').primary();
    table.integer('profile_id').unsigned().notNullable().unique().references('id').inTable('athlete_profiles').onDelete('CASCADE');
    table.enum('current_mode', ['week_by_week', 'event_driven', 'block_periodization']).notNullable();
    table.json('mode_config'); // event dates, volume targets, etc.
    table.json('switch_history'); // Array of mode changes with dates
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('training_modes');
  await knex.schema.dropTableIfExists('weekly_summaries');
  await knex.schema.dropTableIfExists('workout_history');
  await knex.schema.dropTableIfExists('llm_decisions');
  await knex.schema.dropTableIfExists('daily_metrics');
  await knex.schema.dropTableIfExists('athlete_profiles');
  await knex.schema.dropTableIfExists('users');
}
