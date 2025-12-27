// CloseLogic consolidated API router (Vercel Hobby plan friendly)
// All requests to /api/* are rewritten here via vercel.json.

import healthHandler from '../server/health.js';
import analyzeLeadHandler from '../server/analyze-lead.js';
import messagesHandler from '../server/messages.js';
import syncInboxHandler from '../server/sync-inbox.js';

import gmailConnectHandler from '../server/gmail/connect.js';
import gmailCallbackHandler from '../server/gmail/callback.js';
import gmailStatusHandler from '../server/gmail/status.js';
import gmailSyncHandler from '../server/gmail/sync.js';
import gmailDisconnectHandler from '../server/gmail/disconnect.js';
import gmailSendHandler from '../server/gmail/send.js';

import aiReplyHandler from '../server/ai/reply.js';

// Legacy endpoints kept for backward compatibility
import legacyConnectGmailHandler from '../server/connect-gmail.js';
import legacyGmailCallbackHandler from '../server/gmail-callback.js';

function applyCors(req, res) {
  // Bearer-token auth; no cookies needed → wildcard is OK.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function getRoutedPath(req) {
  const host = req.headers?.host || 'localhost';
  const url = new URL(req.url || '/api/index', `http://${host}`);

  // If vercel.json rewrite is active, it sets ?path=:path*
  const qp = url.searchParams.get('path');
  if (qp && typeof qp === 'string') {
    return '/' + qp.replace(/^\/+/, '');
  }

  // Fallback: route based on actual pathname (/api/foo -> /foo)
  const pathname = url.pathname || '';
  if (pathname.startsWith('/api/')) return pathname.slice('/api'.length);
  if (pathname === '/api') return '/';
  if (pathname === '/api/index' || pathname === '/api/index.js') return '/';
  return pathname;
}

export default async function handler(req, res) {
  try {
    applyCors(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const routedPath = getRoutedPath(req);
    const p = routedPath.replace(/\/+$/, '') || '/';

    // Lightweight visibility for deploy verification
    console.log('[api-router]', { method: req.method, path: p });

    // Health
    if (p === '/health' || p === '/_health') return healthHandler(req, res);

    // Core
    if (p === '/analyze-lead') return analyzeLeadHandler(req, res);
    if (p === '/messages') return messagesHandler(req, res);
    if (p === '/sync-inbox') return syncInboxHandler(req, res);

    // AI
    if (p === '/ai/reply') return aiReplyHandler(req, res);

    // Gmail (current)
    if (p === '/gmail/connect') return gmailConnectHandler(req, res);
    if (p === '/gmail/callback') return gmailCallbackHandler(req, res);
    if (p === '/gmail/status') return gmailStatusHandler(req, res);
    if (p === '/gmail/sync') return gmailSyncHandler(req, res);
    if (p === '/gmail/disconnect') return gmailDisconnectHandler(req, res);
    if (p === '/gmail/send') return gmailSendHandler(req, res);

    // Gmail (legacy URLs)
    if (p === '/connect-gmail') return legacyConnectGmailHandler(req, res);
    if (p === '/gmail-callback') return legacyGmailCallbackHandler(req, res);

    return res.status(404).json({ ok: false, error: 'Not found', path: p });
  } catch (e) {
    console.error('[api-router] fatal', e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}


