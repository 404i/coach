/**
 * Workout planning and recommendation module
 * Generates workout plans based on recovery state, gaps, and athlete profile
 */

/**
 * Choose workout based on recovery state, gaps, and profile
 * @param {Object} profile - Athlete profile
 * @param {Object} today - Today's daily metrics
 * @param {Object} scoreData - Recovery score data
 * @param {Object} gapData - Gap detection data
 * @returns {Object} Workout recommendation
 */
function chooseWorkout(profile, today, scoreData, gapData) {
  let state = scoreData.score <= -3 ? "recover" : scoreData.score >= 3 ? "build" : "maintain";
  if (scoreData.forceRecover) state = "recover";

  const sports = profile.favorite_sports || ["run"];
  const pain = Number(today.subjective.pain_0_10) || 0;
  const tooMuchIntensity = gapData.gaps.some((g) => g.gap_type === "too_much_high_intensity");
  const lowAerobicMissing = gapData.gaps.some((g) => g.gap_type === "low_aerobic_missing");

  let recommendationType = "easy_aerobic";
  
  if (state === "recover") {
    recommendationType = pain >= 6 || today.subjective.illness_symptoms ? "rest" : "yoga_mobility";
  } else if (state === "maintain") {
    recommendationType = lowAerobicMissing ? "easy_aerobic" : "strength";
  } else {
    recommendationType = scoreData.hiitBlocked || tooMuchIntensity ? "tempo_threshold" : "hiit";
  }

  const chosenSport = pickSport(sports, recommendationType, pain);
  const planA = buildPlanA(recommendationType, chosenSport, profile.access?.minutes_per_session || 45);
  const planB = buildPlanB(recommendationType, chosenSport);

  return { state, recommendationType, chosenSport, planA, planB };
}

/**
 * Pick appropriate sport based on recommendation type and pain level
 * @param {Array} sports - Array of preferred sports
 * @param {string} type - Recommendation type
 * @param {number} pain - Pain score (0-10)
 * @returns {string} Chosen sport
 */
function pickSport(sports, type, pain) {
  const lowImpact = ["swim", "bike", "walk", "yoga"];
  const highImpact = ["run", "hiit"];

  if (type === "yoga_mobility" || type === "strength") {
    return sports.find((s) => ["yoga", "strength"].includes(s)) || "yoga";
  }

  if (pain >= 4) {
    return sports.find((s) => lowImpact.includes(s)) || "walk";
  }

  if (type === "hiit") {
    return sports.find((s) => highImpact.includes(s)) || sports[0] || "bike";
  }

  return sports[0] || "bike";
}

/**
 * Build primary workout plan
 * @param {string} type - Workout type
 * @param {string} sport - Sport/activity
 * @param {number} minutes - Target duration
 * @returns {Object} Workout plan with steps
 */
function buildPlanA(type, sport, minutes) {
  if (type === "rest") {
    return {
      title: "Full recovery day",
      duration_min: 0,
      intensity: "very_easy",
      target_zone: "none",
      steps: [
        "No training today.",
        "10-15 min gentle mobility if it feels good.",
        "Prioritize hydration, food, and sleep tonight."
      ]
    };
  }

  if (type === "yoga_mobility") {
    return {
      title: "Recovery mobility",
      duration_min: 25,
      intensity: "very_easy",
      target_zone: "z1",
      steps: [
        "5 min breathing and easy warm-up.",
        "15 min yoga flow or mobility sequence.",
        "5 min light stretch and down-regulation."
      ]
    };
  }

  if (type === "easy_aerobic") {
    return {
      title: `${capitalize(sport)} easy aerobic`,
      duration_min: clamp(minutes, 30, 75),
      intensity: "easy",
      target_zone: "z1-z2",
      steps: [
        "10 min easy warm-up.",
        "Main set steady Z2 conversational effort.",
        "5-10 min cool-down."
      ]
    };
  }

  if (type === "strength") {
    return {
      title: "Strength + mobility",
      duration_min: 35,
      intensity: "moderate",
      target_zone: "mixed",
      steps: [
        "8 min dynamic warm-up.",
        "20 min strength circuit (lower, upper, core).",
        "7 min mobility and breathing reset."
      ]
    };
  }

  if (type === "tempo_threshold") {
    return {
      title: `${capitalize(sport)} tempo/threshold`,
      duration_min: clamp(minutes, 35, 70),
      intensity: "moderate",
      target_zone: "z3-z4",
      steps: [
        "15 min progressive warm-up to Z2.",
        "3-4 × (5-8 min Z3/Z4 + 2-3 min easy).",
        "10 min cool-down."
      ]
    };
  }

  if (type === "hiit") {
    return {
      title: `${capitalize(sport)} HIIT`,
      duration_min: clamp(minutes, 30, 60),
      intensity: "hard",
      target_zone: "z4-z5",
      steps: [
        "15 min build warm-up to Z3.",
        "6-10 × (60-90 sec Z5 + 90-120 sec recovery).",
        "10 min easy cool-down."
      ]
    };
  }

  return {
    title: "Easy session",
    duration_min: 30,
    intensity: "easy",
    target_zone: "z1-z2",
    steps: ["Warm-up.", "Easy effort.", "Cool-down."]
  };
}

/**
 * Build alternative workout plan
 * @param {string} type - Workout type
 * @param {string} sport - Sport/activity
 * @returns {Object} Alternative workout plan
 */
function buildPlanB(type, sport) {
  if (type === "rest" || type === "yoga_mobility") {
    return {
      title: "Active recovery walk",
      duration_min: 20,
      steps: [
        "20 min easy walk outside.",
        "Focus on deep breathing and relaxation."
      ]
    };
  }

  if (type === "easy_aerobic") {
    return {
      title: "Cross-training easy",
      duration_min: 40,
      steps: [
        "Switch to different low-impact sport.",
        "Keep heart rate in Z1-Z2.",
        "Focus on form and enjoyment."
      ]
    };
  }

  if (type === "strength") {
    return {
      title: "Bodyweight circuit",
      duration_min: 25,
      steps: [
        "4 rounds: 10 squats, 8 push-ups, 30s plank, 10 lunges.",
        "2 min rest between rounds.",
        "Finish with 5 min stretch."
      ]
    };
  }

  if (type === "tempo_threshold") {
    return {
      title: "Fartlek mixed pace",
      duration_min: 45,
      steps: [
        "15 min warm-up easy.",
        "20 min mixed: alternate 2 min Z3 + 2 min Z2.",
        "10 min cool-down."
      ]
    };
  }

  if (type === "hiit") {
    return {
      title: "Hill repeats",
      duration_min: 40,
      steps: [
        "15 min warm-up.",
        "6-8 × (60 sec uphill hard + jog down easy).",
        "10 min cool-down."
      ]
    };
  }

  return {
    title: "Easy alternative",
    duration_min: 30,
    steps: ["Warm-up.", "Easy pace.", "Cool-down."]
  };
}

/**
 * Capitalize first letter of string
 */
function capitalize(text) {
  return String(text || "").charAt(0).toUpperCase() + String(text || "").slice(1);
}

/**
 * Clamp value between min and max
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Export for Node.js (server) and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    chooseWorkout,
    pickSport,
    buildPlanA,
    buildPlanB
  };
}
