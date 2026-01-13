// Load environment variables FIRST, before any imports that might use them
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local first (highest priority)
const envLocalPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envLocalPath)) {
  const raw = fs.readFileSync(envLocalPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    // Remove quotes if present
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // Set env var (override existing if present)
    if (key) {
      process.env[key] = val;
    }
  }
  console.log('[dev-server] Loaded .env.local');
}

// Fallback: load .env if it exists and .env.local didn't set the var
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // Only set if not already set from .env.local
    if (key && (process.env[key] === undefined || process.env[key] === '')) {
      process.env[key] = val;
    }
  }
  console.log('[dev-server] Loaded .env (fallback)');
}

// Now import handlers (they can safely use process.env)
import http from 'http';
import apiRouter from './api/index.js';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // Only set if not already set (treat empty-string as not set, too)
    if (key && (process.env[key] === undefined || process.env[key] === '')) {
      process.env[key] = val;
    }
  }
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.ico': return 'image/x-icon';
    default: return 'application/octet-stream';
  }
}

function sendJson(res, statusCode, obj) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

function getMissingEnvVars() {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY'
  ];
  return required.filter((k) => !process.env[k]);
}

function makeVercelLikeReqRes(nodeReq, nodeRes, bodyObj) {
  const headersLower = {};
  for (const [k, v] of Object.entries(nodeReq.headers || {})) {
    headersLower[String(k).toLowerCase()] = v;
  }

  // Parse query parameters from URL
  const urlObj = new URL(nodeReq.url, `http://${nodeReq.headers.host || 'localhost'}`);
  const query = {};
  urlObj.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  const req = {
    method: nodeReq.method,
    url: nodeReq.url,
    query: query,
    headers: {
      ...headersLower,
      get: (name) => headersLower[String(name).toLowerCase()]
    },
    body: bodyObj
  };

  const res = {
    setHeader: (...args) => nodeRes.setHeader(...args),
    status: (code) => {
      nodeRes.statusCode = code;
      return res;
    },
    json: (obj) => {
      nodeRes.setHeader('Content-Type', 'application/json; charset=utf-8');
      nodeRes.end(JSON.stringify(obj));
    },
    redirect: (url) => {
      nodeRes.statusCode = 302;
      nodeRes.setHeader('Location', url);
      nodeRes.end();
    },
    end: () => nodeRes.end()
  };

  return { req, res };
}

async function readJsonBody(nodeReq) {
  return await new Promise((resolve) => {
    let data = '';
    nodeReq.on('data', (chunk) => { data += chunk; });
    nodeReq.on('end', () => {
      if (!data) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(null);
      }
    });
  });
}

async function handleApi(nodeReq, nodeRes) {
  const urlObj = new URL(nodeReq.url, `http://${nodeReq.headers.host || 'localhost'}`);
  // Normalize pathname (avoid surprising 404s due to trailing slashes)
  let pathname = urlObj.pathname;
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  console.log('[dev-server] API request:', { method: nodeReq.method, pathname });

  // Local-only: quick health check for env wiring (does not expose secrets)
  if (pathname === '/api/_health') {
    const missing = getMissingEnvVars();
    return sendJson(nodeRes, 200, {
      ok: true,
      port: Number(process.env.PORT || 5001),
      env: {
        hasEnvLocal: fs.existsSync(path.join(__dirname, '.env.local')),
        missing
      }
    });
  }

  // For GET requests (like gmail-callback), don't read body
  const bodyObj = nodeReq.method === 'GET' ? null : await readJsonBody(nodeReq);
  const { req, res } = makeVercelLikeReqRes(nodeReq, nodeRes, bodyObj);
  // Delegate all /api/* routes to the consolidated router (matches Vercel production behavior)
  return await apiRouter(req, res);
}

function serveStatic(nodeReq, nodeRes) {
  const urlObj = new URL(nodeReq.url, `http://${nodeReq.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(urlObj.pathname);
  if (pathname === '/') pathname = '/index.html';

  // Prevent path traversal
  const resolved = path.resolve(__dirname, '.' + pathname);
  if (!resolved.startsWith(__dirname)) {
    nodeRes.statusCode = 403;
    nodeRes.end('Forbidden');
    return;
  }

  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    nodeRes.statusCode = 404;
    nodeRes.end('Not Found');
    return;
  }

  nodeRes.statusCode = 200;
  nodeRes.setHeader('Content-Type', contentTypeFor(resolved));
  fs.createReadStream(resolved).pipe(nodeRes);
}

// Environment variables already loaded at top of file
// Keep track of whether .env.local exists for warning messages
const hadEnvLocal = fs.existsSync(path.join(__dirname, '.env.local'));

function warnIfMissingEnv() {
  const missing = getMissingEnvVars();
  if (missing.length === 0) return;
  console.warn('[dev-server] Missing required env vars:', missing.join(', '));
  if (!hadEnvLocal) {
    console.warn('[dev-server] No .env.local found. Copy env.local.example -> .env.local, fill in values, then restart the server.');
  } else {
    console.warn('[dev-server] .env.local was found, but some keys are missing/empty. Fix it and restart the server.');
  }
}

const port = Number(process.env.PORT || 5001);

const server = http.createServer(async (req, res) => {
  try {
    if (req.url?.startsWith('/api/')) {
      return await handleApi(req, res);
    }
    return serveStatic(req, res);
  } catch (e) {
    console.error('[dev-server] Unhandled error:', e?.message || e);
    return sendJson(res, 500, { ok: false, error: 'Internal server error' });
  }
});

server.listen(port, () => {
  console.log(`[dev-server] Running on http://localhost:${port}`);
  console.log('[dev-server] Serving static files + local /api/* routed through api/index.js');
  // Safe env diagnostics (does not log secrets)
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (clientId) {
    const clientIdStr = String(clientId);
    const clientIdCore = clientIdStr.replace(/\.apps\.googleusercontent\.com$/, '');
    console.log('[dev-server] Gmail OAuth env check:', {
      has_google_client_id: true,
      google_client_id_length: clientIdStr.length,
      google_client_id_has_whitespace: /\s/.test(clientIdStr),
      google_client_id_has_quotes: /["']/.test(clientIdStr),
      google_client_id_looks_like_google: clientIdStr.endsWith('.apps.googleusercontent.com'),
      google_client_id_core_tail12: clientIdCore.slice(-12),
      has_google_redirect_uri: !!process.env.GOOGLE_REDIRECT_URI
    });
  } else {
    console.log('[dev-server] Gmail OAuth env check:', { has_google_client_id: false, has_google_redirect_uri: !!process.env.GOOGLE_REDIRECT_URI });
  }
  warnIfMissingEnv();
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[dev-server] ERROR: Port ${port} is already in use.`);
    console.error(`[dev-server] To fix this, run:`);
    console.error(`  lsof -ti:${port} | xargs kill -9`);
    console.error(`  or`);
    console.error(`  pkill -f 'dev-server.mjs'\n`);
    process.exit(1);
  } else {
    throw err;
  }
});


