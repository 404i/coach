/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.createTable('activities', (table) => {
    table.increments('id').primary();
    table.integer('profile_id').notNullable()
      .references('id').inTable('athlete_profiles').onDelete('CASCADE');
    table.string('activity_id').notNullable().unique(); // Garmin activity ID
    table.string('activity_name');
    table.string('activity_type');
    table.string('sport_type');
    table.date('date').notNullable();
    table.datetime('start_time');
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
    
    table.index(['profile_id', 'date']);
    table.index('activity_id');
  });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.dropTable('activities');
}
