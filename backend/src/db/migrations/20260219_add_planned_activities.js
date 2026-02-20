/**
 * Migration: Planned Activities
 * 
 * Stores future activities mentioned by the user (e.g., "yoga tonight", "DH park next weekend")
 * Enables context sharing between Claude, LM Studio, and other tools
 */
export async function up(knex) {
  await knex.schema.createTable('planned_activities', (table) => {
    table.increments('id').primary();
    table.integer('profile_id').notNullable()
      .references('id').inTable('athlete_profiles').onDelete('CASCADE');
    
    // Activity details
    table.string('activity_type').notNullable(); // 'yoga', 'mountain_biking', 'cycling', etc.
    table.string('sport_category'); // 'endurance', 'strength', 'flexibility', etc.
    table.text('description'); // 'DH park session', 'yoga retreat', etc.
    
    // Timing
    table.date('planned_date'); // Specific date
    table.date('planned_date_end'); // For multi-day events (retreats, trips)
    table.string('time_of_day'); // 'morning', 'afternoon', 'evening', null
    table.boolean('is_flexible').defaultTo(true); // Can be rescheduled?
    
    // Importance and constraints
    table.enum('priority', ['low', 'medium', 'high', 'committed']).defaultTo('medium');
    table.boolean('is_social').defaultTo(false); // Group activity?
    table.boolean('is_event').defaultTo(false); // Organized event/race?
    table.text('constraints'); // "Weather dependent", "Need to book", etc.
    
    // Status tracking
    table.enum('status', ['mentioned', 'planned', 'scheduled', 'completed', 'cancelled', 'rescheduled'])
      .defaultTo('mentioned');
    table.date('completed_date'); // When it actually happened
    table.integer('actual_activity_id').references('id').inTable('activities'); // Link to completed activity
    
    // Context and notes
    table.text('context'); // Original conversation context
    table.text('notes'); // Additional user notes
    table.json('metadata'); // Flexible storage for additional data
    
    table.timestamps(true, true);
    
    // Indexes for efficient queries
    table.index(['profile_id', 'status']);
    table.index(['profile_id', 'planned_date']);
    table.index(['planned_date', 'status']);
  });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.dropTable('planned_activities');
}
