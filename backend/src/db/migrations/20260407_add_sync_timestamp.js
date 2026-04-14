/**
 * Add last_successful_sync column to users table
 * Tracks when the most recent successful Garmin sync completed
 * Used by data-freshness middleware to avoid false "stale data" warnings
 */
export async function up(knex) {
  await knex.schema.alterTable('users', (table) => {
    table.timestamp('last_successful_sync').nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('last_successful_sync');
  });
}
