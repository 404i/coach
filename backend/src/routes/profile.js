import express from 'express';
import db from '../db/index.js';
import logger from '../utils/logger.js';
import { syncDateRange } from '../services/garmin-sync.js';
import { storeEncryptedCredentials } from '../services/auth-improved.js';

const router = express.Router();

/**
 * POST /api/profile - Create new athlete profile
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      email,
      goals,
      motivations,
      constraints,
      favorite_sports,
      access,
      injuries_conditions,
      baselines,
      preferences,
      location,
      garmin_email,
      garmin_password
    } = req.body;

    logger.info('Creating new profile', { email });

    // Validate required fields
    if (!name || !email || !favorite_sports || favorite_sports.length === 0) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, email, favorite_sports' 
      });
    }

    // Check if user already exists
    const existingUser = await db('users').where({ garmin_email: email }).first();
    
    let userId;
    if (existingUser) {
      userId = existingUser.id;
      logger.info('User already exists, updating profile', { userId });
    } else {
      // Create user
      const [newUserId] = await db('users').insert({
        garmin_email: email,
        location_label: location?.label || null,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        timezone: location?.timezone || 'UTC'
      });
      userId = newUserId;
      logger.info('Created new user', { userId });
    }

    // Generate profile_id from email
    const profileId = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '_');

    // Extract structured fields from preferences if present
    const extractedName = name || preferences?.name || null;
    const extractedFavoriteSports = favorite_sports || preferences?.favorite_sports || [];
    const extractedGoals = goals || preferences?.goals || [];
    const extractedMotivations = motivations || preferences?.motivations || [];
    const extractedInjuries = injuries_conditions || preferences?.injuries_conditions || [];
    const extractedTrainingGoals = preferences?.training_goals || [];

    // Build profile data matching athlete_profile.v1.json schema
    const profileData = {
      profile_id: profileId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      name: extractedName,
      goals: extractedGoals,
      motivations: extractedMotivations,
      constraints: constraints || [],
      favorite_sports: extractedFavoriteSports,
      access: {
        equipment: access?.equipment || [],
        facilities: access?.facilities || [],
        days_per_week: access?.days_per_week || 3,
        minutes_per_session: access?.minutes_per_session || 45
      },
      injuries_conditions: extractedInjuries,
      baselines: {
        resting_hr_bpm_14d: baselines?.resting_hr_bpm_14d || null,
        hrv_ms_7d: baselines?.hrv_ms_7d || null,
        lthr_bpm: baselines?.lthr_bpm || null,
        max_hr_bpm: baselines?.max_hr_bpm || null,
        ftp_watts: baselines?.ftp_watts || null
      },
      preferences: {
        ...preferences,
        max_hard_days_per_week: preferences?.max_hard_days_per_week || 2,
        preferred_training_time: preferences?.preferred_training_time || 'either',
        likes_variety: preferences?.likes_variety !== undefined ? preferences.likes_variety : true
      },
      location: location || {},
      training_goals: extractedTrainingGoals
    };

    // Check if profile already exists
    const existingProfile = await db('athlete_profiles')
      .where({ profile_id: profileId })
      .first();

    let profile;
    // Prepare update/insert fields for structured columns
    const structuredFields = {
      name_display: extractedName,
      favorite_sports: JSON.stringify(extractedFavoriteSports),
      goals: JSON.stringify(extractedGoals),
      motivations: JSON.stringify(extractedMotivations),
      injuries_conditions: JSON.stringify(extractedInjuries),
      training_goals: JSON.stringify(extractedTrainingGoals)
    };
    if (existingProfile) {
      // Update existing profile
      await db('athlete_profiles')
        .where({ id: existingProfile.id })
        .update({
          profile_data: JSON.stringify(profileData),
          updated_at: db.fn.now(),
          ...structuredFields
        });
      profile = {
        id: existingProfile.id,
        user_id: userId,
        profile_id: profileId,
        email: email,
        ...profileData
      };
      logger.info('Updated existing profile', { profileId });
    } else {
      // Create new profile
      const [profileDbId] = await db('athlete_profiles').insert({
        user_id: userId,
        profile_id: profileId,
        profile_data: JSON.stringify(profileData),
        ...structuredFields
      });
      profile = {
        id: profileDbId,
        user_id: userId,
        profile_id: profileId,
        email: email,
        ...profileData
      };
      logger.info('Created new profile', { profileId, profileDbId });
    }

    // If Garmin credentials provided, initiate sync
    let syncResult = null;
    if (garmin_email && garmin_password) {
      try {
        logger.info('Initiating Garmin authentication during onboarding');
        
        // Import loginGarmin to properly authenticate
        const { loginGarmin } = await import('../services/garmin-sync.js');
        
        // Authenticate with Garmin and store proper session
        const authResult = await loginGarmin(garmin_email, garmin_password);
        
        if (authResult.mfa_required) {
          logger.info('MFA required for Garmin login');
          // Store encrypted credentials; mark session as MFA-pending (no plaintext password)
          await storeEncryptedCredentials(garmin_email, garmin_password);
          await db('users').where({ id: userId }).update({
            garth_session: JSON.stringify({
              email: garmin_email,
              mfa_required: true,
              authenticated_at: new Date().toISOString()
            })
          });
          syncResult = { mfa_required: true, message: 'MFA required. Please complete authentication via /api/garmin/mfa' };
        } else {
          logger.info('Garmin authentication successful');
          
          // Sync last 90 days of data
          const endDate = new Date().toISOString().split('T')[0];
          const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];

          syncResult = await syncDateRange(email, startDate, endDate);
          logger.info('Initial Garmin sync completed', syncResult);
        }
      } catch (syncError) {
        logger.error('Garmin authentication/sync failed during onboarding', syncError);
        // Store encrypted credentials for later re-auth (no plaintext password persisted)
        try {
          await storeEncryptedCredentials(garmin_email, garmin_password);
        } catch (dbError) {
          logger.error('Failed to store credentials after auth error', dbError);
        }
        // Don't fail profile creation if auth fails
        syncResult = { error: syncError.message };
      }
    }

    res.json({
      success: true,
      profile,
      sync_result: syncResult
    });

  } catch (error) {
    logger.error('Failed to create profile:', error);
    res.status(500).json({
      error: 'Failed to create profile',
      message: error.message
    });
  }
});

/**
 * GET /api/profile - Get athlete profile by email
 */
