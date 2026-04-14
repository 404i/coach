-- Fix strava_activities FK constraint
-- Problem: FK references athlete_profiles.profile_id (STRING) but code inserts athlete_profiles.id (INTEGER)
-- Solution: Recreate table with FK to athlete_profiles.id

BEGIN TRANSACTION;

-- Backup data
CREATE TABLE strava_activities_backup AS SELECT * FROM strava_activities;

-- Drop old table (and its FKs)
DROP TABLE strava_activities;

-- Recreate with correct FK (athlete_profiles.id instead of athlete_profiles.profile_id)
CREATE TABLE strava_activities (
  activity_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  strava_id BIGINT NOT NULL,
  trail_id INTEGER,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100),
  sport_type VARCHAR(100),
  activity_date DATETIME NOT NULL,
  distance_km FLOAT,
  duration_sec INTEGER,
  elevation_gain_m INTEGER,
  avg_hr INTEGER,
  max_hr INTEGER,
  avg_power INTEGER,
  normalized_power INTEGER,
  training_load INTEGER,
  route_polyline TEXT,
  start_latlng POINT,
  matched_trail BOOLEAN DEFAULT '0',
  trail_match_confidence FLOAT,
  raw_data JSON,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(profile_id) REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY(trail_id) REFERENCES trails(trail_id) ON DELETE SET NULL
);

-- Restore data
INSERT INTO strava_activities SELECT * FROM strava_activities_backup;

-- Drop backup
DROP TABLE strava_activities_backup;

COMMIT;
