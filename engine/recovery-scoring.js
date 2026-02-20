/**
 * Recovery scoring engine
 * Analyzes daily metrics and recent history to compute recovery state
 */

/**
 * Compute recovery score from daily metrics and history
 * @param {Object} today - Today's daily metrics
 * @param {Array} history - Array of prior daily metrics (sorted by date)
 * @param {Object} profile - Athlete profile
 * @returns {Object} Score data with reasons, flags, and blockers
 */
function scoreRecovery(today, history, profile) {
  const reasons = [];
  let score = 0;
  const flags = [];
  let completeness = 0;

  const prior = history.filter((d) => d.date < today.date);
  const lookback7 = prior.slice(-7);

  // Sleep score
  const sleepHours = today.recovery_signals.sleep_hours;
  if (sleepHours !== null && sleepHours !== undefined) {
    completeness++;
    if (sleepHours < 4) {
      score -= 3;
      reasons.push(reason("sleep_hours", sleepHours, -3));
      flags.push("very_low_sleep");
    } else if (sleepHours < 5.5) {
      score -= 2;
      reasons.push(reason("sleep_hours", sleepHours, -2));
      flags.push("low_sleep");
    } else if (sleepHours >= 7) {
      score += 1;
      reasons.push(reason("sleep_hours", sleepHours, 1));
    } else {
      reasons.push(reason("sleep_hours", sleepHours, 0));
    }
  }

  // Readiness score
  const readiness = today.readiness?.garmin_training_readiness;
  if (readiness !== null && readiness !== undefined) {
    completeness++;
    if (readiness < 25) {
      score -= 3;
      reasons.push(reason("training_readiness", readiness, -3));
      flags.push("very_low_readiness");
    } else if (readiness >= 80) {
      score += 2;
      reasons.push(reason("training_readiness", readiness, 2));
    } else {
      reasons.push(reason("training_readiness", readiness, 0));
    }
  }

  // HRV vs baseline
  const hrv = today.recovery_signals.hrv_ms;
  const baseline = profile?.baselines?.hrv_ms_7d;
  if (hrv !== null && hrv !== undefined && baseline) {
    completeness++;
    const pct = ((hrv - baseline) / baseline) * 100;
    if (pct < -15) {
      score -= 2;
      reasons.push(reason("hrv_vs_baseline_pct", round(pct, 1), -2));
    } else if (pct < -8) {
      score -= 1;
      reasons.push(reason("hrv_vs_baseline_pct", round(pct, 1), -1));
    } else if (pct > 8) {
      score += 1;
      reasons.push(reason("hrv_vs_baseline_pct", round(pct, 1), 1));
    } else {
      reasons.push(reason("hrv_vs_baseline_pct", round(pct, 1), 0));
    }
  }

  // RHR vs baseline
  const rhr = today.recovery_signals.resting_hr_bpm;
  const rhrBaseline = profile?.baselines?.resting_hr_bpm_14d;
  if (rhr !== null && rhr !== undefined && rhrBaseline) {
    completeness++;
    const diff = rhr - rhrBaseline;
    if (diff >= 7) {
      score -= 2;
      reasons.push(reason("rhr_vs_baseline_bpm", round(diff, 1), -2));
    } else if (diff >= 4) {
      score -= 1;
      reasons.push(reason("rhr_vs_baseline_bpm", round(diff, 1), -1));
    } else if (diff <= -3) {
      score += 1;
      reasons.push(reason("rhr_vs_baseline_bpm", round(diff, 1), 1));
    } else {
      reasons.push(reason("rhr_vs_baseline_bpm", round(diff, 1), 0));
    }
  }

  // Load ratio
  const ratio = today.readiness?.load_ratio;
  if (ratio !== null && ratio !== undefined) {
    completeness++;
    if (ratio < 0.7) {
      score += 1;
      reasons.push(reason("load_ratio", round(ratio, 2), 1));
    } else if (ratio > 1.5) {
      score -= 1;
      reasons.push(reason("load_ratio", round(ratio, 2), -1));
      flags.push("load_ratio_high");
    } else {
      reasons.push(reason("load_ratio", round(ratio, 2), 0));
    }
  }

  // Hard days in last 48h
  const hardDays48h = countHardDays(prior, today.date, 2);
  const ptsHard = hardDays48h === 0 ? 1 : hardDays48h === 1 ? 0 : -2;
  score += ptsHard;
  reasons.push(reason("hard_days_last_48h", hardDays48h, ptsHard));

  // Pain score
  const pain = Number(today.subjective.pain_0_10) || 0;
  const painPts = pain >= 7 ? -4 : pain >= 4 ? -2 : 0;
  score += painPts;
  reasons.push(reason("pain_0_10", pain, painPts));
  if (pain >= 4) flags.push("pain_4_or_more");

  // Illness
  if (today.subjective.illness_symptoms) {
    score -= 4;
    reasons.push(reason("illness_symptoms", true, -4));
    flags.push("illness_symptoms");
  }

  // Force recovery conditions
  const forceRecover =
    today.subjective.illness_symptoms ||
    pain >= 7 ||
    (flags.includes("very_low_sleep") && (readiness ?? 100) < 40);

  // HIIT blocking conditions
  const hrvDrop = getReasonValue(reasons, "hrv_vs_baseline_pct");
  const hiitBlocked =
    pain >= 4 ||
    hardDays48h >= 2 ||
    ((readiness ?? 50) < 50 && isNumber(hrvDrop) && hrvDrop < -10);

  return {
    score,
    reasons: reasons.sort((a, b) => Math.abs(b.points) - Math.abs(a.points)),
    flags,
    forceRecover,
    hiitBlocked,
    hardDays48h,
    completeness
  };
}