router.get('/', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Find user
    const user = await db('users').where({ garmin_email: email }).first();
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Find profile
    const profile = await db('athlete_profiles')
      .where({ user_id: user.id })
      .first();

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    let profileData = {};
    try {
      profileData = profile.profile_data ? JSON.parse(profile.profile_data) : {};
    } catch {
      logger.error('Failed to parse profile_data for profile', profile.id);
    }

    res.json({
      success: true,
      profile: {
        id: profile.id,
        user_id: profile.user_id,
        profile_id: profile.profile_id,
        email: user.garmin_email,
        ...profileData,
        has_garmin: !!user.garth_session
      }
    });

  } catch (error) {
    logger.error('Failed to fetch profile:', error);
    res.status(500).json({
      error: 'Failed to fetch profile',
      message: error.message
    });
  }
});

/**
 * PUT /api/profile - Update athlete profile
 */
router.put('/', async (req, res) => {
  try {
    const { profile_id, ...updates } = req.body;

    if (!profile_id) {
      return res.status(400).json({ error: 'profile_id required' });
    }

    const profile = await db('athlete_profiles')
      .where({ profile_id })
      .first();

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    let currentData = {};
    try {
      currentData = profile.profile_data ? JSON.parse(profile.profile_data) : {};
    } catch {
      logger.error('Failed to parse profile_data for profile', profile.id);
    }
    // Extract structured fields from updates or preferences
    const updatedName = updates.name || updates.preferences?.name || currentData.name || null;
    const updatedFavoriteSports = updates.favorite_sports || updates.preferences?.favorite_sports || currentData.favorite_sports || [];
    const updatedGoals = updates.goals || updates.preferences?.goals || currentData.goals || [];
    const updatedMotivations = updates.motivations || updates.preferences?.motivations || currentData.motivations || [];
    const updatedInjuries = updates.injuries_conditions || updates.preferences?.injuries_conditions || currentData.injuries_conditions || [];
    const updatedTrainingGoals = updates.training_goals || updates.preferences?.training_goals || currentData.training_goals || [];

    const updatedData = {
      ...currentData,
      ...updates,
      name: updatedName,
      favorite_sports: updatedFavoriteSports,
      goals: updatedGoals,
      motivations: updatedMotivations,
      injuries_conditions: updatedInjuries,
      training_goals: updatedTrainingGoals,
      updated_at: new Date().toISOString()
    };

    const structuredFields = {
      name_display: updatedName,
      favorite_sports: JSON.stringify(updatedFavoriteSports),
      goals: JSON.stringify(updatedGoals),
      motivations: JSON.stringify(updatedMotivations),
      injuries_conditions: JSON.stringify(updatedInjuries),
      training_goals: JSON.stringify(updatedTrainingGoals)
    };

    await db('athlete_profiles')
      .where({ id: profile.id })
      .update({
        profile_data: JSON.stringify(updatedData),
        updated_at: db.fn.now(),
        ...structuredFields
      });

    res.json({
      success: true,
      profile: {
        id: profile.id,
        profile_id,
        ...updatedData
      }
    });

  } catch (error) {
    logger.error('Failed to update profile:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      message: error.message
    });
  }
});

export default router;
