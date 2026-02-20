#!/usr/bin/env node
"use strict";

// SECURITY WARNING: This server is for LOCAL DEVELOPMENT ONLY
// DO NOT expose this server to the internet without:
// 1. Adding authentication/authorization
// 2. Using HTTPS (TLS/SSL)
// 3. Implementing rate limiting
// 4. Validating all inputs thoroughly
// 5. Using environment-based secrets management
// 6. Adding CSRF protection

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const HOST = process.env.COACH_WEB_HOST || "127.0.0.1";
const PORT = asPort(process.env.COACH_WEB_PORT, 8080);
const MAX_BODY_BYTES = 64 * 1024;
const OUTPUT_TAIL_LIMIT = 10000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon"
};

const server = http.createServer(async (req, res) => {
  try {
    // Add security headers (for local dev only)
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    
    // CORS for localhost only (development)
    const origin = req.headers.origin;
    if (origin && (origin.startsWith("http://127.0.0.1") || origin.startsWith("http://localhost"))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    
    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (!req.url) return sendJson(res, 400, { ok: false, error: "Missing URL." });
    const url = new URL(req.url, `http://${HOST}:${PORT}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        service: "coach-web-server",
        time: new Date().toISOString()
      });
    }

    if (req.method === "POST" && url.pathname === "/api/garmin/sync") {
      // TODO: Add authentication check here before allowing sync
      const body = await readJsonBody(req);
      const result = await runGarminSync(body || {});
      return sendJson(res, 200, { ok: true, result });
    }

    if (req.method !== "GET") {
      return sendJson(res, 405, { ok: false, error: "Method not allowed." });
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    const result = error && error.result ? error.result : null;
    return sendJson(res, 500, {
      ok: false,
      error: error && error.message ? error.message : "Unhandled server error.",
      result
    });
  }
});

server.listen(PORT, HOST, () => {
  process.stderr.write(`coach-web-server listening on http://${HOST}:${PORT}\n`);
});

function asPort(value, fallback) {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0 && n <= 65535) return Math.round(n);
  return fallback;
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(body.length),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", (error) => reject(error));
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(text));
      } catch (_error) {
        reject(new Error("Invalid JSON request body."));
      }
    });
  });
}

function serveStatic(pathname, res) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  
  // Enhanced path traversal protection
  const normalized = path.normalize(cleanPath);
  
  // Block any path with parent directory references
  if (normalized.includes("..")) {
    return sendJson(res, 403, { ok: false, error: "Forbidden: Path traversal detected." });
  }
  
  // Only allow specific file extensions for security
  const ext = path.extname(normalized).toLowerCase();
  const allowedExtensions = [".html", ".js", ".css", ".json", ".ico"];
  if (!allowedExtensions.includes(ext)) {
    return sendJson(res, 403, { ok: false, error: "Forbidden: File type not allowed." });
  }
  
  const filePath = path.join(ROOT_DIR, normalized);
  
  // Ensure resolved path is within ROOT_DIR
  const realRootDir = fs.realpathSync(ROOT_DIR);
  let realFilePath;
  try {
    realFilePath = fs.realpathSync(filePath);
  } catch (error) {
    return sendJson(res, 404, { ok: false, error: "Not found." });
  }
  
  if (!realFilePath.startsWith(realRootDir)) {
    return sendJson(res, 403, { ok: false, error: "Forbidden path." });
  }
  
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return sendJson(res, 404, { ok: false, error: "Not found." });
  }

  const mime = MIME[ext] || "application/octet-stream";
  const stream = fs.createReadStream(filePath);
  res.writeHead(200, { "Content-Type": mime });
  stream.on("error", () => {
    if (!res.headersSent) {
      sendJson(res, 500, { ok: false, error: "Failed to read file." });
      return;
    }
    res.destroy();
  });
  stream.pipe(res);
}

