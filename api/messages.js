// CloseLogic Messages API
// POST /api/messages - Insert message and automatically analyze lead

import { createClient } from '@supabase/supabase-js';
import { analyzeLead } from './lib/analyzeLead.js';

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
 * Main handler function (Vercel serverless)
 */
export default async function handler(req, res) {
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
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        console.log('[messages] Message creation request received');
        
        // 1. Authenticate request
        const token = getAuthToken(req);
        if (!token) {
            console.log('[messages] No auth token provided');
            return res.status(401).json({ error: 'Unauthorized: No token provided' });
        }
        
        const userId = await validateAuth(token);
        if (!userId) {
            console.log('[messages] Invalid auth token');
            return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }
        
        console.log('[messages] Authenticated user:', userId);
        
        // 2. Parse and validate request body
        const body = req.body || {};
        const { lead_id, direction, subject, body: messageBody, sent_at } = body;
        
        if (!lead_id || !direction || !messageBody) {
            return res.status(400).json({ 
                error: 'lead_id, direction, and body are required' 
            });
        }
        
        if (!['inbound', 'outbound'].includes(direction)) {
            return res.status(400).json({ 
                error: 'direction must be "inbound" or "outbound"' 
            });
        }
        
        // 3. Get Supabase service client
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error('Supabase service role key missing');
        }
        
        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });
        
        // 4. Verify lead ownership
        const { data: lead, error: leadError } = await supabase
            .from('leads')
            .select('id, user_id, score')
            .eq('id', lead_id)
            .eq('user_id', userId)
            .single();
        
        if (leadError || !lead) {
            return res.status(403).json({ error: 'Lead not found or access denied' });
        }
        
        // 5. Insert message
        const messageData = {
            lead_id: lead_id,
            user_id: userId,
            direction: direction,
            subject: subject || null,
            body: messageBody,
            sent_at: sent_at || new Date().toISOString()
        };
        
        const { data: insertedMessage, error: insertError } = await supabase
            .from('messages')
            .insert(messageData)
            .select()
            .single();
        
        if (insertError) {
            console.error('[messages] Error inserting message:', insertError);
            return res.status(500).json({ error: 'Failed to insert message' });
        }
        
        console.log('[messages] Message inserted successfully:', insertedMessage.id);
        
        // 6. Update lead's last_message_at
        await supabase
            .from('leads')
            .update({
                last_message_at: messageData.sent_at,
                updated_at: new Date().toISOString()
            })
            .eq('id', lead_id)
            .eq('user_id', userId);
        
        // 7. Automatically trigger lead analysis (async, don't wait)
        // Trigger rules:
        // - Always on new inbound message
        // - Or if lead has no score yet (backfill)
        const shouldAnalyze = direction === 'inbound';

        if (shouldAnalyze) {
            analyzeLead(lead_id, userId, { force: false, triggerCreatedAt: insertedMessage.created_at })
                .then((result) => {
                    console.log('[messages] Automatic analysis completed for lead:', lead_id, {
                        deal_probability: result.deal_probability,
                        confidence: result.confidence
                    });
                })
                .catch((error) => {
                    // Log full error details - don't silently fail
                    console.error('[messages] ERROR in automatic analysis:', {
                        lead_id: lead_id,
                        error: error.message,
                        stack: error.stack,
                        name: error.name
                    });
                    // Don't fail the request if analysis fails, but log it prominently
                });
        }
        
        // 8. Return success (analysis runs in background)
        return res.status(200).json({
            success: true,
            message: insertedMessage,
            analysis_triggered: true
        });
        
    } catch (error) {
        console.error('[messages] Error in messages endpoint:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