/**
 * Count hard training days in lookback window
 * @param {Array} history - Training history
 * @param {string} todayDate - Today's date (YYYY-MM-DD)
 * @param {number} backDays - Number of days to look back
 * @returns {number} Count of hard days
 */
function countHardDays(history, todayDate, backDays) {
  return history.filter((d) => {
    const diff = daysBetween(d.date, todayDate);
    if (diff < 1 || diff > backDays) return false;
    if (!d.activities || !Array.isArray(d.activities)) return false;
    const high = d.activities.reduce((sum, a) => sum + (a.hr_zone_minutes?.z4 || 0) + (a.hr_zone_minutes?.z5 || 0), 0);
    return high >= 10 || d.activities.some((a) => a.sport === "hiit");
  }).length;
}

/**
 * Calculate confidence score based on data completeness
 * @param {Object} today - Today's daily metrics
 * @param {number} completeness - Number of signals present
 * @returns {number} Confidence score (0-1)
 */
function computeConfidence(today, completeness) {
  const signalSlots = 6;
  const pct = completeness / signalSlots;
  let conf = 0.45 + pct * 0.4;
  if (today.source.type === "screenshot") conf += 0.05;
  if (today.subjective.notes) conf += 0.02;
  return clamp(round(conf, 2), 0.35, 0.9);
}

/**
 * Create a reason object for scoring
 * @param {string} signal - Signal name
 * @param {any} value - Signal value
 * @param {number} points - Points contributed
 * @returns {Object} Reason object
 */
function reason(signal, value, points) {
  return {
    signal,
    value,
    points,
    impact: points > 0 ? "positive" : points < 0 ? "negative" : "neutral"
  };
}

/**
 * Get value from reasons array by signal name
 * @param {Array} reasons - Array of reason objects
 * @param {string} signal - Signal name to find
 * @returns {number|null} Value or null if not found
 */
function getReasonValue(reasons, signal) {
  const found = reasons.find((r) => r.signal === signal);
  return found ? Number(found.value) : null;
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
 * Clamp value between min and max
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Round number to decimal places
 */
function round(value, dp = 1) {
  const p = 10 ** dp;
  return Math.round(value * p) / p;
}

/**
 * Check if value is a finite number
 */
function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// Export for Node.js (server) and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    scoreRecovery,
    countHardDays,
    computeConfidence,
    reason,
    getReasonValue,
    daysBetween
  };
}
