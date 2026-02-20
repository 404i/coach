// SECURITY WARNING: This UI is for LOCAL DEVELOPMENT ONLY
// - Passwords transmitted over HTTP (use HTTPS in production)
// - No authentication on API endpoints
// - localStorage for data (use proper database in production)
// See SECURITY.md for full security guidelines

// Version stamp - updated: 2026-02-17T09:32:00
const APP_VERSION = '2.0.0-fixed';
console.log(`%c🚀 Coach App ${APP_VERSION} Loading...`, 'color: #1b8f42; font-weight: bold; font-size: 14px;');

// Check if modules are loaded
if (!window.CoachStorage) {
  console.error('❌ CoachStorage module not loaded! Check if storage/local-storage.js is loaded before app.js');
}
if (!window.CoachUtils) {
  console.error('❌ CoachUtils module not loaded! Check if utils/formatters.js is loaded before app.js');
}
if (typeof scoreRecovery === 'undefined') {
  console.error('❌ Recovery scoring module not loaded! Check if engine/recovery-scoring.js is loaded before app.js');
}

// Import from modules (loaded via script tags in index.html)
const {
  loadProfile, saveProfile,
  loadDailyHistory, saveDailyHistory, upsertDaily,
  loadChatLog, saveChatLog, addChatMessage,
  loadLastRecommendation, saveLastRecommendation,
  loadLMStudioConfig, saveLMStudioConfig,
  loadGarminConfig, saveGarminConfig,
  loadGarminSyncMeta, saveGarminSyncMeta
} = window.CoachStorage || {};

const {
  parseCsv, readNumber, readNullableNumber,
  toISODate, formatDateTime, safe,
  isNumber, round, clamp, capitalize,
  prettySignal, pointsLabel, shellQuote
} = window.CoachUtils || {};

// DOM elements - will be initialized after DOM ready
let profileForm, checkinForm, chatForm, chatBox, chatInput, profileStatus;
let activitiesWrap, activityTemplate, addActivityBtn, previewWrap, screenshotInput;
let lmStudioForm, lmStudioBaseUrlInput, lmStudioModelInput, lmStudioStatus;
let garminForm, garminStatus, garminLastSync, garminCommandBox, garminSyncOutputBox;
let garminCopyBtn, garminSyncLatestBtn;
let garminUserInput, garminPasswordInput, garminPasswordFileInput;
let garminMfaCodeInput, garminSyncModeInput, garminStartDateInput, garminHttpTimeoutInput;

// Load initial data from storage (this is safe before DOM ready)
let profile = loadProfile();
let dailyHistory = loadDailyHistory();
let chatLog = loadChatLog();
let lastRecommendation = loadLastRecommendation();
let lmStudioConfig = loadLMStudioConfig();
let garminConfig = loadGarminConfig();
let garminSyncMeta = loadGarminSyncMeta();

// Wait for DOM to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  console.log('🚀 Initializing Coach app...');
  
  // Check if essential functions exist
  if (typeof toISODate === 'undefined') {
    console.error('❌ FATAL: toISODate function not found. Modules not loaded properly.');
    alert('Error: Required modules failed to load. Please refresh the page.');
    return;
  }
  
  // Initialize DOM element references
  profileForm = document.getElementById("profile-form");
  checkinForm = document.getElementById("checkin-form");
  chatForm = document.getElementById("chat-form");
  chatBox = document.getElementById("chat");
  chatInput = document.getElementById("chat-input");
  profileStatus = document.getElementById("profile-status");
  activitiesWrap = document.getElementById("activities");
  activityTemplate = document.getElementById("activity-template");
  addActivityBtn = document.getElementById("add-activity");
  previewWrap = document.getElementById("preview");
  screenshotInput = document.getElementById("screenshots");
  lmStudioForm = document.getElementById("lmstudio-form");
  lmStudioBaseUrlInput = document.getElementById("lmstudio-base-url");
  lmStudioModelInput = document.getElementById("lmstudio-model");
  lmStudioStatus = document.getElementById("lmstudio-status");
  garminForm = document.getElementById("garmin-form");
  garminStatus = document.getElementById("garmin-status");
  garminLastSync = document.getElementById("garmin-last-sync");
  garminCommandBox = document.getElementById("garmin-command");
  garminSyncOutputBox = document.getElementById("garmin-sync-output");
  garminCopyBtn = document.getElementById("garmin-copy-command");
  garminSyncLatestBtn = document.getElementById("garmin-sync-latest");
  garminUserInput = document.getElementById("garmin-user");
  garminPasswordInput = document.getElementById("garmin-password");
  garminPasswordFileInput = document.getElementById("garmin-password-file");
  garminMfaCodeInput = document.getElementById("garmin-mfa-code");
  garminSyncModeInput = document.getElementById("garmin-sync-mode");
  garminStartDateInput = document.getElementById("garmin-start-date");
  garminHttpTimeoutInput = document.getElementById("garmin-http-timeout");
  
  // Check for critical DOM elements
  const criticalElements = {
    profileForm, checkinForm, chatForm, addActivityBtn,
    lmStudioForm, garminForm, garminCopyBtn, garminSyncLatestBtn
  };
  
  const missingElements = Object.entries(criticalElements)
    .filter(([name, elem]) => !elem)
    .map(([name]) => name);
  
  if (missingElements.length > 0) {
    console.error('❌ FATAL: Missing DOM elements:', missingElements);
    alert('Error: Page structure invalid. Missing elements: ' + missingElements.join(', '));
    return;
  }
  
  console.log('✅ DOM elements initialized');
  
  document.getElementById("date").value = toISODate(new Date());
  fillLMStudioForm(lmStudioConfig);
  fillGarminForm(garminConfig);
  lmStudioStatus.textContent = hasLMStudioConfig() ? "LM Studio configured." : "Set model name to enable AI responses.";
  lmStudioStatus.style.color = hasLMStudioConfig() ? "#1b8f42" : "#667284";
  garminCommandBox.textContent = buildGarminSyncCommand(garminConfig);
  garminSyncOutputBox.textContent = "Sync output will appear here.";
  renderGarminSyncMeta(garminSyncMeta);

  if (profile) fillProfileForm(profile);
  addActivityCard();

  if (!chatLog.length) {
    addMessage(
      "assistant",
      "Hi - save your profile, sync Garmin with the generated command, then use manual check-in only when you need overrides."
    );
  } else {
    renderChat();
  }

  // Attach event listeners with error handling
  try {
    profileForm.addEventListener("submit", onSaveProfile);
    addActivityBtn.addEventListener("click", () => addActivityCard());
    activitiesWrap.addEventListener("click", onActivityAction);
    screenshotInput.addEventListener("change", previewFiles);
    checkinForm.addEventListener("submit", onGenerateRecommendation);
    chatForm.addEventListener("submit", onChatSubmit);
    lmStudioForm.addEventListener("submit", onSaveLMStudioConfig);
    garminForm.addEventListener("submit", onSaveGarminConfig);
    garminCopyBtn.addEventListener("click", onCopyGarminCommand);
    garminSyncLatestBtn.addEventListener("click", onSyncGarminLatest);
    
    console.log('✅ Event listeners attached');
  } catch (error) {
    console.error('❌ Error attaching event listeners:', error);
    alert('Error: Failed to set up event listeners. Some buttons may not work.');
    return;
  }
  
  // Final success message
  console.log(`%c✨ Coach App ${APP_VERSION} Ready!`, 'color: #1b8f42; font-weight: bold; font-size: 16px;');
  console.log('All functions working. You can now:');
  console.log('  • Save profile');
  console.log('  • Add activities');
  console.log('  • Generate recommendations');
  console.log('  • Sync with Garmin');
}

