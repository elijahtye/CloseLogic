// Gmail Disconnect Endpoint
// POST /api/gmail/disconnect
// Disconnects Gmail by setting status to 'disconnected' and clearing tokens

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
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        
        // Handle preflight
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }
        
        // Only allow POST
        if (req.method !== 'POST') {
            console.error('[gmail-disconnect] Invalid method:', req.method);
            return res.status(405).json({ 
                success: false,
                error: 'Method not allowed' 
            });
        }
        
        console.log('[gmail-disconnect] Endpoint hit');
        
        // Validate JWT
        const authResult = await validateSupabaseJwt(req);
        if (!authResult.ok) {
            console.error('[gmail-disconnect] Auth failed:', authResult.error);
            return res.status(authResult.status || 401).json({ 
                success: false,
                error: authResult.error || 'Unauthorized'
            });
        }
        
        console.log('[gmail-disconnect] User authenticated:', authResult.userId);
        
        // Find email_account for this user
        const { data: emailAccount, error: accountError } = await supabaseAdmin
            .from('email_accounts')
            .select('id, status')
            .eq('user_id', authResult.userId)
            .eq('provider', 'gmail')
            .maybeSingle();
        
        if (accountError) {
            console.error('[gmail-disconnect] Error fetching email account:', {
                error: accountError.message,
                error_code: accountError.code
            });
            return res.status(500).json({
                success: false,
                error: `Failed to fetch email account: ${accountError.message}`
            });
        }
        
        // If no account exists, return success (already disconnected)
        if (!emailAccount) {
            console.log('[gmail-disconnect] No Gmail account found, already disconnected');
            return res.status(200).json({
                success: true,
                disconnected: true,
                message: 'Gmail already disconnected'
            });
        }
        
        // Update status to disconnected and clear tokens
        const { error: updateError } = await supabaseAdmin
            .from('email_accounts')
            .update({
                status: 'disconnected',
                access_token: null,
                refresh_token: null,
                token_expires_at: null,
                expires_at: null,
                last_error: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', emailAccount.id);
        
        if (updateError) {
            console.error('[gmail-disconnect] Failed to disconnect:', {
                error: updateError.message,
                error_code: updateError.code
            });
            return res.status(500).json({
                success: false,
                error: `Failed to disconnect: ${updateError.message}`
            });
        }
        
        console.log('[gmail-disconnect] Gmail disconnected successfully:', {
            user_id: authResult.userId,
            email_account_id: emailAccount.id
        });
        
        return res.status(200).json({
            success: true,
            disconnected: true,
            message: 'Gmail disconnected successfully'
        });
        
    } catch (error) {
        console.error('[gmail-disconnect] Error:', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            error: error?.message || 'Internal server error'
        });
    }
}

