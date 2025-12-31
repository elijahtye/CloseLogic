// Shared Gmail OAuth URL generation logic
// Used by both /api/gmail/connect and /api/connect-gmail

import { createClient } from '@supabase/supabase-js';

/**
 * Get authenticated user from Supabase token using anon key
 */
export async function validateUserAuth(req) {
    const authHeader = req.headers.authorization || req.headers.get?.('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { error: 'No authorization header', user: null };
    }
    
    const token = authHeader.substring(7);
    
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
        return { error: 'Supabase configuration missing', user: null };
    }
    
    // Use anon key to validate user token (as per requirements)
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
        return { error: error?.message || 'Invalid token', user: null };
    }
    
    return { error: null, user };
}

/**
 * Build Google OAuth URL
 */
export function buildGmailOAuthUrl(userId, siteUrl = null, { callbackPath = '/api/gmail-callback' } = {}) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const base = (process.env.SITE_URL || process.env.APP_URL || siteUrl || '').toString().replace(/\/$/, '');
    const envRedirect = process.env.GOOGLE_REDIRECT_URI || null;
    const isLocal = (u) => String(u || '').toLowerCase().includes('localhost') || String(u || '').toLowerCase().includes('127.0.0.1');
    const redirectUri = (envRedirect && !isLocal(envRedirect)) ? envRedirect : (base ? `${base}${callbackPath}` : null);
    
    // Validate required env vars
    if (!clientId) {
        throw new Error('Missing env var: GOOGLE_CLIENT_ID');
    }
    if (!clientSecret) {
        throw new Error('Missing env var: GOOGLE_CLIENT_SECRET');
    }
    if (!redirectUri) {
        throw new Error('Missing env var: GOOGLE_REDIRECT_URI');
    }
    
    // Build state - base64 encode user ID (UUID) for security
    // State is used to verify the callback came from our OAuth flow
    const state = Buffer.from(userId).toString('base64');
    
    // Build OAuth URL
    const scope = 'openid email profile https://www.googleapis.com/auth/gmail.readonly';
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        scope: scope,
        state: state
    });
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    
    console.log('[gmail-oauth] Built OAuth URL:', {
        userId: userId,
        redirectUri: redirectUri,
        hasClientId: !!clientId,
        hasSecret: !!clientSecret
    });
    
    return authUrl;
}

/**
 * Get site URL from request headers or env var
 */
export function getSiteUrl(req) {
    // Prefer SITE_URL env var
    if (process.env.SITE_URL) {
        return process.env.SITE_URL;
    }
    
    // Infer from request headers
    const host = req.headers.host || req.headers['x-forwarded-host'];
    const protocol = req.headers['x-forwarded-proto'] || 
                    (req.headers['x-forwarded-ssl'] === 'on' ? 'https' : 'http') ||
                    'http';
    
    if (host) {
        return `${protocol}://${host}`;
    }
    
    // Fallback for local dev - check PORT env var
    const port = process.env.PORT || '5001';
    return `http://localhost:${port}`;
}

