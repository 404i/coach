/**
 * Input validation utilities for Coach MCP server
 */

/**
 * Validates profile ID format
 * @param {string} profileId - The profile ID to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateProfileId(profileId) {
  if (!profileId || typeof profileId !== 'string') {
    return { valid: false, error: 'profile_id must be a non-empty string' };
  }
  
  const trimmed = profileId.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'profile_id cannot be empty' };
  }
  
  if (trimmed.length > 100) {
    return { valid: false, error: 'profile_id too long (max 100 characters)' };
  }
  
  // Allow alphanumeric, hyphens, underscores
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { valid: false, error: 'profile_id can only contain letters, numbers, hyphens, and underscores' };
  }
  
  return { valid: true };
}

/**
 * Validates date string in YYYY-MM-DD format
 * @param {string} dateString - The date string to validate
 * @returns {{valid: boolean, error?: string, value?: string}}
 */
function validateISODate(dateString) {
  if (!dateString) {
    return { valid: false, error: 'date is required' };
  }
  
  const str = String(dateString).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return { valid: false, error: 'date must be in YYYY-MM-DD format' };
  }
  
  const date = new Date(str + 'T00:00:00Z');
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'invalid date' };
  }
  
  // Check if date is reasonable (not too far in past or future)
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) {
    return { valid: false, error: 'date year must be between 2000 and 2100' };
  }
  
  return { valid: true, value: str };
}

/**
 * Validates numeric range
 * @param {any} value - The value to validate
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @param {string} fieldName - Name of the field for error messages
 * @returns {{valid: boolean, error?: string, value?: number}}
 */
function validateNumericRange(value, min, max, fieldName) {
  if (value === null || value === undefined || value === '') {
    return { valid: true, value: null };
  }
  
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return { valid: false, error: `${fieldName} must be a valid number` };
  }
  
  if (num < min || num > max) {
    return { valid: false, error: `${fieldName} must be between ${min} and ${max}` };
  }
  
  return { valid: true, value: num };
}

/**
 * Validates email format
 * @param {string} email - The email to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateEmail(email) {
  if (!email) {
    return { valid: false, error: 'email is required' };
  }
  
  const str = String(email).trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(str)) {
    return { valid: false, error: 'invalid email format' };
  }
  
  if (str.length > 254) {
    return { valid: false, error: 'email too long' };
  }
  
  return { valid: true };
}

/**
 * Validates sport name
 * @param {string} sport - The sport name to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateSport(sport) {
  const validSports = ['run', 'bike', 'swim', 'strength', 'yoga', 'hiit', 'walk', 'other'];
  
  if (!sport || typeof sport !== 'string') {
    return { valid: false, error: 'sport must be a string' };
  }
  
  const normalized = sport.trim().toLowerCase();
  if (!validSports.includes(normalized)) {
    return { valid: false, error: `sport must be one of: ${validSports.join(', ')}` };
  }
  
  return { valid: true };
}

/**
 * Validates array of strings
 * @param {any} arr - The array to validate
 * @param {string} fieldName - Name of the field for error messages
 * @param {number} maxItems - Maximum number of items allowed
 * @returns {{valid: boolean, error?: string}}
 */
function validateStringArray(arr, fieldName, maxItems = 100) {
  if (!Array.isArray(arr)) {
    return { valid: false, error: `${fieldName} must be an array` };
  }
  
  if (arr.length > maxItems) {
    return { valid: false, error: `${fieldName} can have at most ${maxItems} items` };
  }
  
  for (let i = 0; i < arr.length; i++) {
    if (typeof arr[i] !== 'string') {
      return { valid: false, error: `${fieldName}[${i}] must be a string` };
    }
  }
  
  return { valid: true };
}

/**
 * Validates pain score (0-10)
 * @param {any} value - The pain score to validate
 * @returns {{valid: boolean, error?: string, value?: number}}
 */
function validatePainScore(value) {
  return validateNumericRange(value, 0, 10, 'pain_score');
}

/**
 * Validates heart rate value
 * @param {any} value - The heart rate to validate
 * @returns {{valid: boolean, error?: string, value?: number}}
 */
function validateHeartRate(value) {
  return validateNumericRange(value, 20, 250, 'heart_rate');
}

/**
 * Validates sleep hours
 * @param {any} value - The sleep hours to validate
 * @returns {{valid: boolean, error?: string, value?: number}}
 */
function validateSleepHours(value) {
  return validateNumericRange(value, 0, 24, 'sleep_hours');
}

/**
 * Validates HRV value (milliseconds)
 * @param {any} value - The HRV to validate
 * @returns {{valid: boolean, error?: string, value?: number}}
 */
function validateHRV(value) {
  return validateNumericRange(value, 1, 300, 'hrv_ms');
}

/**
 * Validates duration in minutes
 * @param {any} value - The duration to validate
 * @returns {{valid: boolean, error?: string, value?: number}}
 */
function validateDurationMinutes(value) {
  return validateNumericRange(value, 0, 1440, 'duration_minutes');
}

/**
 * Validates readiness score (0-100)
 * @param {any} value - The readiness score to validate
 * @returns {{valid: boolean, error?: string, value?: number}}
 */
function validateReadinessScore(value) {
  return validateNumericRange(value, 0, 100, 'readiness_score');
}

/**
 * Sanitizes user input string (prevents injection)
 * @param {string} input - The input to sanitize
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Sanitized string
 */
function sanitizeString(input, maxLength = 1000) {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  // Remove any potential script tags or dangerous characters
  let sanitized = input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
  
  // Trim to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  return sanitized.trim();
}

/**
 * Validates file path (prevents path traversal)
 * @param {string} filePath - The file path to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, error: 'file path is required' };
  }
  
  const str = String(filePath).trim();
  
  // Check for path traversal attempts
  if (str.includes('..') || str.includes('~')) {
    return { valid: false, error: 'invalid file path: path traversal not allowed' };
  }
  
  // Check for null bytes
  if (str.includes('\0')) {
    return { valid: false, error: 'invalid file path: null bytes not allowed' };
  }
  
  return { valid: true };
}

module.exports = {
  validateProfileId,
  validateISODate,
  validateNumericRange,
  validateEmail,
  validateSport,
  validateStringArray,
  validatePainScore,
  validateHeartRate,
  validateSleepHours,
  validateHRV,
  validateDurationMinutes,
  validateReadinessScore,
  sanitizeString,
  validateFilePath
};