function runGarminSync(args) {
  return new Promise((resolve, reject) => {
    // Input validation
    const mode = String(args.sync_mode || "latest").trim().toLowerCase();
    if (mode !== "latest" && mode !== "all") {
      reject(new Error("Invalid sync_mode. Must be 'latest' or 'all'."));
      return;
    }
    
    const scriptPath = path.join(ROOT_DIR, "scripts", mode === "all" ? "garmindb_sync_all.sh" : "garmindb_sync_latest.sh");
    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`Sync script not found: ${scriptPath}`));
      return;
    }

    // Validate inputs before passing to environment
    const validatedArgs = validateGarminSyncArgs(args);
    if (validatedArgs.error) {
      reject(new Error(validatedArgs.error));
      return;
    }

    const env = { ...process.env };
    setEnvIfPresent(env, "GARMIN_USER", validatedArgs.garmin_user);
    setEnvIfPresent(env, "GARMIN_PASSWORD", validatedArgs.garmin_password);
    setEnvIfPresent(env, "GARMIN_PASSWORD_FILE", validatedArgs.garmin_password_file);
    setEnvIfPresent(env, "GARMIN_MFA_CODE", validatedArgs.garmin_mfa_code);
    setEnvIfPresent(env, "GARMIN_START_DATE", validatedArgs.garmin_start_date);
    setEnvIfPresent(env, "GARMINDB_HTTP_TIMEOUT", positiveIntOrNull(validatedArgs.garmindb_http_timeout));
    setEnvIfPresent(env, "GARMINDB_HTTP_RETRIES", nonNegativeIntOrNull(validatedArgs.garmindb_http_retries));
    setEnvIfPresent(env, "GARMINDB_HTTP_BACKOFF", nonNegativeNumberOrNull(validatedArgs.garmindb_http_backoff));

    const startedAtMs = Date.now();
    const startedAtIso = new Date(startedAtMs).toISOString();
    const child = spawn("bash", [scriptPath], {
      cwd: ROOT_DIR,
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    child.stdin.end();

    let stdoutTail = "";
    let stderrTail = "";

    child.stdout.on("data", (chunk) => {
      stdoutTail = pushTail(stdoutTail, chunk.toString("utf8"));
    });

    child.stderr.on("data", (chunk) => {
      stderrTail = pushTail(stderrTail, chunk.toString("utf8"));
    });

    child.on("error", (error) => {
      reject(new Error(`Failed to start sync process: ${error.message}`));
    });

    child.on("close", (code) => {
      const completedAtMs = Date.now();
      const completedAtIso = new Date(completedAtMs).toISOString();
      const result = {
        mode,
        script: scriptPath,
        exit_code: code,
        started_at: startedAtIso,
        completed_at: completedAtIso,
        duration_sec: round((completedAtMs - startedAtMs) / 1000, 1),
        latest_data_timestamp: latestGarminDataTimestamp(),
        stdout_tail: stdoutTail.trim(),
        stderr_tail: stderrTail.trim()
      };

      if (code === 0) {
        resolve(result);
        return;
      }

      const message = `Garmin sync failed (exit ${code}).`;
      const error = new Error(message);
      error.result = result;
      reject(error);
    });
  });
}

function latestGarminDataTimestamp() {
  const dbDir = path.join(ROOT_DIR, "data", "garmin", "HealthData", "DBs");
  if (!fs.existsSync(dbDir)) return null;

  let maxMtimeMs = 0;
  const entries = fs.readdirSync(dbDir);
  entries.forEach((name) => {
    const fullPath = path.join(dbDir, name);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile() && stat.mtimeMs > maxMtimeMs) {
        maxMtimeMs = stat.mtimeMs;
      }
    } catch (_error) {
      // Ignore unreadable files.
    }
  });

  if (!maxMtimeMs) return null;
  return new Date(maxMtimeMs).toISOString();
}

function setEnvIfPresent(env, key, value) {
  if (value === null || value === undefined) return;
  const text = String(value).trim();
  if (!text) return;
  env[key] = text;
}

function positiveIntOrNull(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(Math.round(n));
}

function nonNegativeIntOrNull(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return String(Math.round(n));
}

function nonNegativeNumberOrNull(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return String(n);
}

function pushTail(current, chunkText) {
  const merged = `${current}${chunkText}`;
  if (merged.length <= OUTPUT_TAIL_LIMIT) return merged;
  return merged.slice(merged.length - OUTPUT_TAIL_LIMIT);
}

function round(value, digits) {
  const scale = Math.pow(10, digits);
  return Math.round(value * scale) / scale;
}

function validateGarminSyncArgs(args) {
  const result = {};
  
  // Validate email format if provided
  if (args.garmin_user) {
    const email = String(args.garmin_user).trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: "Invalid email format for garmin_user." };
    }
    result.garmin_user = email;
  }
  
  // Password - just ensure it's a string if provided
  if (args.garmin_password) {
    result.garmin_password = String(args.garmin_password);
  }
  
  // Password file - validate it's a reasonable path
  if (args.garmin_password_file) {
    const passwordFile = String(args.garmin_password_file).trim();
    if (passwordFile.includes(".." )) {
      return { error: "Invalid password_file path: path traversal detected." };
    }
    result.garmin_password_file = passwordFile;
  }
  
  // MFA code - should be 6 digits
  if (args.garmin_mfa_code) {
    const code = String(args.garmin_mfa_code).trim();
    if (code && !/^\d{6}$/.test(code)) {
      return { error: "Invalid MFA code format. Expected 6 digits." };
    }
    result.garmin_mfa_code = code;
  }
  
  // Start date - validate MM/DD/YYYY format
  if (args.garmin_start_date) {
    const date = String(args.garmin_start_date).trim();
    if (date && !/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/.test(date)) {
      return { error: "Invalid start_date format. Expected MM/DD/YYYY." };
    }
    result.garmin_start_date = date;
  }
  
  // Numeric validations
  if (args.garmindb_http_timeout !== undefined) {
    const timeout = Number(args.garmindb_http_timeout);
    if (!Number.isFinite(timeout) || timeout < 1 || timeout > 300) {
      return { error: "Invalid http_timeout. Must be between 1 and 300 seconds." };
    }
    result.garmindb_http_timeout = timeout;
  }
  
  if (args.garmindb_http_retries !== undefined) {
    const retries = Number(args.garmindb_http_retries);
    if (!Number.isFinite(retries) || retries < 0 || retries > 20) {
      return { error: "Invalid http_retries. Must be between 0 and 20." };
    }
    result.garmindb_http_retries = retries;
  }
  
  if (args.garmindb_http_backoff !== undefined) {
    const backoff = Number(args.garmindb_http_backoff);
    if (!Number.isFinite(backoff) || backoff < 0 || backoff > 10) {
      return { error: "Invalid http_backoff. Must be between 0 and 10." };
    }
    result.garmindb_http_backoff = backoff;
  }
  
  return result;
}
