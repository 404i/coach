#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const STORE_PATH = process.env.COACH_MCP_STORE || path.join(process.cwd(), "data", "coach_mcp_store.json");
const SERVER_NAME = "coach-mcp";
const SERVER_VERSION = "0.1.0";
const DEFAULT_PROTOCOL_VERSION = "2024-11-05";
const LM_STUDIO_BASE_URL = process.env.LM_STUDIO_BASE_URL || "http://127.0.0.1:1234/v1";
const LM_STUDIO_MODEL = String(process.env.LM_STUDIO_MODEL || "").trim();
const LM_STUDIO_TIMEOUT_MS = asPositiveInt(process.env.LM_STUDIO_TIMEOUT_MS, 12000);
const OPEN_METEO_BASE_URL = process.env.OPEN_METEO_BASE_URL || "https://api.open-meteo.com/v1/forecast";

const TOOL_DEFS = [
  {
    name: "save_profile",
    description: "Create or update athlete profile used by recommendation engine.",
    inputSchema: {
      type: "object",
      required: ["profile"],
      properties: {
        profile: {
          type: "object",
          required: ["profile_id"],
          properties: {
            profile_id: { type: "string" },
            goals: { type: "array", items: { type: "string" } },
            motivations: { type: "array", items: { type: "string" } },
            constraints: { type: "array", items: { type: "string" } },
            favorite_sports: { type: "array", items: { type: "string" } },
            access: { type: "object" },
            availability: { type: "object" },
            injuries_conditions: { type: "array", items: { type: "object" } },
            location: { type: "object" },
            baselines: { type: "object" },
            preferences: { type: "object" }
          }
        }
      }
    }
  },
  {
    name: "get_profile",
    description: "Get a saved athlete profile by profile_id.",
    inputSchema: {
      type: "object",
      required: ["profile_id"],
      properties: {
        profile_id: { type: "string" }
      }
    }
  },
  {
    name: "start_get_to_know_session",
    description: "Return prioritized intake questions to get to know the athlete deeply.",
    inputSchema: {
      type: "object",
      required: ["profile_id"],
      properties: {
        profile_id: { type: "string" },
        max_questions: { type: "integer", description: "Optional number of questions to return (default 6)." }
      }
    }
  },
  {
    name: "save_get_to_know_answers",
    description: "Save structured answers from a get-to-know session into athlete profile and return next questions.",
    inputSchema: {
      type: "object",
      required: ["profile_id", "answers"],
      properties: {
        profile_id: { type: "string" },
        answers: {
          type: "object",
          description:
            "Keys can include goals, motivations, constraints, favorite_sports, equipment, facilities, days_per_week, minutes_per_session, weekly_minutes_target, weekly_schedule, injuries_conditions, location, preferred_training_time, and intake.* details."
        },
        max_questions: { type: "integer", description: "Optional number of follow-up questions to return (default 6)." }
      }
    }
  },
  {
    name: "ingest_daily_metrics",
    description: "Save one day of metrics and activities (from manual entry or screenshot transcription).",
    inputSchema: {
      type: "object",
      required: ["daily"],
      properties: {
        daily: {
          type: "object",
          required: ["profile_id", "date"],
          properties: {
            profile_id: { type: "string" },
            date: { type: "string" },
            source: { type: "object" },
            readiness: { type: "object" },
            recovery_signals: { type: "object" },
            subjective: { type: "object" },
            activities: { type: "array", items: { type: "object" } }
          }
        }
      }
    }
  },
  {
    name: "import_garmindb_metrics",
    description: "Import GarminDB SQLite data into coach daily metrics for a profile.",
    inputSchema: {
      type: "object",
      required: ["profile_id"],
      properties: {
        profile_id: { type: "string" },
        from_date: { type: "string", description: "Optional YYYY-MM-DD lower bound." },
        to_date: { type: "string", description: "Optional YYYY-MM-DD upper bound." },
        latest_days: { type: "integer", description: "Optional lookback window if from_date is omitted." },
        overwrite: { type: "boolean", description: "Default true. If false, existing days are left unchanged." },
        dry_run: { type: "boolean", description: "If true, previews import without writing store." },
        garmin_db_dir: { type: "string", description: "Optional DB directory. Defaults to data/garmin/HealthData/DBs." }
      }
    }
  },
  {
    name: "garmin_login_sync",
    description:
      "Run GarminDB sync using optional Garmin credentials + MFA code (latest or full history).",
    inputSchema: {
      type: "object",
      properties: {
        sync_mode: {
          type: "string",
          enum: ["latest", "all"],
          description: "Default latest. Use all for first-time full historical sync."
        },
        garmin_user: { type: "string", description: "Garmin Connect email/username." },
        garmin_password: { type: "string", description: "Garmin password (prefer password_file when possible)." },
        garmin_password_file: { type: "string", description: "Path to password file." },
        garmin_mfa_code: { type: "string", description: "Optional email MFA code." },
        garmin_start_date: {
          type: "string",
          description: "Optional bootstrap start date in MM/DD/YYYY format (e.g. 01/01/2024)."
        },
        garmindb_http_timeout: { type: "integer", description: "Optional HTTP timeout seconds." },
        garmindb_http_retries: { type: "integer", description: "Optional retry count." },
        garmindb_http_backoff: { type: "number", description: "Optional retry backoff factor." }
      }
    }
  },
  {
    name: "sync_garmin_and_recommend",
    description:
      "Optional Garmin latest sync + GarminDB import + recommendation generation in one call.",
    inputSchema: {
      type: "object",
      required: ["profile_id"],
      properties: {
        profile_id: { type: "string" },
        date: { type: "string", description: "Optional YYYY-MM-DD recommendation date override." },
        from_date: { type: "string", description: "Optional YYYY-MM-DD lower bound for Garmin import." },
        to_date: { type: "string", description: "Optional YYYY-MM-DD upper bound for Garmin import." },
        latest_days: { type: "integer", description: "Optional Garmin import lookback window." },
        garmin_db_dir: { type: "string", description: "Optional Garmin DB directory override." },
        overwrite: { type: "boolean" },
        dry_run: { type: "boolean" },
        run_sync: { type: "boolean", description: "If true, runs scripts/garmindb_sync_latest.sh first." },
        sync_mode: {
          type: "string",
          enum: ["latest", "all"],
          description: "Default latest. Use all for first-time full historical sync."
        },
        garmin_user: { type: "string", description: "Garmin Connect email/username for sync stage." },
        garmin_password: { type: "string", description: "Garmin password for sync stage." },
        garmin_password_file: { type: "string", description: "Path to password file for sync stage." },
        garmin_mfa_code: { type: "string", description: "Optional email MFA code for sync stage." },
        garmin_start_date: { type: "string", description: "Optional MM/DD/YYYY bootstrap start date." },
        garmindb_http_timeout: { type: "integer", description: "Optional HTTP timeout seconds for sync stage." },
        garmindb_http_retries: { type: "integer", description: "Optional retry count for sync stage." },
        garmindb_http_backoff: { type: "number", description: "Optional retry backoff factor for sync stage." },
        continue_on_sync_error: {
          type: "boolean",
          description: "If true (default), import/recommend still run when sync fails."
        }
      }
    }
  },
  {
    name: "recommend_today",
    description: "Generate recommendation for a day from profile + history.",
    inputSchema: {
      type: "object",
      required: ["profile_id"],
      properties: {
        profile_id: { type: "string" },
        date: { type: "string", description: "Optional YYYY-MM-DD. Defaults to latest day in history." }
      }
    }
  },
  {
    name: "list_training_gaps",
    description: "Return gap analysis over recent history for a profile.",
    inputSchema: {
      type: "object",
      required: ["profile_id"],
      properties: {
        profile_id: { type: "string" },
        date: { type: "string", description: "Optional YYYY-MM-DD. Defaults to latest day in history." }
      }
    }
  },
  {
    name: "chat_followup",
    description: "Answer a follow-up question using the last recommendation context.",
    inputSchema: {
      type: "object",
      required: ["profile_id", "question"],
      properties: {
        profile_id: { type: "string" },
        question: { type: "string" }
      }
    }
  },
  {
    name: "save_planned_activities",
    description: "Save planned sessions/events/races for future training planning.",
    inputSchema: {
      type: "object",
      required: ["profile_id", "planned"],
      properties: {
        profile_id: { type: "string" },
        planned: {
          type: "array",
          items: {
            type: "object",
            required: ["title", "sport"],
            properties: {
              event_id: { type: "string" },
              title: { type: "string" },
              sport: { type: "string" },
              type: { type: "string", enum: ["session", "event", "race"] },
              date: { type: "string" },
              start_date: { type: "string" },
              end_date: { type: "string" },
              expected_duration_min: { type: "number" },
              priority: { type: "string", enum: ["low", "medium", "high", "a"] },
              notes: { type: "string" }
            }
          }
        }
      }
    }
  },
  {
    name: "list_planned_activities",
    description: "List planned sessions/events/races for a profile.",
    inputSchema: {
      type: "object",
      required: ["profile_id"],
      properties: {
        profile_id: { type: "string" },
        from_date: { type: "string", description: "Optional YYYY-MM-DD filter start." },
        to_date: { type: "string", description: "Optional YYYY-MM-DD filter end." }
      }
    }
  },
  {
    name: "get_weather_forecast",
    description: "Get local weather forecast for the profile location or explicit lat/lon.",
    inputSchema: {
      type: "object",
      properties: {
        profile_id: { type: "string" },
        latitude: { type: "number" },
        longitude: { type: "number" },
        days: { type: "integer" },
        start_date: { type: "string" }
      }
    }
  },
  {
    name: "weekly_suggestions",
    description: "Generate weather-aware weekly activity suggestions from history, goals, and planned events.",
    inputSchema: {
      type: "object",
      required: ["profile_id"],
      properties: {
        profile_id: { type: "string" },
        start_date: { type: "string", description: "Optional YYYY-MM-DD start date. Defaults to today." },
        include_weather: { type: "boolean" }
      }
    }
  },
  {
    name: "agent_chat",
    description:
      "LM Studio coaching agent with profile intake, history analysis, planned-event awareness, and weather-aware weekly guidance.",
    inputSchema: {
      type: "object",
      required: ["profile_id", "message"],
      properties: {
        profile_id: { type: "string" },
        message: { type: "string" },
        start_date: { type: "string" },
        include_weather: { type: "boolean" }
      }
    }
  }
];

let negotiatedProtocolVersion = DEFAULT_PROTOCOL_VERSION;

process.stdin.on("data", onData);
process.stdin.on("error", () => {
  // Ignore stdin stream errors in stdio mode.
});
process.stdout.on("error", () => {
  // Ignore stdout stream errors (e.g. EPIPE when client closes transport).
});
process.stdin.resume();

let inputBuffer = Buffer.alloc(0);

function onData(chunk) {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  parseMessages();
}

