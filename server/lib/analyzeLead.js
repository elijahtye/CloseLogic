// CloseLogic Lead Analysis Library
// PRODUCTION-SAFE: No fallbacks, strict validation, only OpenAI scoring

import { createClient } from '@supabase/supabase-js';
import { buildPersonalizationBlock, getAgentProfile, promptHash, safeProfileLog } from './agentPersonalization.js';

/**
 * Analyze a lead using OpenAI
 * @param {string} leadId - UUID of the lead to analyze
 * @param {string} userId - UUID of the authenticated user
 * @param {Object} options - Options object
 * @returns {Promise<Object>} Analysis results from OpenAI ONLY
 */
export async function analyzeLead(leadId, userId, options = {}) {
    // Validate environment variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Supabase configuration missing: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }
    
    if (!openaiKey) {
        throw new Error('OpenAI API key missing: OPENAI_API_KEY is required');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
    
    console.log('[AI_ANALYSIS] Starting analysis', { lead_id: leadId, user_id: userId });
    
    // Fetch lead and verify ownership
    const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .eq('user_id', userId)
        .single();
    
    if (leadError || !lead) {
        console.error('[AI_ERROR] Lead not found or access denied:', { leadId, userId, error: leadError });
        throw new Error('Lead not found or access denied');
    }
    
    // Double-check ownership
    if (lead.user_id !== userId) {
        console.error('[AI_ERROR] Ownership mismatch:', { leadUserId: lead.user_id, authUserId: userId });
        throw new Error('Access denied: Lead ownership mismatch');
    }
    
    // Fetch ALL messages for full conversation context
    const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('lead_id', leadId)
        .order('sent_at', { ascending: false });
    
    if (messagesError) {
        console.error('[AI_ERROR] Error fetching messages:', messagesError);
        throw new Error(`Failed to fetch messages: ${messagesError.message}`);
    }
    
    const messagesList = messages || [];
    console.log('[AI_ANALYSIS] Fetched messages', { lead_id: leadId, message_count: messagesList.length });
    
    // TASK A.2: Ensure messages array exists and has at least 1 message
    if (messagesList.length === 0) {
        console.error('[AI_ERROR] No messages found for lead:', leadId);
        throw new Error('Lead must have at least 1 message to analyze');
    }

    // Idempotency check: skip if already analyzed
    const latestInbound = messagesList.find(m => m.direction === 'inbound');
    const latestInboundSentAt = latestInbound?.sent_at ? new Date(latestInbound.sent_at) : null;
    const triggerCreatedAt = options.triggerCreatedAt ? new Date(options.triggerCreatedAt) : null;

    const { data: existingScore } = await supabase
        .from('lead_scores')
        .select('deal_probability, confidence, reason, recommended_actions, classification, created_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    // Fetch existing lead data for pipeline values
    const { data: existingLead } = await supabase
        .from('leads')
        .select('pipeline_value, estimated_price_min, estimated_price_max, classification')
        .eq('id', leadId)
        .single();

    if (!options.force && existingScore) {
        const scoreCreatedAt = existingScore.created_at ? new Date(existingScore.created_at) : null;
        const coversTrigger = scoreCreatedAt && triggerCreatedAt && scoreCreatedAt.getTime() >= triggerCreatedAt.getTime();
        const coversLatestInbound = scoreCreatedAt && latestInboundSentAt && scoreCreatedAt.getTime() >= latestInboundSentAt.getTime();
        if (coversTrigger || coversLatestInbound) {
            console.log('[AI_ANALYSIS] Returning existing score (idempotency)', { lead_id: leadId });
            return {
                deal_probability: existingScore.deal_probability,
                lead_score: existingScore.deal_probability,
                confidence: existingScore.confidence,
                reason: existingScore.reason,
                recommended_actions: existingScore.recommended_actions || [],
                classification: existingScore.classification, // TASK E: Use OpenAI classification, no fallback
                has_pricing_intent: existingLead?.pipeline_value !== null && existingLead?.pipeline_value !== undefined,
                estimated_price_min: existingLead?.estimated_price_min ?? null,
                estimated_price_max: existingLead?.estimated_price_max ?? null,
                pipeline_value: existingLead?.pipeline_value ?? null
            };
        }
    }
    
    // Fetch agent profile for personalization (REQUIRED)
    const profileData = await getAgentProfile(supabase, userId);
    if (!profileData) {
        console.error('[AI_PERSONALIZATION] Missing profile row for user:', { user_id: userId });
        throw new Error('missing_profile');
    }
    
    // TASK A.3: Call OpenAI with strict error handling
    console.log('[AI_ANALYSIS] Calling OpenAI API', { lead_id: leadId, message_count: messagesList.length });
    
    let analysis;
    try {
        analysis = await callOpenAI(lead, messagesList, profileData);
        console.log('[AI_OPENAI_RESPONSE] OpenAI response received', {
            lead_id: leadId,
            score: analysis.lead_score,
            classification: analysis.classification,
            has_pricing_intent: analysis.has_pricing_intent
        });
    } catch (openaiError) {
        // TASK A.3: Log OpenAI failure with full details
        console.error('[AI_ERROR] OpenAI API call failed:', {
            lead_id: leadId,
            error: openaiError.message,
            stack: openaiError.stack,
            name: openaiError.name
        });
        // Re-throw to be caught by caller
        throw new Error(`OpenAI analysis failed: ${openaiError.message}`);
    }
    
    // TASK B: Save to Supabase with only known columns
    try {
        await saveAnalysis(supabase, leadId, userId, analysis);
        console.log('[AI_DB_WRITE] Analysis saved successfully', { lead_id: leadId });
    } catch (dbError) {
        // TASK B: Log exact Supabase error
        console.error('[AI_ERROR] Database write failed:', {
            lead_id: leadId,
            error: dbError.message,
            stack: dbError.stack
        });
        throw new Error(`Failed to save analysis: ${dbError.message}`);
    }
    
    return analysis;
}

/**
 * Call OpenAI API to analyze lead
 * TASK A.4: Enforce STRICT response parsing
 */
async function callOpenAI(lead, messages, profile) {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    
    if (!apiKey) {
        console.error('[AI_ERROR] OPENAI_API_KEY is missing');
        throw new Error('OpenAI API key missing - check environment variables');
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
    
    // Build lead context
    const leadContext = `
Lead Name: ${lead.lead_name || 'Unknown'}
Lead Email: ${lead.lead_email}
Source: ${lead.source || 'Unknown'}
Last Message At: ${lead.last_message_at ? new Date(lead.last_message_at).toLocaleString() : 'N/A'}
`;
    
    const systemPrompt = `You are a real estate CRM assistant analyzing lead engagement and pricing.
Analyze the conversation thread and determine lead score, classification, and pipeline value estimation.

CRITICAL: You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations. Just pure JSON.

MANDATORY OUTPUT FORMAT (exactly this structure):
{
  "score": <integer 0-100>,
  "classification": "cold" | "warm" | "hot",
  "confidence": "low" | "medium" | "high",
  "reasoning": "<string <= 200 chars>",
  "recommended_actions": ["<string>", ...],
  "estimated_price_min": <integer | null>,
  "estimated_price_max": <integer | null>,
  "pipeline_value": <integer | null>
}

CLASSIFICATION MAPPING (must match score):
- score 0-49 → "cold" (low quality, low engagement)
- score 50-79 → "warm" (medium quality, moderate engagement)
- score 80-100 → "hot" (high quality, strong engagement)

CRITICAL NUMERIC FORMAT RULES:
- estimated_price_min and estimated_price_max MUST be integers with NO currency symbols ($) and NO commas
- Example: 350000 (NOT "$350,000" or "350,000")
- pipeline_value MUST be a number or null (NO currency symbols, NO commas)
- If you provide ANY price estimate, ALL numeric fields MUST be present as numbers (NOT null)
- If you CANNOT reasonably estimate price from the thread, ALL numeric fields MUST be null

PIPELINE ESTIMATION RULES (STRICT):
You may ONLY estimate price/pipeline_value if the thread includes at least ONE of:
- Property type (house, condo, townhome, etc.)
- Bedroom count
- Budget or price range
- Timeline ("soon", "this month", "ready now")
- Buying intent language ("looking to buy", "ready to move forward")

If NONE are present:
- Set estimated_price_min = null
- Set estimated_price_max = null
- Set pipeline_value = null
- DO NOT estimate price
- DO NOT create placeholders
- DO NOT infer pricing

PRICE ESTIMATION MODES:
1) If the thread includes explicit dollar amounts (budget/price range), use those (EXPLICIT).
2) If no explicit dollars are mentioned BUT there is sufficient property context (at minimum: location/area + property type AND at least one of beds/baths/timeline/features like waterfront), provide a MARKET-BASED estimate range.
   - Use a WIDE range if uncertain.
   - If only a single point estimate is possible, set min = max.
   - Example: "3 bed 2 bath oceanfront condo in Myrtle Beach" → return a reasonable min/max range (market-based), not null.

PIPELINE VALUE CALCULATION (applies to both explicit and market-based estimates):
- IMPORTANT: pipeline_value is NOT an "ego number". It is an EXPECTED VALUE estimate that MUST align with score.
  - Score ranges: 0-49 (LOW), 50-79 (MEDIUM), 80-100 (HIGH)
  - If range exists: expected_midpoint = (estimated_price_min + estimated_price_max) / 2
  - If single price: expected_midpoint = price
  - Base calculation: pipeline_value = round_to_nearest_1000(expected_midpoint * (score / 100))
  - BUT: Apply score-based caps to ensure consistency:
    * Score 0-49: pipeline_value capped at 30% of midpoint (low engagement = low expected value)
    * Score 50-79: pipeline_value capped at 65% of midpoint (moderate engagement = moderate expected value)
    * Score 80-100: pipeline_value can be full expected value (high engagement = high expected value)
- Probability is inferred from: urgency, clarity, specificity, buyer readiness
- CRITICAL: Never return high pipeline_value (>$100k) with low scores (<50) - this violates consistency rules
- MUST return all fields as numbers (not strings, not null)

SCORING RULES (STRICT):
- score and classification must ALWAYS be returned (REQUIRED)
- Score ranges determine lead quality:
  * 0-49 = LOW quality (cold leads, low engagement, vague intent)
  * 50-79 = MEDIUM quality (warm leads, moderate engagement, some buying signals)
  * 80-100 = HIGH quality (hot leads, strong engagement, clear buying intent)
- Pipeline fields must ONLY be populated if you can reasonably estimate price from the thread (explicit OR market-based)
- CRITICAL: Score and pipeline_value MUST be consistent:
  * If score is 0-49 (LOW), pipeline_value should be LOW (proportionally reduced)
  * If score is 50-79 (MEDIUM), pipeline_value should be MEDIUM (moderate expected value)
  * If score is 80-100 (HIGH), pipeline_value can be HIGH (full expected value)
- Do NOT return high pipeline_value (>$100k) with low scores (<50) - this is inconsistent
- Do NOT infer pricing if information is too vague (missing location/area OR property context)
- If you provide a market-based estimate, keep confidence at "low" unless the thread is very specific

CONFIDENCE RULES (STRICT):
- confidence reflects how certain you are based ONLY on evidence in the thread (NOT gut feel).
- "high": multiple strong, consistent buying signals; explicit next steps; clear details (timeline/budget/requirements) and the thread supports it.
- "medium": some signals and engagement, but key details are missing or intent is not fully confirmed.
- "low": limited information (very short thread), vague intent, conflicting signals, or the user is mostly browsing.`;

    const developerPrompt = buildPersonalizationBlock(profile);
    
    const userPrompt = `Analyze this real estate lead:

${leadContext}

Conversation Thread (${messages.length} messages):
${conversationText || 'No messages yet.'}

REQUIRED ANALYSIS:
1. Determine score (0-100) based on engagement, responsiveness, and buying signals:
   - 0-49 = LOW quality (cold leads, low engagement, vague intent)
   - 50-79 = MEDIUM quality (warm leads, moderate engagement, some buying signals)
   - 80-100 = HIGH quality (hot leads, strong engagement, clear buying intent)
2. Classify as "cold" (0-49), "warm" (50-79), or "hot" (80-100) based on score
3. Estimate price + pipeline value:
   - If message contains explicit price ranges (e.g., "$350,000 to $450,000", "budget 400k"), use those.
   - If NO explicit dollars but sufficient property context exists (location/area + property type + beds/baths/features/timeline), provide a market-based estimate range.
   - estimated_price_min and estimated_price_max = integers if you can estimate, null otherwise (if single point estimate, set min=max)
   - pipeline_value = calculated expected value if you can estimate, null otherwise
   - CRITICAL: pipeline_value MUST align with score (low score = low pipeline_value, high score = high pipeline_value)
4. Provide confidence, reasoning, and recommended_actions

Return JSON with score, classification, confidence, reasoning, recommended_actions, estimated_price_min, estimated_price_max, and pipeline_value.`;
    
    const requestBody = {
        model: model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'developer', content: developerPrompt },
            { role: 'user', content: userPrompt }
        ],
        temperature: 0,
        response_format: { type: 'json_object' }
    };

    // Personalization + prompt hash logging (no PII)
    const ph = promptHash(requestBody.messages);
    console.log('[AI_PERSONALIZATION] Using profile', { user_id: lead.user_id, profile: safeProfileLog(profile), prompt_hash: ph });
    
    // TASK D: Log request details
    console.log('[AI_OPENAI_RESPONSE] Sending request to OpenAI', {
        model: model,
        message_count: messages.length,
        conversation_length: conversationText.length,
        prompt_length: userPrompt.length
    });
    
    // TASK A.3: Wrap OpenAI call in try/catch
    let response;
    try {
        response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });
    } catch (fetchError) {
        console.error('[AI_ERROR] OpenAI fetch failed:', {
            error: fetchError.message,
            stack: fetchError.stack
        });
        throw new Error(`OpenAI API request failed: ${fetchError.message}`);
    }
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('[AI_ERROR] OpenAI API error:', {
            status: response.status,
            statusText: response.statusText,
            error: errorText
        });
        throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    // TASK D: Log raw response
    console.log('[AI_OPENAI_RESPONSE] Raw OpenAI response:', {
        model: data.model,
        usage: data.usage,
        content_length: content?.length || 0,
        content_preview: content?.substring(0, 500) || 'null'
    });
    
    if (!content) {
        console.error('[AI_ERROR] No content in OpenAI response:', JSON.stringify(data, null, 2));
        throw new Error('No content from OpenAI - check API response');
    }
    
    // TASK A.4: STRICT JSON parsing - hard fail if parse fails
    let analysis;
    try {
        analysis = JSON.parse(content);
        console.log('[AI_OPENAI_RESPONSE] Parsed OpenAI response:', JSON.stringify(analysis, null, 2));
    } catch (parseError) {
        const rawSnippet = content.substring(0, 300);
        console.error('[AI_ERROR] OpenAI JSON parse failed:', {
            error: parseError.message,
            raw_snippet: rawSnippet,
            content_length: content.length
        });
        throw new Error(`OpenAI JSON parse failed: ${parseError.message}. Raw response snippet: ${rawSnippet}`);
    }
    
    // TASK A.4: Enforce STRICT validation of required fields
    // Required: score, classification, confidence, reasoning
    if (typeof analysis.score !== 'number') {
        console.error('[AI_ERROR] Invalid score type:', typeof analysis.score, analysis.score);
        throw new Error(`Invalid score: expected number, got ${typeof analysis.score}`);
    }
    
    if (analysis.score < 0 || analysis.score > 100) {
        console.error('[AI_ERROR] score out of range:', analysis.score);
        throw new Error(`Invalid score: must be 0-100, got ${analysis.score}`);
    }
    
    if (!['cold', 'warm', 'hot'].includes(analysis.classification)) {
        console.error('[AI_ERROR] Invalid classification value:', analysis.classification);
        throw new Error(`Invalid classification: must be "cold", "warm", or "hot", got "${analysis.classification}"`);
    }
    
    if (!['low', 'medium', 'high'].includes(analysis.confidence)) {
        console.error('[AI_ERROR] Invalid confidence value:', analysis.confidence);
        throw new Error(`Invalid confidence: must be "low", "medium", or "high", got "${analysis.confidence}"`);
    }
    
    // Validate reasoning field
    const reasoning = analysis.reasoning !== undefined ? analysis.reasoning : analysis.reason;
    if (!reasoning || typeof reasoning !== 'string') {
        console.error('[AI_ERROR] Missing or invalid reasoning:', reasoning, analysis);
        throw new Error(`Missing or invalid reasoning field: ${typeof reasoning}`);
    }
    
    // Truncate reasoning if too long
    const truncatedReasoning = reasoning.length > 200 ? reasoning.substring(0, 200) : reasoning;
    
    // Ensure recommended_actions exists
    if (!Array.isArray(analysis.recommended_actions)) {
        analysis.recommended_actions = [];
    }
    
    // TASK A.4: Validate pipeline fields conditionally - STRICT validation
    const hasPricingInfo = analysis.estimated_price_min !== null && 
                          analysis.estimated_price_min !== undefined &&
                          analysis.estimated_price_max !== null && 
                          analysis.estimated_price_max !== undefined;
    
    if (hasPricingInfo) {
        // All pricing fields must be present and valid numbers
        let priceMin = analysis.estimated_price_min;
        let priceMax = analysis.estimated_price_max;
        let pipelineVal = analysis.pipeline_value;
        
        // Convert strings to numbers if needed (strip $ and commas)
        if (typeof priceMin === 'string') {
            priceMin = parseInt(priceMin.replace(/[$,]/g, ''), 10);
            if (isNaN(priceMin)) {
                throw new Error(`Invalid estimated_price_min: cannot parse "${analysis.estimated_price_min}" as number`);
            }
        }
        if (typeof priceMax === 'string') {
            priceMax = parseInt(priceMax.replace(/[$,]/g, ''), 10);
            if (isNaN(priceMax)) {
                throw new Error(`Invalid estimated_price_max: cannot parse "${analysis.estimated_price_max}" as number`);
            }
        }
        if (typeof pipelineVal === 'string') {
            pipelineVal = parseInt(pipelineVal.replace(/[$,]/g, ''), 10);
            if (isNaN(pipelineVal)) {
                throw new Error(`Invalid pipeline_value: cannot parse "${analysis.pipeline_value}" as number`);
            }
        }
        
        // Validate numeric types and ranges
        if (typeof priceMin !== 'number' || priceMin <= 0) {
            throw new Error(`Invalid estimated_price_min: must be positive number, got ${priceMin} (type: ${typeof priceMin})`);
        }
        if (typeof priceMax !== 'number' || priceMax <= 0) {
            throw new Error(`Invalid estimated_price_max: must be positive number, got ${priceMax} (type: ${typeof priceMax})`);
        }
        if (priceMax < priceMin) {
            throw new Error(`Invalid price range: max (${priceMax}) < min (${priceMin})`);
        }
        if (pipelineVal === null || pipelineVal === undefined) {
            throw new Error('pipeline_value is required when pricing information is present');
        }
        if (typeof pipelineVal !== 'number' || pipelineVal < 0) {
            throw new Error(`Invalid pipeline_value: must be non-negative number, got ${pipelineVal} (type: ${typeof pipelineVal})`);
        }
        
        // Round to integers
        analysis.estimated_price_min = Math.round(priceMin);
        analysis.estimated_price_max = Math.round(priceMax);
        // Reduce false precision: round expected value to the nearest $1,000
        analysis.pipeline_value = Math.round(pipelineVal / 1000) * 1000;
    } else {
        // TASK A.5: If no pricing info, ensure all fields are null
        if (analysis.estimated_price_min !== null && analysis.estimated_price_min !== undefined) {
            throw new Error('estimated_price_min must be null when pricing information is not present');
        }
        if (analysis.estimated_price_max !== null && analysis.estimated_price_max !== undefined) {
            throw new Error('estimated_price_max must be null when pricing information is not present');
        }
        if (analysis.pipeline_value !== null && analysis.pipeline_value !== undefined) {
            throw new Error('pipeline_value must be null when pricing information is not present');
        }
        // Ensure all are explicitly null
        analysis.estimated_price_min = null;
        analysis.estimated_price_max = null;
        analysis.pipeline_value = null;
    }
    
    // Round score to integer
    const leadScore = Math.round(analysis.score);

    // Normalize classification to satisfy DB constraint (lead_scores_classification_matches_probability_check)
    // Updated mapping: cold 0-50, warm 51-79, hot 80-100
    let normalizedClassification = analysis.classification;
    if (leadScore >= 80) normalizedClassification = 'hot';
    else if (leadScore >= 50) normalizedClassification = 'warm';
    else normalizedClassification = 'cold';

    if (normalizedClassification !== analysis.classification) {
        console.warn('[AI_ANALYSIS] Normalized classification to match score', {
            lead_score: leadScore,
            openai_classification: analysis.classification,
            normalized_classification: normalizedClassification
        });
    }
    
    // CRITICAL: Validate and normalize pipeline_value to match score range
    // Score ranges (requested): 0-49 (low), 50-79 (medium), 80-100 (high)
    // Ensure pipeline_value is consistent with score
    if (hasPricingInfo && analysis.pipeline_value !== null && analysis.pipeline_value !== undefined) {
        const originalPipelineValue = analysis.pipeline_value;
        let normalizedPipelineValue = originalPipelineValue;
        
        // Calculate expected midpoint for reference
        const expectedMidpoint = analysis.estimated_price_min && analysis.estimated_price_max
            ? (analysis.estimated_price_min + analysis.estimated_price_max) / 2
            : analysis.estimated_price_min || analysis.estimated_price_max || 0;
        
        // Normalize based on score range
        if (leadScore < 50) {
            // LOW score (0-49): pipeline_value should be proportionally low
            // Cap at 30% of midpoint (low engagement = low expected value)
            const maxPipelineForLowScore = Math.round(expectedMidpoint * 0.30 / 1000) * 1000;
            if (normalizedPipelineValue > maxPipelineForLowScore) {
                normalizedPipelineValue = maxPipelineForLowScore;
                console.warn('[AI_ANALYSIS] Normalized pipeline_value for LOW score', {
                    original_score: leadScore,
                    original_pipeline_value: originalPipelineValue,
                    normalized_pipeline_value: normalizedPipelineValue,
                    reason: 'Score 0-49 requires low pipeline_value'
                });
            }
        } else if (leadScore >= 50 && leadScore <= 79) {
            // MEDIUM score (50-79): pipeline_value should be moderate
            // Cap at 65% of midpoint (moderate engagement = moderate expected value)
            const maxPipelineForMediumScore = Math.round(expectedMidpoint * 0.65 / 1000) * 1000;
            if (normalizedPipelineValue > maxPipelineForMediumScore) {
                normalizedPipelineValue = maxPipelineForMediumScore;
                console.warn('[AI_ANALYSIS] Normalized pipeline_value for MEDIUM score', {
                    original_score: leadScore,
                    original_pipeline_value: originalPipelineValue,
                    normalized_pipeline_value: normalizedPipelineValue,
                    reason: 'Score 50-79 requires medium pipeline_value'
                });
            }
        }
        // HIGH score (80-100): pipeline_value can be full expected value (no cap)
        
        analysis.pipeline_value = normalizedPipelineValue;
    }
    
    return {
        deal_probability: leadScore, // Keep for backward compatibility
        lead_score: leadScore,
        classification: normalizedClassification,
        has_pricing_intent: hasPricingInfo,
        estimated_price_min: analysis.estimated_price_min,
        estimated_price_max: analysis.estimated_price_max,
        pipeline_value: analysis.pipeline_value,
        confidence: analysis.confidence,
        reason: truncatedReasoning,
        recommended_actions: analysis.recommended_actions || []
    };
}

