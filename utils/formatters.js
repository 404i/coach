/**
 * Utility functions for data formatting and validation
 */

/**
 * Parse comma-separated values into array
 * @param {string} text - CSV text
 * @returns {Array<string>} Array of trimmed non-empty strings
 */
function parseCsv(text) {
  return (text || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Read number from input element
 * @param {string} elementId - Element ID
 * @param {number} fallback - Fallback value
 * @returns {number} Number value or fallback
 */
function readNumber(elementId, fallback = 0) {
  const element = document.getElementById(elementId);
  if (!element) return fallback;
  const value = Number(element.value);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Read nullable number from input element
 * @param {string} elementId - Element ID
 * @returns {number|null} Number value or null
 */
function readNullableNumber(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return null;
  const raw = element.value;
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Format ISO date string for date input
 * @param {Date} date - Date object
 * @returns {string} YYYY-MM-DD formatted string
 */
function toISODate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format date/time for display
 * @param {string} isoString - ISO date string
 * @returns {string} Formatted date/time
 */
function formatDateTime(isoString) {
  const d = new Date(String(isoString || ""));
  if (Number.isNaN(d.getTime())) return String(isoString || "");
  return d.toLocaleString();
}

/**
 * Safe value accessor with fallback
 * @param {any} value - Value to check
 * @param {any} fallback - Fallback value
 * @returns {any} Value or fallback
 */
function safe(value, fallback) {
  return value === null || value === undefined ? fallback : value;
}

/**
 * Check if value is a finite number
 * @param {any} value - Value to check
 * @returns {boolean} True if finite number
 */
function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Calculate average of numeric array
 * @param {Array} values - Array of values
 * @returns {number|null} Average or null if no valid numbers
 */
function avg(values) {
  const filtered = values.filter(isNumber);
  if (!filtered.length) return null;
  return filtered.reduce((a, b) => a + b, 0) / filtered.length;
}

/**
 * Round number to decimal places
 * @param {number} value - Value to round
 * @param {number} dp - Decimal places (default 1)
 * @returns {number} Rounded value
 */
function round(value, dp = 1) {
  const p = 10 ** dp;
  return Math.round(value * p) / p;
}

/**
 * Clamp value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Capitalize first letter of string
 * @param {string} text - Text to capitalize
 * @returns {string} Capitalized text
 */
function capitalize(text) {
  return String(text || "").charAt(0).toUpperCase() + String(text || "").slice(1);
}

/**
 * Pretty print signal name (replace underscores with spaces)
 * @param {string} signal - Signal name
 * @returns {string} Pretty signal name
 */
function prettySignal(signal) {
  return String(signal || "").replaceAll("_", " ");
}

/**
 * Format points with sign
 * @param {number} points - Points value
 * @returns {string} Formatted points (+N or -N)
 */
function pointsLabel(points) {
  return points > 0 ? `+${points}` : `${points}`;
}

/**
 * Quote string for shell command (single quotes with escaping)
 * @param {string} value - Value to quote
 * @returns {string} Shell-quoted string
 */
function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, `'\\''`)}'`;
}

// Export for browser
if (typeof window !== 'undefined') {
  window.CoachUtils = {
    parseCsv,
    readNumber,
    readNullableNumber,
    toISODate,
    formatDateTime,
    safe,
    isNumber,
    avg,
    round,
    clamp,
    capitalize,
    prettySignal,
    pointsLabel,
    shellQuote
  };
}