function parseMessages() {
  while (true) {
    const crlfSep = inputBuffer.indexOf("\r\n\r\n");
    const lfSep = inputBuffer.indexOf("\n\n");
    let sep = -1;
    let sepLen = 0;

    if (crlfSep !== -1 && (lfSep === -1 || crlfSep <= lfSep)) {
      sep = crlfSep;
      sepLen = 4;
    } else if (lfSep !== -1) {
      sep = lfSep;
      sepLen = 2;
    }

    if (sep === -1) return;

    const headersRaw = inputBuffer.slice(0, sep).toString("utf8");
    const lengthMatch = headersRaw.match(/Content-Length:\s*(\d+)/i);
    if (!lengthMatch) {
      inputBuffer = inputBuffer.slice(sep + sepLen);
      continue;
    }

    const contentLength = Number(lengthMatch[1]);
    const bodyStart = sep + sepLen;
    const totalLength = bodyStart + contentLength;

    if (inputBuffer.length < totalLength) return;

    const bodyRaw = inputBuffer.slice(bodyStart, totalLength).toString("utf8");
    inputBuffer = inputBuffer.slice(totalLength);

    let message;
    try {
      message = JSON.parse(bodyRaw);
    } catch (error) {
      sendError(null, -32700, `Invalid JSON: ${error.message}`);
      continue;
    }

    handleMessage(message);
  }
}

function handleMessage(message) {
  if (!message || typeof message !== "object") return;

  if (message.method && Object.prototype.hasOwnProperty.call(message, "id")) {
    void handleRequest(message);
    return;
  }

  if (message.method && !Object.prototype.hasOwnProperty.call(message, "id")) {
    handleNotification(message);
  }
}

function handleNotification(message) {
  if (message.method === "notifications/initialized") {
    return;
  }
}

async function handleRequest(message) {
  const { id, method, params } = message;

  try {
    switch (method) {
      case "initialize": {
        negotiatedProtocolVersion = (params && params.protocolVersion) || DEFAULT_PROTOCOL_VERSION;
        sendResult(id, {
          protocolVersion: negotiatedProtocolVersion,
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION
          },
          instructions:
            "Use garmin_login_sync for Garmin auth/sync only, sync_garmin_and_recommend for one-shot daily flow, or save_profile + import_garmindb_metrics/ingest_daily_metrics + weekly_suggestions + agent_chat for adaptive coaching."
        });
        return;
      }

      case "ping":
        sendResult(id, {});
        return;

      case "tools/list":
        sendResult(id, { tools: TOOL_DEFS });
        return;

      case "tools/call": {
        const result = await handleToolCall(params || {});
        sendResult(id, result);
        return;
      }

      default:
        sendError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    sendError(id, -32603, error.message || "Internal error");
  }
}

async function handleToolCall(params) {
  const name = params.name;
  const args = params.arguments || {};

  try {
    let data;
    switch (name) {
      case "save_profile":
        data = saveProfile(args);
        return toolSuccess(data, "Profile saved.");
      case "get_profile":
        data = getProfile(args);
        return toolSuccess(data, "Profile loaded.");
      case "start_get_to_know_session":
        data = startGetToKnowSession(args);
        return toolSuccess(data, "Get-to-know session ready.");
      case "save_get_to_know_answers":
        data = saveGetToKnowAnswers(args);
        return toolSuccess(data, "Get-to-know answers saved.");
      case "ingest_daily_metrics":
        data = ingestDailyMetrics(args);
        return toolSuccess(data, "Daily metrics ingested.");
      case "import_garmindb_metrics":
        data = importGarminDbMetrics(args);
        return toolSuccess(data, "GarminDB metrics imported.");
      case "garmin_login_sync":
        data = garminLoginSync(args);
        return toolSuccess(data, "Garmin sync completed.");
      case "sync_garmin_and_recommend":
        data = await syncGarminAndRecommend(args);
        return toolSuccess(data, "Garmin sync/import/recommendation completed.");
      case "recommend_today":
        data = await recommendToday(args);
        return toolSuccess(data, "Recommendation generated.");
      case "list_training_gaps":
        data = listTrainingGaps(args);
        return toolSuccess(data, "Gap analysis generated.");
      case "chat_followup":
        data = await chatFollowup(args);
        return toolSuccess(data, data.answer);
      case "save_planned_activities":
        data = savePlannedActivities(args);
        return toolSuccess(data, "Planned activities saved.");
      case "list_planned_activities":
        data = listPlannedActivities(args);
        return toolSuccess(data, "Planned activities loaded.");
      case "get_weather_forecast":
        data = await getWeatherForecast(args);
        return toolSuccess(data, "Forecast loaded.");
      case "weekly_suggestions":
        data = await weeklySuggestions(args);
        return toolSuccess(data, "Weekly suggestions generated.");
      case "agent_chat":
        data = await agentChat(args);
        return toolSuccess(data, data.answer);
      default:
        return toolError(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return toolError(error.message || "Tool call failed");
  }
}

function toolSuccess(payload, summary) {
  return {
    content: [
      {
        type: "text",
        text: `${summary}\n\n${JSON.stringify(payload, null, 2)}`
      }
    ],
    structuredContent: payload,
    isError: false
  };
}

function toolError(message) {
  return {
    content: [
      {
        type: "text",
        text: message
      }
    ],
    isError: true
  };
}

function sendResult(id, result) {
  send({
    jsonrpc: "2.0",
    id,
    result
  });
}

function sendError(id, code, message) {
  send({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  });
}

function send(message) {
  const body = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;
  process.stdout.write(header + body);
}

function defaultStore() {
  return {
    profiles: {},
    daily: {},
    planned: {},
    lastRecommendation: {},
    agentMemory: {}
  };
}

function loadStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return defaultStore();
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      profiles: parsed.profiles || {},
      daily: parsed.daily || {},
      planned: parsed.planned || {},
      lastRecommendation: parsed.lastRecommendation || {},
      agentMemory: parsed.agentMemory || {}
    };
  } catch (_error) {
    return defaultStore();
  }
}

function saveStore(store) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function saveProfile(args) {
  const input = args.profile;
  if (!input || typeof input !== "object") throw new Error("profile is required");
  if (!input.profile_id) throw new Error("profile.profile_id is required");

  const sports = normalizeSportsList(input.favorite_sports);

  const store = loadStore();
  const existing = store.profiles[input.profile_id];
  const now = new Date().toISOString();
  const mergedIntakeInput =
    input.intake && typeof input.intake === "object"
      ? { ...(existing && existing.intake ? existing.intake : {}), ...input.intake }
      : existing && existing.intake
      ? existing.intake
      : {};

  const normalized = {
    profile_id: input.profile_id,
    created_at: existing && existing.created_at ? existing.created_at : now,
    updated_at: now,
    goals: asArray(input.goals),
    motivations: asArray(input.motivations),
    constraints: asArray(input.constraints),
    favorite_sports: sports,
    access: {
      equipment: asArray(input.access && input.access.equipment),
      facilities: asArray(input.access && input.access.facilities),
      days_per_week: asNullableNumber(input.access && input.access.days_per_week),
      minutes_per_session: asNullableNumber(input.access && input.access.minutes_per_session)
    },
    availability: {
      weekly_minutes_target: asNullableNumber(input.availability && input.availability.weekly_minutes_target),
      weekly_schedule: normalizeWeeklySchedule(input.availability && input.availability.weekly_schedule)
    },
    injuries_conditions: Array.isArray(input.injuries_conditions) ? input.injuries_conditions : [],
    location: normalizeLocation(input.location),
    baselines: {
      resting_hr_bpm_14d: asNullableNumber(input.baselines && input.baselines.resting_hr_bpm_14d),
      hrv_ms_7d: asNullableNumber(input.baselines && input.baselines.hrv_ms_7d),
      lthr_bpm: asNullableNumber(input.baselines && input.baselines.lthr_bpm),
      max_hr_bpm: asNullableNumber(input.baselines && input.baselines.max_hr_bpm),
      ftp_watts: asNullableNumber(input.baselines && input.baselines.ftp_watts)
    },
    preferences: {
      max_hard_days_per_week: asNumberOr(input.preferences && input.preferences.max_hard_days_per_week, 2),
      preferred_training_time: (input.preferences && input.preferences.preferred_training_time) || "either",
      likes_variety:
        input.preferences && typeof input.preferences.likes_variety === "boolean"
          ? input.preferences.likes_variety
          : true
    },
    intake: normalizeIntake(mergedIntakeInput)
  };

  store.profiles[input.profile_id] = normalized;
  if (!store.daily[input.profile_id]) store.daily[input.profile_id] = [];
  if (!store.planned[input.profile_id]) store.planned[input.profile_id] = [];
  if (!store.agentMemory[input.profile_id]) store.agentMemory[input.profile_id] = [];

  saveStore(store);
  return { profile: normalized, store_path: STORE_PATH };
}

function getProfile(args) {
  const profileId = args.profile_id;
  if (!profileId) throw new Error("profile_id is required");

  const store = loadStore();
  const profile = store.profiles[profileId];
  if (!profile) throw new Error(`Profile not found: ${profileId}`);

  const intakeStatus = getToKnowStatus(profile);
  return {
    profile,
    history_days: (store.daily[profileId] || []).length,
    planned_items: (store.planned[profileId] || []).length,
    pending_profile_fields: getMissingProfileFields(profile),
    intake_completion: intakeStatus
  };
}

function startGetToKnowSession(args) {
  const profileId = String(args.profile_id || "").trim();
  if (!profileId) throw new Error("profile_id is required");

  const store = loadStore();
  const profile = store.profiles[profileId];
  if (!profile) throw new Error(`Profile not found: ${profileId}`);

  const maxQuestions = clamp(asNumberOr(args.max_questions, 6), 1, 12);
  const status = getToKnowStatus(profile);
  return {
    profile_id: profileId,
    intake_completion: status,
    next_questions: status.missing_questions.slice(0, maxQuestions),
    answering_hint:
      "Reply with save_get_to_know_answers using an answers object. Example keys: goals, motivations, favorite_sports, equipment, days_per_week, weekly_minutes_target, injuries_conditions, location, intake."
  };
}

function saveGetToKnowAnswers(args) {
  const profileId = String(args.profile_id || "").trim();
  if (!profileId) throw new Error("profile_id is required");
  if (!args.answers || typeof args.answers !== "object") {
    throw new Error("answers object is required");
  }

  const store = loadStore();
  const profile = store.profiles[profileId];
  if (!profile) throw new Error(`Profile not found: ${profileId}`);

  const applied = applyGetToKnowAnswers(profile, args.answers);
  profile.updated_at = new Date().toISOString();
  store.profiles[profileId] = profile;
  saveStore(store);

  const maxQuestions = clamp(asNumberOr(args.max_questions, 6), 1, 12);
  const status = getToKnowStatus(profile);
  return {
    profile_id: profileId,
    applied_fields: applied,
    intake_completion: status,
    next_questions: status.missing_questions.slice(0, maxQuestions)
  };
}

