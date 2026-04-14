#!/usr/bin/env node

/**
 * Garmin AI Coach MCP Server — thin orchestrator.
 *
 * All business logic lives in ./lib/ modules.  This file wires up the MCP SDK
 * server, registers tool/resource handlers, and starts the appropriate
 * transport (stdio for Claude Desktop, HTTP/SSE for remote clients).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Shared infrastructure ───────────────────────────────────────────────────
import { callAPI } from './lib/api.js';
import { loadAthleteState, getCurrentAthlete, setCurrentAthlete, saveAthleteState } from './lib/state.js';
import { readMemory } from './lib/memory.js';
import { TOOLS } from './lib/tool-definitions.js';

// ── Handler groups ──────────────────────────────────────────────────────────
import { sessionHandlers }       from './lib/handlers/session.js';
import { coachingHandlers }      from './lib/handlers/coaching.js';
import { garminHandlers }        from './lib/handlers/garmin.js';
import { stravaHandlers }        from './lib/handlers/strava.js';
import { planningHandlers }      from './lib/handlers/planning.js';
import { analyticsHandlers }     from './lib/handlers/analytics.js';
import { weatherAlertsHandlers } from './lib/handlers/weather-alerts.js';
import { goalsHandlers }         from './lib/handlers/goals.js';

// ── HTTP server (lazy-loaded only in HTTP mode) ─────────────────────────────
import { startHttpServer } from './lib/http-server.js';

// ── Paths ───────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const SYSTEM_PROMPT_PATH = path.join(__dirname, 'coach-system-prompt.md');

// ── Process-level crash guards ──────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[MCP] Uncaught exception (server kept alive):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[MCP] Unhandled rejection (server kept alive):', reason?.message || reason);
});

// ── Load system prompt & athlete state at startup ───────────────────────────
let SYSTEM_PROMPT = '';
async function loadSystemPrompt() {
  try {
    SYSTEM_PROMPT = await fs.readFile(SYSTEM_PROMPT_PATH, 'utf-8');
  } catch {
    SYSTEM_PROMPT = 'Expert AI endurance coach. Always be honest about missing data.';
  }
}
await loadSystemPrompt();
await loadAthleteState();

// ── Merged handler dispatch map ─────────────────────────────────────────────
const allHandlers = {
  ...sessionHandlers,
  ...coachingHandlers,
  ...garminHandlers,
  ...stravaHandlers,
  ...planningHandlers,
  ...analyticsHandlers,
  ...weatherAlertsHandlers,
  ...goalsHandlers,
};

// ── MCP Server factory ──────────────────────────────────────────────────────
function createMCPServer() {
  const server = new Server(
    { name: "garmin-ai-coach", version: "1.0.0" },
    { capabilities: { tools: {}, resources: {} } },
  );

  // ── ListTools ─────────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  // ── ListResources ─────────────────────────────────────────────────────────
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources = [
      {
        uri: "coach://system-prompt",
        name: "Coach System Prompt",
        description: "The system prompt that defines coaching behavior",
        mimeType: "text/markdown",
      },
    ];

    try {
      const email = getCurrentAthlete();
      const sanitizedEmail = email.replace(/@/g, '_at_').replace(/\./g, '_');
      resources.push({
        uri: `memory://${sanitizedEmail}`,
        name: `Athlete Memory: ${email}`,
        description: `Persistent memory for ${email}`,
        mimeType: "application/json",
      });
    } catch {
      // No current athlete set — that's fine, just skip the memory resource
    }

    return { resources };
  });

  // ── ReadResource ──────────────────────────────────────────────────────────
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;

    if (uri === "coach://system-prompt") {
      return {
        contents: [{ uri, mimeType: "text/markdown", text: SYSTEM_PROMPT }],
      };
    }

    if (uri.startsWith('memory://')) {
      const emailKey = uri.replace('memory://', '');
      const email = emailKey.replace(/_at_/g, '@').replace(/_/g, '.');
      const memory = await readMemory(email);
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(memory, null, 2) }],
      };
    }

    throw new Error('Invalid resource URI');
  });

  // ── CallTool ──────────────────────────────────────────────────────────────
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = allHandlers[name];
    if (!handler) {
      return {
        content: [{ type: "text", text: `Error: Unknown tool "${name}"` }],
        isError: true,
      };
    }
    try {
      return await handler(args);
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  return server;
}

// ── Entry point ─────────────────────────────────────────────────────────────
async function main() {
  const httpMode = process.env.MCP_HTTP_MODE === 'true' || !!process.env.MCP_PORT;

  if (httpMode) {
    await startHttpServer(createMCPServer);
  } else {
    const transport = new StdioServerTransport();
    await createMCPServer().connect(transport);
    console.error('Garmin AI Coach MCP server running on stdio');
  }
}

main().catch((error) => {
  console.error('[MCP] Fatal startup error:', error);
  process.exit(1);
});
