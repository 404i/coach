-- Fix planned_activities FK constraint
-- Problem: FK references activities_old which doesn't exist

BEGIN TRANSACTION;

-- Backup data
CREATE TABLE planned_activities_backup AS SELECT * FROM planned_activities;

-- Drop old table
DROP TABLE planned_activities;

-- Recreate with correct FK (activities instead of activities_old)
CREATE TABLE planned_activities (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  activity_type VARCHAR(255) NOT NULL,
  sport_category VARCHAR(255),
  description TEXT,
  planned_date DATE,
  planned_date_end DATE,
  time_of_day VARCHAR(255),
  is_flexible BOOLEAN DEFAULT '1',
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'committed')) DEFAULT 'medium',
  is_social BOOLEAN DEFAULT '0',
  is_event BOOLEAN DEFAULT '0',
  constraints TEXT,
  status TEXT CHECK (status IN ('mentioned', 'planned', 'scheduled', 'completed', 'cancelled', 'rescheduled')) DEFAULT 'mentioned',
  completed_date DATE,
  actual_activity_id INTEGER,
  context TEXT,
  notes TEXT,
  metadata JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(profile_id) REFERENCES athlete_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY(actual_activity_id) REFERENCES activities(id)
);

-- Restore data
INSERT INTO planned_activities SELECT * FROM planned_activities_backup;

-- Drop backup
DROP TABLE planned_activities_backup;

COMMIT;
