const http = require('node:http');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport, getDefaultEnvironment } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { UnauthorizedError } = require('@modelcontextprotocol/sdk/client/auth.js');

const ROOT = __dirname;
const CONFIG_PATH = process.env.MCP_CONFIG || path.join(ROOT, 'mcp-servers.json');
const HOST = process.env.MCP_GATEWAY_HOST || '0.0.0.0';
const PORT = Number(process.env.MCP_GATEWAY_PORT || 8787);
const TOKEN = process.env.MCP_GATEWAY_TOKEN || '';
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const OAUTH_STATE_PATH = process.env.MCP_OAUTH_STATE || path.join(ROOT, 'mcp-oauth-state.json');
const DEFAULT_PUBLIC_URL = process.env.MCP_GATEWAY_PUBLIC_URL || `http://127.0.0.1:${PORT}`;
const LOG_DIR = process.env.MCP_LOG_DIR || path.join(ROOT, 'logs');
const LOG_PATH = process.env.MCP_LOG_PATH || path.join(LOG_DIR, 'app.log');

const clients = new Map();
const oauthFlows = new Map();
let oauthState = {};
let config = { servers: [] };

function appendLog(level, source, message, details) {
  try {
    fsSync.mkdirSync(LOG_DIR, { recursive: true });
    const record = {
      time: new Date().toISOString(),
      level,
      source,
      message: String(message || ''),
      ...(details === undefined ? {} : { details }),
    };
    fsSync.appendFileSync(LOG_PATH, `${JSON.stringify(record)}\n`, 'utf8');
    return record;
  } catch (error) {
    console.error('[mcp-gateway] Failed to write log:', error.message);
    return null;
  }
}

function log(message, ...args) {
  console.log(`[mcp-gateway] ${message}`, ...args);
  appendLog('info', 'gateway', message, args.length ? args : undefined);
}

function logError(source, message, details) {
  console.error(`[${source}] ${message}`, details || '');
  return appendLog('error', source, message, details);
}

function sanitizeLogDetails(value, depth = 0) {
  if (depth > 5) return '[truncated]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.slice(0, 12000);
  if (Array.isArray(value)) return value.slice(0, 30).map(item => sanitizeLogDetails(item, depth + 1));
  if (typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      if (/authorization|api[-_]?key|token|secret|password/i.test(key)) output[key] = '[redacted]';
      else output[key] = sanitizeLogDetails(item, depth + 1);
    }
    return output;
  }
  return String(value);
}