function onSaveProfile(event) {
  event.preventDefault();

  const sports = [...document.querySelectorAll("input[name='sports']:checked")].map((el) => el.value);
  if (!sports.length) {
    profileStatus.textContent = "Select at least one sport.";
    profileStatus.style.color = "#b42318";
    return;
  }

  profile = {
    profile_id: "athlete-1",
    created_at: profile?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    goals: parseCsv(document.getElementById("goals").value),
    favorite_sports: sports,
    access: {
      equipment: parseCsv(document.getElementById("equipment").value),
      facilities: parseCsv(document.getElementById("equipment").value),
      days_per_week: readNumber("days-week", 5),
      minutes_per_session: readNumber("minutes-session", 45)
    },
    injuries_conditions: [
      {
        name: document.getElementById("injuries").value.trim() || "none",
        status: "managed",
        severity_0_10: 0,
        contraindications: []
      }
    ],
    baselines: {
      resting_hr_bpm_14d: readNullableNumber("baseline-rhr"),
      hrv_ms_7d: readNullableNumber("baseline-hrv"),
      lthr_bpm: readNullableNumber("lthr"),
      ftp_watts: readNullableNumber("ftp")
    },
    preferences: {
      max_hard_days_per_week: readNumber("hard-days", 2),
      preferred_training_time: "either",
      likes_variety: true
    }
  };

  saveProfile(profile);
  profileStatus.textContent = "Profile saved.";
  profileStatus.style.color = "#1b8f42";
}

function fillProfileForm(saved) {
  document.getElementById("goals").value = (saved.goals || []).join(", ");
  document.getElementById("equipment").value = (saved.access?.equipment || []).join(", ");
  document.getElementById("injuries").value = saved.injuries_conditions?.[0]?.name || "";
  document.getElementById("baseline-rhr").value = saved.baselines?.resting_hr_bpm_14d || "";
  document.getElementById("baseline-hrv").value = saved.baselines?.hrv_ms_7d || "";
  document.getElementById("lthr").value = saved.baselines?.lthr_bpm || "";
  document.getElementById("ftp").value = saved.baselines?.ftp_watts || "";
  document.getElementById("days-week").value = saved.access?.days_per_week || 5;
  document.getElementById("minutes-session").value = saved.access?.minutes_per_session || 45;
  document.getElementById("hard-days").value = saved.preferences?.max_hard_days_per_week || 2;

  const set = new Set(saved.favorite_sports || []);
  document.querySelectorAll("input[name='sports']").forEach((el) => {
    el.checked = set.has(el.value);
  });
}

function defaultLMStudioConfig() {
  return { base_url: "http://127.0.0.1:1234/v1", model: "" };
}

function fillLMStudioForm(saved) {
  lmStudioBaseUrlInput.value = saved.base_url || defaultLMStudioConfig().base_url;
  lmStudioModelInput.value = saved.model || "";
}

function onSaveLMStudioConfig(event) {
  event.preventDefault();
  const baseUrl = lmStudioBaseUrlInput.value.trim() || defaultLMStudioConfig().base_url;
  const model = lmStudioModelInput.value.trim();

  lmStudioConfig = {
    base_url: baseUrl,
    model
  };

  saveLMStudioConfig(lmStudioConfig);
  lmStudioStatus.textContent = model ? "LM Studio config saved." : "Saved. Add a model to enable AI responses.";
  lmStudioStatus.style.color = model ? "#1b8f42" : "#c47a00";
}

function fillGarminForm(saved) {
  garminUserInput.value = saved.garmin_user || "";
  garminPasswordInput.value = saved.garmin_password || "";
  garminPasswordFileInput.value = saved.garmin_password_file || "";
  garminMfaCodeInput.value = saved.garmin_mfa_code || "";
  garminSyncModeInput.value = saved.sync_mode || "latest";
  garminStartDateInput.value = saved.garmin_start_date || "";
  garminHttpTimeoutInput.value = Number(saved.garmindb_http_timeout || 30);
}

