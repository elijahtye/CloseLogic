// CloseLogic AI Reply Draft Endpoint (Phase 5)
// POST /api/ai/reply
// - Requires Authorization: Bearer <supabase access token>
// - Reads lead + recent messages (server-side, service role)
// - Calls OpenAI to draft a reply (subject + body) and returns JSON

import { supabaseAdmin } from '../_utils/supabaseAdmin.js';
import { validateSupabaseJwt } from '../lib/auth.js';
import { buildPersonalizationBlock, getAgentProfile, promptHash, safeProfileLog } from '../lib/agentPersonalization.js';

function json(res, status, payload) {
  return res.status(status).json(payload);
}

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

function validateEnv() {
  const required = ['OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter((k) => !process.env[k] || String(process.env[k]).trim() === '');
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

async function callOpenAI({ lead, profile, messages }) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const convo = (messages || [])
    .slice()
    .reverse() // oldest -> newest
    .map((m) => {
      const who = m.direction === 'inbound' ? 'Lead' : 'Agent';
      const ts = m.sent_at ? new Date(m.sent_at).toISOString() : 'unknown_time';
      const subj = m.subject ? `Subject: ${m.subject}\n` : '';
      return `${who} (${ts})\n${subj}${m.body}`;
    })
    .join('\n\n---\n\n');

  const system = [
    'You are an assistant helping a real estate agent respond to leads.',
    'Be concise, helpful, and specific.',
    'Ask 1–3 clarifying questions max (only if needed).',
    'Propose a clear next step (call / showing / quick scheduling).',
    'Do not mention that you are an AI.',
    '',
    'CRITICAL: Return ONLY valid JSON. No markdown. No code blocks. No extra keys.',
    'JSON format must be exactly:',
    '{"subject":"...","body":"...","notes":"..."}'
  ].join('\n');

  const developer = buildPersonalizationBlock(profile);

  const user = [
    `Lead name: ${lead?.lead_name || 'Unknown'}`,
    `Lead email: ${lead?.lead_email || 'unknown'}`,
    '',
    'Conversation (oldest to newest):',
    convo || '(no messages provided)',
    '',
    'Task: Draft the agent’s next outbound reply email.'
  ].join('\n');

  const messagesPayload = [
    { role: 'system', content: system },
    { role: 'developer', content: developer },
    { role: 'user', content: user }
  ];

  const ph = promptHash(messagesPayload);
  console.log('[ai-reply] Personalization', { user_id: lead?.user_id || null, profile: safeProfileLog(profile), prompt_hash: ph });

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: messagesPayload
    })
  });

  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`OpenAI returned non-JSON response (HTTP ${resp.status})`);
  }

  if (!resp.ok) {
    const msg = data?.error?.message || `OpenAI error (HTTP ${resp.status})`;
    throw new Error(msg);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('OpenAI response missing content');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Per requirements: do not do heavy fallbacks; return a clear error instead.
    throw new Error('Failed to parse OpenAI JSON content');
  }

  const subject = String(parsed?.subject || '').trim();
  const body = String(parsed?.body || '').trim();
  const notes = String(parsed?.notes || '').trim();

  if (!subject || !body) {
    throw new Error('OpenAI response missing subject/body');
  }

  return { subject, body, notes };
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });

  try {
    validateEnv();

    const auth = await validateSupabaseJwt(req);
    if (!auth.ok) {
      return json(res, auth.status || 401, { ok: false, error: auth.error || 'Unauthorized' });
    }

    // Tier enforcement: AI reply drafts are Agent+
    const planCheck = await requireMinPlan({ userId: auth.userId, minPlan: 'agent' });
    if (!planCheck.ok) {
      return json(res, 403, {
        ok: false,
        error: 'tier_restriction',
        details: `AI reply drafts require Agent tier (current: ${planCheck.plan})`
      });
    }

    const bodyObj = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const leadId = bodyObj.lead_id;
    if (!leadId) return json(res, 400, { ok: false, error: 'lead_id is required' });

    console.log('[ai-reply] Request received', { user_id: auth.userId, lead_id: leadId });

    // Profile (REQUIRED)
    const profile = await getAgentProfile(supabaseAdmin, auth.userId);
    if (!profile) {
      return json(res, 400, { ok: false, error: 'missing_profile' });
    }

    // Lead (ownership enforced)
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('id,user_id,lead_name,lead_email')
      .eq('id', leadId)
      .eq('user_id', auth.userId)
      .single();
    if (leadError || !lead) {
      return json(res, 403, { ok: false, error: 'Lead not found or access denied' });
    }

    // Recent messages for context (last 8, newest first)
    const { data: messages, error: msgError } = await supabaseAdmin
      .from('messages')
      .select('direction,subject,body,sent_at')
      .eq('lead_id', leadId)
      .eq('user_id', auth.userId)
      .order('sent_at', { ascending: false })
      .limit(8);
    if (msgError) {
      return json(res, 500, { ok: false, error: `Failed to fetch messages: ${msgError.message}` });
    }

    if (!messages || messages.length === 0) {
      return json(res, 400, { ok: false, error: 'No messages found for this lead' });
    }

    const draft = await callOpenAI({ lead, profile, messages });

    console.log('[ai-reply] Draft generated', {
      user_id: auth.userId,
      lead_id: leadId,
      subject_len: draft.subject.length,
      body_len: draft.body.length
    });

    return json(res, 200, {
      ok: true,
      lead_id: leadId,
      subject: draft.subject,
      body: draft.body,
      tone: profile?.communication_style || 'professional-direct',
      notes: draft.notes || ''
    });
  } catch (err) {
    console.error('[ai-reply] Error', { error: err?.message || String(err) });
    return json(res, 500, { ok: false, error: err?.message || String(err) });
  }
}


