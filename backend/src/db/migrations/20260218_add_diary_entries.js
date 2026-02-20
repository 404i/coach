/**
 * Training Diary schema
 * Creates table for logging subjective training experiences and AI-generated insights
 */
export async function up(knex) {
  // Diary entries - stores subjective training logs and feelings
  await knex.schema.createTable('diary_entries', (table) => {
    table.increments('id').primary();
    table.integer('profile_id').unsigned().notNullable().references('id').inTable('athlete_profiles').onDelete('CASCADE');
    table.date('date').notNullable();
    table.string('activity_id'); // Optional reference to GarminDB activity
    
    // Subjective metrics (1-10 scale or nullable)
    table.integer('rpe'); // Rate of Perceived Exertion (1-10)
    table.integer('overall_feel'); // How did you feel overall? (1-10, 1=terrible, 10=amazing)
    table.integer('sleep_quality'); // Sleep quality last night (1-10)
    table.integer('stress_level'); // Mental stress (1-10, higher = more stressed)
    table.integer('motivation'); // Motivation to train (1-10)
    table.integer('soreness'); // Muscle soreness (1-10, higher = more sore)
    table.integer('energy'); // Energy level (1-10)
    
    // Free-form content
    table.text('notes'); // Training notes, thoughts, observations
    table.text('highlights'); // What went well
    table.text('challenges'); // What was difficult
    table.json('tags'); // Array of tags like ['breakthrough', 'tough', 'fun']
    
    // AI-generated insights (populated during analysis)
    table.text('ai_insights'); // AI-generated patterns and observations
    
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.index(['profile_id', 'date']);
    table.index(['profile_id', 'created_at']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('diary_entries');
}
