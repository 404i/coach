/**
 * HTTP / SSE transport for the MCP server.
 * Extracted from the monolithic coach-mcp-server.js for clarity.
 */
import { createServer } from 'http';
import { timingSafeEqual } from 'crypto';
import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

/**
 * Start the HTTP server that exposes the MCP protocol over SSE.
 *
 * @param {Function} createMCPServer - Factory that returns a new MCP Server instance.
 */
export async function startHttpServer(createMCPServer) {
  const AUTH_TOKEN  = process.env.MCP_AUTH_TOKEN;
  const PORT        = parseInt(process.env.MCP_PORT || '3001', 10);
  const HOST        = process.env.MCP_BIND_HOST || '0.0.0.0';
  const RATE_MAX    = parseInt(process.env.MCP_RATE_LIMIT || '60', 10);
  const ALLOWED_IPS = process.env.MCP_ALLOWED_IPS
    ? process.env.MCP_ALLOWED_IPS.split(',').map(s => s.trim()).filter(Boolean)
    : null;

  if (!AUTH_TOKEN || AUTH_TOKEN.length < 32) {
    console.error('FATAL: MCP_AUTH_TOKEN is not set or is too short (min 32 chars).');
    console.error('Generate one with:  openssl rand -hex 32');
    process.exit(1);
  }

  const app = express();
  const activeSessions = new Map(); // sessionId -> SSEServerTransport

  // ── Rate limiter (per IP, sliding window) ─────────────────────────────────
  const rateLimits = new Map();
  const RATE_WINDOW_MS = 60_000;

  function rateLimit(req, res, next) {
    const ip  = (req.ip || '').replace('::ffff:', '');
    const now = Date.now();
    let   entry = rateLimits.get(ip);
    if (!entry || now > entry.reset) {
      entry = { count: 0, reset: now + RATE_WINDOW_MS };
    }
    entry.count++;
    rateLimits.set(ip, entry);
    if (entry.count > RATE_MAX) {
      res.setHeader('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    next();
  }

  // ── Bearer-token auth (timing-safe compare) ──────────────────────────────
  function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'] || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization header (Bearer token required)' });
    }
    const provided = authHeader.slice(7);
    try {
      const expected = Buffer.from(AUTH_TOKEN, 'utf8');
      const received = Buffer.from(provided.padEnd(AUTH_TOKEN.length, '\0'), 'utf8');
      const match = expected.length === received.length && timingSafeEqual(expected, received);
      if (!match) throw new Error('mismatch');
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
    next();
  }

  // ── Optional IP allowlist ─────────────────────────────────────────────────
  function ipAllowlist(req, res, next) {
    if (!ALLOWED_IPS) return next();
    const ip = (req.ip || '').replace('::ffff:', '');
    if (!ALLOWED_IPS.includes(ip)) {
      console.error(`[MCP] Blocked: ${ip} not in allowlist`);
      return res.status(403).json({ error: 'IP not allowed' });
    }
    next();
  }

  // ── Security headers ──────────────────────────────────────────────────────
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  // ── Health (unauthenticated) ──────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      server: 'garmin-ai-coach-mcp',
      transport: 'sse',
      sessions: activeSessions.size,
    });
  });

  // ── SSE endpoint — GET establishes the stream ─────────────────────────────
  app.get('/mcp', rateLimit, ipAllowlist, authenticate, async (req, res) => {
    const transport = new SSEServerTransport('/mcp/message', res);
    activeSessions.set(transport._sessionId, transport);

    transport.onclose = () => {
      activeSessions.delete(transport._sessionId);
      console.error(`[MCP] Session closed: ${transport._sessionId}`);
    };

    try {
      const sessionServer = createMCPServer();
      await sessionServer.connect(transport);
      console.error(`[MCP] Session opened: ${transport._sessionId} from ${(req.ip || '').replace('::ffff:', '')}`);
    } catch (err) {
      activeSessions.delete(transport._sessionId);
      console.error('[MCP] Connection error:', err.message);
    }
  });

  // ── Message endpoint — POST carries tool calls ────────────────────────────
  app.post('/mcp/message', rateLimit, ipAllowlist, authenticate, async (req, res) => {
    const sessionId = req.query.sessionId;
    const transport = activeSessions.get(sessionId);
    if (!transport) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }
    try {
      await transport.handlePostMessage(req, res);
    } catch (err) {
      console.error('[MCP] Message error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── 404 catch-all ─────────────────────────────────────────────────────────
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  createServer(app).listen(PORT, HOST, () => {
    console.error(`[MCP] HTTP server listening on ${HOST}:${PORT}`);
    console.error(`[MCP] SSE endpoint : http://<your-ip>:${PORT}/mcp`);
    console.error(`[MCP] Health check : http://<your-ip>:${PORT}/health`);
    console.error('[MCP] Auth         : Bearer token required on /mcp and /mcp/message');
    if (ALLOWED_IPS) console.error(`[MCP] IP allowlist : ${ALLOWED_IPS.join(', ')}`);
  });
}
