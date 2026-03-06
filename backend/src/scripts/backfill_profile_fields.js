// Script to backfill structured columns in athlete_profiles from preferences JSON
// Run with: node backend/src/scripts/backfill_profile_fields.js

import db, { initDatabase } from '../db/index.js';

async function backfillProfileFields() {
  await initDatabase();
  const profiles = await db('athlete_profiles').select('id', 'profile_data');
  let updated = 0;

  for (const profile of profiles) {
    let data;
    try {
      data = JSON.parse(profile.profile_data);
    } catch (e) {
      console.error(`Invalid JSON for profile id ${profile.id}`);
      continue;
    }
    const preferences = data.preferences || {};
    const updateFields = {
      name_display: data.name || preferences.name || null,
      favorite_sports: JSON.stringify(data.favorite_sports || preferences.favorite_sports || []),
      goals: JSON.stringify(data.goals || preferences.goals || []),
      motivations: JSON.stringify(data.motivations || preferences.motivations || []),
      injuries_conditions: JSON.stringify(data.injuries_conditions || preferences.injuries_conditions || []),
      training_goals: JSON.stringify(data.training_goals || preferences.training_goals || [])
    };
    // Only update if at least one field is non-empty
    if (Object.values(updateFields).some(v => v && v !== '[]' && v !== 'null')) {
      await db('athlete_profiles').where({ id: profile.id }).update(updateFields);
      updated++;
    }
  }
  console.log(`Backfill complete. Updated ${updated} profiles.`);
  await db.destroy();
}

backfillProfileFields().catch(e => {
  console.error('Backfill failed:', e);
  process.exit(1);
});