function applyGetToKnowAnswers(profile, answers) {
  const applied = [];

  if (Object.prototype.hasOwnProperty.call(answers, "goals")) {
    profile.goals = asArrayOrCsv(answers.goals);
    applied.push("goals");
  }
  if (Object.prototype.hasOwnProperty.call(answers, "motivations")) {
    profile.motivations = asArrayOrCsv(answers.motivations);
    applied.push("motivations");
  }
  if (Object.prototype.hasOwnProperty.call(answers, "constraints")) {
    profile.constraints = asArrayOrCsv(answers.constraints);
    applied.push("constraints");
  }
  if (Object.prototype.hasOwnProperty.call(answers, "favorite_sports")) {
    const sports = normalizeSportsList(answers.favorite_sports);
    if (sports.length) {
      profile.favorite_sports = sports;
      applied.push("favorite_sports");
    }
  }

  profile.access = profile.access || {
    equipment: [],
    facilities: [],
    days_per_week: 5,
    minutes_per_session: 45
  };
  if (Object.prototype.hasOwnProperty.call(answers, "equipment")) {
    profile.access.equipment = asArrayOrCsv(answers.equipment);
    applied.push("access.equipment");
  }
  if (Object.prototype.hasOwnProperty.call(answers, "facilities")) {
    profile.access.facilities = asArrayOrCsv(answers.facilities);
    applied.push("access.facilities");
  }
  if (Object.prototype.hasOwnProperty.call(answers, "days_per_week")) {
    profile.access.days_per_week = clamp(asNumberOr(answers.days_per_week, profile.access.days_per_week || 5), 1, 7);
    applied.push("access.days_per_week");
  }
  if (Object.prototype.hasOwnProperty.call(answers, "minutes_per_session")) {
    profile.access.minutes_per_session = clamp(
      asNumberOr(answers.minutes_per_session, profile.access.minutes_per_session || 45),
      10,
      300
    );
    applied.push("access.minutes_per_session");
  }

  profile.availability = profile.availability || { weekly_minutes_target: null, weekly_schedule: {} };
  if (Object.prototype.hasOwnProperty.call(answers, "weekly_minutes_target")) {
    profile.availability.weekly_minutes_target = asNullableNumber(answers.weekly_minutes_target);
    applied.push("availability.weekly_minutes_target");
  }
  if (Object.prototype.hasOwnProperty.call(answers, "weekly_schedule")) {
    profile.availability.weekly_schedule = normalizeWeeklySchedule(answers.weekly_schedule);
    applied.push("availability.weekly_schedule");
  }

  if (Object.prototype.hasOwnProperty.call(answers, "injuries_conditions")) {
    if (Array.isArray(answers.injuries_conditions)) {
      profile.injuries_conditions = answers.injuries_conditions;
      applied.push("injuries_conditions");
    } else {
      const name = String(answers.injuries_conditions || "").trim();
      if (name) {
        profile.injuries_conditions = [{ name, status: "managed", severity_0_10: 0, contraindications: [] }];
        applied.push("injuries_conditions");
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(answers, "location")) {
    profile.location = normalizeLocation(answers.location);
    applied.push("location");
  } else {
    const loc = profile.location || {};
    let changed = false;
    if (Object.prototype.hasOwnProperty.call(answers, "location_label")) {
      loc.label = String(answers.location_label || "").trim();
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(answers, "latitude")) {
      loc.latitude = asNullableNumber(answers.latitude);
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(answers, "longitude")) {
      loc.longitude = asNullableNumber(answers.longitude);
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(answers, "timezone")) {
      loc.timezone = String(answers.timezone || "").trim();
      changed = true;
    }
    if (changed) {
      profile.location = normalizeLocation(loc);
      applied.push("location");
    }
  }

  profile.preferences = profile.preferences || {
    max_hard_days_per_week: 2,
    preferred_training_time: "either",
    likes_variety: true
  };
  if (Object.prototype.hasOwnProperty.call(answers, "preferred_training_time")) {
    profile.preferences.preferred_training_time = normalizePreferredTrainingTime(answers.preferred_training_time);
    applied.push("preferences.preferred_training_time");
  }
  if (Object.prototype.hasOwnProperty.call(answers, "max_hard_days_per_week")) {
    profile.preferences.max_hard_days_per_week = clamp(asNumberOr(answers.max_hard_days_per_week, 2), 0, 4);
    applied.push("preferences.max_hard_days_per_week");
  }

  const intakePatch = {};
  const intake = answers.intake && typeof answers.intake === "object" ? answers.intake : {};
  const intakeKeys = [
    "training_background",
    "current_weekly_volume_min",
    "primary_limiters",
    "motivations_detail",
    "lifestyle_notes",
    "work_schedule",
    "sleep_target_hours",
    "stress_level_0_10",
    "preferred_long_session_day",
    "indoor_outdoor_preference",
    "race_goals",
    "confidence_areas",
    "support_system",
    "nutrition_notes"
  ];

  intakeKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(answers, key)) intakePatch[key] = answers[key];
    if (Object.prototype.hasOwnProperty.call(intake, key)) intakePatch[key] = intake[key];
  });

  if (Object.keys(intakePatch).length) {
    profile.intake = normalizeIntake({ ...(profile.intake || {}), ...intakePatch });
    applied.push("intake");
  } else if (!profile.intake) {
    profile.intake = normalizeIntake({});
  }

  return applied;
}

function ingestDailyMetrics(args) {
  const input = args.daily;
  if (!input || typeof input !== "object") throw new Error("daily is required");
  if (!input.profile_id) throw new Error("daily.profile_id is required");
  if (!input.date) throw new Error("daily.date is required");

  const store = loadStore();
  if (!store.profiles[input.profile_id]) {
    throw new Error(`Profile not found: ${input.profile_id}. Save profile first.`);
  }

  const normalized = normalizeDaily(input);
  const history = store.daily[input.profile_id] || [];
  const idx = history.findIndex((d) => d.date === normalized.date);
  if (idx >= 0) history[idx] = normalized;
  else history.push(normalized);
  history.sort((a, b) => (a.date < b.date ? -1 : 1));

  store.daily[input.profile_id] = history;
  saveStore(store);

  return {
    saved: true,
    profile_id: input.profile_id,
    date: normalized.date,
    total_days: history.length,
    source: normalized.source
  };
}

function importGarminDbMetrics(args) {
  const profileId = String(args.profile_id || "").trim();
  if (!profileId) throw new Error("profile_id is required");

  const store = loadStore();
  if (!store.profiles[profileId]) {
    throw new Error(`Profile not found: ${profileId}. Save profile first.`);
  }

  const scriptPath = path.join(process.cwd(), "scripts", "import_garmindb_to_coach.py");
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Missing importer script: ${scriptPath}`);
  }

  const pythonExec =
    String(process.env.GARMINDB_PYTHON || "").trim() ||
    path.join(process.cwd(), ".venv-garmin", "bin", "python3");

  const cmdArgs = [scriptPath, "--profile-id", profileId, "--store", STORE_PATH];
  if (args.garmin_db_dir) cmdArgs.push("--garmin-db-dir", String(args.garmin_db_dir));
  if (args.from_date) cmdArgs.push("--from-date", String(args.from_date));
  if (args.to_date) cmdArgs.push("--to-date", String(args.to_date));

  const latestDaysRaw = Number(args.latest_days);
  if (Number.isFinite(latestDaysRaw) && latestDaysRaw > 0) {
    cmdArgs.push("--latest-days", String(Math.round(latestDaysRaw)));
  }

  if (args.overwrite === false) cmdArgs.push("--no-overwrite");
  if (Boolean(args.dry_run)) cmdArgs.push("--dry-run");

  const run = spawnSync(pythonExec, cmdArgs, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });

  if (run.error) {
    throw new Error(`Failed to run GarminDB importer: ${run.error.message}`);
  }

  const stdout = String(run.stdout || "").trim();
  const stderr = String(run.stderr || "").trim();
  if (run.status !== 0) {
    const detail = (stderr || stdout || `exit code ${run.status}`).slice(0, 2000);
    throw new Error(`GarminDB importer failed: ${detail}`);
  }
  if (!stdout) {
    throw new Error("GarminDB importer returned no output.");
  }

  try {
    return JSON.parse(stdout);
  } catch (_error) {
    throw new Error(`GarminDB importer returned invalid JSON: ${stdout.slice(0, 300)}`);
  }
}

function runGarminSync(args = {}) {
  const syncModeRaw = String(args.sync_mode || "latest").trim().toLowerCase();
  const syncMode = syncModeRaw === "all" ? "all" : "latest";
  const scriptPath = path.join(
    process.cwd(),
    "scripts",
    syncMode === "all" ? "garmindb_sync_all.sh" : "garmindb_sync_latest.sh"
  );
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Missing Garmin sync script: ${scriptPath}`);
  }

  const env = { ...process.env };
  if (args.garmin_user) env.GARMIN_USER = String(args.garmin_user);
  if (args.garmin_password) env.GARMIN_PASSWORD = String(args.garmin_password);
  if (args.garmin_password_file) env.GARMIN_PASSWORD_FILE = String(args.garmin_password_file);
  if (args.garmin_mfa_code) env.GARMIN_MFA_CODE = String(args.garmin_mfa_code);
  if (args.garmin_start_date) env.GARMIN_START_DATE = String(args.garmin_start_date);

  if (isNumber(asNullableNumber(args.garmindb_http_timeout))) {
    env.GARMINDB_HTTP_TIMEOUT = String(Math.max(5, Math.round(Number(args.garmindb_http_timeout))));
  }
  if (isNumber(asNullableNumber(args.garmindb_http_retries))) {
    env.GARMINDB_HTTP_RETRIES = String(Math.max(0, Math.round(Number(args.garmindb_http_retries))));
  }
  if (isNumber(asNullableNumber(args.garmindb_http_backoff))) {
    env.GARMINDB_HTTP_BACKOFF = String(Math.max(0, Number(args.garmindb_http_backoff)));
  }

  const startedAtMs = Date.now();
  const startedAtIso = new Date(startedAtMs).toISOString();

  const run = spawnSync("bash", [scriptPath], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    env
  });

  if (run.error) {
    throw new Error(`Failed to run Garmin sync: ${run.error.message}`);
  }
  if (run.status !== 0) {
    const detail = String(run.stderr || run.stdout || `exit code ${run.status}`).slice(0, 3000);
    throw new Error(`Garmin sync failed: ${detail}`);
  }

  const completedAtMs = Date.now();
  const completedAtIso = new Date(completedAtMs).toISOString();

  return {
    ok: true,
    mode: syncMode,
    script: scriptPath,
    status: run.status,
    started_at: startedAtIso,
    completed_at: completedAtIso,
    duration_sec: round((completedAtMs - startedAtMs) / 1000, 1),
    latest_data_timestamp: latestGarminDataTimestamp(),
    stdout_tail: String(run.stdout || "").slice(-1200),
    stderr_tail: String(run.stderr || "").slice(-1200)
  };
}

function latestGarminDataTimestamp() {
  const dbDir = path.join(process.cwd(), "data", "garmin", "HealthData", "DBs");
  if (!fs.existsSync(dbDir)) return null;

  let maxMtimeMs = 0;
  try {
    const entries = fs.readdirSync(dbDir);
    entries.forEach((name) => {
      const filePath = path.join(dbDir, name);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile() && stat.mtimeMs > maxMtimeMs) {
          maxMtimeMs = stat.mtimeMs;
        }
      } catch (_error) {
        // Ignore unreadable files.
      }
    });
  } catch (_error) {
    return null;
  }

  if (!maxMtimeMs) return null;
  return new Date(maxMtimeMs).toISOString();
}

function garminLoginSync(args) {
  const sync = runGarminSync(args || {});
  return {
    sync
  };
}

