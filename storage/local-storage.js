/**
 * Storage abstraction layer for browser localStorage
 * Provides type-safe access to stored data with error handling
 */

const STORAGE_KEYS = {
  profile: "coach_profile_v1",
  daily: "coach_daily_v1",
  chat: "coach_chat_v1",
  lastRecommendation: "coach_last_recommendation_v1",
  lmStudio: "coach_lmstudio_v1",
  garmin: "coach_garmin_v1",
  garminSyncMeta: "coach_garmin_sync_meta_v1"
};

/**
 * Load JSON from localStorage with fallback
 * @param {string} key - Storage key
 * @param {any} fallback - Fallback value if not found or invalid
 * @returns {any} Parsed JSON or fallback
 */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Failed to load ${key} from localStorage:`, error);
    return fallback;
  }
}

/**
 * Save JSON to localStorage
 * @param {string} key - Storage key
 * @param {any} value - Value to store
 * @returns {boolean} Success status
 */
function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Failed to save ${key} to localStorage:`, error);
    return false;
  }
}

/**
 * Load athlete profile
 * @returns {Object|null} Profile object or null
 */
function loadProfile() {
  return loadJSON(STORAGE_KEYS.profile, null);
}

/**
 * Save athlete profile
 * @param {Object} profile - Profile to save
 * @returns {boolean} Success status
 */
function saveProfile(profile) {
  return saveJSON(STORAGE_KEYS.profile, profile);
}

/**
 * Load daily history
 * @returns {Array} Array of daily metrics
 */
function loadDailyHistory() {
  return loadJSON(STORAGE_KEYS.daily, []);
}

/**
 * Save daily history
 * @param {Array} history - History array to save
 * @returns {boolean} Success status
 */
function saveDailyHistory(history) {
  return saveJSON(STORAGE_KEYS.daily, history);
}

/**
 * Upsert a daily record into history
 * @param {Array} history - Existing history array
 * @param {Object} daily - Daily record to upsert
 * @returns {Array} Updated history array
 */
function upsertDaily(history, daily) {
  const next = [...history];
  const idx = next.findIndex((d) => d.date === daily.date);
  if (idx >= 0) next[idx] = daily;
  else next.push(daily);
  next.sort((a, b) => (a.date < b.date ? -1 : 1));
  return next;
}

/**
 * Load chat log
 * @returns {Array} Array of chat messages
 */
function loadChatLog() {
  return loadJSON(STORAGE_KEYS.chat, []);
}

/**
 * Save chat log
 * @param {Array} chatLog - Chat log to save
 * @returns {boolean} Success status
 */
function saveChatLog(chatLog) {
  return saveJSON(STORAGE_KEYS.chat, chatLog);
}

/**
 * Add message to chat log
 * @param {Array} chatLog - Existing chat log
 * @param {string} role - Message role (user/assistant)
 * @param {string} text - Message text
 * @param {number} maxEntries - Maximum entries to keep (default 200)
 * @returns {Array} Updated chat log
 */
function addChatMessage(chatLog, role, text, maxEntries = 200) {
  const next = [...chatLog];
  next.push({ role, text, at: new Date().toISOString() });
  if (next.length > maxEntries) {
    return next.slice(next.length - maxEntries);
  }
  return next;
}

/**
 * Load last recommendation
 * @returns {Object|null} Last recommendation or null
 */
function loadLastRecommendation() {
  return loadJSON(STORAGE_KEYS.lastRecommendation, null);
}

/**
 * Save last recommendation
 * @param {Object} recommendation - Recommendation to save
 * @returns {boolean} Success status
 */
function saveLastRecommendation(recommendation) {
  return saveJSON(STORAGE_KEYS.lastRecommendation, recommendation);
}

/**
 * Load LM Studio configuration
 * @returns {Object} LM Studio config
 */
function loadLMStudioConfig() {
  return {
    base_url: "http://127.0.0.1:1234/v1",
    model: "",
    ...loadJSON(STORAGE_KEYS.lmStudio, {})
  };
}

/**
 * Save LM Studio configuration
 * @param {Object} config - LM Studio config
 * @returns {boolean} Success status
 */
function saveLMStudioConfig(config) {
  return saveJSON(STORAGE_KEYS.lmStudio, config);
}

/**
 * Load Garmin configuration
 * @returns {Object} Garmin config
 */
function loadGarminConfig() {
  return {
    garmin_user: "",
    garmin_password: "",
    garmin_password_file: "",
    garmin_mfa_code: "",
    sync_mode: "latest",
    garmin_start_date: "",
    garmindb_http_timeout: 30,
    ...loadJSON(STORAGE_KEYS.garmin, {})
  };
}

/**
 * Save Garmin configuration (excludes sensitive fields)
 * @param {Object} config - Garmin config
 * @returns {boolean} Success status
 */
function saveGarminConfig(config) {
  // Never persist password or MFA code
  const sanitized = {
    ...config,
    garmin_password: "",
    garmin_mfa_code: ""
  };
  return saveJSON(STORAGE_KEYS.garmin, sanitized);
}

/**
 * Load Garmin sync metadata
 * @returns {Object|null} Sync metadata
 */
function loadGarminSyncMeta() {
  return loadJSON(STORAGE_KEYS.garminSyncMeta, null);
}

/**
 * Save Garmin sync metadata
 * @param {Object} meta - Sync metadata
 * @returns {boolean} Success status
 */
function saveGarminSyncMeta(meta) {
  return saveJSON(STORAGE_KEYS.garminSyncMeta, meta);
}

/**
 * Clear all storage (use with caution!)
 */
function clearAllStorage() {
  Object.values(STORAGE_KEYS).forEach((key) => {
    localStorage.removeItem(key);
  });
}

// Export for browser
if (typeof window !== 'undefined') {
  window.CoachStorage = {
    STORAGE_KEYS,
    loadJSON,
    saveJSON,
    loadProfile,
    saveProfile,
    loadDailyHistory,
    saveDailyHistory,
    upsertDaily,
    loadChatLog,
    saveChatLog,
    addChatMessage,
    loadLastRecommendation,
    saveLastRecommendation,
    loadLMStudioConfig,
    saveLMStudioConfig,
    loadGarminConfig,
    saveGarminConfig,
    loadGarminSyncMeta,
    saveGarminSyncMeta,
    clearAllStorage
  };
}