function onSaveGarminConfig(event) {
  event.preventDefault();

  const runtimeConfig = currentGarminConfigFromForm();
  garminConfig = runtimeConfig;

  const persistedConfig = {
    ...runtimeConfig,
    garmin_password: "",
    garmin_mfa_code: ""
  };
  saveGarminConfig(persistedConfig);
  garminCommandBox.textContent = buildGarminSyncCommand(garminConfig);
  garminStatus.textContent = "Garmin sync command generated. Password/MFA are not persisted.";
  garminStatus.style.color = "#1b8f42";
}

function currentGarminConfigFromForm() {
  return {
    garmin_user: garminUserInput.value.trim(),
    garmin_password: garminPasswordInput.value,
    garmin_password_file: garminPasswordFileInput.value.trim(),
    garmin_mfa_code: garminMfaCodeInput.value.trim(),
    sync_mode: garminSyncModeInput.value === "all" ? "all" : "latest",
    garmin_start_date: garminStartDateInput.value.trim(),
    garmindb_http_timeout: Number(garminHttpTimeoutInput.value || 30)
  };
}

function renderGarminSyncMeta(meta) {
  if (!garminLastSync) return;
  if (!meta || !meta.completed_at) {
    garminLastSync.textContent = "Last synced: not yet.";
    return;
  }

  const syncedAt = formatDateTime(meta.completed_at);
  const latestDataAt = meta.latest_data_timestamp ? formatDateTime(meta.latest_data_timestamp) : null;
  garminLastSync.textContent = latestDataAt
    ? `Last synced: ${syncedAt}. Latest Garmin data timestamp: ${latestDataAt}.`
    : `Last synced: ${syncedAt}.`;
}

// formatDateTime is imported from CoachUtils, no need to redefine

async function onSyncGarminLatest() {
  const runtimeConfig = currentGarminConfigFromForm();
  garminConfig = runtimeConfig;
  setGarminBusy(true);
  garminStatus.textContent = "Running Garmin latest sync...";
  garminStatus.style.color = "#ac6b12";
  garminSyncOutputBox.textContent = "Sync in progress. Keep this tab open.";

  try {
    const response = await fetch("/api/garmin/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sync_mode: "latest",
        garmin_user: runtimeConfig.garmin_user || undefined,
        garmin_password: runtimeConfig.garmin_password || undefined,
        garmin_password_file: runtimeConfig.garmin_password_file || undefined,
        garmin_mfa_code: runtimeConfig.garmin_mfa_code || undefined,
        garmin_start_date: runtimeConfig.garmin_start_date || undefined,
        garmindb_http_timeout: runtimeConfig.garmindb_http_timeout || undefined
      })
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      const error = new Error(payload.error || `Sync failed (${response.status})`);
      error.result = payload.result || null;
      throw error;
    }

    const result = payload.result || {};
    const lines = [
      `Mode: ${result.mode || "latest"}`,
      `Started: ${safe(result.started_at, "n/a")}`,
      `Completed: ${safe(result.completed_at, "n/a")}`,
      `Duration: ${safe(result.duration_sec, "n/a")}s`,
      `Latest Garmin data timestamp: ${safe(result.latest_data_timestamp, "n/a")}`,
      "",
      "STDOUT tail:",
      result.stdout_tail || "(empty)",
      "",
      "STDERR tail:",
      result.stderr_tail || "(empty)"
    ];
    garminSyncOutputBox.textContent = lines.join("\n");
    garminStatus.textContent = "Garmin latest sync completed.";
    garminStatus.style.color = "#1b8f42";
    garminSyncMeta = {
      completed_at: result.completed_at || new Date().toISOString(),
      latest_data_timestamp: result.latest_data_timestamp || null
    };
    saveGarminSyncMeta(garminSyncMeta);
    renderGarminSyncMeta(garminSyncMeta);
  } catch (error) {
    const failed = error && error.result ? error.result : null;
    if (failed) {
      garminSyncOutputBox.textContent = [
        `Sync error: ${error.message || "Failed"}`,
        "",
        "STDOUT tail:",
        failed.stdout_tail || "(empty)",
        "",
        "STDERR tail:",
        failed.stderr_tail || "(empty)"
      ].join("\n");
    } else {
      garminSyncOutputBox.textContent = `Sync error:\n${error.message || String(error)}`;
    }
    garminStatus.textContent =
      "Sync failed. Start with `node scripts/coach_web_server.js` and check Garmin credentials/MFA.";
    garminStatus.style.color = "#b0352a";
  } finally {
    setGarminBusy(false);
    const persistedConfig = {
      ...runtimeConfig,
      garmin_password: "",
      garmin_mfa_code: ""
    };
    saveGarminConfig(persistedConfig);
  }
}

function setGarminBusy(isBusy) {
  garminSyncLatestBtn.disabled = Boolean(isBusy);
  garminSyncLatestBtn.textContent = isBusy ? "Syncing..." : "Sync latest now";
}

async function onCopyGarminCommand() {
  const text = garminCommandBox.textContent || "";
  if (!text.trim()) {
    garminStatus.textContent = "No command to copy yet.";
    garminStatus.style.color = "#ac6b12";
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    garminStatus.textContent = "Sync command copied.";
    garminStatus.style.color = "#1b8f42";
  } catch (_error) {
    garminStatus.textContent = "Could not copy command. Copy manually from the box.";
    garminStatus.style.color = "#ac6b12";
  }
}

function buildGarminSyncCommand(config) {
  const lines = [];
  if (config.garmin_user) lines.push(`GARMIN_USER=${shellQuote(config.garmin_user)} \\`);
  if (config.garmin_password_file) {
    lines.push(`GARMIN_PASSWORD_FILE=${shellQuote(config.garmin_password_file)} \\`);
  } else if (config.garmin_password) {
    lines.push(`GARMIN_PASSWORD=${shellQuote(config.garmin_password)} \\`);
  }
  if (config.garmin_mfa_code) lines.push(`GARMIN_MFA_CODE=${shellQuote(config.garmin_mfa_code)} \\`);
  if (config.garmin_start_date) lines.push(`GARMIN_START_DATE=${shellQuote(config.garmin_start_date)} \\`);
  if (isNumber(config.garmindb_http_timeout) && config.garmindb_http_timeout > 0) {
    lines.push(`GARMINDB_HTTP_TIMEOUT=${Math.round(config.garmindb_http_timeout)} \\`);
  }

  const script = config.sync_mode === "all" ? "./scripts/garmindb_sync_all.sh" : "./scripts/garmindb_sync_latest.sh";
  lines.push(script);
  return lines.join("\n");
}

