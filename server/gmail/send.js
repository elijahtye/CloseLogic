// Gmail Send Endpoint
// POST /api/gmail/send
// Sends an email via Gmail API using stored server-side tokens in email_accounts.
// Requires Authorization: Bearer <supabase access token>

import { validateSupabaseJwt } from '../lib/auth.js';
import { supabaseAdmin } from '../_utils/supabaseAdmin.js';

function planRank(plan) {
  const p = String(plan || '').toLowerCase();
  if (p === 'broker') return 2;
  if (p === 'agent') return 1;
  return 0; // viewer (or unknown)
}

async function requireMinPlan({ userId, minPlan }) {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch plan: ${error.message}`);
  const plan = profile?.plan || 'viewer';
  return { ok: planRank(plan) >= planRank(minPlan), plan };
}

function pickExpiry(emailAccount) {
  return emailAccount?.token_expires_at || emailAccount?.expires_at || null;
}

async function refreshAccessToken(refreshToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }).toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  return await response.json();
}

function base64UrlEncode(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function buildRawEmail({ to, subject, body, fromName }) {
  const safeSubject = String(subject || '').replace(/\r?\n/g, ' ').trim();
  const safeTo = String(to || '').trim();
  const displayFrom = fromName ? `${fromName}` : '';

  // Minimal RFC 2822 email. Gmail will set From based on the authenticated account.
  return [
    `To: ${safeTo}`,
    `Subject: ${safeSubject || 'Re:'}`,
    displayFrom ? `From: ${displayFrom}` : null,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    String(body || '')
  ].filter(Boolean).join('\r\n');
}

export default async function handler(req, res) {
  try {
    // CORS
    const origin = req.headers.origin || req.headers.get?.('origin');
    if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    const auth = await validateSupabaseJwt(req);
    if (!auth.ok) {
      return res.status(auth.status || 401).json({ success: false, error: auth.error || 'Unauthorized' });
    }

    // Tier enforcement: sending emails is Agent+ (Viewer is read-only)
    const planCheck = await requireMinPlan({ userId: auth.userId, minPlan: 'agent' });
    if (!planCheck.ok) {
      return res.status(403).json({
        success: false,
        error: 'tier_restriction',
        details: `Email sending requires Agent tier (current: ${planCheck.plan})`
      });
    }

    const bodyObj = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const leadId = bodyObj.lead_id;
    const subject = bodyObj.subject;
    const body = bodyObj.body;

    if (!leadId || !String(leadId).trim()) {
      return res.status(400).json({ success: false, error: 'lead_id is required' });
    }
    if (!body || !String(body).trim()) {
      return res.status(400).json({ success: false, error: 'body is required' });
    }

    console.log('[gmail-send] Endpoint hit', { user_id: auth.userId, lead_id: leadId });

    // Load lead (ownership enforced)
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('id,user_id,lead_name,lead_email')
      .eq('id', leadId)
      .eq('user_id', auth.userId)
      .single();
    if (leadError || !lead) {
      return res.status(403).json({ success: false, error: 'Lead not found or access denied' });
    }

    // Load connected Gmail account
    const { data: emailAccount, error: accountError } = await supabaseAdmin
      .from('email_accounts')
      .select('id,status,email_address,access_token,refresh_token,token_expires_at,expires_at,token_scope,granted_scopes')
      .eq('user_id', auth.userId)
      .eq('provider', 'gmail')
      .maybeSingle();
    if (accountError) {
      return res.status(500).json({ success: false, error: `Failed to fetch email account: ${accountError.message}` });
    }
    if (!emailAccount || emailAccount.status !== 'connected') {
      return res.status(400).json({ success: false, error: 'not_connected' });
    }
    if (!emailAccount.access_token) {
      return res.status(400).json({ success: false, error: 'Gmail tokens not found. Please reconnect your Gmail account.' });
    }

    const scopes = String(emailAccount.granted_scopes || emailAccount.token_scope || '');
    const hasSendScope = scopes.includes('https://www.googleapis.com/auth/gmail.send');
    if (!hasSendScope) {
      return res.status(400).json({
        success: false,
        error: 'missing_scope',
        details: 'Missing Gmail send permission. Please reconnect Gmail to grant send access.'
      });
    }

    // Refresh if expired
    let accessToken = emailAccount.access_token;
    const expiresAt = pickExpiry(emailAccount);
    if (expiresAt && new Date(expiresAt) < new Date()) {
      if (!emailAccount.refresh_token) {
        return res.status(400).json({
          success: false,
          error: 'expired_no_refresh',
          details: 'Access token expired and no refresh token available. Please reconnect your Gmail account.'
        });
      }
      const refreshData = await refreshAccessToken(emailAccount.refresh_token);
      accessToken = refreshData.access_token;
      const newExpiresAt = refreshData.expires_in
        ? new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
        : null;
      await supabaseAdmin
        .from('email_accounts')
        .update({
          access_token: accessToken,
          token_expires_at: newExpiresAt,
          expires_at: newExpiresAt,
          updated_at: new Date().toISOString()
        })
        .eq('id', emailAccount.id);
    }

    const rawEmail = buildRawEmail({
      to: lead.lead_email,
      subject,
      body,
      fromName: null
    });

    const sendOnce = async (token) => {
      const resp = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: base64UrlEncode(rawEmail) })
      });
      const txt = await resp.text();
      let json;
      try { json = JSON.parse(txt); } catch { json = null; }
      return { resp, txt, json };
    };

    // Try send; if 401, refresh once and retry (handles edge expiry)
    let sendResult = await sendOnce(accessToken);
    if (sendResult.resp.status === 401 && emailAccount.refresh_token) {
      console.warn('[gmail-send] Gmail returned 401, attempting refresh+retry');
      const refreshData = await refreshAccessToken(emailAccount.refresh_token);
      accessToken = refreshData.access_token;
      const newExpiresAt = refreshData.expires_in
        ? new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
        : null;
      await supabaseAdmin
        .from('email_accounts')
        .update({
          access_token: accessToken,
          token_expires_at: newExpiresAt,
          expires_at: newExpiresAt,
          updated_at: new Date().toISOString()
        })
        .eq('id', emailAccount.id);
      sendResult = await sendOnce(accessToken);
    }

    if (!sendResult.resp.ok) {
      const msg = sendResult.json?.error?.message || sendResult.txt?.slice(0, 200) || `HTTP ${sendResult.resp.status}`;
      console.error('[gmail-send] Send failed:', { status: sendResult.resp.status, error: msg });
      // Mark account error (non-destructive)
      await supabaseAdmin
        .from('email_accounts')
        .update({
          status: sendResult.resp.status === 401 ? 'error' : 'connected',
          last_error: msg,
          updated_at: new Date().toISOString()
        })
        .eq('id', emailAccount.id);
      return res.status(sendResult.resp.status === 401 ? 401 : 500).json({ success: false, error: msg });
    }

    const gmailMessageId = sendResult.json?.id || null;
    const gmailThreadId = sendResult.json?.threadId || null;
    console.log('[gmail-send] Sent successfully', { user_id: auth.userId, lead_id: leadId, gmail_message_id: gmailMessageId });

    return res.status(200).json({
      success: true,
      lead_id: leadId,
      sent: true,
      gmail_message_id: gmailMessageId,
      gmail_thread_id: gmailThreadId
    });
  } catch (err) {
    console.error('[gmail-send] Unexpected error:', { error: err?.message || String(err) });
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
}


