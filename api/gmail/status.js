// Gmail Connection Status Endpoint
// GET /api/gmail/status
// Returns Gmail connection status for the authenticated user

import { validateSupabaseJwt } from '../lib/auth.js';
import { supabaseAdmin } from '../_utils/supabaseAdmin.js';

/**
 * Main handler function
 */
export default async function handler(req, res) {
    try {
        // Set CORS headers
        const origin = req.headers.origin || req.headers.get?.('origin');
        if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        
        // Handle preflight
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }
        
        // Only allow GET
        if (req.method !== 'GET') {
            console.error('[gmail-status] Invalid method:', req.method);
            return res.status(405).json({ 
                success: false,
                connected: false,
                error: 'Method not allowed' 
            });
        }
        
        console.log('[gmail-status] Endpoint hit');
        
        // Validate JWT
        const authResult = await validateSupabaseJwt(req);
        if (!authResult.ok) {
            console.error('[gmail-status] Auth failed:', authResult.error);
            return res.status(authResult.status || 401).json({ 
                success: false,
                connected: false,
                error: authResult.error || 'Unauthorized'
            });
        }
        
        console.log('[gmail-status] User authenticated:', authResult.userId);
        
        // Query email_accounts for connection status
        const { data: emailAccount, error: accountError } = await supabaseAdmin
            .from('email_accounts')
            .select('status, email_address, last_sync_at')
            .eq('user_id', authResult.userId)
            .eq('provider', 'gmail')
            .maybeSingle();
        
        if (accountError) {
            console.error('[gmail-status] Error fetching email account:', {
                error: accountError.message,
                error_code: accountError.code
            });
            return res.status(500).json({
                success: false,
                connected: false,
                error: `Failed to fetch email account: ${accountError.message}`
            });
        }
        
        const connected = emailAccount && emailAccount.status === 'connected';
        
        console.log('[gmail-status] Status retrieved:', {
            user_id: authResult.userId,
            connected: connected,
            email_address: emailAccount?.email_address || null,
            status: emailAccount?.status || null
        });
        
        return res.status(200).json({
            success: true,
            connected: connected,
            email_address: emailAccount?.email_address || null,
            status: emailAccount?.status || null,
            last_sync_at: emailAccount?.last_sync_at || null
        });
        
    } catch (error) {
        console.error('[gmail-status] Error:', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            connected: false,
            error: error?.message || 'Internal server error'
        });
    }
}
