// Gmail OAuth Connect Endpoint
// POST /api/gmail/connect
// Returns JSON with auth_url for frontend to redirect

import { validateSupabaseJwt } from '../lib/auth.js';
import crypto from 'crypto';

/**
 * Sign state payload with HMAC
 */
function signState(payload) {
    const secret = process.env.GMAIL_STATE_SECRET || 'default-secret-change-in-production';
    const payloadJson = JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payloadJson);
    const signature = hmac.digest('hex');
    
    // Base64URL encode payload + signature
    const signed = Buffer.from(JSON.stringify({ payload, signature })).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    
    return signed;
}

/**
 * Main handler function
 */
export default async function handler(req, res) {
    try {
        // Set CORS headers (allow same-origin for local dev)
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
            console.error('[gmail-connect] Invalid method:', req.method);
            return res.status(405).json({ 
                success: false,
                error: 'Method not allowed. Use POST.' 
            });
        }
        
        console.log('[gmail-connect] Endpoint hit');
        
        // Validate JWT
        const authResult = await validateSupabaseJwt(req);
        if (!authResult.ok) {
            console.error('[gmail-connect] Auth failed:', authResult.error);
            return res.status(authResult.status || 401).json({ 
                success: false,
                error: authResult.error || 'Unauthorized'
            });
        }
        
        console.log('[gmail-connect] User authenticated:', authResult.userId);
        
        // Get returnTo from body
        const body = req.body || {};
        const returnTo = body.returnTo || '/dashboard.html';
        
        // Validate env vars
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const redirectUri = process.env.GOOGLE_REDIRECT_URI;
        
        if (!clientId) {
            console.error('[gmail-connect] Missing GOOGLE_CLIENT_ID');
            return res.status(500).json({
                success: false,
                error: 'Missing env var: GOOGLE_CLIENT_ID'
            });
        }
        
        if (!redirectUri) {
            console.error('[gmail-connect] Missing GOOGLE_REDIRECT_URI');
            return res.status(500).json({
                success: false,
                error: 'Missing env var: GOOGLE_REDIRECT_URI'
            });
        }

        // Safe diagnostics (client_id is not a secret, but avoid logging the whole thing)
        const clientIdStr = String(clientId);
        const clientIdCore = clientIdStr.replace(/\.apps\.googleusercontent\.com$/, '');
        console.log('[gmail-connect] OAuth env check:', {
            client_id_present: true,
            client_id_length: clientIdStr.length,
            client_id_has_whitespace: /\s/.test(clientIdStr),
            client_id_has_quotes: /["']/.test(clientIdStr),
            client_id_looks_like_google: clientIdStr.endsWith('.apps.googleusercontent.com'),
            client_id_core_tail12: clientIdCore.slice(-12),
            redirect_uri_present: true
        });
        
        // Create signed state
        const statePayload = {
            user_id: authResult.userId,
            returnTo: returnTo
        };
        
        const state = signState(statePayload);
        
        console.log('[gmail-connect] Created signed state:', {
            user_id: authResult.userId,
            returnTo: returnTo
        });
        
        // Build Google OAuth URL
        // NOTE: We request send + modify so the app can draft + send replies and manage labels/read state.
        // Reconnecting will prompt consent and update the granted scopes.
        const scope = [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/gmail.modify'
        ].join(' ');
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: redirectUri,
            scope: scope,
            access_type: 'offline',
            prompt: 'consent',
            include_granted_scopes: 'true',
            state: state
        });
        
        const auth_url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
        
        console.log('[gmail-connect] Built OAuth URL:', {
            user_id: authResult.userId,
            redirect_uri: redirectUri,
            returnTo: returnTo,
            has_client_id: !!clientId,
            oauth_url_length: auth_url.length
        });
        
        // Return JSON with authUrl (camelCase)
        return res.status(200).json({
            success: true,
            authUrl: auth_url
        });
        
    } catch (error) {
        console.error('[gmail-connect] Error:', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            error: error?.message || 'Internal server error'
        });
    }
}
