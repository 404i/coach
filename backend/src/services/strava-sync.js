/**
 * Strava API Sync Service
 *
 * Handles OAuth token refresh, activity/athlete fetching, and DB upserts.
 * Uses the existing strava_connections / strava_activities tables
 * (created by schema_reference_trails migration) which use profile_id.
 *
 * Table mapping:
 *   strava_connections.profile_id → athlete_profiles.id (integer PK)
 *   strava_activities.profile_id  → athlete_profiles.id (integer PK)
 *   users.id → athlete_profiles.user_id
 */

import db from '../db/index.js';
import logger from '../utils/logger.js';

const STRAVA_API = 'https://www.strava.com/api/v3';
const TOKEN_URL  = 'https://www.strava.com/oauth/token';

// ─────────────────────────────── helpers ──────────────────────────────────

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set in .env`);
  return v;
}

/**
 * Resolve email → user_id → first athlete_profiles.id (integer PK).
 * The strava tables reference this as their profile_id FK.
 */
export async function resolveProfileId(email) {
  const user = await db('users').where({ garmin_email: email }).first();
  if (!user) return null;
  const profile = await db('athlete_profiles').where({ user_id: user.id }).first();
  return profile?.id || null;
}

// ──────────────────────────── token management ───────────────────────────

/**
 * Refresh or bootstrap a Strava access token.
 *
 * If the profile already has a row in strava_connections we use that
 * refresh_token; otherwise we fall back to STRAVA_REFRESH_TOKEN env var.
 */
export async function refreshAccessToken(profileId) {
  let conn;

  if (profileId) {
    conn = await db('strava_connections').where({ profile_id: profileId }).first();
  }

  let refreshToken;

  if (conn) {
    // token_expires_at is stored as ISO datetime — normalise to epoch
    let expiresEpoch = conn.token_expires_at;
    if (typeof expiresEpoch === 'string') {
      expiresEpoch = Math.floor(new Date(expiresEpoch).getTime() / 1000);
    }

    // Reuse if still valid (>60 s buffer)
    if (expiresEpoch > Math.floor(Date.now() / 1000) + 60) {
      return {
        access_token:  conn.access_token,
        refresh_token: conn.refresh_token,
        expires_at:    expiresEpoch,
      };
    }
    refreshToken = conn.refresh_token;
  } else {
    refreshToken = env('STRAVA_REFRESH_TOKEN');
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     env('STRAVA_CLIENT_ID'),
      client_secret: env('STRAVA_CLIENT_SECRET'),
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error('Strava token refresh failed:', body);
    throw new Error(`Strava token refresh failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const expiresIso = new Date(data.expires_at * 1000).toISOString();

  // Persist the new token set
  if (conn) {
    await db('strava_connections').where({ connection_id: conn.connection_id }).update({
      access_token:     data.access_token,
      refresh_token:    data.refresh_token,
      token_expires_at: expiresIso,
      updated_at:       new Date(),
    });
  } else if (profileId) {
    await db('strava_connections').insert({
      profile_id:          profileId,
      strava_athlete_id:   data.athlete?.id || 0,
      access_token:        data.access_token,
      refresh_token:       data.refresh_token,
      token_expires_at:    expiresIso,
      auto_sync:           true,
      created_at:          new Date(),
      updated_at:          new Date(),
    });
  }

  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at:    data.expires_at,
    athlete:       data.athlete || null,
  };
}

// ─────────────────────────── authenticated fetch ─────────────────────────

async function stravaFetch(endpoint, accessToken, params = {}) {
  const url = new URL(`${STRAVA_API}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Strava API ${endpoint} failed (${res.status}): ${body}`);
  }
  return res.json();
}

// ────────────────────────────── public API ────────────────────────────────

/**
 * Get authenticated athlete profile from Strava.
 */
export async function getStravaAthlete(profileId) {
  const { access_token } = await refreshAccessToken(profileId);
  return stravaFetch('/athlete', access_token);
}

/**
 * Get the Strava connection status for a profile.
 */
export async function getConnectionStatus(profileId) {
  const conn = await db('strava_connections').where({ profile_id: profileId }).first();
  if (!conn) return { connected: false };

  let expiresEpoch = conn.token_expires_at;
  if (typeof expiresEpoch === 'string') {
    expiresEpoch = Math.floor(new Date(expiresEpoch).getTime() / 1000);
  }

  return {
    connected: true,
    strava_athlete_id: conn.strava_athlete_id,
    last_sync: conn.last_sync,
    auto_sync: !!conn.auto_sync,
    token_valid: expiresEpoch > Math.floor(Date.now() / 1000),
  };
}

/**
 * Sync activities from Strava into the local DB.
 *
 * @param {number} profileId – athlete_profiles.id
 * @param {object} opts
 * @param {string} [opts.after]    – ISO date (default: 30 days ago)
 * @param {string} [opts.before]   – ISO date (default: now)
 * @param {number} [opts.per_page] – max per page (default 50, max 200)
 */