function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, `'\\''`)}'`;
}

function addActivityCard(data = null) {
  const clone = activityTemplate.content.firstElementChild.cloneNode(true);
  if (data) {
    clone.querySelector(".sport").value = data.sport || "run";
    clone.querySelector(".duration").value = data.duration_min || 30;
    clone.querySelector(".exercise-load").value = data.exercise_load || 50;
    clone.querySelector(".z1").value = data.hr_zone_minutes?.z1 || 0;
    clone.querySelector(".z2").value = data.hr_zone_minutes?.z2 || 0;
    clone.querySelector(".z3").value = data.hr_zone_minutes?.z3 || 0;
    clone.querySelector(".z4").value = data.hr_zone_minutes?.z4 || 0;
    clone.querySelector(".z5").value = data.hr_zone_minutes?.z5 || 0;
  }
  activitiesWrap.appendChild(clone);
}

function onActivityAction(event) {
  if (!event.target.classList.contains("remove-activity")) return;
  const all = activitiesWrap.querySelectorAll(".activity");
  if (all.length === 1) return;
  event.target.closest(".activity")?.remove();
}

function previewFiles() {
  previewWrap.innerHTML = "";
  [...screenshotInput.files].forEach((file) => {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.alt = file.name;
    previewWrap.appendChild(img);
  });
}

async function onGenerateRecommendation(event) {
  event.preventDefault();

  if (!profile) {
    addMessage("assistant", "Please save athlete profile first.");
    return;
  }

  const daily = buildDailyMetrics();
  dailyHistory = upsertDaily(dailyHistory, daily);
  saveDailyHistory(dailyHistory);

  const recommendation = generateRecommendation(profile, dailyHistory, daily);
  lastRecommendation = recommendation;

  addMessage(
    "user",
    `Check-in for ${daily.date}: readiness ${safe(daily.readiness.garmin_training_readiness, "n/a")}, pain ${daily.subjective.pain_0_10}/10.`
  );

  let answer = formatRecommendationMessage(recommendation);
  const llm = await generateRecommendationWithLMStudio(recommendation, daily);
  if (llm.ok) {
    answer = llm.text;
    recommendation.response_provider = "lm_studio";
    recommendation.llm_model = lmStudioConfig.model;
  } else {
    recommendation.response_provider = "rules";
    if (llm.reason === "unavailable" && hasLMStudioConfig()) {
      answer += "\n\nLM Studio unavailable, so I used local rule-based coaching.";
    }
  }

  lastRecommendation = recommendation;
  saveLastRecommendation(recommendation);
  addMessage("assistant", answer);
}

function buildDailyMetrics() {
  const artifacts = [...screenshotInput.files].map((f) => f.name);
  return {
    profile_id: profile.profile_id,
    date: document.getElementById("date").value,
    source: {
      type: artifacts.length ? "screenshot" : "manual",
      artifacts,
      extraction_confidence_0_1: artifacts.length ? 0.45 : 0.9
    },
    readiness: {
      garmin_training_readiness: readNullableNumber("readiness"),
      training_status_label: document.getElementById("status-label").value.trim(),
      acute_load: null,
      chronic_load: null,
      load_ratio: readNullableNumber("load-ratio")
    },
    recovery_signals: {
      resting_hr_bpm: readNullableNumber("rhr"),
      hrv_ms: readNullableNumber("hrv"),
      sleep_hours: readNullableNumber("sleep"),
      stress_score: readNullableNumber("stress")
    },
    subjective: {
      pain_0_10: readNumber("pain", 0),
      fatigue_0_10: readNumber("fatigue", 3),
      soreness_0_10: readNumber("soreness", 3),
      illness_symptoms: document.getElementById("illness").value === "true",
      notes: document.getElementById("notes").value.trim()
    },
    activities: collectActivities()
  };
}

function collectActivities() {
  return [...activitiesWrap.querySelectorAll(".activity")].map((node) => ({
    sport: node.querySelector(".sport").value,
    duration_min: Number(node.querySelector(".duration").value || 0),
    exercise_load: Number(node.querySelector(".exercise-load").value || 0),
    hr_zone_minutes: {
      z1: Number(node.querySelector(".z1").value || 0),
      z2: Number(node.querySelector(".z2").value || 0),
      z3: Number(node.querySelector(".z3").value || 0),
      z4: Number(node.querySelector(".z4").value || 0),
      z5: Number(node.querySelector(".z5").value || 0)
    }
  }));
}

function generateRecommendation(currentProfile, history, today) {
  const scoreData = scoreRecovery(currentProfile, history, today);
  const gapData = detectGaps(history, today.date);
  const workoutData = chooseWorkout(currentProfile, today, scoreData, gapData);

  const confidence = computeConfidence(today, scoreData.completeness);

  return {
    profile_id: currentProfile.profile_id,
    date: today.date,
    state: workoutData.state,
    recommendation_type: workoutData.recommendationType,
    recovery_score: scoreData.score,
    confidence_0_1: confidence,
    why: scoreData.reasons.slice(0, 5),
    safety_flags: scoreData.flags,
    gap_findings: gapData.gaps,
    plan_a: workoutData.planA,
    plan_b: workoutData.planB,
    ask_next: [
      "Upload tomorrow's readiness + HRV + resting HR screenshot.",
      "Tell me pain/fatigue/soreness before next session.",
      "Share any schedule changes so the plan can adapt."
    ],
    debug: {
      hard_days_last_48h: scoreData.hardDays48h,
      intensity_mix_14d: gapData.mix
    }
  };
}