function readRecentLogs(limit = 200) {
  try {
    const lines = fsSync.readFileSync(LOG_PATH, 'utf8').trim().split(/\r?\n/).filter(Boolean);
    return lines.slice(-Math.max(1, Math.min(limit, 1000))).map(line => {
      try { return JSON.parse(line); } catch { return { time: '', level: 'info', source: 'raw', message: line }; }
    });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function isLoopback(req) {
  const address = req.socket.remoteAddress || '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function persistConfig() {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

async function loadOAuthState() {
  try {
    const raw = await fs.readFile(OAUTH_STATE_PATH, 'utf8');
    const next = JSON.parse(raw.replace(/^\uFEFF/, ''));
    if (next && typeof next === 'object') oauthState = next;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function persistOAuthState() {
  await fs.writeFile(OAUTH_STATE_PATH, JSON.stringify(oauthState, null, 2), 'utf8');
}

async function loadConfig() {
  const raw = await fs.readFile(CONFIG_PATH, 'utf8');
  const next = JSON.parse(raw.replace(/^\uFEFF/, ''));
  if (!next || !Array.isArray(next.servers)) {
    throw new Error('Config must contain a servers array');
  }
  const ids = next.servers.map(item => item.id);
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) {
    throw new Error('Every MCP must have a unique id');
  }
  config = next;
  return config;
}

function getServer(serverId) {
  const server = config.servers.find(item => item.id === serverId);
  if (!server) throw fail(`MCP not found: ${serverId}`, 404);
  if (server.enabled === false) throw fail(`MCP is disabled: ${serverId}`, 409);
  return server;
}

function publicServer(server) {
  const state = clients.get(server.id);
  return {
    id: server.id,
    name: server.name || server.id,
    enabled: server.enabled !== false,
    transport: server.transport,
    connected: Boolean(state?.client && !state?.authRequired),
    toolCount: state?.tools?.length || 0,
    error: state?.error || null,
    authRequired: Boolean(state?.authRequired),
    authUrl: state?.authUrl || null,
  };
}

class GatewayOAuthProvider {
  constructor(server, state) {
    this.server = server;
    this.stateRef = state;
    this.record = oauthState[server.id] || (oauthState[server.id] = {});
  }

  get redirectUrl() {
    return this.server.oauthRedirectUrl || undefined;
  }

  get clientMetadata() {
    return {
      client_name: 'MyChatApp MCP Gateway',
      redirect_uris: [String(this.redirectUrl)],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  state() {
    if (!this.stateRef.oauthState) this.stateRef.oauthState = randomUUID();
    return this.stateRef.oauthState;
  }

  clientInformation() { return this.record.clientInformation; }
  async saveClientInformation(value) { this.record.clientInformation = value; await persistOAuthState(); }
  tokens() { return this.record.tokens; }
  async saveTokens(value) { this.record.tokens = value; await persistOAuthState(); }
  saveCodeVerifier(value) { this.record.codeVerifier = value; }
  codeVerifier() {
    if (!this.record.codeVerifier) throw new Error('OAuth code verifier is missing');
    return this.record.codeVerifier;
  }
  async saveDiscoveryState(value) { this.record.discoveryState = value; await persistOAuthState(); }
  discoveryState() { return this.record.discoveryState; }
  async invalidateCredentials(kind) {
    if (kind === 'all' || kind === 'client') delete this.record.clientInformation;
    if (kind === 'all' || kind === 'tokens') delete this.record.tokens;
    if (kind === 'all' || kind === 'verifier') delete this.record.codeVerifier;
    if (kind === 'all' || kind === 'discovery') delete this.record.discoveryState;
    await persistOAuthState();
  }

  redirectToAuthorization(url) {
    this.stateRef.authRequired = true;
    this.stateRef.authUrl = url.toString();
    oauthFlows.set(this.state(), { serverId: this.server.id, state: this.stateRef });
  }
}

function createClient(server, state) {
  const client = new Client(
    { name: 'mychatapp-mcp-gateway', version: '0.1.0' },
    { capabilities: {} },
  );

  let transport;
  if (server.transport === 'stdio') {
    if (!server.command) throw fail(`MCP ${server.id} is missing command`);
    transport = new StdioClientTransport({
      command: server.command,
      args: server.args || [],
      cwd: server.cwd,
      env: { ...getDefaultEnvironment(), ...(server.env || {}) },
      stderr: 'pipe',
    });
  } else if (server.transport === 'streamable-http') {
    if (!server.url) throw fail(`MCP ${server.id} is missing url`);
    const supportsStandardOAuth = server.oauthRedirectUrl && !server.manualBearerAuth;
    const authProvider = supportsStandardOAuth ? new GatewayOAuthProvider(server, state) : undefined;
    transport = new StreamableHTTPClientTransport(new URL(server.url), {
      authProvider,
      requestInit: server.headers ? { headers: server.headers } : undefined,
    });
  } else {
    throw fail(`Unsupported transport for ${server.id}: ${server.transport}`);
  }

  return { client, transport };
}

async function connectServer(server) {
  const previous = clients.get(server.id);
  if (previous?.client) return previous;
  if (previous?.authRequired) return previous;
  if (previous?.promise) return previous.promise;

  const state = { client: null, transport: null, tools: [], error: null, promise: null, authRequired: false, authUrl: null, oauthState: null };
  state.promise = (async () => {
    try {
      const created = createClient(server, state);
      state.client = created.client;
      state.transport = created.transport;
      await state.client.connect(state.transport);
      const result = await state.client.listTools();
      state.tools = result.tools || [];
      state.error = null;
      state.authRequired = false;
      state.authUrl = null;
      if (state.oauthState) oauthFlows.delete(state.oauthState);
      log(`Connected ${server.id}; tools: ${state.tools.length}`);
      return state;
    } catch (error) {
      if (error instanceof UnauthorizedError && state.authUrl) {
        state.error = null;
        state.authRequired = true;
        log(`OAuth required for ${server.id}`);
        return state;
      }
      state.error = error.message;
      log(`Connection failed for ${server.id}: ${error.message}`);
      try { await state.client?.close(); } catch {}
      state.client = null;
      throw error;
    } finally {
      state.promise = null;
    }
  })();

  clients.set(server.id, state);
  return state.promise;
}

async function reloadConfig() {
  for (const server of config.servers) await disconnectServer(server.id);
  return loadConfig();
}

async function disconnectServer(serverId) {
  const state = clients.get(serverId);
  if (!state) return;
  try { await state.client?.close(); } catch (error) { log(`Close failed for ${serverId}: ${error.message}`); }
  clients.delete(serverId);
}

function parseHeaders(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw fail('headers must be a JSON object');
  }
}

async function addRemoteServer(body) {
  const name = String(body.name || '').trim();
  const remoteUrl = String(body.url || '').trim();
  if (!name) throw fail('Missing MCP name');
  if (!remoteUrl) throw fail('Missing MCP URL');
  let parsedUrl;
  try { parsedUrl = new URL(remoteUrl); } catch { throw fail('MCP URL is invalid'); }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw fail('MCP URL must use http or https');

  const headers = parseHeaders(body.headers);
  if (body.bearerToken) headers.Authorization = `Bearer ${String(body.bearerToken).trim()}`;
  const callbackUrl = String(body.callbackUrl || `${DEFAULT_PUBLIC_URL}/oauth/callback`).trim();
  const isLuckin = parsedUrl.hostname === 'gwmcp.lkcoffee.com';
  const server = {
    id: `remote-${randomUUID().slice(0, 8)}`,
    name,
    enabled: true,
    transport: 'streamable-http',
    url: remoteUrl,
    headers,
    oauthRedirectUrl: callbackUrl,
    manualBearerAuth: isLuckin,
  };

  config.servers.push(server);
  try {
    await connectServer(server);
    await persistConfig();
    return publicServer(server);
  } catch (error) {
    config.servers = config.servers.filter(item => item.id !== server.id);
    clients.delete(server.id);
    if (isLuckin && !body.bearerToken && /oauth token is not found|401/i.test(error.message || '')) {
      const authError = fail('Luckin MCP requires a login token', 401);
      authError.authType = 'bearer';
      authError.authUrl = 'https://open.lkcoffee.com/mcp';
      throw authError;
    }
    throw error;
  }
}

async function finishOAuth(flow, code) {
  const server = getServer(flow.serverId);
  const state = flow.state;
  if (!state.transport || !state.client) throw fail('OAuth session expired', 409);
  await state.transport.finishAuth(code);
  try { await state.client.close(); } catch {}
  state.authRequired = false;
  state.authUrl = null;
  const created = createClient(server, state);
  state.client = created.client;
  state.transport = created.transport;
  await state.client.connect(state.transport);
  const result = await state.client.listTools();
  state.tools = result.tools || [];
  state.error = null;
  oauthFlows.delete(state.oauthState);
  log(`OAuth connected ${server.id}; tools: ${state.tools.length}`);
  return state;
}

async function removeServer(serverId) {
  const server = config.servers.find(item => item.id === serverId);
  if (!server) throw fail(`MCP not found: ${serverId}`, 404);
  await disconnectServer(serverId);
  config.servers = config.servers.filter(item => item.id !== serverId);
  await persistConfig();
}

async function setServerEnabled(serverId, enabled) {
  const server = config.servers.find(item => item.id === serverId);
  if (!server) throw fail(`MCP not found: ${serverId}`, 404);
  server.enabled = Boolean(enabled);
  if (!server.enabled) await disconnectServer(serverId);
  await persistConfig();
  return publicServer(server);
}

function isSessionExpiredError(error) {
  return /SESSION_EXPIRED|session expired/i.test(String(error?.message || error || ''));
}

async function withSessionReconnect(server, operation) {
  let state = await connectServer(server);
  if (state.authRequired) throw fail('MCP requires OAuth login', 409);
  try {
    return await operation(state);
  } catch (error) {
    if (!isSessionExpiredError(error)) throw error;
    log(`Session expired for ${server.id}; reconnecting once`);
    await disconnectServer(server.id);
    state = await connectServer(server);
    if (state.authRequired) throw fail('MCP requires OAuth login', 409);
    return operation(state);
  }
}

async function listTools(serverId) {
  const server = getServer(serverId);
  return withSessionReconnect(server, async (state) => {
    const result = await state.client.listTools();
    state.tools = result.tools || [];
    return state.tools;
  });
}

async function callTool(serverId, name, args) {
  const server = getServer(serverId);
  if (!name) throw fail('Missing tool name');
  return withSessionReconnect(server, state => state.client.callTool({ name, arguments: args || {} }));
}

function json(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  });
  res.end(body);
}

function authorized(req) {
  if (!TOKEN) return true;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${TOKEN}` || req.headers['x-api-key'] === TOKEN;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw fail('Request body too large', 413);
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw fail('Request body must be valid JSON'); }
}

async function handle(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/logs') {
      if (!isLoopback(req)) return json(res, 403, { error: 'Logs are only available on this computer' });
      const records = readRecentLogs(300);
      const rows = records.map(item => `<div class="row ${escapeHtml(item.level)}"><b>${escapeHtml(item.time)}</b> <span>[${escapeHtml(item.source)}]</span> ${escapeHtml(item.message)}${item.details === undefined ? '' : `<pre>${escapeHtml(JSON.stringify(item.details, null, 2))}</pre>`}</div>`).join('');
      const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="3"><title>MyChatApp Logs</title><style>body{font:14px system-ui;background:#111;color:#ddd;padding:18px}.row{border-bottom:1px solid #333;padding:10px 0}.error{color:#ff8b8b}.warn{color:#ffd27a}pre{white-space:pre-wrap;color:#bbb;margin:6px 0 0}</style><h2>MyChatApp Logs</h2><p>??? 3 ?????????${escapeHtml(LOG_PATH)}</p>${rows || '<p>????</p>'}`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    if (!authorized(req) && url.pathname !== '/oauth/callback') return json(res, 401, { error: 'Unauthorized' });
    if (req.method === 'GET' && url.pathname === '/oauth/callback') {
      const authState = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      const oauthError = url.searchParams.get('error');
      const flow = authState ? oauthFlows.get(authState) : null;
      if (!flow) throw fail('OAuth session not found or expired', 400);
      if (oauthError) throw fail(`OAuth login failed: ${oauthError}`, 400);
      if (!code) throw fail('OAuth callback is missing authorization code', 400);
      await finishOAuth(flow, code);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<!doctype html><meta charset="utf-8"><title>Login complete</title><p>Login complete. You can return to MyChatApp.</p><script>setTimeout(()=>window.close(),1200)</script>');
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { ok: true, service: 'mychatapp-mcp-gateway', time: new Date().toISOString() });
    }

    if (req.method === 'POST' && url.pathname === '/api/logs') {
      const body = await readBody(req);
      const record = logError(
        String(body.source || 'app'),
        String(body.message || 'App diagnostic'),
        sanitizeLogDetails(body.details),
      );
      return json(res, 201, { ok: true, record });
    }

    if (req.method === 'GET' && url.pathname === '/api/logs') {
      return json(res, 200, { logs: readRecentLogs(Number(url.searchParams.get('limit') || 200)), path: LOG_PATH });
    }

    if (req.method === 'GET' && url.pathname === '/api/servers') {
      return json(res, 200, { servers: config.servers.map(publicServer) });
    }

    if (req.method === 'GET' && url.pathname === '/api/tools') {
      const serverId = url.searchParams.get('serverId');
      if (!serverId) throw fail('Missing serverId');
      return json(res, 200, { serverId, tools: await listTools(serverId) });
    }

    if (req.method === 'POST' && url.pathname === '/api/servers') {
      return json(res, 201, { server: await addRemoteServer(await readBody(req)) });
    }

    if (req.method === 'PATCH' && url.pathname.startsWith('/api/servers/')) {
      const serverId = decodeURIComponent(url.pathname.slice('/api/servers/'.length));
      const body = await readBody(req);
      return json(res, 200, { server: await setServerEnabled(serverId, body.enabled) });
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/api/servers/')) {
      const serverId = decodeURIComponent(url.pathname.slice('/api/servers/'.length));
      await removeServer(serverId);
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/config/reload') {
      await reloadConfig();
      return json(res, 200, { ok: true, servers: config.servers.map(publicServer) });
    }

    if (req.method === 'POST' && url.pathname === '/api/tools/call') {
      const body = await readBody(req);
      return json(res, 200, {
        serverId: body.serverId,
        tool: body.name,
        result: await callTool(body.serverId, body.name, body.arguments),
      });
    }

    return json(res, 404, { error: 'Route not found' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return json(res, statusCode, {
      error: error.message || 'Internal server error',
      ...(error.authType ? { authType: error.authType } : {}),
      ...(error.authUrl ? { authUrl: error.authUrl } : {}),
    });
  }
}

async function shutdown() {
  for (const server of config.servers) await disconnectServer(server.id);
  process.exit(0);
}

async function main() {
  await loadOAuthState();
  await loadConfig();
  const server = http.createServer((req, res) => handle(req, res));
  server.listen(PORT, HOST, () => {
    log(`Gateway listening at http://${HOST}:${PORT}`);
    log(`Config: ${CONFIG_PATH}`);
    log(`Logs: ${LOG_PATH}`);
    log(`Open logs on this computer: http://127.0.0.1:${PORT}/logs`);
    if (!TOKEN) log('WARNING: MCP_GATEWAY_TOKEN is not set; LAN clients are unauthenticated');
  });
  process.on('uncaughtException', error => logError('gateway', 'Uncaught exception', { message: error.message, stack: error.stack }));
  process.on('unhandledRejection', error => logError('gateway', 'Unhandled rejection', { message: error?.message || String(error), stack: error?.stack }));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(error => {
  console.error(`[mcp-gateway] Startup failed: ${error.message}`);
  process.exit(1);
});

