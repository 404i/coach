#!/usr/bin/env node
/**
 * User Consolidation Script
 * 
 * Problem: Two user accounts exist with similar emails:
 *   - User ID 1: tsochev.ivan@gmail.com (has auth tokens + 131 activities)
 *   - User ID 2: tscochev.ivan@gmail.com (no auth, no data)
 * 
 * Solution: Keep user ID 1, migrate any athlete_profiles from user ID 2, delete user ID 2
 * 
 * Run: node backend/scripts/migrate-duplicate-users.js
 */

import db from '../src/db/index.js';
import logger from '../src/utils/logger.js';

async function consolidateUsers() {
  try {
    console.log('=== User Consolidation Script ===\n');

    // Step 1: Check current state
    console.log('Step 1: Checking current users...');
    const users = await db('users').select('id', 'garmin_email');
    console.log(`Found ${users.length} users:`);
    users.forEach(u => console.log(`  - User ID ${u.id}: ${u.garmin_email}`));

    if (users.length === 1) {
      console.log('\n✓ Only one user exists. No consolidation needed.');
      process.exit(0);
    }

    // Step 2: Identify target user (keep) and duplicate user (delete)
    const targetUser = users.find(u => u.id === 1);
    const duplicateUser = users.find(u => u.id === 2);

    if (!targetUser || !duplicateUser) {
      console.log('\n✓ No duplicate users with expected IDs (1 and 2). Skipping.');
      process.exit(0);
    }

    console.log(`\nTarget user (keep): User ID ${targetUser.id} - ${targetUser.garmin_email}`);
    console.log(`Duplicate user (delete): User ID ${duplicateUser.id} - ${duplicateUser.garmin_email}`);

    // Step 3: Check data linked to each user
    console.log('\nStep 3: Checking data distribution...');

    // Check activities (using user_id after migration)
    const activitiesUser1 = await db('activities').where('user_id', 1).count('* as count').first();
    const activitiesUser2 = await db('activities').where('user_id', 2).count('* as count').first();
    console.log(`  Activities - User 1: ${activitiesUser1.count}, User 2: ${activitiesUser2.count}`);

    // Check daily_metrics
    const metricsUser1 = await db('daily_metrics').where('user_id', 1).count('* as count').first();
    const metricsUser2 = await db('daily_metrics').where('user_id', 2).count('* as count').first();
    console.log(`  Daily Metrics - User 1: ${metricsUser1.count}, User 2: ${metricsUser2.count}`);

    // Check athlete_profiles
    const profilesUser1 = await db('athlete_profiles').where('user_id', 1).count('* as count').first();
    const profilesUser2 = await db('athlete_profiles').where('user_id', 2).count('* as count').first();
    console.log(`  Athlete Profiles - User 1: ${profilesUser1.count}, User 2: ${profilesUser2.count}`);

    if (activitiesUser2.count > 0 || metricsUser2.count > 0) {
      console.log('\n⚠️  WARNING: User 2 has activities or metrics data!');
      console.log('This script expects User 2 to have NO data (based on investigation).');
      console.log('Please review data manually before proceeding.');
      process.exit(1);
    }

    // Step 4: Migrate athlete_profiles from user 2 to user 1
    if (profilesUser2.count > 0) {
      console.log('\nStep 4: Migrating athlete_profiles from User 2 to User 1...');
      
      // Check for conflicts (profile_id must be unique)
      const user2Profiles = await db('athlete_profiles').where('user_id', 2).select('profile_id');
      const user1ProfileIds = await db('athlete_profiles').where('user_id', 1).pluck('profile_id');
      
      const conflicts = user2Profiles.filter(p => user1ProfileIds.includes(p.profile_id));
      if (conflicts.length > 0) {
        console.log(`\n⚠️  ERROR: Profile ID conflicts detected: ${conflicts.map(c => c.profile_id).join(', ')}`);
        console.log('Cannot migrate - profile_id must be unique.');
        process.exit(1);
      }

      await db('athlete_profiles').where('user_id', 2).update({ user_id: 1 });
      console.log(`✓ Migrated ${profilesUser2.count} athlete_profile(s) to User 1`);
    } else {
      console.log('\nStep 4: No athlete_profiles to migrate from User 2');
    }

    // Step 5: Delete duplicate user
    console.log('\nStep 5: Deleting duplicate user...');
    await db('users').where('id', 2).delete();
    console.log(`✓ Deleted User ID 2 (${duplicateUser.garmin_email})`);

    // Step 6: Final verification
    console.log('\nStep 6: Final verification...');
    const remainingUsers = await db('users').select('id', 'garmin_email');
    console.log(`Remaining users: ${remainingUsers.length}`);
    remainingUsers.forEach(u => console.log(`  - User ID ${u.id}: ${u.garmin_email}`));

    const totalActivities = await db('activities').count('* as count').first();
    const totalMetrics = await db('daily_metrics').count('* as count').first();
    const totalProfiles = await db('athlete_profiles').count('* as count').first();

    console.log(`\nData summary:`);
    console.log(`  Activities: ${totalActivities.count}`);
    console.log(`  Daily Metrics: ${totalMetrics.count}`);
    console.log(`  Athlete Profiles: ${totalProfiles.count}`);

    console.log('\n=== User Consolidation Complete ===');
    console.log('✓ Duplicate user removed');
    console.log('✓ All data preserved and linked to User ID 1');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error during user consolidation:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

consolidateUsers();