export async function syncStravaActivities(profileId, opts = {}) {
  const { access_token } = await refreshAccessToken(profileId);

  const now    = Math.floor(Date.now() / 1000);
  const after  = opts.after
    ? Math.floor(new Date(opts.after).getTime() / 1000)
    : now - 30 * 86400;
  const before = opts.before
    ? Math.floor(new Date(opts.before).getTime() / 1000)
    : now;
  const perPage = Math.min(opts.per_page || 50, 200);

  let page = 1;
  let totalSynced = 0;
  let totalNew = 0;
  let totalUpdated = 0;

  while (true) {
    const activities = await stravaFetch('/athlete/activities', access_token, {
      after,
      before,
      per_page: perPage,
      page,
    });

    if (!activities || activities.length === 0) break;

    for (const act of activities) {
      const existing = await db('strava_activities').where({ strava_id: act.id }).first();

      const row = {
        profile_id:       profileId,
        strava_id:        act.id,
        name:             act.name,
        type:             act.type,
        sport_type:       act.sport_type,
        activity_date:    act.start_date,
        distance_km:      act.distance ? +(act.distance / 1000).toFixed(2) : null,
        duration_sec:     act.moving_time,
        elevation_gain_m: act.total_elevation_gain ? Math.round(act.total_elevation_gain) : null,
        avg_hr:           act.average_heartrate || null,
        max_hr:           act.max_heartrate || null,
        avg_power:        act.average_watts ? Math.round(act.average_watts) : null,
        normalized_power: null,
        training_load:    act.suffer_score || null,
        route_polyline:   act.map?.summary_polyline || null,
        start_latlng:     act.start_latlng ? `${act.start_latlng[0]},${act.start_latlng[1]}` : null,
        raw_data:         JSON.stringify(act),
        synced_at:        new Date(),
      };

      if (existing) {
        await db('strava_activities').where({ activity_id: existing.activity_id }).update(row);
        totalUpdated++;
      } else {
        await db('strava_activities').insert({ ...row, created_at: new Date() });
        totalNew++;
      }
      totalSynced++;
    }

    if (activities.length < perPage) break;
    page++;
  }

  // Mark last sync
  await db('strava_connections').where({ profile_id: profileId }).update({
    last_sync:  new Date(),
    updated_at: new Date(),
  });

  const summary = {
    total_synced: totalSynced,
    new_activities: totalNew,
    updated_activities: totalUpdated,
    date_range: {
      after:  new Date(after * 1000).toISOString().split('T')[0],
      before: new Date(before * 1000).toISOString().split('T')[0],
    },
  };

  logger.info(`Strava sync complete for profile ${profileId}:`, summary);
  return summary;
}

/**
 * Query local Strava activities from DB.
 */
export async function getLocalActivities(profileId, { limit = 30, start_date, end_date, type } = {}) {
  let query = db('strava_activities').where({ profile_id: profileId });

  if (start_date) query = query.where('activity_date', '>=', start_date);
  if (end_date)   query = query.where('activity_date', '<=', end_date);
  if (type)       query = query.where('type', type);

  return query.orderBy('activity_date', 'desc').limit(limit);
}

/**
 * Connect a profile to Strava using the env-var refresh token.
 */
export async function connectStrava(profileId) {
  const existing = await db('strava_connections').where({ profile_id: profileId }).first();
  if (existing) {
    return { already_connected: true, strava_athlete_id: existing.strava_athlete_id };
  }

  // Refresh to get initial access token + athlete info (null profileId → uses env token)
  const tokenData = await refreshAccessToken(null);
  const expiresIso = new Date(tokenData.expires_at * 1000).toISOString();

  await db('strava_connections').insert({
    profile_id:        profileId,
    strava_athlete_id: tokenData.athlete?.id || 0,
    access_token:      tokenData.access_token,
    refresh_token:     tokenData.refresh_token,
    token_expires_at:  expiresIso,
    auto_sync:         true,
    created_at:        new Date(),
    updated_at:        new Date(),
  });

  // Fetch full athlete profile
  const athlete = await stravaFetch('/athlete', tokenData.access_token);

  if (athlete?.id) {
    await db('strava_connections').where({ profile_id: profileId }).update({
      strava_athlete_id: athlete.id,
    });
  }

  return {
    connected: true,
    athlete: {
      id: athlete.id,
      firstname: athlete.firstname,
      lastname: athlete.lastname,
      city: athlete.city,
      country: athlete.country,
      premium: athlete.premium,
    },
  };
}

/**
 * Disconnect Strava (remove connection row).
 */
export async function disconnectStrava(profileId) {
  const deleted = await db('strava_connections').where({ profile_id: profileId }).del();
  return { disconnected: deleted > 0 };
}

export default {
  resolveProfileId,
  refreshAccessToken,
  getStravaAthlete,
  getConnectionStatus,
  syncStravaActivities,
  getLocalActivities,
  connectStrava,
  disconnectStrava,
};
