/**
 * Garmin data-freshness helpers — sync cache, auto-sync, freshness gate.
 */
import { callAPI } from './api.js';
import { getDateTimeContext } from './datetime.js';
import { getSyncCache, setSyncCache, saveAthleteState } from './state.js';

/**
 * Get last sync timestamp for an athlete.
 * First checks the in-process cache (state file), then falls back to the DB
 * via the dedicated /api/garmin/last-sync endpoint.
 */
export async function getLastSyncTime(email) {
  const cache = getSyncCache();
  if (
    cache.email === email &&
    cache.timestamp > 0 &&
    Date.now() - cache.fetchedAt < 10 * 60 * 1000
  ) {
    return cache.timestamp;
  }

  try {
    const response = await callAPI(`/api/garmin/last-sync?email=${encodeURIComponent(email)}`);
    if (response.last_sync) {
      const ts = new Date(response.last_sync).getTime();
      setSyncCache({ email, timestamp: ts, fetchedAt: Date.now() });
      return ts;
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Check if data needs syncing based on last sync time (>2 hours = stale).
 * Returns true if sync was performed, false if data is fresh.
 */
export async function autoSyncIfNeeded(email) {
  try {
    const now = Date.now();
    const lastSyncTime = await getLastSyncTime(email);
    const minutesSinceSync = (now - lastSyncTime) / (1000 * 60);

    // If never synced, sync last 7 days
    if (lastSyncTime === 0) {
      console.error('⚠️  No sync history found - syncing last 7 days');
      await callAPI('/api/garmin/sync', {
        method: 'POST',
        body: JSON.stringify({
          email,
          start_date: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: new Date().toISOString().split('T')[0],
        }),
      });
      setSyncCache({ email, timestamp: Date.now(), fetchedAt: Date.now() });
      await saveAthleteState();
      return true;
    }

    // If last sync was more than 2 hours ago, sync recent data
    if (minutesSinceSync > 120) {
      console.error(`ℹ️  Last sync was ${minutesSinceSync.toFixed(0)} min ago (>2h) - syncing recent data`);
      await callAPI('/api/garmin/sync', {
        method: 'POST',
        body: JSON.stringify({
          email,
          start_date: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: new Date().toISOString().split('T')[0],
        }),
      });
      setSyncCache({ email, timestamp: Date.now(), fetchedAt: Date.now() });
      await saveAthleteState();
      return true;
    }

    console.error(`✓ Data is fresh (synced ${minutesSinceSync.toFixed(0)} min ago)`);
    return false;
  } catch (error) {
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.error('🔑 Session expired - attempting re-authentication');
      try {
        const reauthResult = await callAPI('/api/garmin/reauth', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        if (reauthResult.success) {
          console.error('✓ Re-authentication successful - retrying sync');
          await callAPI('/api/garmin/sync', {
            method: 'POST',
            body: JSON.stringify({
              email,
              start_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              end_date: new Date().toISOString().split('T')[0],
            }),
          });
          return true;
        } else if (reauthResult.mfa_required) {
          throw new Error('MFA_REQUIRED: Please authenticate via POST /api/garmin/login with mfa_code');
        }
        throw new Error(`Re-authentication failed: ${reauthResult.message}`);
      } catch (reauthError) {
        console.error('❌ Re-authentication failed:', reauthError.message);
        throw reauthError;
      }
    }
    console.error('⚠️  Auto-sync failed:', error.message);
    return false;
  }
}

/**
 * Ensure data is fresh before responding to the athlete.
 * Checks current time vs DB data age; if difference > 2 hours, auto-syncs.
 * Returns a freshness status line to prepend to tool responses.
 */
export async function ensureFreshData(email) {
  const datetime = getDateTimeContext();
  let freshnessNote = `📅 ${datetime.formatted}`;
  try {
    const synced = await autoSyncIfNeeded(email);
    if (synced) {
      freshnessNote += ' | ✓ Auto-synced fresh data from Garmin';
    } else {
      const lastSync = await getLastSyncTime(email);
      if (lastSync > 0) {
        const minAgo = Math.round((Date.now() - lastSync) / 60000);
        freshnessNote += ` | Data synced ${minAgo} min ago`;
      }
    }
  } catch (err) {
    freshnessNote += ` | ⚠️  Auto-sync failed: ${err.message}`;
  }
  return freshnessNote;
}