function scoreRecovery(currentProfile, history, today) {
  const prior = history.filter((d) => d.date !== today.date);
  const baselineHRV = currentProfile.baselines?.hrv_ms_7d ?? avg(prior.map((d) => d.recovery_signals?.hrv_ms));
  const baselineRHR = currentProfile.baselines?.resting_hr_bpm_14d ?? avg(prior.map((d) => d.recovery_signals?.resting_hr_bpm));

  let score = 0;
  const reasons = [];
  const flags = [];
  let completeness = 0;

  const readiness = today.readiness.garmin_training_readiness;
  if (isNumber(readiness)) {
    completeness += 1;
    const pts = readiness >= 75 ? 2 : readiness >= 55 ? 1 : readiness >= 40 ? 0 : -2;
    score += pts;
    reasons.push(reason("readiness", readiness, pts));
  }

  const hrv = today.recovery_signals.hrv_ms;
  if (isNumber(hrv) && isNumber(baselineHRV) && baselineHRV > 0) {
    completeness += 1;
    const deltaPct = ((hrv - baselineHRV) / baselineHRV) * 100;
    const pts = deltaPct >= 5 ? 1 : deltaPct >= -5 ? 0 : deltaPct >= -12 ? -1 : -2;
    score += pts;
    reasons.push(reason("hrv_vs_baseline_pct", round(deltaPct), pts));
    if (deltaPct < -10) flags.push("hrv_drop_gt_10pct");
  }

  const rhr = today.recovery_signals.resting_hr_bpm;
  if (isNumber(rhr) && isNumber(baselineRHR)) {
    completeness += 1;
    const drift = rhr - baselineRHR;
    const pts = drift <= 2 ? 1 : drift <= 5 ? 0 : drift <= 8 ? -1 : -2;
    score += pts;
    reasons.push(reason("resting_hr_drift_bpm", round(drift), pts));
    if (drift > 8) flags.push("resting_hr_elevated_gt_8");
  }

  const sleep = today.recovery_signals.sleep_hours;
  if (isNumber(sleep)) {
    completeness += 1;
    const pts = sleep >= 7 ? 1 : sleep >= 6 ? 0 : -1;
    score += pts;
    reasons.push(reason("sleep_hours", sleep, pts));
    if (sleep < 5.5) flags.push("very_low_sleep");
  }

  const stress = today.recovery_signals.stress_score;
  if (isNumber(stress)) {
    completeness += 1;
    const pts = stress < 30 ? 1 : stress <= 60 ? 0 : -1;
    score += pts;
    reasons.push(reason("stress", stress, pts));
  }

  const ratio = today.readiness.load_ratio;
  if (isNumber(ratio)) {
    completeness += 1;
    const pts = ratio >= 0.8 && ratio <= 1.3 ? 1 : ratio > 1.5 ? -2 : ratio < 0.7 ? -1 : 0;
    score += pts;
    reasons.push(reason("acute_chronic_load_ratio", ratio, pts));
    if (ratio > 1.5) flags.push("load_ratio_high");
  }

  const hardDays48h = countHardDays(prior, today.date, 2);
  const ptsHard = hardDays48h === 0 ? 1 : hardDays48h === 1 ? 0 : -2;
  score += ptsHard;
  reasons.push(reason("hard_days_last_48h", hardDays48h, ptsHard));

  const pain = Number(today.subjective.pain_0_10) || 0;
  const painPts = pain >= 7 ? -4 : pain >= 4 ? -2 : 0;
  score += painPts;
  reasons.push(reason("pain_0_10", pain, painPts));
  if (pain >= 4) flags.push("pain_4_or_more");

  if (today.subjective.illness_symptoms) {
    score -= 4;
    reasons.push(reason("illness_symptoms", true, -4));
    flags.push("illness_symptoms");
  }

  const forceRecover =
    today.subjective.illness_symptoms ||
    pain >= 7 ||
    (flags.includes("very_low_sleep") && (readiness ?? 100) < 40);

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
  if (total > 0 && lowPct < 65) {
    gaps.push({
      gap_type: "low_aerobic_missing",
      severity: lowPct < 55 ? "high" : "medium",
      action: "Add 30-60 min easy Z1/Z2 session in next 24h."
    });
  }

  if (total > 0 && highPct > 12) {
    gaps.push({
      gap_type: "too_much_high_intensity",
      severity: highPct > 18 ? "high" : "medium",
      action: "Replace next hard day with easy aerobic or mobility."
    });
  }

  if (lookback7.length >= 5 && activeDays7.size >= 7) {
    gaps.push({
      gap_type: "no_recovery_day",
      severity: "medium",
      action: "Schedule one full rest or 20 min recovery mobility day."
    });
  }

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

function chooseWorkout(currentProfile, today, scoreData, gapData) {
  let state = scoreData.score <= -3 ? "recover" : scoreData.score >= 3 ? "build" : "maintain";
  if (scoreData.forceRecover) state = "recover";

  const sports = currentProfile.favorite_sports || ["run"];
  const pain = today.subjective.pain_0_10;
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
  const planA = buildPlanA(recommendationType, chosenSport, currentProfile.access?.minutes_per_session || 45);
  const planB = buildPlanB(recommendationType, chosenSport);

  return { state, recommendationType, chosenSport, planA, planB };
}

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
        "12 min progressive warm-up.",
        "3 x 8 min at upper Z3/lower Z4, 3 min easy between.",
        "8 min cool-down."
      ]
    };
  }

  return {
    title: `${capitalize(sport)} HIIT`,
    duration_min: clamp(minutes, 30, 55),
    intensity: "hard",
    target_zone: "z4-z5",
    steps: [
      "12 min warm-up with 3 short pickups.",
      "6 x 2 min hard (Z5) with 2 min easy recoveries.",
      "8 min cool-down."
    ]
  };
}

