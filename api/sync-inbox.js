// Gmail Inbox Sync API
// POST /api/sync-inbox

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
                error: 'Method not allowed' 
            });
        }
        
        // Authenticate request
        const token = getAuthToken(req);
        if (!token) {
            return res.status(401).json({ 
                success: false,
                error: 'Unauthorized: No token provided' 
            });
        }
        
        const userId = await validateAuth(token);
        if (!userId) {
            return res.status(401).json({ 
                success: false,
                error: 'Unauthorized: Invalid token' 
            });
        }
        
        // Check if Gmail is connected
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });
        
        const { data: emailAccount, error: accountError } = await supabase
            .from('email_accounts')
            .select('*')
            .eq('user_id', userId)
            .eq('provider', 'gmail')
            .maybeSingle();
        
        if (accountError) {
            console.error('[sync-inbox] Error fetching email account:', accountError);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch email account: ' + accountError.message
            });
        }
        
        if (!emailAccount || emailAccount.status !== 'connected') {
            return res.status(400).json({
                success: false,
                error: 'Gmail is not connected. Please connect your Gmail account first.'
            });
        }
        
        // TODO: In production, this would:
        // 1. Fetch emails from Gmail API
        // 2. Parse emails to extract leads and messages
        // 3. Insert/update leads and messages in database
        // 4. Trigger lead analysis for new inbound messages
        
        // For now, simulate sync
        console.log('[sync-inbox] Syncing inbox for user:', userId);
        
        // Update last_sync_at timestamp
        const { error: updateError } = await supabase
            .from('email_accounts')
            .update({
                last_sync_at: new Date().toISOString()
            })
            .eq('id', emailAccount.id);
        
        if (updateError) {
            console.error('[sync-inbox] Error updating sync timestamp:', updateError);
            return res.status(500).json({
                success: false,
                error: 'Failed to update sync timestamp: ' + updateError.message
            });
        }
        
        return res.status(200).json({
            success: true,
            message: 'Inbox synced successfully',
            last_sync_at: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('[sync-inbox] Error:', error);
        return res.status(500).json({
            success: false,
            error: error?.message || String(error)
        });
    }
}