/**
 * Save analysis results to Supabase
 * TASK B: Only write to known columns, log errors
 */
async function saveAnalysis(supabase, leadId, userId, analysis) {
    // TASK B: Build update object using ONLY known columns
    // lead_scores table: deal_probability, confidence, reason, recommended_actions, classification, model_version
    const scoreInsertData = {
        lead_id: leadId,
        user_id: userId,
        deal_probability: analysis.deal_probability,
        confidence: analysis.confidence,
        reason: analysis.reason,
        recommended_actions: analysis.recommended_actions,
        classification: analysis.classification, // TASK E: Only from OpenAI
        model_version: process.env.OPENAI_MODEL || 'gpt-4o-mini'
    };
    
    console.log('[AI_DB_WRITE] Inserting lead_scores record', { lead_id: leadId });
    
    const { error: scoreError } = await supabase
        .from('lead_scores')
        .insert(scoreInsertData);
    
    if (scoreError) {
        console.error('[AI_ERROR] Failed to insert lead_scores:', {
            lead_id: leadId,
            error: scoreError.message,
            error_code: scoreError.code,
            error_details: scoreError
        });
        throw new Error(`Failed to save lead_scores: ${scoreError.message}`);
    }
    
    // TASK B: Update leads table with ONLY known columns
    // Known columns: score, classification, confidence, estimated_price_min, estimated_price_max, pipeline_value, last_analyzed_at, needs_followup, updated_at
    const leadUpdateData = {
        score: analysis.lead_score,
        confidence: analysis.confidence,
        classification: analysis.classification, // TASK E: Only from OpenAI
        needs_followup: analysis.lead_score >= 75, // High quality leads (80-100) and upper medium (75-79)
        updated_at: new Date().toISOString(),
        last_analyzed_at: new Date().toISOString()
    };
    
    // Only include pipeline fields if pricing info is present
    if (analysis.has_pricing_intent && 
        analysis.estimated_price_min !== null && 
        analysis.estimated_price_max !== null &&
        analysis.pipeline_value !== null) {
        // Ensure all are numbers (defensive)
        leadUpdateData.estimated_price_min = typeof analysis.estimated_price_min === 'number' 
            ? Math.round(analysis.estimated_price_min) 
            : null;
        leadUpdateData.estimated_price_max = typeof analysis.estimated_price_max === 'number'
            ? Math.round(analysis.estimated_price_max)
            : null;
        leadUpdateData.pipeline_value = typeof analysis.pipeline_value === 'number'
            ? Math.round(analysis.pipeline_value)
            : null;
        
        console.log('[AI_DB_WRITE] Writing pipeline values', {
            lead_id: leadId,
            estimated_price_min: leadUpdateData.estimated_price_min,
            estimated_price_max: leadUpdateData.estimated_price_max,
            pipeline_value: leadUpdateData.pipeline_value
        });
    } else {
        // Explicitly set to null if no pricing intent
        leadUpdateData.estimated_price_min = null;
        leadUpdateData.estimated_price_max = null;
        leadUpdateData.pipeline_value = null;
        
        console.log('[AI_DB_WRITE] No pricing intent - setting pipeline fields to NULL', {
            lead_id: leadId
        });
    }
    
    console.log('[AI_DB_WRITE] Updating leads record', { lead_id: leadId });
    
    const { data: updateResult, error: leadUpdateError } = await supabase
        .from('leads')
        .update(leadUpdateData)
        .eq('id', leadId)
        .eq('user_id', userId)
        .select('id, classification, score, confidence, pipeline_value, estimated_price_min, estimated_price_max, last_analyzed_at');
    
    if (leadUpdateError) {
        console.error('[AI_ERROR] Failed to update leads:', {
            lead_id: leadId,
            error: leadUpdateError.message,
            error_code: leadUpdateError.code,
            error_details: leadUpdateError,
            update_data: leadUpdateData
        });
        throw new Error(`Failed to update lead: ${leadUpdateError.message}`);
    }
    
    console.log('[AI_DB_WRITE] Successfully updated lead', {
        lead_id: leadId,
        updated_fields: updateResult?.[0] || 'no data returned'
    });
    
    return true;
}
