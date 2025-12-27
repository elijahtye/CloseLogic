// CloseLogic OpenAI Lead Analysis API
// Vercel serverless endpoint: POST /api/analyze-lead
// PRODUCTION-SAFE: No fallbacks, strict validation, clear errors

import { analyzeLead } from './lib/analyzeLead.js';
import { createClient } from '@supabase/supabase-js';

/**
 * Get authenticated user from Supabase token
 */
function getAuthToken(req) {
    const authHeader = req.headers.authorization || req.headers.get?.('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.substring(7);
}

/**
 * Validate Supabase token and get user ID
 */
async function validateAuth(token) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase configuration missing');
    }
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
        return null;
    }
    
    return user.id;
}

/**
 * Validate required environment variables
 */
function validateEnvVars() {
    const required = [
        'OPENAI_API_KEY',
        'SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY'
    ];
    const missing = required.filter(key => !process.env[key] || process.env[key].trim() === '');
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}

/**
 * Main handler function (Vercel serverless)
 */
export default async function handler(req, res) {
    let body = {};
    let lead_id = null;
    let userId = null;
    let ai_ran = false;
    
    try {
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        
        // Handle preflight
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }
        
        // Only allow POST
        if (req.method !== 'POST') {
            return res.status(405).json({ 
                success: false,
                ai_ran: false,
                error: 'Method not allowed' 
            });
        }
        
        // Validate environment variables FIRST (hard fail if missing)
        try {
            validateEnvVars();
            console.log('[AI_ANALYSIS] Environment variables validated');
        } catch (envError) {
            console.error('[AI_ERROR] Missing env vars:', envError.message);
            const missing = ['OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
                .filter(key => !process.env[key] || process.env[key].trim() === '');
            return res.status(500).json({ 
                success: false,
                ai_ran: false,
                error: `Missing required environment variables: ${missing.join(', ')}`
            });
        }
        
        // Parse request body
        try {
            body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
            lead_id = body.lead_id;
        } catch (parseError) {
            console.error('[AI_ERROR] Failed to parse request body:', parseError);
            return res.status(400).json({ 
                success: false,
                ai_ran: false,
                error: 'Invalid request body: ' + parseError.message
            });
        }
        
        // Authenticate request
        const token = getAuthToken(req);
        if (!token) {
            console.error('[AI_ERROR] No auth token provided');
            return res.status(401).json({ 
                success: false,
                ai_ran: false,
                error: 'Unauthorized: No token provided' 
            });
        }
        
        try {
            userId = await validateAuth(token);
        } catch (authError) {
            console.error('[AI_ERROR] Auth validation failed:', authError);
            return res.status(401).json({ 
                success: false,
                ai_ran: false,
                error: 'Unauthorized: ' + authError.message
            });
        }
        
        if (!userId) {
            console.error('[AI_ERROR] Invalid auth token');
            return res.status(401).json({ 
                success: false,
                ai_ran: false,
                error: 'Unauthorized: Invalid token' 
            });
        }
        
        // TASK A.1: Validate lead_id exists
        if (!lead_id || typeof lead_id !== 'string' || lead_id.trim() === '') {
            console.error('[AI_ERROR] Invalid lead_id:', lead_id);
            return res.status(400).json({ 
                success: false,
                ai_ran: false,
                lead_id: lead_id || null,
                error: 'lead_id is required and must be a non-empty string'
            });
        }
        
        // TASK A.2: Validate messages exist (fetch from DB first)
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });
        
        const { data: lead, error: leadError } = await supabase
            .from('leads')
            .select('id, user_id')
            .eq('id', lead_id)
            .eq('user_id', userId)
            .single();
        
        if (leadError || !lead) {
            console.error('[AI_ERROR] Lead not found or access denied:', { lead_id, userId, error: leadError });
            return res.status(404).json({ 
                success: false,
                ai_ran: false,
                lead_id,
                error: 'Lead not found or access denied'
            });
        }
        
        const { data: messages, error: messagesError } = await supabase
            .from('messages')
            .select('id')
            .eq('lead_id', lead_id)
            .limit(1);
        
        if (messagesError) {
            console.error('[AI_ERROR] Failed to fetch messages:', messagesError);
            return res.status(500).json({ 
                success: false,
                ai_ran: false,
                lead_id,
                error: `Failed to fetch messages: ${messagesError.message}`
            });
        }
        
        if (!messages || messages.length === 0) {
            console.error('[AI_ERROR] No messages found for lead:', lead_id);
            return res.status(400).json({ 
                success: false,
                ai_ran: false,
                lead_id,
                error: 'Lead must have at least 1 message to analyze'
            });
        }
        
        console.log('[AI_ANALYSIS] Starting analysis', { lead_id, user_id: userId, message_count: messages.length });
        
        // TASK A.3: Wrap OpenAI call in try/catch
        let analysis = null;
        try {
            ai_ran = true;
            console.log('[AI_ANALYSIS] Calling analyzeLead function');
            analysis = await analyzeLead(lead_id, userId, { force: false });
            console.log('[AI_OPENAI_RESPONSE] Analysis completed successfully', {
                lead_id,
                score: analysis.deal_probability,
                classification: analysis.classification,
                has_pricing_intent: analysis.has_pricing_intent,
                pipeline_value: analysis.pipeline_value
            });
        } catch (openaiError) {
            // TASK A.3: Log OpenAI failure details
            console.error('[AI_ERROR] OpenAI analysis failed:', {
                lead_id,
                error: openaiError.message,
                stack: openaiError.stack,
                name: openaiError.name
            });
            
            // If profile missing, block request explicitly (no fallbacks)
            if (String(openaiError?.message || '').includes('missing_profile')) {
                return res.status(400).json({
                    success: false,
                    ai_ran: false,
                    lead_id,
                    error: 'missing_profile'
                });
            }

            // TASK A.3: Return 502 with openai_failed error
            return res.status(502).json({
                success: false,
                ai_ran: false,
                lead_id,
                error: 'openai_failed',
                error_details: openaiError.message
            });
        }
        
        // TASK C: Return structured response with ai_ran flag
        return res.status(200).json({
            success: true,
            ai_ran: true,
            lead_id: lead_id,
            score: analysis.deal_probability,
            classification: analysis.classification,
            confidence: analysis.confidence,
            estimated_price_min: analysis.estimated_price_min,
            estimated_price_max: analysis.estimated_price_max,
            pipeline_value: analysis.pipeline_value,
            reason: analysis.reason,
            recommended_actions: analysis.recommended_actions
        });
        
    } catch (error) {
        // TASK D: Log with [AI_ERROR] prefix
        console.error('[AI_ERROR] Unexpected error in analyze-lead handler:', {
            error: error.message,
            stack: error.stack,
            name: error.name,
            lead_id: lead_id || null,
            user_id: userId || null
        });
        
        // Return structured error response
        return res.status(500).json({
            success: false,
            ai_ran: ai_ran,
            lead_id: lead_id || null,
            error: error?.message || String(error)
        });
    }
}