async function syncGarminAndRecommend(args) {
  const profileId = String(args.profile_id || "").trim();
  if (!profileId) throw new Error("profile_id is required");

  const runSync = Boolean(args.run_sync);
  const continueOnSyncError = args.continue_on_sync_error !== false;

  const result = {
    profile_id: profileId,
    sync: {
      attempted: runSync,
      ok: false,
      error: null
    },
    import: null,
    recommendation: null
  };

  if (runSync) {
    try {
      const sync = runGarminSync({
        sync_mode: args.sync_mode,
        garmin_user: args.garmin_user,
        garmin_password: args.garmin_password,
        garmin_password_file: args.garmin_password_file,
        garmin_mfa_code: args.garmin_mfa_code,
        garmin_start_date: args.garmin_start_date,
        garmindb_http_timeout: args.garmindb_http_timeout,
        garmindb_http_retries: args.garmindb_http_retries,
        garmindb_http_backoff: args.garmindb_http_backoff
      });
      result.sync = {
        attempted: true,
        ok: true,
        error: null,
        ...sync
      };
    } catch (error) {
      result.sync = {
        attempted: true,
        ok: false,
        error: error.message
      };
      if (!continueOnSyncError) {
        throw new Error(`Sync stage failed and continue_on_sync_error=false: ${error.message}`);
      }
    }
  }

  const importArgs = {
    profile_id: profileId,
    from_date: args.from_date,
    to_date: args.to_date,
    latest_days: args.latest_days,
    overwrite: args.overwrite,
    dry_run: args.dry_run,
    garmin_db_dir: args.garmin_db_dir
  };
  const imported = importGarminDbMetrics(importArgs);
  result.import = imported;

  if (Boolean(args.dry_run)) {
    result.recommendation = {
      skipped: true,
      reason: "dry_run=true (import preview only)"
    };
    return result;
  }

  const targetDate = String(args.date || "").trim() || imported.last_imported_day;
  if (!targetDate) {
    result.recommendation = {
      skipped: true,
      reason: "No imported day available for recommendation."
    };
    return result;
  }

  const recommendation = await recommendToday({ profile_id: profileId, date: targetDate });
  result.recommendation = {
    skipped: false,
    date: recommendation.date,
    state: recommendation.state,
    recommendation_type: recommendation.recommendation_type,
    recovery_score: recommendation.recovery_score,
    response_provider: recommendation.response_provider,
    payload: recommendation
  };
  return result;
}

async function recommendToday(args) {
  const profileId = args.profile_id;
  if (!profileId) throw new Error("profile_id is required");

  const store = loadStore();
  const profile = store.profiles[profileId];
  if (!profile) throw new Error(`Profile not found: ${profileId}`);

  const history = store.daily[profileId] || [];
  if (!history.length) throw new Error("No daily metrics found. Use ingest_daily_metrics first.");

  const targetDate = args.date || history[history.length - 1].date;
  const today = history.find((d) => d.date === targetDate);
  if (!today) throw new Error(`No daily metrics found for date ${targetDate}`);

  const recommendation = generateRecommendation(profile, history, today);
  const llmRecommendation = await generateRecommendationWithLMStudio(profile, today, recommendation);
  if (llmRecommendation.ok) {
    recommendation.coach_message = llmRecommendation.text;
    recommendation.response_provider = "lm_studio";
    recommendation.llm_model = LM_STUDIO_MODEL;
  } else {
    recommendation.coach_message = formatRuleRecommendation(recommendation);
    recommendation.response_provider = "rules";
    if (llmRecommendation.reason === "unavailable" && lmStudioEnabled()) {
      recommendation.llm_error = llmRecommendation.error;
    }
  }

  store.lastRecommendation[profileId] = recommendation;
  saveStore(store);

  return recommendation;
}

function listTrainingGaps(args) {
  const profileId = args.profile_id;
  if (!profileId) throw new Error("profile_id is required");

  const store = loadStore();
  const history = store.daily[profileId] || [];
  if (!history.length) throw new Error("No daily metrics found.");

  const targetDate = args.date || history[history.length - 1].date;
  const gapData = detectGaps(history, targetDate);

  return {
    profile_id: profileId,
    date: targetDate,
    ...gapData
  };
}

async function chatFollowup(args) {
  const profileId = args.profile_id;
  const question = String(args.question || "").trim();
  if (!profileId) throw new Error("profile_id is required");
  if (!question) throw new Error("question is required");

  const store = loadStore();
  const rec = store.lastRecommendation[profileId];
  if (!rec) throw new Error("No last recommendation found. Call recommend_today first.");

  const llmFollowup = await answerFollowupWithLMStudio(question, rec);
  const provider = llmFollowup.ok ? "lm_studio" : "rules";

  return {
    answer: llmFollowup.ok ? llmFollowup.text : followUp(question, rec),
    recommendation_type: rec.recommendation_type,
    state: rec.state,
    response_provider: provider,
    llm_model: provider === "lm_studio" ? LM_STUDIO_MODEL : null,
    llm_error: !llmFollowup.ok && lmStudioEnabled() ? llmFollowup.error : null
  };
}

function savePlannedActivities(args) {
  const profileId = String(args.profile_id || "").trim();
  if (!profileId) throw new Error("profile_id is required");

  const planned = Array.isArray(args.planned) ? args.planned : [];
  if (!planned.length) throw new Error("planned must include at least one item");

  const store = loadStore();
  if (!store.profiles[profileId]) throw new Error(`Profile not found: ${profileId}`);
  if (!store.planned[profileId]) store.planned[profileId] = [];

  const existing = store.planned[profileId];
  planned.forEach((item, idx) => {
    const normalized = normalizePlannedItem(item, idx);
    const pos = existing.findIndex((p) => p.event_id === normalized.event_id);
    if (pos >= 0) existing[pos] = normalized;
    else existing.push(normalized);
  });

  existing.sort((a, b) => {
    const aDate = eventDateForSort(a) || "9999-12-31";
    const bDate = eventDateForSort(b) || "9999-12-31";
    return aDate < bDate ? -1 : 1;
  });

  store.planned[profileId] = existing;
  saveStore(store);

  return {
    profile_id: profileId,
    saved: planned.length,
    total_planned: existing.length,
    planned: existing
  };
}

function listPlannedActivities(args) {
  const profileId = String(args.profile_id || "").trim();
  if (!profileId) throw new Error("profile_id is required");

  const fromDate = asISODateOrNull(args.from_date);
  const toDate = asISODateOrNull(args.to_date);

  const store = loadStore();
  const planned = (store.planned[profileId] || []).filter((item) => {
    const date = eventDateForSort(item);
    if (!date) return !fromDate && !toDate;
    if (fromDate && date < fromDate) return false;
    if (toDate && date > toDate) return false;
    return true;
  });

  return {
    profile_id: profileId,
    count: planned.length,
    planned
  };
}

async function getWeatherForecast(args) {
  const resolved = resolveWeatherLocation(args);
  const days = clamp(asNumberOr(args.days, 7), 1, 14);
  const startDate = asISODateOrNull(args.start_date) || toISODate(new Date());
  const forecast = await fetchWeatherForecast(resolved.latitude, resolved.longitude, startDate, days);

  return {
    location: resolved,
    forecast
  };
}

async function weeklySuggestions(args) {
  const profileId = String(args.profile_id || "").trim();
  if (!profileId) throw new Error("profile_id is required");

  const includeWeather = args.include_weather !== false;
  const startDate = asISODateOrNull(args.start_date) || toISODate(new Date());

  const store = loadStore();
  const profile = store.profiles[profileId];
  if (!profile) throw new Error(`Profile not found: ${profileId}`);

  const history = store.daily[profileId] || [];
  const planned = store.planned[profileId] || [];

  let weather = null;
  let weatherError = null;
  if (includeWeather) {
    const loc = normalizeLocation(profile.location);
    if (isNumber(loc.latitude) && isNumber(loc.longitude)) {
      try {
        weather = await fetchWeatherForecast(loc.latitude, loc.longitude, startDate, 7);
      } catch (error) {
        weatherError = error.message;
      }
    }
  }

  const result = buildWeeklySuggestions(profile, history, planned, startDate, weather);
  return {
    profile_id: profileId,
    start_date: startDate,
    pending_profile_fields: getMissingProfileFields(profile),
    weather_used: Boolean(weather),
    weather_error: weatherError,
    ...result
  };
}

async function agentChat(args) {
  const profileId = String(args.profile_id || "").trim();
  const message = String(args.message || "").trim();
  if (!profileId) throw new Error("profile_id is required");
  if (!message) throw new Error("message is required");

  const includeWeather = args.include_weather !== false;
  const startDate = asISODateOrNull(args.start_date) || toISODate(new Date());

  const store = loadStore();
  const profile = store.profiles[profileId];
  if (!profile) throw new Error(`Profile not found: ${profileId}`);

  const history = store.daily[profileId] || [];
  const planned = store.planned[profileId] || [];
  const lastRecommendation = store.lastRecommendation[profileId] || null;
  const priorTurns = Array.isArray(store.agentMemory[profileId]) ? store.agentMemory[profileId] : [];
  const intakeStatus = getToKnowStatus(profile);

  let weather = null;
  if (includeWeather) {
    const loc = normalizeLocation(profile.location);
    if (isNumber(loc.latitude) && isNumber(loc.longitude)) {
      try {
        weather = await fetchWeatherForecast(loc.latitude, loc.longitude, startDate, 7);
      } catch (_error) {
        weather = null;
      }
    }
  }

  const weekly = buildWeeklySuggestions(profile, history, planned, startDate, weather);
  const context = {
    profile: summarizeProfileForAgent(profile),
    missing_profile_fields: getMissingProfileFields(profile),
    intake_status: intakeStatus,
    next_get_to_know_questions: intakeStatus.missing_questions.slice(0, 6),
    latest_metrics: summarizeRecentMetrics(history),
    weekly_summary: weekly.summary,
    weekly_suggestions: weekly.suggestions,
    planned_events: planned.slice(0, 20),
    last_recommendation: lastRecommendation,
    weather_summary: summarizeWeather(weather)
  };

  const nextTurns = [...priorTurns.slice(-10), { role: "user", content: message }];
  const llm = await answerAgentChatWithLMStudio(nextTurns, context);

  const answer = llm.ok ? llm.text : agentFallback(message, context);
  nextTurns.push({ role: "assistant", content: answer });

  store.agentMemory[profileId] = nextTurns.slice(-20);
  saveStore(store);

  return {
    answer,
    response_provider: llm.ok ? "lm_studio" : "rules",
    llm_model: llm.ok ? LM_STUDIO_MODEL : null,
    llm_error: !llm.ok && lmStudioEnabled() ? llm.error : null,
    pending_profile_fields: context.missing_profile_fields,
    intake_completion: context.intake_status,
    used_weather: Boolean(weather)
  };
}