function buildPlanB(type, sport) {
  if (type === "rest") {
    return {
      title: "Optional short walk",
      duration_min: 15,
      steps: ["If energy allows, 10-15 min easy walk.", "Stop if pain increases."]
    };
  }

  return {
    title: `Short ${sport} option`,
    duration_min: 20,
    steps: ["5 min warm-up.", "10 min easy effort.", "5 min cool-down or mobility."]
  };
}

function formatRecommendationMessage(rec) {
  const why = rec.why.slice(0, 3).map((r) => `- ${prettySignal(r.signal)}: ${r.value} (${pointsLabel(r.points)})`).join("\n");
  const gaps = rec.gap_findings.length
    ? rec.gap_findings.map((g) => `- ${g.gap_type.replaceAll("_", " ")}: ${g.action}`).join("\n")
    : "- No major gap detected in current data window.";

  return [
    `Today: ${rec.recommendation_type.replaceAll("_", " ")} (${rec.state}, score ${rec.recovery_score})`,
    `Why:\n${why}`,
    `Plan A: ${rec.plan_a.title} (${rec.plan_a.duration_min} min, ${rec.plan_a.target_zone})`,
    rec.plan_a.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    `Plan B: ${rec.plan_b.title} (${rec.plan_b.duration_min} min)`,
    `Gaps:\n${gaps}`,
    `Confidence: ${Math.round(rec.confidence_0_1 * 100)}%`
  ].join("\n\n");
}

async function onChatSubmit(event) {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  addMessage("user", text);
  chatInput.value = "";

  if (!lastRecommendation) {
    addMessage("assistant", "Generate a recommendation first from daily check-in.");
    return;
  }

  let answer;
  const llm = await generateFollowUpWithLMStudio(text, lastRecommendation);
  if (llm.ok) {
    answer = llm.text;
  } else {
    answer = followUp(text, lastRecommendation);
    if (llm.reason === "unavailable" && hasLMStudioConfig()) {
      answer += "\n\nLM Studio unavailable, using local fallback.";
    }
  }

  addMessage("assistant", answer);
}

function hasLMStudioConfig() {
  return Boolean(lmStudioConfig.model && lmStudioConfig.model.trim());
}

function lmStudioChatUrl() {
  const raw = String(lmStudioConfig.base_url || "").trim() || defaultLMStudioConfig().base_url;
  const trimmed = raw.replace(/\/+$/, "");
  const base = trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
  return `${base}/chat/completions`;
}

async function generateRecommendationWithLMStudio(rec, daily) {
  if (!hasLMStudioConfig()) return { ok: false, reason: "not_configured" };

  const messages = [
    {
      role: "system",
      content:
        "You are an evidence-aware endurance coach. The recommendation JSON is final from a safety rules engine. Explain it clearly without changing recommendation type or safety constraints."
    },
    {
      role: "user",
      content: [
        "Write a concise athlete-facing coaching response with this structure:",
        "1) Today decision (state + recommendation type)",
        "2) Why (top 3 drivers)",
        "3) Plan A",
        "4) Plan B",
        "5) One sentence for tomorrow check-in",
        "",
        "Keep it under 190 words and do not invent data.",
        "",
        `Context JSON:\n${JSON.stringify(
          {
            profile: {
              goals: profile?.goals || [],
              favorite_sports: profile?.favorite_sports || [],
              injuries_conditions: profile?.injuries_conditions || []
            },
            daily,
            recommendation: rec
          },
          null,
          2
        )}`
      ].join("\n")
    }
  ];

  try {
    const text = await callLMStudioChat(messages, { temperature: 0.2, max_tokens: 360 });
    return { ok: true, text };
  } catch (_error) {
    return { ok: false, reason: "unavailable" };
  }
}

async function generateFollowUpWithLMStudio(question, rec) {
  if (!hasLMStudioConfig()) return { ok: false, reason: "not_configured" };

  const messages = [
    {
      role: "system",
      content:
        "You are a cautious sports coach. Keep answers aligned with recommendation JSON and safety flags. If asked for risky work while blocked, explain why and offer a safe alternative."
    },
    {
      role: "user",
      content: `Question: ${question}\n\nRecommendation JSON:\n${JSON.stringify(rec, null, 2)}`
    }
  ];

  try {
    const text = await callLMStudioChat(messages, { temperature: 0.25, max_tokens: 260 });
    return { ok: true, text };
  } catch (_error) {
    return { ok: false, reason: "unavailable" };
  }
}

async function callLMStudioChat(messages, options = {}) {
  if (typeof fetch !== "function") {
    throw new Error("Fetch is not available in this browser.");
  }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), 12000) : null;

  try {
    const response = await fetch(lmStudioChatUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: lmStudioConfig.model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.max_tokens ?? options.maxTokens ?? 300
      }),
      signal: controller ? controller.signal : undefined
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LM Studio error (${response.status}): ${text.slice(0, 200)}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;

    if (typeof content === "string" && content.trim()) return content.trim();
    if (Array.isArray(content)) {
      const merged = content
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part === "object" && typeof part.text === "string") return part.text;
          return "";
        })
        .join("")
        .trim();
      if (merged) return merged;
    }

    throw new Error("LM Studio returned an empty response.");
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("LM Studio request timed out.");
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function followUp(text, rec) {
  const q = text.toLowerCase();
  if (q.includes("why")) {
    return `Top drivers today:\n${rec.why
      .slice(0, 4)
      .map((w) => `- ${prettySignal(w.signal)} = ${w.value} (${pointsLabel(w.points)})`)
      .join("\n")}`;
  }

  if (q.includes("hiit")) {
    if (rec.recommendation_type === "hiit") return "You are currently cleared for HIIT because recovery score and guardrails allow it.";
    return `HIIT is blocked today due to guardrails: ${rec.safety_flags.join(", ") || "recovery state"}.`;
  }

  if (q.includes("alternative") || q.includes("option")) {
    return `Alternative:\n${rec.plan_b.title} (${rec.plan_b.duration_min} min)\n${rec.plan_b.steps
      .map((s, i) => `${i + 1}. ${s}`)
      .join("\n")}`;
  }

  if (q.includes("gap") || q.includes("missing")) {
    if (!rec.gap_findings.length) return "No major training gap detected in the current lookback window.";
    return `Gaps found:\n${rec.gap_findings
      .map((g) => `- ${g.gap_type.replaceAll("_", " ")} (${g.severity}): ${g.action}`)
      .join("\n")}`;
  }

  if (q.includes("tomorrow") || q.includes("next")) {
    return `For tomorrow, send: readiness, HRV, resting HR, pain/fatigue/soreness, and latest session screenshot.`;
  }

  return "I can explain why, show alternatives, or summarize gaps. Ask: 'why?', 'alternative?', or 'gaps?'.";
}

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

