/**
 * MTB Trail Integration - Database Schema Reference
 * Run these migrations to add trail and Strava integration
 */

// Migration: 20260219_add_trails_tables.js
export async function up(knex) {
  
  // ===== TRAILS TABLE =====
  await knex.schema.createTable('trails', (table) => {
    table.increments('trail_id').primary();
    table.integer('trailforks_id').unique().notNullable();
    table.string('name', 255).notNullable();
    table.string('region', 255);
    table.string('country', 100);
    
    // Location
    table.decimal('latitude', 10, 7).notNullable();
    table.decimal('longitude', 10, 7).notNullable();
    table.text('trailhead_address');
    
    // Difficulty ratings
    table.enum('difficulty', ['green', 'blue', 'black', 'double_black']).notNullable();
    table.integer('physical_rating').checkBetween([1, 5]);
    table.integer('technical_rating').checkBetween([1, 5]);
    
    // Trail metrics
    table.decimal('length_km', 8, 2).notNullable();
    table.integer('elevation_gain_m').defaultTo(0);
    table.integer('elevation_loss_m').defaultTo(0);
    table.integer('duration_estimate_min');
    
    // Trail characteristics
    table.json('trail_type'); // ['singletrack', 'xc', 'enduro']
    table.json('features'); // ['jumps', 'drops', 'technical']
    table.string('surface', 50); // 'dirt', 'rock', 'mixed'
    
    // Conditions
    table.enum('current_condition', ['dry', 'wet', 'muddy', 'snow', 'closed']).defaultTo('dry');
    table.timestamp('condition_updated');
    table.json('condition_reports');
    
    // Season
    table.json('best_season'); // ['spring', 'summer', 'fall', 'winter']
    
    // Metadata
    table.text('description');
    table.json('photos'); // Array of URLs
    table.integer('popularity_score').defaultTo(0);
    
    table.timestamps(true, true);
    
    // Indexes
    table.index(['latitude', 'longitude'], 'idx_trails_location');
    table.index('difficulty', 'idx_trails_difficulty');
    table.index('region', 'idx_trails_region');
    table.index('current_condition', 'idx_trails_condition');
  });
  
  // ===== TRAIL RECOMMENDATIONS TABLE =====
  await knex.schema.createTable('trail_recommendations', (table) => {
    table.increments('recommendation_id').primary();
    table.integer('profile_id').unsigned().notNullable();
    table.integer('trail_id').unsigned().notNullable();
    table.date('date').notNullable();
    
    // Scoring (0-100)
    table.integer('fitness_match_score').checkBetween([0, 100]);
    table.integer('skill_match_score').checkBetween([0, 100]);
    table.integer('condition_score').checkBetween([0, 100]);
    table.integer('weather_score').checkBetween([0, 100]);
    table.integer('overall_score').checkBetween([0, 100]);
    
    // Reasoning
    table.json('match_reasons'); // String array
    table.json('warnings'); // String array
    table.json('preparation_tips'); // String array
    
    // Predicted metrics
    table.integer('predicted_duration_min');
    table.integer('predicted_avg_hr');
    table.integer('predicted_training_load');
    
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Foreign keys
    table.foreign('profile_id').references('athlete_profiles.profile_id').onDelete('CASCADE');
    table.foreign('trail_id').references('trails.trail_id').onDelete('CASCADE');
    
    // Indexes
    table.index(['profile_id', 'date'], 'idx_recommendations_profile_date');
    table.index('overall_score', 'idx_recommendations_score');
  });
  
  // ===== STRAVA CONNECTIONS TABLE =====
  await knex.schema.createTable('strava_connections', (table) => {
    table.increments('connection_id').primary();
    table.integer('profile_id').unsigned().unique().notNullable();
    table.bigInteger('strava_athlete_id').notNullable();
    
    // OAuth tokens (encrypted)
    table.text('access_token').notNullable();
    table.text('refresh_token').notNullable();
    table.timestamp('token_expires_at').notNullable();
    
    // Permissions
    table.json('scopes'); // ['activity:read', 'activity:write']
    
    // Sync settings
    table.boolean('auto_sync').defaultTo(true);
    table.timestamp('last_sync');
    table.enum('sync_frequency', ['hourly', 'daily', 'manual']).defaultTo('daily');
    
    table.timestamps(true, true);
    
    // Foreign key
    table.foreign('profile_id').references('athlete_profiles.profile_id').onDelete('CASCADE');
    
    // Index
    table.index('strava_athlete_id', 'idx_strava_athlete_id');
  });
  
  // ===== STRAVA ACTIVITIES TABLE =====
  await knex.schema.createTable('strava_activities', (table) => {
    table.increments('activity_id').primary();
    table.integer('profile_id').unsigned().notNullable();
    table.bigInteger('strava_id').unique().notNullable();
    table.integer('trail_id').unsigned(); // Nullable - matched trail
    
    // Activity basics
    table.string('name', 255).notNullable();
    table.string('type', 100); // 'Ride', 'MountainBikeRide'
    table.string('sport_type', 100);
    table.timestamp('activity_date').notNullable();
    
    // Metrics
    table.decimal('distance_km', 10, 2);
    table.integer('duration_sec');
    table.integer('elevation_gain_m');
    
    // Physiological
    table.integer('avg_hr');
    table.integer('max_hr');
    table.integer('avg_power');
    table.integer('normalized_power');
    table.integer('training_load');
    
    // Route data
    table.text('route_polyline'); // Encoded polyline from Strava
    table.specificType('start_latlng', 'point'); // PostGIS point
    
    // Analysis
    table.boolean('matched_trail').defaultTo(false);
    table.decimal('trail_match_confidence', 5, 2); // 0-100%
    
    // Raw data (for re-processing)
    table.json('raw_data');
    
    table.timestamp('synced_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Foreign keys
    table.foreign('profile_id').references('athlete_profiles.profile_id').onDelete('CASCADE');
    table.foreign('trail_id').references('trails.trail_id').onDelete('SET NULL');
    
    // Indexes
    table.index(['profile_id', 'activity_date'], 'idx_strava_activities_profile_date');
    table.index('trail_id', 'idx_strava_activities_trail');
    table.index('strava_id', 'idx_strava_activities_strava_id');
  });
  
  // ===== TRAIL ATTEMPTS TABLE (derived from Strava activities) =====
  await knex.schema.createTable('trail_attempts', (table) => {
    table.increments('attempt_id').primary();
    table.integer('profile_id').unsigned().notNullable();
    table.integer('trail_id').unsigned().notNullable();
    table.integer('strava_activity_id').unsigned();
    
    table.timestamp('attempt_date').notNullable();
    table.integer('duration_sec').notNullable();
    table.integer('avg_hr');
    table.integer('training_load');
    
    // Performance flags
    table.boolean('is_pr').defaultTo(false); // Personal record
    table.integer('rank_on_trail'); // 1st, 2nd, 3rd attempt
    
    // Conditions during attempt
    table.string('trail_condition', 50);
    table.decimal('temperature', 5, 1);
    table.string('weather', 100);
    
    table.json('notes'); // User notes, feelings
    
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Foreign keys
    table.foreign('profile_id').references('athlete_profiles.profile_id').onDelete('CASCADE');
    table.foreign('trail_id').references('trails.trail_id').onDelete('CASCADE');
    table.foreign('strava_activity_id').references('strava_activities.activity_id').onDelete('SET NULL');
    
    // Indexes
    table.index(['profile_id', 'trail_id'], 'idx_attempts_profile_trail');
    table.index(['trail_id', 'attempt_date'], 'idx_attempts_trail_date');
    table.index('is_pr', 'idx_attempts_pr');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('trail_attempts');
  await knex.schema.dropTableIfExists('strava_activities');
  await knex.schema.dropTableIfExists('strava_connections');
  await knex.schema.dropTableIfExists('trail_recommendations');
  await knex.schema.dropTableIfExists('trails');
}

/**
 * SAMPLE DATA STRUCTURES
 */

// Trail record example
const exampleTrail = {
  trail_id: 1,
  trailforks_id: 123456,
  name: "Blue Diamond Trail",
  region: "Whistler",
  country: "Canada",
  latitude: 50.1163,
  longitude: -122.9574,
  trailhead_address: "Whistler Village, BC",
  
  difficulty: "blue",
  physical_rating: 3,
  technical_rating: 3,
  
  length_km: 8.5,
  elevation_gain_m: 450,
  elevation_loss_m: 450,
  duration_estimate_min: 90,
  
  trail_type: ["singletrack", "xc"],
  features: ["flow", "berms", "small jumps"],
  surface: "dirt",
  
  current_condition: "dry",
  condition_updated: "2026-02-18T10:00:00Z",
  condition_reports: [
    { date: "2026-02-18", status: "dry", reporter: "user123" }
  ],
  
  best_season: ["summer", "fall"],
  
  description: "Classic Whistler XC trail with flowy singletrack...",
  photos: [
    "https://cdn.trailforks.com/photos/trail/123456/1.jpg"
  ],
  popularity_score: 85
};

// Trail recommendation example
const exampleRecommendation = {
  recommendation_id: 1,
  profile_id: 1,
  trail_id: 1,
  date: "2026-02-18",
  
  fitness_match_score: 85, // Good match for fitness level
  skill_match_score: 90,   // Appropriate technical level
  condition_score: 100,     // Perfect conditions (dry)
  weather_score: 95,        // Great weather
  overall_score: 93,        // Highly recommended
  
  match_reasons: [
    "Trail difficulty matches your current fitness level",
    "Technical rating appropriate for your skill",
    "Perfect weather conditions (15°C, sunny)",
    "Trail is dry and in excellent condition"
  ],
  
  warnings: [],
  
  preparation_tips: [
    "Bring 1L water for 90min ride",
    "Trail has some exposure - apply sunscreen",
    "Popular trail - go early to avoid crowds"
  ],
  
  predicted_duration_min: 95,
  predicted_avg_hr: 145,
  predicted_training_load: 85
};

// Strava connection example
const exampleStravaConnection = {
  connection_id: 1,
  profile_id: 1,
  strava_athlete_id: 987654321,
  
  access_token: "encrypted_token_here",
  refresh_token: "encrypted_refresh_token",
  token_expires_at: "2026-02-25T15:30:00Z",
  
  scopes: ["activity:read", "activity:read_all"],
  
  auto_sync: true,
  last_sync: "2026-02-18T14:00:00Z",
  sync_frequency: "daily"
};

// Strava activity example
const exampleStravaActivity = {
  activity_id: 1,
  profile_id: 1,
  strava_id: 11234567890,
  trail_id: 1, // Matched to Blue Diamond Trail
  
  name: "Morning MTB Ride",
  type: "MountainBikeRide",
  sport_type: "MountainBikeRide",
  activity_date: "2026-02-18T08:30:00Z",
  
  distance_km: 8.6,
  duration_sec: 5700, // 95 minutes
  elevation_gain_m: 455,
  
  avg_hr: 148,
  max_hr: 175,
  avg_power: null,
  normalized_power: null,
  training_load: 87,
  
  route_polyline: "encoded_polyline_data_here",
  start_latlng: "POINT(-122.9574 50.1163)",
  
  matched_trail: true,
  trail_match_confidence: 95.5, // High confidence match
  
  raw_data: {
    // Full Strava API response
  },
  
  synced_at: "2026-02-18T14:00:00Z"
};

// Trail attempt example
const exampleTrailAttempt = {
  attempt_id: 1,
  profile_id: 1,
  trail_id: 1,
  strava_activity_id: 1,
  
  attempt_date: "2026-02-18T08:30:00Z",
  duration_sec: 5700,
  avg_hr: 148,
  training_load: 87,
  
  is_pr: true, // First attempt = PR
  rank_on_trail: 1,
  
  trail_condition: "dry",
  temperature: 15.0,
  weather: "sunny",
  
  notes: {
    feeling: "great",
    challenges: "steep final climb",
    highlights: "perfect flow section"
  }
};
