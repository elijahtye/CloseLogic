// CloseLogic Lead Analysis Library
// Server-side function to analyze a lead using OpenAI
// Can be called from API endpoints or database triggers

import { createClient } from '@supabase/supabase-js';

/**
 * Analyze a lead using OpenAI
 * @param {string} leadId - UUID of the lead to analyze
 * @param {string} userId - UUID of the authenticated user
 * @returns {Promise<Object>} Analysis results
 */
export async function analyzeLead(leadId, userId) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Supabase configuration missing');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
    
    console.log(`[analyzeLead] Starting analysis for lead ${leadId}, user ${userId}`);
    
    // Fetch lead and verify ownership
    const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .eq('user_id', userId)
        .single();
    
    if (leadError || !lead) {
        throw new Error('Lead not found or access denied');
    }
    
    // Fetch most recent 10 messages
    const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('lead_id', leadId)
        .order('sent_at', { ascending: false })
        .limit(10);
    
    if (messagesError) {
        console.warn('[analyzeLead] Error fetching messages:', messagesError);
    }
    
    const messagesList = messages || [];
    console.log(`[analyzeLead] Fetched ${messagesList.length} messages`);
    
    // Fetch user profile for communication style
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('primary_goal, communication_style')
        .eq('id', userId)
        .single();
    
    if (profileError) {
        console.warn('[analyzeLead] Error fetching profile:', profileError);
    }
    
    const profileData = profile || {};
    
    // Call OpenAI
    const analysis = await callOpenAI(lead, messagesList, profileData);
    console.log('[analyzeLead] OpenAI analysis complete:', {
        deal_probability: analysis.deal_probability,
        confidence: analysis.confidence
    });
    
    // Save to Supabase
    await saveAnalysis(supabase, leadId, userId, analysis);
    console.log('[analyzeLead] Analysis saved successfully');
    
    return analysis;
}

/**
 * Call OpenAI API to analyze lead
 */
async function callOpenAI(lead, messages, profile) {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    
    if (!apiKey) {
        throw new Error('OpenAI API key missing');
    }
    
    // Build conversation context
    const conversationText = messages
        .reverse() // Reverse to chronological order
        .map(msg => {
            const sender = msg.direction === 'inbound' ? 'Lead' : 'Agent';
            const date = new Date(msg.sent_at).toLocaleDateString();
            return `${sender} (${date}): ${msg.body}`;
        })
        .join('\n\n');
    
    const leadContext = `
Lead Name: ${lead.lead_name || 'Unknown'}
Lead Email: ${lead.lead_email}
Source: ${lead.source || 'Unknown'}
Current Score: ${lead.score || 0}
Current Confidence: ${lead.confidence || 'low'}
Last Message At: ${lead.last_message_at ? new Date(lead.last_message_at).toLocaleString() : 'N/A'}
`;
    
    const communicationStyle = profile.communication_style || 'professional-direct';
    const styleMap = {
        'friendly-conversational': 'friendly and conversational',
        'professional-direct': 'professional and direct',
        'warm-supportive': 'warm and supportive',
        'short-efficient': 'short and efficient'
    };
    const styleDescription = styleMap[communicationStyle] || 'professional and direct';
    
    const systemPrompt = `You are a real estate CRM assistant analyzing lead engagement. 
Analyze the conversation thread and provide insights.

CRITICAL: You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations. Just pure JSON.

Output format:
{
  "deal_probability": <integer 0-100>,
  "confidence": "<low|medium|high>",
  "reason": "<short explanation <= 200 chars>",
  "signals": ["<signal 1>", "<signal 2>", ... 3-6 items],
  "recommended_actions": ["<imperative action 1>", "<imperative action 2>", ... 3-6 items]
}`;
    
    const userPrompt = `Analyze this real estate lead:

${leadContext}

Conversation Thread:
${conversationText || 'No messages yet.'}

Provide analysis with deal probability, confidence level, reason, engagement signals, and recommended actions.`;
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            response_format: { type: 'json_object' }
        })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('[analyzeLead] OpenAI API error:', response.status, errorText);
        throw new Error(`OpenAI API error: ${response.status}`);
    }
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
        throw new Error('No content from OpenAI');
    }
    
    // Parse JSON response
    let analysis;
    try {
        analysis = JSON.parse(content);
    } catch (parseError) {
        console.error('[analyzeLead] Failed to parse OpenAI response:', content);
        throw new Error('Invalid JSON from OpenAI');
    }
    
    // Validate required fields
    if (typeof analysis.deal_probability !== 'number' || 
        analysis.deal_probability < 0 || analysis.deal_probability > 100) {
        throw new Error('Invalid deal_probability');
    }
    
    if (!['low', 'medium', 'high'].includes(analysis.confidence)) {
        throw new Error('Invalid confidence value');
    }
    
    if (!Array.isArray(analysis.signals)) {
        analysis.signals = [];
    }
    
    if (!Array.isArray(analysis.recommended_actions)) {
        throw new Error('recommended_actions must be an array');
    }
    
    return {
        deal_probability: Math.round(analysis.deal_probability),
        confidence: analysis.confidence,
        reason: (analysis.reason || '').substring(0, 200),
        signals: analysis.signals.slice(0, 6),
        recommended_actions: analysis.recommended_actions.slice(0, 6)
    };
}

/**
 * Save analysis results to Supabase
 */
async function saveAnalysis(supabase, leadId, userId, analysis) {
    // Insert lead_scores record
    // Store signals in recommended_actions JSONB if signals field doesn't exist in schema
    // Otherwise, signals can be stored separately
    const { error: scoreError } = await supabase
        .from('lead_scores')
        .insert({
            lead_id: leadId,
            user_id: userId,
            deal_probability: analysis.deal_probability,
            confidence: analysis.confidence,
            reason: analysis.reason,
            recommended_actions: analysis.recommended_actions,
            model_version: process.env.OPENAI_MODEL || 'gpt-4o-mini'
        });
    
    if (scoreError) {
        console.error('[analyzeLead] Error saving lead_scores:', scoreError);
        throw new Error('Failed to save analysis');
    }
    
    // Update leads table
    const { error: leadUpdateError } = await supabase
        .from('leads')
        .update({
            score: analysis.deal_probability,
            confidence: analysis.confidence,
            needs_followup: analysis.deal_probability >= 60,
            updated_at: new Date().toISOString()
        })
        .eq('id', leadId)
        .eq('user_id', userId);
    
    if (leadUpdateError) {
        console.error('[analyzeLead] Error updating lead:', leadUpdateError);
        throw new Error('Failed to update lead');
    }
    
    return true;
}

