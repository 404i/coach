/**
 * Training recommendation constants
 */

// Recovery scoring thresholds
export const RECOVERY_SCORE = {
  // State boundaries
  RECOVER_THRESHOLD: -3,
  BUILD_THRESHOLD: 3,
  
  // Pain thresholds and points
  PAIN_SEVERE_THRESHOLD: 7,
  PAIN_SEVERE_POINTS: -4,
  PAIN_MODERATE_THRESHOLD: 4,
  PAIN_MODERATE_POINTS: -2,
  PAIN_FORCE_RECOVER_THRESHOLD: 7,
  
  // Illness
  ILLNESS_POINTS: -4,
  
  // Sleep thresholds
  SLEEP_CRITICALLY_LOW_HOURS: 4,
  SLEEP_CRITICALLY_LOW_POINTS: -3,
  SLEEP_LOW_HOURS: 5.5,
  SLEEP_LOW_POINTS: -2,
  SLEEP_GOOD_HOURS: 7,
  SLEEP_GOOD_POINTS: 1,
  
  // Readiness thresholds
  READINESS_LOW_THRESHOLD: 40,
  READINESS_VERY_LOW_THRESHOLD: 25,
  READINESS_VERY_LOW_POINTS: -3,
  READINESS_HIGH_THRESHOLD: 80,
  READINESS_HIGH_POINTS: 2,
  
  // HRV vs baseline percentage points
  HRV_HIGH_DROP_PCT: -15,
  HRV_HIGH_DROP_POINTS: -2,
  HRV_MODERATE_DROP_PCT: -8,
  HRV_MODERATE_DROP_POINTS: -1,
  HRV_INCREASE_PCT: 8,
  HRV_INCREASE_POINTS: 1,
  
  // RHR vs baseline
  RHR_HIGH_INCREASE_BPM: 7,
  RHR_HIGH_INCREASE_POINTS: -2,
  RHR_MODERATE_INCREASE_BPM: 4,
  RHR_MODERATE_INCREASE_POINTS: -1,
  RHR_DECREASE_BPM: -3,
  RHR_DECREASE_POINTS: 1,
  
  // Load ratio (acute/chronic)
  LOAD_RATIO_HIGH_THRESHOLD: 1.5,
  LOAD_RATIO_HIGH_POINTS: -1,
  LOAD_RATIO_LOW_THRESHOLD: 0.7,
  LOAD_RATIO_LOW_POINTS: 1,
  
  // Hard days lookback
  HARD_DAYS_NONE_POINTS: 1,
  HARD_DAYS_ONE_POINTS: 0,
  HARD_DAYS_MULTIPLE_POINTS: -2,
  HARD_DAYS_LOOKBACK: 2,
  HARD_DAYS_MAX_FOR_HIIT: 2,
  
  // Completeness
  SIGNAL_SLOTS: 6,
  BASE_CONFIDENCE: 0.45,
  SCREENSHOT_CONFIDENCE_BONUS: 0.05,
  NOTES_CONFIDENCE_BONUS: 0.02,
  MIN_CONFIDENCE: 0.35,
  MAX_CONFIDENCE: 0.9
};

// Gap detection thresholds
export const GAP_DETECTION = {
  LOOKBACK_DAYS_14: 14,
  LOOKBACK_DAYS_7: 7,
  
  // Aerobic zone distribution
  LOW_AEROBIC_TARGET_PCT: 65,
  LOW_AEROBIC_CRITICAL_PCT: 55,
  
  // High intensity limits
  HIGH_INTENSITY_LIMIT_PCT: 12,
  HIGH_INTENSITY_CRITICAL_PCT: 18,
  
  // Recovery requirements
  MIN_ACTIVE_DAYS_FOR_REST_WARNING: 5,
  CONSECUTIVE_DAYS_FOR_REST_WARNING: 7,
  
  // HIIT blocking conditions
  HIIT_BLOCK_PAIN_THRESHOLD: 4,
  HIIT_BLOCK_HRV_DROP_PCT: -10,
  HIIT_BLOCK_READINESS_THRESHOLD: 50
};

// Training plan defaults
export const TRAINING = {
  // Duration ranges (minutes)
  MIN_SESSION_DURATION: 10,
  MAX_SESSION_DURATION: 240,
  
  DEFAULT_DAYS_PER_WEEK: 5,
  DEFAULT_MINUTES_PER_SESSION: 45,
  DEFAULT_MAX_HARD_DAYS: 2,
  
  // Workout durations by type
  REST_DURATION: 0,
  MOBILITY_DURATION: 25,
  STRENGTH_DURATION: 35,
  EASY_MIN_DURATION: 30,
  EASY_MAX_DURATION: 75,
  TEMPO_MIN_DURATION: 35,
  TEMPO_MAX_DURATION: 70,
  HIIT_MIN_DURATION: 30,
  HIIT_MAX_DURATION: 60,
  
  // Intensity thresholds
  HIGH_INTENSITY_MIN_MINUTES: 10,
  
  // Baseline ranges
  MIN_RESTING_HR: 30,
  MAX_RESTING_HR: 110,
  MIN_HRV: 5,
  MAX_HRV: 200,
  MIN_LTHR: 100,
  MAX_LTHR: 220,
  MIN_FTP: 80,
  MAX_FTP: 600
};

// API and network settings
export const NETWORK = {
  DEFAULT_LM_STUDIO_BASE_URL: 'http://127.0.0.1:1234/v1',
  DEFAULT_LM_STUDIO_TIMEOUT_MS: 12000,
  DEFAULT_OPEN_METEO_BASE_URL: 'https://api.open-meteo.com/v1/forecast',
  DEFAULT_WEB_HOST: '127.0.0.1',
  DEFAULT_WEB_PORT: 8080,
  MAX_REQUEST_BODY_BYTES: 64 * 1024
};

// Storage keys
export const STORAGE_KEYS = {
  PROFILE: 'coach_profile_v1',
  DAILY: 'coach_daily_v1',
  CHAT: 'coach_chat_v1',
  LAST_RECOMMENDATION: 'coach_last_recommendation_v1',
  LM_STUDIO: 'coach_lmstudio_v1',
  GARMIN: 'coach_garmin_v1',
  GARMIN_SYNC_META: 'coach_garmin_sync_meta_v1'
};

// Sports classifications
export const SPORTS = {
  LOW_IMPACT: ['swim', 'bike', 'walk', 'yoga'],
  HIGH_IMPACT: ['run', 'hiit'],
  STRENGTH_MOBILITY: ['strength', 'yoga'],
  VALID: ['run', 'bike', 'swim', 'strength', 'yoga', 'hiit', 'walk', 'other']
};

// Time constants
export const TIME = {
  MS_PER_DAY: 86400000,
  CHAT_LOG_MAX_ENTRIES: 200
};
