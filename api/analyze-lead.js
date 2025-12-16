// CloseLogic OpenAI Lead Analysis API
// Vercel serverless endpoint: POST /api/analyze-lead
// NOTE: This endpoint is kept for manual triggering if needed
// Automatic analysis happens via /api/messages when messages are inserted

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
        console.log('Analyze lead request received');
        
        // 1. Authenticate request
        const token = await getAuthToken(req);
        if (!token) {
            console.log('No auth token provided');
            return res.status(401).json({ error: 'Unauthorized: No token provided' });
        }
        
        const userId = await validateAuth(token);
        if (!userId) {
            console.log('Invalid auth token');
            return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }
        
        console.log('Authenticated user:', userId);
        
        // 2. Parse and validate request body
        // Vercel automatically parses JSON bodies
        const body = req.body || {};
        const { lead_id } = body;
        
        if (!lead_id) {
            return res.status(400).json({ error: 'lead_id is required' });
        }
        
        console.log('Analyzing lead:', lead_id);
        
        // 3. Call analyzeLead function (reusable server-side function)
        const analysis = await analyzeLead(lead_id, userId);
        console.log('Analysis complete:', {
            deal_probability: analysis.deal_probability,
            confidence: analysis.confidence
        });
        
        // 4. Return response
        return res.status(200).json({
            success: true,
            analysis: {
                deal_probability: analysis.deal_probability,
                confidence: analysis.confidence,
                reason: analysis.reason,
                signals: analysis.signals,
                recommended_actions: analysis.recommended_actions
            }
        });
        
    } catch (error) {
        console.error('Error in analyze-lead:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