function addMessage(role, text) {
  chatLog = addChatMessage(chatLog, role, text, 200);
  saveChatLog(chatLog);
  renderChat();
}

function renderChat() {
  chatBox.innerHTML = "";
  chatLog.forEach((m) => {
    const div = document.createElement("div");
    div.className = `msg ${m.role}`;
    div.textContent = m.text;
    chatBox.appendChild(div);
  });
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ========== DASHBOARD FEATURES ==========

// Dashboard element references
const testLLMBtn = document.getElementById("test-llm");
const llmStatusInfo = document.getElementById("llm-status-info");
const fetchWeatherBtn = document.getElementById("fetch-weather");
const weatherLocationInput = document.getElementById("weather-location");
const weatherForecast = document.getElementById("weather-forecast");
const refreshPlanBtn = document.getElementById("refresh-plan");
const weeklyPlan = document.getElementById("weekly-plan");

// Initialize dashboard features
function initDashboard() {
  updateStats();
  generateWeeklyPlan();
  
  if (testLLMBtn) testLLMBtn.addEventListener("click", testLLMConnection);
  if (fetchWeatherBtn) fetchWeatherBtn.addEventListener("click", fetchWeather);
  if (refreshPlanBtn) refreshPlanBtn.addEventListener("click", generateWeeklyPlan);
}

// Stats Calculation
function updateStats() {
  const today = new Date();
  const hist = loadDailyHistory();
  
  // Last 7 days
  const days7 = hist.filter(d => {
    const diff = (today - new Date(d.date)) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff < 7;
  });
  
  const volume7d = days7.reduce((sum, d) => {
    const acts = d.activities || [];
    const mins = acts.reduce((s, a) => s + (a.duration_minutes || 0), 0);
    return sum + mins;
  }, 0);
  
  const hard7d = days7.filter(d => {
    const acts = d.activities || [];
    return acts.some(a => (a.exercise_load || 0) > 80 || ((a.z4_minutes || 0) + (a.z5_minutes || 0)) > 10);
  }).length;
  
  const recovery7d = days7.map(d => scoreRecovery(d, hist)).filter(s => s !== null);
  const avgRecovery7d = recovery7d.length ? round(recovery7d.reduce((a,b) => a+b, 0) / recovery7d.length, 1) : '-';
  
  // Last 4 weeks
  const days28 = hist.filter(d => {
    const diff = (today - new Date(d.date)) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff < 28;
  });
  
  const volume4w = days28.reduce((sum, d) => {
    const acts = d.activities || [];
    const mins = acts.reduce((s, a) => s + (a.duration_minutes || 0), 0);
    return sum + mins;
  }, 0);
  
  const avgWeekly = volume4w / 4;
  
  const activeDays = days28.filter(d => (d.activities || []).length > 0).length;
  const consistency = days28.length > 0 ? round((activeDays / days28.length) * 100, 0) : 0;
  
  // Update UI
  document.getElementById("stats-7d-volume").textContent = round(volume7d / 60, 1);
  document.getElementById("stats-7d-hard").textContent = hard7d;
  document.getElementById("stats-7d-recovery").textContent = avgRecovery7d;
  
  document.getElementById("stats-4w-volume").textContent = round(volume4w / 60, 1);
  document.getElementById("stats-4w-avg").textContent = round(avgWeekly / 60, 1);
  document.getElementById("stats-4w-consistency").textContent = consistency;
}

// Weekly Plan Generation
function generateWeeklyPlan() {
  if (!weeklyPlan) return;
  
  const hist = loadDailyHistory();
  const prof = loadProfile();
  const today = new Date();
  
  weeklyPlan.innerHTML = "";
  
  const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const todayDow = today.getDay(); // 0 = Sunday
  
  for (let i = 0; i < 7; i++) {
    const dayOffset = (i + 1 - todayDow + 7) % 7; // Days from today
    const date = new Date(today);
    date.setDate(date.getDate() + dayOffset);
    const dateStr = toISODate(date);
    
    // Check if we have data for this date
    const existing = hist.find(d => d.date === dateStr);
    
    // Mock recovery score for future days
    const mockDay = existing || {
      date: dateStr,
      subjective: { sleep_quality_0_10: 7, soreness_0_10: 3, stress_0_10: 4 },
      activities: []
    };
    
    const recovery = scoreRecovery(mockDay, hist);
    const recoveryScore = recovery !== null ? recovery : 75;
    
    // Simple workout selection based on day and recovery
    let workout = "";
    let zones = "";
    
    if (recoveryScore < 50) {
      workout = "🧘 Recovery";
      zones = "Easy yoga, walk, or rest day";
    } else if (i % 3 === 0 && recoveryScore >= 70) {
      // Hard day every 3 days if recovered
      const sport = prof?.favorite_sports?.[0] || "bike";
      workout = `🔥 ${capitalize(sport)} - Intervals`;
      zones = "10min warmup Z1-Z2, 4x(4min Z4 + 2min Z1), 10min cooldown";
    } else if (i % 2 === 1) {
      workout = "💪 Strength";
      zones = "Full body strength, 45-60 min, focus on weak areas";
    } else {
      const sport = prof?.favorite_sports?.[1] || prof?.favorite_sports?.[0] || "run";
      workout = `🚴 ${capitalize(sport)} - Aerobic`;
      zones = "Z2 steady, 45-75min, build aerobic base";
    }
    
    const dayEl = document.createElement("div");
    dayEl.className = "plan-day";
    dayEl.innerHTML = `
      <div class="plan-day-header">
        <strong>${daysOfWeek[i]}</strong>
        <span class="plan-date">${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        <span class="recovery-badge ${recoveryScore >= 70 ? 'good' : recoveryScore >= 50 ? 'ok' : 'poor'}">
          ${recoveryScore}%
        </span>
      </div>
      <div class="plan-workout">${workout}</div>
      <div class="plan-zones">${zones}</div>
    `;
    
    weeklyPlan.appendChild(dayEl);
  }
}

// Weather Fetching
async function fetchWeather() {
  if (!weatherForecast) return;
  
  const location = weatherLocationInput.value.trim();
  weatherForecast.innerHTML = "<p>Loading weather data...</p>";
  
  try {
    // Use profile location or default
    const prof = loadProfile();
    const lat = prof?.location?.latitude || 37.7749;  // Default SF
    const lon = prof?.location?.longitude || -122.4194;
    
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max&timezone=auto&forecast_days=7`);
    
    if (!response.ok) throw new Error("Weather API failed");
    
    const data = await response.json();
    renderWeather(data);
    
  } catch (error) {
    weatherForecast.innerHTML = `<p class="error">Failed to fetch weather: ${error.message}</p>`;
  }
}

function renderWeather(data) {
  if (!data.daily) {
    weatherForecast.innerHTML = "<p>No weather data available</p>";
    return;
  }
  
  const { time, temperature_2m_max, temperature_2m_min, precipitation_probability_max, weathercode } = data.daily;
  
  const weatherCodes = {
    0: "☀️ Clear",
    1: "🌤️ Mainly clear",
    2: "⛅ Partly cloudy",
    3: "☁️ Overcast",
    45: "🌫️ Foggy",
    48: "🌫️ Foggy",
    51: "🌧️ Light drizzle",
    53: "🌧️ Drizzle",
    55: "🌧️ Heavy drizzle",
    61: "🌧️ Light rain",
    63: "🌧️ Rain",
    65: "🌧️ Heavy rain",
    71: "❄️ Light snow",
    73: "❄️ Snow",
    75: "❄️ Heavy snow",
    80: "🌦️ Rain showers",
    95: "⛈️ Thunderstorm"
  };
  
  weatherForecast.innerHTML = "";
  
  for (let i = 0; i < Math.min(time.length, 7); i++) {
    const date = new Date(time[i]);
    const code = weathercode[i];
    const maxTemp = round(temperature_2m_max[i], 0);
    const minTemp = round(temperature_2m_min[i], 0);
    const precip = precipitation_probability_max[i];
    
    const weatherIcon = weatherCodes[code] || "🌡️ Unknown";
    const isGoodForOutdoor = precip < 30 && maxTemp > 5 && maxTemp < 35;
    
    const dayEl = document.createElement("div");
    dayEl.className = "weather-day";
    dayEl.innerHTML = `
      <div class="weather-day-header">
        <strong>${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
      </div>
      <div class="weather-icon">${weatherIcon}</div>
      <div class="weather-temp">${minTemp}°C - ${maxTemp}°C</div>
      <div class="weather-precip">💧 ${precip}%</div>
      ${isGoodForOutdoor ? '<div class="weather-badge good">✅ Good for outdoor</div>' : '<div class="weather-badge poor">⚠️ Indoor preferred</div>'}
    `;
    
    weatherForecast.appendChild(dayEl);
  }
}

// LLM Connection Test
async function testLLMConnection() {
  if (!llmStatusInfo) return;
  
  llmStatusInfo.textContent = "Testing connection...";
  llmStatusInfo.style.color = "#667284";
  
  try {
    const config = loadLMStudioConfig();
    const baseUrl = config.base_url || "http://127.0.0.1:1234/v1";
    
    const startTime = Date.now();
    const response = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });
    
    const elapsed = Date.now() - startTime;
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    const models = data.data || [];
    
    llmStatusInfo.innerHTML = `
      <div style="color: #2b8a3e;">✅ Connected (${elapsed}ms)</div>
      <div style="font-size: 0.9em; margin-top: 4px;">
        Models: ${models.length > 0 ? models.map(m => m.id).join(", ") : "None loaded"}
      </div>
    `;
    
  } catch (error) {
    llmStatusInfo.innerHTML = `
      <div style="color: #b0352a;">❌ Connection failed</div>
      <div style="font-size: 0.9em; margin-top: 4px;">${error.message}</div>
      <div style="font-size: 0.85em; margin-top: 4px; color: #667284;">
        Make sure LM Studio is running and the server is started
      </div>
    `;
  }
}

// Initialize dashboard when page loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDashboard);
} else {
  initDashboard();
}

// Expose functions to window for testing/debugging
window.onSaveProfile = onSaveProfile;
window.onSaveGarminConfig = onSaveGarminConfig;
window.onSaveLMStudioConfig = onSaveLMStudioConfig;
window.onGenerateRecommendation = onGenerateRecommendation;
window.onChatSubmit = onChatSubmit;
window.onCopyGarminCommand = onCopyGarminCommand;
window.onSyncGarminLatest = onSyncGarminLatest;
window.onActivityAction = onActivityAction;
window.testLLMConnection = testLLMConnection;
window.fetchWeather = fetchWeather;
window.generateWeeklyPlan = generateWeeklyPlan;
window.updateStats = updateStats;
window.initDashboard = initDashboard;
window.addActivityCard = addActivityCard;

// Verify exports
console.log('✅ Functions exported to window:', {
  onSaveProfile: typeof window.onSaveProfile,
  testLLMConnection: typeof window.testLLMConnection,
  fetchWeather: typeof window.fetchWeather
});
