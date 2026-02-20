/**
 * Training gap detection module
 * Analyzes training history to identify gaps in aerobic base, intensity distribution, recovery, etc.
 */

/**
 * Detect training gaps in recent history
 * @param {Array} history - Array of daily metrics
 * @param {string} todayDate - Today's date (YYYY-MM-DD)
 * @returns {Object} Gap findings and zone distribution
 */
function detectGaps(history, todayDate) {
  const lookback14 = history.filter((d) => daysBetween(d.date, todayDate) >= 0 && daysBetween(d.date, todayDate) <= 13);
  const lookback7 = history.filter((d) => daysBetween(d.date, todayDate) >= 0 && daysBetween(d.date, todayDate) <= 6);

  let low = 0;
  let moderate = 0;
  let high = 0;
  let strengthOrMobilityDays = 0;
  const activeDays7 = new Set();

  lookback14.forEach((day) => {
    if (!day.activities || !Array.isArray(day.activities)) return;
    day.activities.forEach((a) => {
      low += (a.hr_zone_minutes?.z1 || 0) + (a.hr_zone_minutes?.z2 || 0);
      moderate += a.hr_zone_minutes?.z3 || 0;
      high += (a.hr_zone_minutes?.z4 || 0) + (a.hr_zone_minutes?.z5 || 0);
    });
  });

  lookback7.forEach((day) => {
    if (!day.activities || !Array.isArray(day.activities)) return;
    let hasDuration = false;
    day.activities.forEach((a) => {
      if ((a.duration_min || 0) > 0) hasDuration = true;
      if (a.sport && ["strength", "yoga"].includes(a.sport)) strengthOrMobilityDays += 1;
    });
    if (hasDuration) activeDays7.add(day.date);
  });

  const total = low + moderate + high;
  const lowPct = total ? (low / total) * 100 : 0;
  const moderatePct = total ? (moderate / total) * 100 : 0;
  const highPct = total ? (high / total) * 100 : 0;

  const gaps = [];

  // Gap 1: Low aerobic base missing
  if (total > 0 && lowPct < 65) {
    gaps.push({
      gap_type: "low_aerobic_missing",
      severity: lowPct < 55 ? "high" : "medium",
      action: "Add 30-60 min easy Z1/Z2 session in next 24h."
    });
  }

  // Gap 2: Too much high intensity
  if (total > 0 && highPct > 12) {
    gaps.push({
      gap_type: "too_much_high_intensity",
      severity: highPct > 18 ? "high" : "medium",
      action: "Replace next hard day with easy aerobic or mobility."
    });
  }

  // Gap 3: No recovery day (7 consecutive active days)
  if (lookback7.length >= 5 && activeDays7.size >= 7) {
    gaps.push({
      gap_type: "no_recovery_day",
      severity: "medium",
      action: "Schedule one full rest or 20 min recovery mobility day."
    });
  }

  // Gap 4: No strength or mobility work
  if (strengthOrMobilityDays === 0) {
    gaps.push({
      gap_type: "no_strength_mobility",
      severity: "low",
      action: "Add 20-30 min yoga or strength session this week."
    });
  }

  return {
    gaps,
    mix: {
      low_aerobic_pct: round(lowPct),
      moderate_pct: round(moderatePct),
      high_pct: round(highPct)
    }
  };
}

/**
 * Calculate days between two dates (UTC)
 * @param {string} oldDate - Earlier date (YYYY-MM-DD)
 * @param {string} newDate - Later date (YYYY-MM-DD)
 * @returns {number} Number of days between dates
 */
function daysBetween(oldDate, newDate) {
  const a = new Date(`${oldDate}T00:00:00Z`);
  const b = new Date(`${newDate}T00:00:00Z`);
  return Math.floor((b - a) / 86400000);
}

/**
 * Round number to decimal places
 */
function round(value, dp = 1) {
  const p = 10 ** dp;
  return Math.round(value * p) / p;
}

// Export for Node.js (server) and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    detectGaps
  };
}
