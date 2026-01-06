// Agent Personalization Helpers
// Used by all OpenAI calls (analysis + reply) to ensure per-user customization.

import crypto from 'crypto';

/**
 * Fetch agent profile fields required for personalization.
 * Guard: if missing profile row, return null (caller must block request).
 */
export async function getAgentProfile(supabase, userId) {
  if (!supabase) throw new Error('getAgentProfile requires a supabase client');
  if (!userId) throw new Error('getAgentProfile requires userId');

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('full_name, communication_style, primary_goal, lead_volume, plan, email, commission_rate, auto_analyze_leads')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch agent profile: ${error.message}`);
  }

  return profile || null;
}

/**
 * Builds a short, strict developer-message block.
 * This is injected as role: "developer" so it consistently influences all outputs.
 */
export function buildPersonalizationBlock(profile) {
  const style = profile?.communication_style || 'professional-direct';
  const goal = profile?.primary_goal || 'closing-more-deals';
  const leadVolume = profile?.lead_volume || 'unknown';
  const plan = profile?.plan || 'free';

  const styleRules = {
    'friendly-conversational': [
      'Tone: friendly, conversational, human.',
      'Use simple language and warmth, but stay professional.'
    ],
    'professional-direct': [
      'Tone: professional, direct, confident.',
      'Be concise and avoid fluff.'
    ],
    'warm-supportive': [
      'Tone: warm, supportive, reassuring.',
      'Acknowledge concerns and guide to next step.'
    ],
    'short-efficient': [
      'Tone: short, efficient, no-nonsense.',
      'Use minimal sentences and clear asks.'
    ]
  }[style] || [
    'Tone: professional, direct, confident.',
    'Be concise and avoid fluff.'
  ];

  const goalRules = {
    'closing-more-deals': [
      'Goal: drive toward a concrete next step (call / showing / scheduling).',
      'Always propose one clear CTA.'
    ],
    'responding-faster': [
      'Goal: respond quickly and reduce back-and-forth.',
      'Ask only the most necessary 1–2 questions and propose a time.'
    ],
    'prioritizing-leads': [
      'Goal: qualify efficiently.',
      'Ask 1–3 key qualification questions and suggest next action.'
    ],
    'reducing-overwhelm': [
      'Goal: keep things simple and structured.',
      'Use bullets where helpful, and keep asks limited.'
    ]
  }[goal] || [
    'Goal: drive toward a concrete next step (call / showing / scheduling).',
    'Always propose one clear CTA.'
  ];

  return [
    'AGENT PERSONALIZATION (must follow):',
    `Plan: ${plan}`,
    `Lead volume: ${leadVolume}`,
    `Communication style: ${style}`,
    `Primary goal: ${goal}`,
    '',
    ...styleRules,
    ...goalRules,
    '',
    'Hard constraints:',
    '- Do not hallucinate facts or pricing.',
    '- If key info is missing, ask 1–3 clarifying questions max.',
    '- Use the provided conversation only; do not invent extra context.',
    '- Never mention internal policies or that you are an AI.',
  ].join('\n');
}

/**
 * Hashes the prompt messages for observability without logging PII.
 */
export function promptHash(messages) {
  const payload = JSON.stringify(
    (messages || []).map((m) => ({ role: m.role, content: m.content }))
  );
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

export function safeProfileLog(profile) {
  return {
    has_full_name: !!profile?.full_name,
    communication_style: profile?.communication_style || null,
    primary_goal: profile?.primary_goal || null,
    lead_volume: profile?.lead_volume || null,
    plan: profile?.plan || null
  };
}