function normalizeDaily(input) {
  const activities = Array.isArray(input.activities) ? input.activities : [];
  return {
    profile_id: input.profile_id,
    date: input.date,
    source: {
      type: (input.source && input.source.type) || "manual",
      artifacts: asArray(input.source && input.source.artifacts),
      extraction_confidence_0_1: asNullableNumber(input.source && input.source.extraction_confidence_0_1)
    },
    readiness: {
      garmin_training_readiness: asNullableNumber(input.readiness && input.readiness.garmin_training_readiness),
      training_status_label: String((input.readiness && input.readiness.training_status_label) || "").trim(),
      acute_load: asNullableNumber(input.readiness && input.readiness.acute_load),
      chronic_load: asNullableNumber(input.readiness && input.readiness.chronic_load),
      load_ratio: asNullableNumber(input.readiness && input.readiness.load_ratio)
    },
    recovery_signals: {
      resting_hr_bpm: asNullableNumber(input.recovery_signals && input.recovery_signals.resting_hr_bpm),
      hrv_ms: asNullableNumber(input.recovery_signals && input.recovery_signals.hrv_ms),
      sleep_hours: asNullableNumber(input.recovery_signals && input.recovery_signals.sleep_hours),
      stress_score: asNullableNumber(input.recovery_signals && input.recovery_signals.stress_score)
    },
    subjective: {
      pain_0_10: asNumberOr(input.subjective && input.subjective.pain_0_10, 0),
      fatigue_0_10: asNumberOr(input.subjective && input.subjective.fatigue_0_10, 3),
      soreness_0_10: asNumberOr(input.subjective && input.subjective.soreness_0_10, 3),
      illness_symptoms: Boolean(input.subjective && input.subjective.illness_symptoms),
      notes: String((input.subjective && input.subjective.notes) || "").trim()
    },
    activities: activities.map((a) => ({
      sport: String(a.sport || "other"),
      duration_min: asNumberOr(a.duration_min, 0),
      exercise_load: asNullableNumber(a.exercise_load),
      avg_hr_bpm: asNullableNumber(a.avg_hr_bpm),
      max_hr_bpm: asNullableNumber(a.max_hr_bpm),
      training_effect_aerobic: asNullableNumber(a.training_effect_aerobic),
      training_effect_anaerobic: asNullableNumber(a.training_effect_anaerobic),
      hr_zone_minutes: {
        z1: asNumberOr(a.hr_zone_minutes && a.hr_zone_minutes.z1, 0),
        z2: asNumberOr(a.hr_zone_minutes && a.hr_zone_minutes.z2, 0),
        z3: asNumberOr(a.hr_zone_minutes && a.hr_zone_minutes.z3, 0),
        z4: asNumberOr(a.hr_zone_minutes && a.hr_zone_minutes.z4, 0),
        z5: asNumberOr(a.hr_zone_minutes && a.hr_zone_minutes.z5, 0)
      },
      power_zone_minutes: a.power_zone_minutes
        ? {
            z1: asNumberOr(a.power_zone_minutes.z1, 0),
            z2: asNumberOr(a.power_zone_minutes.z2, 0),
            z3: asNumberOr(a.power_zone_minutes.z3, 0),
            z4: asNumberOr(a.power_zone_minutes.z4, 0),
            z5: asNumberOr(a.power_zone_minutes.z5, 0),
            z6: asNumberOr(a.power_zone_minutes.z6, 0),
            z7: asNumberOr(a.power_zone_minutes.z7, 0)
          }
        : null
    }))
  };
}

function normalizePlannedItem(item, idx) {
  if (!item || typeof item !== "object") throw new Error("planned item must be an object");
  const title = String(item.title || "").trim();
  const sport = String(item.sport || "").trim();
  if (!title) throw new Error(`planned[${idx}] title is required`);
  if (!sport) throw new Error(`planned[${idx}] sport is required`);

  const typeRaw = String(item.type || "session").trim().toLowerCase();
  const type = ["session", "event", "race"].includes(typeRaw) ? typeRaw : "session";
  const eventId = String(item.event_id || "").trim() || buildEventId(title, item.date || item.start_date || "");

  return {
    event_id: eventId,
    title,
    sport,
    type,
    date: asISODateOrNull(item.date),
    start_date: asISODateOrNull(item.start_date),
    end_date: asISODateOrNull(item.end_date),
    expected_duration_min: asNullableNumber(item.expected_duration_min),
    priority: normalizePriority(item.priority),
    notes: String(item.notes || "").trim()
  };
}

function normalizePriority(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["low", "medium", "high", "a"].includes(raw)) return raw;
  return "medium";
}

function eventDateForSort(item) {
  return item.date || item.start_date || item.end_date || null;
}

