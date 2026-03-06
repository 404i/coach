/**
 * Migration: Add training_goals column to athlete_profiles
 */

export async function up(knex) {
  await knex.schema.alterTable('athlete_profiles', table => {
    table.json('training_goals'); // string[]
  });
}

export async function down(knex) {
  await knex.schema.alterTable('athlete_profiles', table => {
    table.dropColumn('training_goals');
  });
}
