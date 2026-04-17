/**
 * Migration: Fix malformed activity dates
 *
 * The Garmin API returns startTimeLocal with a space separator
 * ("2026-04-17 10:32:33") rather than ISO T-separator. The sync code
 * previously split on 'T' which was never found, so the full datetime
 * string was stored in the `date` column.  This breaks date-range
 * filters because SQLite string comparison treats
 *   '2026-04-17 10:32:33' <= '2026-04-17'  →  FALSE
 *
 * This migration normalises all existing rows so `date` is always
 * a 10-character "YYYY-MM-DD" string.
 */
export async function up(knex) {
  await knex.raw(`
    UPDATE activities
    SET date = substr(date, 1, 10)
    WHERE length(date) > 10
  `);
}

export async function down() {
  // Not reversible — normalisation is always correct.
}