function buildEventId(title, date) {
  const slug = String(title || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const stamp = String(date || "").trim() || toISODate(new Date());
  return `${slug || "event"}-${stamp}`;
}

function normalizeWeeklySchedule(schedule) {
  if (!schedule || typeof schedule !== "object") return {};
  const out = {};
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  days.forEach((day) => {
    const src = schedule[day];
    if (src && typeof src === "object") {
      out[day] = {
        available: src.available !== false,
        minutes: asNullableNumber(src.minutes),
        preferred_sports: asArray(src.preferred_sports)
      };
    }
  });
  return out;
}

function normalizeLocation(location) {
  if (!location || typeof location !== "object") {
    return {
      label: "",
      latitude: null,
      longitude: null,
      timezone: ""
    };
  }

  return {
    label: String(location.label || "").trim(),
    latitude: asNullableNumber(location.latitude),
    longitude: asNullableNumber(location.longitude),
    timezone: String(location.timezone || "").trim()
  };
}

function asArrayOrCsv(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
  const text = String(value || "").trim();
  if (!text) return [];
  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeSportName(value) {
  const raw = String(value || "").trim().toLowerCase();
  const map = {
    running: "run",
    run: "run",
    trail_running: "run",
    treadmill: "run",
    cycling: "bike",
    biking: "bike",
    mtb: "bike",
    mountain_bike: "bike",
    swimming: "swim",
    swim: "swim",
    walking: "walk",
    hiking: "walk",
    strength_training: "strength",
    gym: "strength",
    yoga: "yoga",
    hiit: "hiit"
  };
  if (map[raw]) return map[raw];
  if (["run", "bike", "swim", "strength", "yoga", "hiit", "walk", "other"].includes(raw)) return raw;
  return "other";
}

function normalizeSportsList(value) {
  return [...new Set(asArrayOrCsv(value).map((item) => normalizeSportName(item)))];
}

function normalizePreferredTrainingTime(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["am", "pm", "either"].includes(raw)) return raw;
  return "either";
}

function normalizeIntake(input) {
  const src = input && typeof input === "object" ? input : {};
  return {
    training_background: String(src.training_background || "").trim(),
    current_weekly_volume_min: asNullableNumber(src.current_weekly_volume_min),
    primary_limiters: asArrayOrCsv(src.primary_limiters),
    motivations_detail: String(src.motivations_detail || "").trim(),
    lifestyle_notes: String(src.lifestyle_notes || "").trim(),
    work_schedule: String(src.work_schedule || "").trim(),
    sleep_target_hours: asNullableNumber(src.sleep_target_hours),
    stress_level_0_10: asNullableNumber(src.stress_level_0_10),
    preferred_long_session_day: String(src.preferred_long_session_day || "").trim(),
    indoor_outdoor_preference: String(src.indoor_outdoor_preference || "").trim(),
    race_goals: asArrayOrCsv(src.race_goals),
    confidence_areas: asArrayOrCsv(src.confidence_areas),
    support_system: String(src.support_system || "").trim(),
    nutrition_notes: String(src.nutrition_notes || "").trim()
  };
}

function getToKnowStatus(profile) {
  const questions = buildGetToKnowQuestions(profile);
  const missing = questions.filter((q) => q.missing);
  const completed = questions.filter((q) => !q.missing);
  const total = questions.length || 1;
  const completionPct = round((completed.length / total) * 100, 1);

  return {
    total_questions: total,
    completion_pct: completionPct,
    completed_count: completed.length,
    missing_count: missing.length,
    completed_topics: [...new Set(completed.map((q) => q.topic))],
    missing_topics: [...new Set(missing.map((q) => q.topic))],
    missing_question_ids: missing.map((q) => q.id),
    missing_questions: missing.map((q) => ({
      id: q.id,
      topic: q.topic,
      prompt: q.prompt,
      why: q.why,
      expected_answer_key: q.expected_answer_key
    }))
  };
}

function buildGetToKnowQuestions(profile) {
  const p = profile || {};
  const access = p.access || {};
  const availability = p.availability || {};
  const intake = normalizeIntake(p.intake || {});
  const injuries = Array.isArray(p.injuries_conditions) ? p.injuries_conditions : [];
  const location = normalizeLocation(p.location);
  const weeklySchedule = availability.weekly_schedule || {};

  return [
    {
      id: "goals",
      topic: "goals",
      prompt: "What are your top goals for the next 3-6 months?",
      why: "Weekly plan direction depends on objective priorities.",
      expected_answer_key: "goals",
      missing: !asArray(p.goals).length
    },
    {
      id: "motivations",
      topic: "motivation",
      prompt: "What motivates you most to train consistently?",
      why: "Motivation cues improve adherence when plans are adjusted.",
      expected_answer_key: "motivations",
      missing: !asArray(p.motivations).length
    },
    {
      id: "constraints",
      topic: "constraints",
      prompt: "What schedule/life constraints should be respected every week?",
      why: "Constraints are required for realistic training prescriptions.",
      expected_answer_key: "constraints",
      missing: !asArray(p.constraints).length
    },
    {
      id: "favorite_sports",
      topic: "sports",
      prompt: "Which sports should your plan prioritize?",
      why: "Sport mix drives session type selection and progression.",
      expected_answer_key: "favorite_sports",
      missing: !asArray(p.favorite_sports).length
    },
    {
      id: "equipment",
      topic: "access",
      prompt: "What equipment do you have access to?",
      why: "Session options depend on available equipment.",
      expected_answer_key: "equipment",
      missing: !asArray(access.equipment).length
    },
    {
      id: "facilities",
      topic: "access",
      prompt: "What facilities can you use (gym, pool, trails, track, etc.)?",
      why: "Facility constraints affect weekly suggestions.",
      expected_answer_key: "facilities",
      missing: !asArray(access.facilities).length
    },
    {
      id: "days_per_week",
      topic: "availability",
      prompt: "How many days per week can you realistically train?",
      why: "Training frequency defines recovery spacing.",
      expected_answer_key: "days_per_week",
      missing: !isNumber(asNullableNumber(access.days_per_week))
    },
    {
      id: "minutes_per_session",
      topic: "availability",
      prompt: "What is your typical session duration on workdays?",
      why: "Duration capacity sets daily load targets.",
      expected_answer_key: "minutes_per_session",
      missing: !isNumber(asNullableNumber(access.minutes_per_session))
    },
    {
      id: "weekly_minutes_target",
      topic: "availability",
      prompt: "What total weekly training minutes are feasible?",
      why: "Used as the weekly planning budget.",
      expected_answer_key: "weekly_minutes_target",
      missing: !isNumber(asNullableNumber(availability.weekly_minutes_target))
    },
    {
      id: "weekly_schedule",
      topic: "availability",
      prompt: "Which specific days are unavailable or ideal for long sessions?",
      why: "Day-level availability improves scheduling quality.",
      expected_answer_key: "weekly_schedule",
      missing: !weeklySchedule || !Object.keys(weeklySchedule).length
    },
    {
      id: "injuries_conditions",
      topic: "health",
      prompt: "Any injuries/conditions and movement contraindications to protect?",
      why: "Safety guardrails depend on known constraints.",
      expected_answer_key: "injuries_conditions",
      missing: !injuries.length
    },
    {
      id: "location",
      topic: "environment",
      prompt: "What is your primary training location (city/lat-lon)?",
      why: "Needed for weather-aware outdoor planning.",
      expected_answer_key: "location",
      missing: !isNumber(location.latitude) || !isNumber(location.longitude)
    },
    {
      id: "training_background",
      topic: "background",
      prompt: "What is your training background and recent consistency?",
      why: "Progression aggressiveness depends on training history.",
      expected_answer_key: "intake.training_background",
      missing: !String(intake.training_background || "").trim()
    },
    {
      id: "current_weekly_volume_min",
      topic: "background",
      prompt: "What is your current average weekly training volume (minutes)?",
      why: "Used to ramp load safely.",
      expected_answer_key: "intake.current_weekly_volume_min",
      missing: !isNumber(asNullableNumber(intake.current_weekly_volume_min))
    },
    {
      id: "primary_limiters",
      topic: "background",
      prompt: "What are your primary performance limiters right now?",
      why: "Sessions should target limiters directly.",
      expected_answer_key: "intake.primary_limiters",
      missing: !asArray(intake.primary_limiters).length
    },
    {
      id: "sleep_target_hours",
      topic: "recovery",
      prompt: "What sleep target can you commit to on most nights?",
      why: "Recovery recommendations depend on sleep constraints.",
      expected_answer_key: "intake.sleep_target_hours",
      missing: !isNumber(asNullableNumber(intake.sleep_target_hours))
    },
    {
      id: "race_goals",
      topic: "events",
      prompt: "Which planned events/races matter most this season?",
      why: "Prioritizes event-specific phases and taper timing.",
      expected_answer_key: "intake.race_goals",
      missing: !asArray(intake.race_goals).length
    },
    {
      id: "support_system",
      topic: "lifestyle",
      prompt: "Who/what helps you stay consistent (partner, group, coach, gym class)?",
      why: "Support patterns improve long-term adherence planning.",
      expected_answer_key: "intake.support_system",
      missing: !String(intake.support_system || "").trim()
    }
  ];
}

function resolveWeatherLocation(args) {
  const latitude = asNullableNumber(args.latitude);
  const longitude = asNullableNumber(args.longitude);
  if (isNumber(latitude) && isNumber(longitude)) {
    return {
      label: "",
      latitude,
      longitude,
      timezone: ""
    };
  }

  const profileId = String(args.profile_id || "").trim();
  if (!profileId) {
    throw new Error("Provide either latitude/longitude or profile_id with location.");
  }

  const store = loadStore();
  const profile = store.profiles[profileId];
  if (!profile) throw new Error(`Profile not found: ${profileId}`);
  const location = normalizeLocation(profile.location);
  if (!isNumber(location.latitude) || !isNumber(location.longitude)) {
    throw new Error("Profile location must include numeric latitude and longitude.");
  }
  return location;
}

async function fetchWeatherForecast(latitude, longitude, startDate, days) {
  if (typeof fetch !== "function") throw new Error("Global fetch is unavailable. Use Node 18+.");

  const start = asISODateOrNull(startDate) || toISODate(new Date());
  const end = toISODate(addDays(start, days - 1));
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    timezone: "auto",
    start_date: start,
    end_date: end,
    daily: [
      "weathercode",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_probability_max",
      "windspeed_10m_max"
    ].join(",")
  });

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), 9000) : null;
  try {
    const response = await fetch(`${OPEN_METEO_BASE_URL}?${params.toString()}`, {
      signal: controller ? controller.signal : undefined
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Weather API error (${response.status}): ${text.slice(0, 200)}`);
    }
    const payload = await response.json();
    return normalizeWeatherPayload(payload);
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("Weather request timed out.");
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function normalizeWeatherPayload(payload) {
  const daily = payload && payload.daily ? payload.daily : {};
  const times = Array.isArray(daily.time) ? daily.time : [];
  const codes = Array.isArray(daily.weathercode) ? daily.weathercode : [];
  const maxTemps = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : [];
  const minTemps = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : [];
  const precip = Array.isArray(daily.precipitation_probability_max) ? daily.precipitation_probability_max : [];
  const wind = Array.isArray(daily.windspeed_10m_max) ? daily.windspeed_10m_max : [];

  const days = times.map((date, idx) => ({
    date,
    weather_code: asNullableNumber(codes[idx]),
    max_temp_c: asNullableNumber(maxTemps[idx]),
    min_temp_c: asNullableNumber(minTemps[idx]),
    precipitation_probability_max: asNullableNumber(precip[idx]),
    windspeed_max_kmh: asNullableNumber(wind[idx]),
    summary: summarizeWeatherCode(codes[idx])
  }));

  return {
    timezone: payload.timezone || "auto",
    elevation: asNullableNumber(payload.elevation),
    daily: days
  };
}

function summarizeWeatherCode(code) {
  const n = asNumberOr(code, -1);
  if (n === 0) return "clear";
  if ([1, 2, 3].includes(n)) return "partly_cloudy";
  if ([45, 48].includes(n)) return "fog";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(n)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(n)) return "snow";
  if ([95, 96, 99].includes(n)) return "storm";
  return "mixed";
}

function buildWeeklySuggestions(profile, history, planned, startDate, weather) {
  const start = asISODateOrNull(startDate) || toISODate(new Date());
  const latestDate = history.length ? history[history.length - 1].date : null;
  const targetDate = latestDate || start;
  const gapData = history.length ? detectGaps(history, targetDate) : { gaps: [], mix: {} };
  const weeklyTarget = resolveWeeklyMinutesTarget(profile);
  const dayDates = Array.from({ length: 7 }, (_x, idx) => toISODate(addDays(start, idx)));
  const plannedByDate = indexPlannedByDate(planned);
  const weatherByDate = indexWeatherByDate(weather);
  const eventsUpcoming = getUpcomingEvents(planned, start, 180);
  const raceFocus = eventsUpcoming.find((item) => item.type === "race");
  const daysToRace = raceFocus ? daysBetween(start, eventDateForSort(raceFocus)) : null;

  const suggestions = [];
  let usedMinutes = 0;
  const minutesDefault = asNumberOr(profile.access && profile.access.minutes_per_session, 45);
  const perDayBudget = Math.max(20, Math.round(weeklyTarget / Math.max(1, asNumberOr(profile.access && profile.access.days_per_week, 5))));

  dayDates.forEach((date, idx) => {
    const dayOfWeek = dayName(date);
    const weatherDay = weatherByDate[date] || null;
    const plannedItems = plannedByDate[date] || [];
    const schedule = getDayAvailability(profile, dayOfWeek);
    const recommendationType = chooseWeeklyRecommendationType(idx, gapData, daysToRace, plannedItems, suggestions);
    const sport = chooseWeeklySport(profile, recommendationType, plannedItems);
    const duration = resolveDayDuration(schedule, perDayBudget, minutesDefault, recommendationType, weeklyTarget, usedMinutes);
    const weatherAdjusted = applyWeatherAdjustment(recommendationType, sport, duration, weatherDay, profile);

    usedMinutes += weatherAdjusted.duration_min;
    suggestions.push({
      date,
      day: dayOfWeek,
      recommendation_type: weatherAdjusted.recommendation_type,
      sport: weatherAdjusted.sport,
      duration_min: weatherAdjusted.duration_min,
      intensity: weatherAdjusted.intensity,
      weather_adjustment: weatherAdjusted.weather_adjustment,
      planned_items: plannedItems,
      rationale: buildWeeklyRationale(gapData, plannedItems, daysToRace, date, weatherAdjusted)
    });
  });

  return {
    summary: {
      weekly_target_min: weeklyTarget,
      suggested_total_min: suggestions.reduce((sum, s) => sum + s.duration_min, 0),
      focus: inferWeeklyFocus(profile, gapData, daysToRace),
      days_to_priority_race: daysToRace
    },
    suggestions
  };
}

function resolveWeeklyMinutesTarget(profile) {
  const explicit = asNullableNumber(profile.availability && profile.availability.weekly_minutes_target);
  if (isNumber(explicit) && explicit > 0) return Math.round(explicit);

  const days = asNumberOr(profile.access && profile.access.days_per_week, 5);
  const mins = asNumberOr(profile.access && profile.access.minutes_per_session, 45);
  return Math.round(days * mins);
}

function indexPlannedByDate(planned) {
  const byDate = {};
  planned.forEach((item) => {
    const date = eventDateForSort(item);
    if (!date) return;
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(item);
  });
  return byDate;
}

function indexWeatherByDate(weather) {
  if (!weather || !Array.isArray(weather.daily)) return {};
  return weather.daily.reduce((acc, day) => {
    if (day && day.date) acc[day.date] = day;
    return acc;
  }, {});
}

function getUpcomingEvents(planned, startDate, windowDays) {
  return planned.filter((item) => {
    const date = eventDateForSort(item);
    if (!date) return false;
    const delta = daysBetween(startDate, date);
    return delta >= 0 && delta <= windowDays;
  });
}

function chooseWeeklyRecommendationType(index, gapData, daysToRace, plannedItems, priorSuggestions) {
  if (plannedItems.some((p) => p.type === "race")) return "taper";
  if (plannedItems.some((p) => p.type === "event")) return "event_specific";

  if (isNumber(daysToRace) && daysToRace <= 7) {
    if (index >= 5) return "taper";
    return index === 2 ? "tempo_threshold" : "easy_aerobic";
  }

  const highGap = gapData.gaps.some((g) => g.gap_type === "too_much_high_intensity");
  if (highGap && (index === 2 || index === 4)) return "easy_aerobic";

  if (index === 1 || index === 4) return "quality";
  if (index === 5) return "long_endurance";

  const recentRecovery = priorSuggestions.filter((s) => s.recommendation_type === "recover").length;
  if (recentRecovery === 0 && index === 3) return "recover";
  return "easy_aerobic";
}

function chooseWeeklySport(profile, recommendationType, plannedItems) {
  if (plannedItems.length && plannedItems[0].sport) return plannedItems[0].sport;
  const sports = asArray(profile.favorite_sports);
  if (!sports.length) return "bike";
  if (recommendationType === "recover") return sports.find((s) => ["yoga", "walk", "swim"].includes(s)) || sports[0];
  if (recommendationType === "long_endurance") return sports.find((s) => ["run", "bike", "swim"].includes(s)) || sports[0];
  if (recommendationType === "quality") return sports.find((s) => ["run", "bike"].includes(s)) || sports[0];
  return sports[0];
}

function getDayAvailability(profile, day) {
  const key = day.slice(0, 3).toLowerCase();
  const schedule = (profile.availability && profile.availability.weekly_schedule) || {};
  const raw = schedule[key];
  if (!raw || typeof raw !== "object") return { available: true, minutes: null, preferred_sports: [] };
  return {
    available: raw.available !== false,
    minutes: asNullableNumber(raw.minutes),
    preferred_sports: asArray(raw.preferred_sports)
  };
}

function resolveDayDuration(schedule, perDayBudget, defaultMinutes, recommendationType, weeklyTarget, usedMinutes) {
  if (schedule.available === false) return 0;
  let base = isNumber(schedule.minutes) ? schedule.minutes : perDayBudget;
  if (recommendationType === "recover") base = Math.min(base, 30);
  if (recommendationType === "long_endurance") base = Math.max(base, Math.min(150, defaultMinutes + 30));
  if (recommendationType === "taper") base = Math.min(base, 35);
  const remaining = Math.max(0, weeklyTarget - usedMinutes);
  return Math.round(clamp(base, 0, remaining));
}

function applyWeatherAdjustment(recommendationType, sport, duration, weatherDay, profile) {
  let type = recommendationType;
  let chosenSport = sport;
  let intensity = "easy";
  let adjustment = null;

  if (["quality", "tempo_threshold"].includes(type)) intensity = "hard";
  if (["recover", "taper"].includes(type)) intensity = "very_easy";
  if (type === "long_endurance") intensity = "moderate";

  if (type === "quality") type = "tempo_threshold";
  if (type === "event_specific") type = "specific_prep";

  const indoorFallback = chooseIndoorFallbackSport(profile);
  if (weatherDay && isOutdoorSport(chosenSport) && shouldMoveIndoors(weatherDay)) {
    adjustment = `Moved indoors due to weather (${weatherDay.summary}, precip ${weatherDay.precipitation_probability_max ?? "n/a"}%).`;
    chosenSport = indoorFallback || chosenSport;
    if (type === "long_endurance") type = "easy_aerobic";
  }

  return {
    recommendation_type: type,
    sport: chosenSport,
    duration_min: Math.max(0, Math.round(duration)),
    intensity,
    weather_adjustment: adjustment
  };
}

function chooseIndoorFallbackSport(profile) {
  const equipment = asArray(profile.access && profile.access.equipment).map((x) => String(x).toLowerCase());
  if (equipment.some((x) => x.includes("trainer") || x.includes("bike"))) return "bike";
  if (equipment.some((x) => x.includes("treadmill"))) return "run";
  if (equipment.some((x) => x.includes("gym"))) return "strength";
  const sports = asArray(profile.favorite_sports);
  return sports.find((s) => ["bike", "strength", "swim", "yoga"].includes(s)) || "strength";
}

function shouldMoveIndoors(weatherDay) {
  const precip = asNullableNumber(weatherDay.precipitation_probability_max);
  const wind = asNullableNumber(weatherDay.windspeed_max_kmh);
  const maxTemp = asNullableNumber(weatherDay.max_temp_c);
  const summary = String(weatherDay.summary || "");

  if (summary === "storm") return true;
  if (isNumber(precip) && precip >= 65) return true;
  if (isNumber(wind) && wind >= 35) return true;
  if (isNumber(maxTemp) && (maxTemp <= -5 || maxTemp >= 35)) return true;
  return false;
}

function isOutdoorSport(sport) {
  return ["run", "bike", "walk", "mtb", "trail_run"].includes(String(sport).toLowerCase());
}

function buildWeeklyRationale(gapData, plannedItems, daysToRace, date, suggestion) {
  const parts = [];
  if (plannedItems.length) {
    parts.push(`Linked to planned: ${plannedItems.map((p) => p.title).join(", ")}`);
  }
  if (isNumber(daysToRace)) {
    if (daysToRace <= 14) parts.push("Race/event taper progression");
    else if (daysToRace <= 60) parts.push("Race/event build phase");
  }
  if (gapData.gaps.some((g) => g.gap_type === "low_aerobic_missing")) {
    parts.push("Building aerobic base from recent intensity mix");
  }
  if (suggestion.weather_adjustment) parts.push(suggestion.weather_adjustment);
  if (!parts.length) parts.push(`Balanced progression for ${date}`);
  return parts.join(". ");
}

function inferWeeklyFocus(profile, gapData, daysToRace) {
  if (isNumber(daysToRace) && daysToRace <= 14) return "taper";
  if (gapData.gaps.some((g) => g.gap_type === "low_aerobic_missing")) return "aerobic_base";
  if (asArray(profile.goals).some((g) => String(g).toLowerCase().includes("race"))) return "specific_prep";
  return "balanced";
}

function dayName(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

function summarizeProfileForAgent(profile) {
  return {
    goals: asArray(profile.goals),
    motivations: asArray(profile.motivations),
    constraints: asArray(profile.constraints),
    favorite_sports: asArray(profile.favorite_sports),
    access: profile.access || {},
    availability: profile.availability || {},
    injuries_conditions: asArray(profile.injuries_conditions)
  };
}

function summarizeRecentMetrics(history) {
  const recent = history.slice(-14);
  const latest = recent.length ? recent[recent.length - 1] : null;
  return {
    days_with_data: recent.length,
    latest_date: latest ? latest.date : null,
    avg_sleep_hours_7d: avg(recent.slice(-7).map((d) => d.recovery_signals.sleep_hours)),
    avg_hrv_7d: avg(recent.slice(-7).map((d) => d.recovery_signals.hrv_ms)),
    total_duration_7d: recent.slice(-7).reduce((sum, d) => sum + d.activities.reduce((x, a) => x + (a.duration_min || 0), 0), 0)
  };
}

function summarizeWeather(weather) {
  if (!weather || !Array.isArray(weather.daily)) return null;
  const next3 = weather.daily.slice(0, 3);
  return next3.map((d) => ({
    date: d.date,
    summary: d.summary,
    precip_pct: d.precipitation_probability_max,
    max_temp_c: d.max_temp_c,
    wind_kmh: d.windspeed_max_kmh
  }));
}

function getMissingProfileFields(profile) {
  const status = getToKnowStatus(profile);
  return [...new Set(status.missing_question_ids)];
}

function agentFallback(message, context) {
  const q = message.toLowerCase();
  const intake = context.intake_status || { completion_pct: 0, missing_questions: [] };
  if ((intake.completion_pct || 0) < 80) {
    const questions = (context.next_get_to_know_questions || []).slice(0, 3);
    if (questions.length) {
      return [
        `Before specific prescriptions, intake is ${intake.completion_pct}% complete.`,
        "Please answer these first:",
        ...questions.map((item) => `- ${item.prompt} (key: ${item.expected_answer_key})`)
      ].join("\n");
    }
  }
  if (q.includes("weekly") || q.includes("plan")) {
    return formatWeeklyPlanText(context.weekly_suggestions);
  }
  if (q.includes("weather")) {
    if (!context.weather_summary) return "Weather forecast is unavailable. Add profile location (lat/lon) to enable weather-aware planning.";
    return `Next forecast window:\n${context.weather_summary
      .map((d) => `- ${d.date}: ${d.summary}, precip ${d.precip_pct ?? "n/a"}%, wind ${d.wind_kmh ?? "n/a"} km/h`)
      .join("\n")}`;
  }
  if (q.includes("missing") || q.includes("profile")) {
    if (!context.missing_profile_fields.length) return "Profile intake is complete enough for planning.";
    const questions = (context.next_get_to_know_questions || []).slice(0, 3);
    if (!questions.length) return `Please fill these profile fields: ${context.missing_profile_fields.join(", ")}.`;
    return [
      `Intake completion: ${intake.completion_pct}%`,
      "Please answer these to improve plan quality:",
      ...questions.map((item) => `- ${item.prompt} (key: ${item.expected_answer_key})`)
    ].join("\n");
  }
  return [
    "I can help with profile intake, weekly plan updates, and event-specific preparation.",
    context.missing_profile_fields.length
      ? `Still needed: ${context.missing_profile_fields.join(", ")}.`
      : "Profile intake is mostly complete."
  ].join(" ");
}

function formatWeeklyPlanText(suggestions) {
  if (!Array.isArray(suggestions) || !suggestions.length) return "No weekly suggestions available yet.";
  return suggestions
    .map(
      (s) =>
        `${s.day} ${s.date}: ${s.recommendation_type} ${s.sport} ${s.duration_min}min (${s.intensity})` +
        (s.weather_adjustment ? ` - ${s.weather_adjustment}` : "")
    )
    .join("\n");
}

function generateRecommendation(profile, history, today) {
  const scoreData = scoreRecovery(profile, history, today);
  const gapData = detectGaps(history, today.date);
  const workoutData = chooseWorkout(profile, today, scoreData, gapData);

  const confidence = computeConfidence(today, scoreData.completeness);

  return {
    profile_id: profile.profile_id,
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
      "Share pain/fatigue/soreness before next session.",
      "Mention schedule constraints for tomorrow."
    ],
    debug: {
      hard_days_last_48h: scoreData.hardDays48h,
      intensity_mix_14d: gapData.mix
    }
  };
}

function scoreRecovery(profile, history, today) {
  const prior = history.filter((d) => d.date !== today.date);
  const baselineHRV =
    asNullableNumber(profile.baselines && profile.baselines.hrv_ms_7d) ?? avg(prior.map((d) => d.recovery_signals.hrv_ms));
  const baselineRHR =
    asNullableNumber(profile.baselines && profile.baselines.resting_hr_bpm_14d) ??
    avg(prior.map((d) => d.recovery_signals.resting_hr_bpm));

  let score = 0;
  const reasons = [];
  const flags = [];
  let completeness = 0;

  const readiness = today.readiness.garmin_training_readiness;
  if (isNumber(readiness)) {
    completeness += 1;
    const points = readiness >= 75 ? 2 : readiness >= 55 ? 1 : readiness >= 40 ? 0 : -2;
    score += points;
    reasons.push(reason("readiness", readiness, points));
  }

  const hrv = today.recovery_signals.hrv_ms;
  if (isNumber(hrv) && isNumber(baselineHRV) && baselineHRV > 0) {
    completeness += 1;
    const deltaPct = ((hrv - baselineHRV) / baselineHRV) * 100;
    const points = deltaPct >= 5 ? 1 : deltaPct >= -5 ? 0 : deltaPct >= -12 ? -1 : -2;
    score += points;
    reasons.push(reason("hrv_vs_baseline_pct", round(deltaPct), points));
    if (deltaPct < -10) flags.push("hrv_drop_gt_10pct");
  }

  const restingHr = today.recovery_signals.resting_hr_bpm;
  if (isNumber(restingHr) && isNumber(baselineRHR)) {
    completeness += 1;
    const drift = restingHr - baselineRHR;
    const points = drift <= 2 ? 1 : drift <= 5 ? 0 : drift <= 8 ? -1 : -2;
    score += points;
    reasons.push(reason("resting_hr_drift_bpm", round(drift), points));
    if (drift > 8) flags.push("resting_hr_elevated_gt_8");
  }

  const sleep = today.recovery_signals.sleep_hours;
  if (isNumber(sleep)) {
    completeness += 1;
    const points = sleep >= 7 ? 1 : sleep >= 6 ? 0 : -1;
    score += points;
    reasons.push(reason("sleep_hours", sleep, points));
    if (sleep < 5.5) flags.push("very_low_sleep");
  }

  const stress = today.recovery_signals.stress_score;
  if (isNumber(stress)) {
    completeness += 1;
    const points = stress < 30 ? 1 : stress <= 60 ? 0 : -1;
    score += points;
    reasons.push(reason("stress", stress, points));
  }

  const ratio = today.readiness.load_ratio;
  if (isNumber(ratio)) {
    completeness += 1;
    const points = ratio >= 0.8 && ratio <= 1.3 ? 1 : ratio > 1.5 ? -2 : ratio < 0.7 ? -1 : 0;
    score += points;
    reasons.push(reason("acute_chronic_load_ratio", ratio, points));
    if (ratio > 1.5) flags.push("load_ratio_high");
  }

  const hardDays48h = countHardDays(prior, today.date, 2);
  const hardPoints = hardDays48h === 0 ? 1 : hardDays48h === 1 ? 0 : -2;
  score += hardPoints;
  reasons.push(reason("hard_days_last_48h", hardDays48h, hardPoints));

  const pain = today.subjective.pain_0_10;
  const painPoints = pain >= 7 ? -4 : pain >= 4 ? -2 : 0;
  score += painPoints;
  reasons.push(reason("pain_0_10", pain, painPoints));
  if (pain >= 4) flags.push("pain_4_or_more");

  if (today.subjective.illness_symptoms) {
    score -= 4;
    reasons.push(reason("illness_symptoms", true, -4));
    flags.push("illness_symptoms");
  }

  const forceRecover =
    today.subjective.illness_symptoms || pain >= 7 || (flags.includes("very_low_sleep") && (readiness ?? 100) < 40);

  const hrvDrop = getReasonValue(reasons, "hrv_vs_baseline_pct");
  const hiitBlocked =
    pain >= 4 || hardDays48h >= 2 || ((readiness ?? 50) < 50 && isNumber(hrvDrop) && hrvDrop < -10);

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
  const lookback14 = history.filter((d) => {
    const diff = daysBetween(d.date, todayDate);
    return diff >= 0 && diff <= 13;
  });
  const lookback7 = history.filter((d) => {
    const diff = daysBetween(d.date, todayDate);
    return diff >= 0 && diff <= 6;
  });

  let low = 0;
  let moderate = 0;
  let high = 0;
  let strengthOrMobilityDays = 0;
  const activeDays7 = new Set();

  lookback14.forEach((day) => {
    day.activities.forEach((a) => {
      low += (a.hr_zone_minutes.z1 || 0) + (a.hr_zone_minutes.z2 || 0);
      moderate += a.hr_zone_minutes.z3 || 0;
      high += (a.hr_zone_minutes.z4 || 0) + (a.hr_zone_minutes.z5 || 0);
    });
  });

  lookback7.forEach((day) => {
    let active = false;
    day.activities.forEach((a) => {
      if ((a.duration_min || 0) > 0) active = true;
      if (a.sport === "strength" || a.sport === "yoga") strengthOrMobilityDays += 1;
    });
    if (active) activeDays7.add(day.date);
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

function chooseWorkout(profile, today, scoreData, gapData) {
  let state = scoreData.score <= -3 ? "recover" : scoreData.score >= 3 ? "build" : "maintain";
  if (scoreData.forceRecover) state = "recover";

  const sports = profile.favorite_sports || ["run"];
  const pain = today.subjective.pain_0_10;
  const tooMuchIntensity = gapData.gaps.some((gap) => gap.gap_type === "too_much_high_intensity");
  const lowAerobicMissing = gapData.gaps.some((gap) => gap.gap_type === "low_aerobic_missing");

  let recommendationType = "easy_aerobic";
  if (state === "recover") {
    recommendationType = pain >= 6 || today.subjective.illness_symptoms ? "rest" : "yoga_mobility";
  } else if (state === "maintain") {
    recommendationType = lowAerobicMissing ? "easy_aerobic" : "strength";
  } else {
    recommendationType = scoreData.hiitBlocked || tooMuchIntensity ? "tempo_threshold" : "hiit";
  }

  const chosenSport = pickSport(sports, recommendationType, pain);
  const planA = buildPlanA(recommendationType, chosenSport, profile.access && profile.access.minutes_per_session);
  const planB = buildPlanB(recommendationType, chosenSport);

  return {
    state,
    recommendationType,
    chosenSport,
    planA,
    planB
  };
}

function buildPlanA(type, sport, minutesInput) {
  const minutes = asNumberOr(minutesInput, 45);

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

function formatRuleRecommendation(recommendation) {
  const why = recommendation.why
    .slice(0, 3)
    .map((item) => `- ${item.signal}: ${item.value} (${pointsLabel(item.points)})`)
    .join("\n");
  const gaps = recommendation.gap_findings.length
    ? recommendation.gap_findings.map((gap) => `- ${gap.gap_type}: ${gap.action}`).join("\n")
    : "- No major training gap detected.";

  return [
    `Today: ${recommendation.recommendation_type} (${recommendation.state}, score ${recommendation.recovery_score})`,
    `Why:\n${why}`,
    `Plan A: ${recommendation.plan_a.title} (${recommendation.plan_a.duration_min} min)`,
    recommendation.plan_a.steps.map((step, idx) => `${idx + 1}. ${step}`).join("\n"),
    `Plan B: ${recommendation.plan_b.title} (${recommendation.plan_b.duration_min} min)`,
    `Gaps:\n${gaps}`
  ].join("\n\n");
}

async function generateRecommendationWithLMStudio(profile, today, recommendation) {
  if (!lmStudioEnabled()) return { ok: false, reason: "not_configured" };

  const messages = [
    {
      role: "system",
      content:
        "You are a cautious endurance coach. The recommendation JSON is final from a safety rules engine. Explain it clearly without changing recommendation type or constraints."
    },
    {
      role: "user",
      content: [
        "Write a concise athlete-facing message with sections:",
        "1) Today decision",
        "2) Why (top 3 factors)",
        "3) Plan A steps",
        "4) Plan B",
        "5) Tomorrow check-in reminder",
        "",
        "Keep under 190 words and do not invent data.",
        "",
        `Context JSON:\n${JSON.stringify(
          {
            profile: {
              goals: profile.goals,
              favorite_sports: profile.favorite_sports,
              injuries_conditions: profile.injuries_conditions
            },
            today,
            recommendation
          },
          null,
          2
        )}`
      ].join("\n")
    }
  ];

  try {
    const text = await callLMStudioChat(messages, { temperature: 0.2, maxTokens: 360 });
    return { ok: true, text };
  } catch (error) {
    return { ok: false, reason: "unavailable", error: error.message };
  }
}

async function answerFollowupWithLMStudio(question, recommendation) {
  if (!lmStudioEnabled()) return { ok: false, reason: "not_configured" };

  const messages = [
    {
      role: "system",
      content:
        "You are a cautious sports coach. Keep answers aligned with recommendation JSON and safety flags. If asked for risky work while blocked, explain why and offer a safe alternative."
    },
    {
      role: "user",
      content: `Question: ${question}\n\nRecommendation JSON:\n${JSON.stringify(recommendation, null, 2)}`
    }
  ];

  try {
    const text = await callLMStudioChat(messages, { temperature: 0.25, maxTokens: 260 });
    return { ok: true, text };
  } catch (error) {
    return { ok: false, reason: "unavailable", error: error.message };
  }
}

async function answerAgentChatWithLMStudio(conversation, context) {
  if (!lmStudioEnabled()) return { ok: false, reason: "not_configured" };

  const history = conversation.slice(-8).map((turn) => ({
    role: turn.role === "assistant" ? "assistant" : "user",
    content: String(turn.content || "")
  }));

  const messages = [
    {
      role: "system",
      content: [
        "You are a cautious endurance coaching agent.",
        "Responsibilities:",
        "- Keep collecting athlete context (time availability, favorite sports, equipment, injuries/conditions, goals, motivations).",
        "- Use current metrics trends, planned activities/races, and weather forecast when available.",
        "- Provide weekly suggestions aligned with goals.",
        "- Do not override deterministic safety constraints in last_recommendation.",
        "- If intake_status.completion_pct is below 80, prioritize onboarding questions first.",
        "When profile fields are missing, ask concise follow-up questions before giving aggressive prescriptions.",
        "Ask at most 3 focused onboarding questions per reply and include expected answer keys."
      ].join("\n")
    },
    {
      role: "system",
      content: `Context JSON:\n${JSON.stringify(context, null, 2)}`
    },
    ...history
  ];

  try {
    const text = await callLMStudioChat(messages, { temperature: 0.25, maxTokens: 520 });
    return { ok: true, text };
  } catch (error) {
    return { ok: false, reason: "unavailable", error: error.message };
  }
}

async function callLMStudioChat(messages, options = {}) {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is unavailable. Use Node 18+.");
  }

  const request = {
    model: LM_STUDIO_MODEL,
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 300
  };

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), LM_STUDIO_TIMEOUT_MS) : null;

  try {
    const response = await fetch(lmStudioChatUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
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
      throw new Error(`LM Studio request timed out after ${LM_STUDIO_TIMEOUT_MS}ms.`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function followUp(question, recommendation) {
  const q = question.toLowerCase();

  if (q.includes("why")) {
    return `Top drivers:\n${recommendation.why
      .slice(0, 4)
      .map((item) => `- ${item.signal}: ${item.value} (${pointsLabel(item.points)})`)
      .join("\n")}`;
  }

  if (q.includes("hiit")) {
    if (recommendation.recommendation_type === "hiit") {
      return "HIIT is allowed today because recovery score and guardrails are favorable.";
    }
    return `HIIT is blocked due to: ${recommendation.safety_flags.join(", ") || "current recovery state"}.`;
  }

  if (q.includes("gap")) {
    if (!recommendation.gap_findings.length) return "No major training gap detected in current history window.";
    return recommendation.gap_findings
      .map((gap) => `- ${gap.gap_type} (${gap.severity}): ${gap.action}`)
      .join("\n");
  }

  if (q.includes("alternative") || q.includes("option")) {
    return `Alternative: ${recommendation.plan_b.title} (${recommendation.plan_b.duration_min} min).`;
  }

  return "Ask: why, hiit, gaps, or alternative.";
}

function pickSport(sports, type, pain) {
  const lowImpact = ["swim", "bike", "walk", "yoga"];
  const highImpact = ["run", "hiit"];

  if (type === "yoga_mobility" || type === "strength") {
    return sports.find((s) => s === "yoga" || s === "strength") || "yoga";
  }

  if (pain >= 4) {
    return sports.find((s) => lowImpact.includes(s)) || "walk";
  }

  if (type === "hiit") {
    return sports.find((s) => highImpact.includes(s)) || sports[0] || "bike";
  }

  return sports[0] || "bike";
}

function computeConfidence(today, completeness) {
  const signalSlots = 6;
  const pct = completeness / signalSlots;
  let confidence = 0.45 + pct * 0.4;
  if (today.source.type === "screenshot") confidence += 0.05;
  if (today.subjective.notes) confidence += 0.02;
  return clamp(round(confidence, 2), 0.35, 0.9);
}

function countHardDays(history, todayDate, backDays) {
  return history.filter((day) => {
    const diff = daysBetween(day.date, todayDate);
    if (diff < 1 || diff > backDays) return false;

    const highMinutes = day.activities.reduce(
      (sum, activity) => sum + (activity.hr_zone_minutes.z4 || 0) + (activity.hr_zone_minutes.z5 || 0),
      0
    );

    return highMinutes >= 10 || day.activities.some((activity) => activity.sport === "hiit");
  }).length;
}

function reason(signal, value, points) {
  return {
    signal,
    value,
    points,
    impact: points > 0 ? "positive" : points < 0 ? "negative" : "neutral"
  };
}

function getReasonValue(reasons, signal) {
  const row = reasons.find((item) => item.signal === signal);
  return row ? Number(row.value) : null;
}

function daysBetween(oldDate, newDate) {
  const oldValue = new Date(`${oldDate}T00:00:00Z`).getTime();
  const newValue = new Date(`${newDate}T00:00:00Z`).getTime();
  return Math.floor((newValue - oldValue) / 86400000);
}

function avg(values) {
  const valid = values.filter((v) => isNumber(v));
  if (!valid.length) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

function lmStudioEnabled() {
  return Boolean(LM_STUDIO_MODEL);
}

function lmStudioChatUrl() {
  const trimmed = String(LM_STUDIO_BASE_URL || "").trim().replace(/\/+$/, "");
  const withVersion = trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
  return `${withVersion}/chat/completions`;
}

function asPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asNumberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asISODateOrNull(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return null;
  return toISODate(parsed);
}

function toISODate(input) {
  const date = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(date.getTime())) return toISODate(new Date());
  return date.toISOString().slice(0, 10);
}

function addDays(input, days) {
  const date = input instanceof Date ? new Date(input) : new Date(`${input}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date;
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, dp = 1) {
  const scale = 10 ** dp;
  return Math.round(value * scale) / scale;
}

function capitalize(text) {
  const str = String(text || "");
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function pointsLabel(points) {
  return points > 0 ? `+${points}` : String(points);
}
