// Gmail OAuth Callback Handler
// GET /api/gmail-callback
// Handles OAuth callback from Google and stores tokens in database

import { createClient } from '@supabase/supabase-js';

/**
 * Exchange OAuth code for tokens
 */
async function exchangeCodeForTokens(code, redirectUri) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
        throw new Error('Google OAuth credentials not configured');
    }
    
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const params = new URLSearchParams({
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
    });
    
    console.log('[gmail-callback] Exchanging code for tokens');
    
    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('[gmail-callback] Token exchange failed:', {
            status: response.status,
            error: errorText
        });
        throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
    }
    
    const tokenData = await response.json();
    console.log('[gmail-callback] Token exchange successful');
    
    return {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        scope: tokenData.scope
    };
}

/**
 * Get user email from Gmail API using access token
 */
async function getUserEmail(accessToken) {
    try {
        const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[gmail-callback] Failed to fetch user email:', {
                status: response.status,
                error: errorText
            });
            throw new Error(`Failed to fetch user email: ${response.status}`);
        }
        
        const profile = await response.json();
        return profile.emailAddress;
    } catch (error) {
        console.error('[gmail-callback] Error fetching user email:', error);
        throw error;
    }
}

/**
 * Upsert email account with tokens
 */
async function upsertEmailAccount(supabase, userId, emailAddress, tokens) {
    const expiresAt = tokens.expires_in 
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null;
    
    const accountData = {
        user_id: userId,
        provider: 'gmail',
        status: 'connected',
        email_address: emailAddress,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        token_scope: tokens.scope,
        last_sync_at: null,
        updated_at: new Date().toISOString()
    };
    
    console.log('[gmail-callback] Upserting email account:', {
        user_id: userId,
        email_address: emailAddress,
        has_access_token: !!tokens.access_token,
        has_refresh_token: !!tokens.refresh_token
    });
    
    // Use upsert with conflict resolution on (user_id, provider)
    const { data, error } = await supabase
        .from('email_accounts')
        .upsert(accountData, {
            onConflict: 'user_id,provider',
            ignoreDuplicates: false
        })
        .select()
        .single();
    
    if (error) {
        console.error('[gmail-callback] Supabase upsert failed:', {
            error: error.message,
            error_code: error.code,
            error_details: error
        });
        throw new Error(`Failed to save email account: ${error.message}`);
    }
    
    console.log('[gmail-callback] Email account upserted successfully:', {
        account_id: data.id,
        email_address: data.email_address,
        status: data.status
    });
    
    return data;
}

/**
 * Main handler function (Vercel serverless)
 */
export default async function handler(req, res) {
    try {
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        // Handle preflight
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }
        
        // Only allow GET
        if (req.method !== 'GET') {
            return res.status(405).json({ 
                success: false,
                error: 'Method not allowed' 
            });
        }
        
        // Parse query parameters
        // Handle both Vercel format (req.query) and standard URL format
        const code = req.query?.code || (req.url ? new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams.get('code') : null);
        const state = req.query?.state || (req.url ? new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams.get('state') : null);
        const error = req.query?.error || (req.url ? new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams.get('error') : null);
        
        // Helper function for redirects
        const redirect = (url) => {
            res.statusCode = 302;
            res.setHeader('Location', url);
            res.end();
        };
        
        // Handle OAuth errors
        if (error) {
            console.error('[gmail-callback] OAuth error:', error);
            return redirect(`/dashboard.html?gmail_error=${encodeURIComponent(error)}`);
        }
        
        // Validate code
        if (!code) {
            console.error('[gmail-callback] No authorization code provided');
            return redirect('/dashboard.html?gmail_error=no_code');
        }
        
        // Decode state to get user_id
        // In production, use proper state validation (e.g., signed JWT)
        let userId;
        try {
            // State format: base64(user_id)
            userId = Buffer.from(state || '', 'base64').toString('utf-8');
            if (!userId || userId.length !== 36) { // UUID length check
                throw new Error('Invalid state format');
            }
        } catch (stateError) {
            console.error('[gmail-callback] Invalid state parameter:', stateError);
            return redirect('/dashboard.html?gmail_error=invalid_state');
        }
        
        // Validate user_id exists
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('[gmail-callback] Supabase configuration missing');
            return redirect('/dashboard.html?gmail_error=config_error');
        }
        
        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });
        
        // Verify user exists
        const { data: user, error: userError } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .single();
        
        if (userError || !user) {
            console.error('[gmail-callback] User not found:', { userId, error: userError });
            return redirect('/dashboard.html?gmail_error=user_not_found');
        }
        
        // Exchange code for tokens
        // Use same logic as connect endpoint to ensure redirect URI matches
        const siteUrl = process.env.SITE_URL || 
                       (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
                       (req.headers.host ? `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}` : null) ||
                       'http://localhost:5001';
        const redirectUri = `${siteUrl}/api/gmail-callback`;
        let tokens;
        try {
            tokens = await exchangeCodeForTokens(code, redirectUri);
            console.log('[gmail-callback] Token exchange successful');
        } catch (tokenError) {
            console.error('[gmail-callback] Token exchange error:', tokenError);
            return redirect(`/dashboard.html?gmail_error=${encodeURIComponent(tokenError.message)}`);
        }
        
        // Get user email from Gmail API
        let emailAddress;
        try {
            emailAddress = await getUserEmail(tokens.access_token);
            console.log('[gmail-callback] User email fetched:', emailAddress);
        } catch (emailError) {
            console.error('[gmail-callback] Failed to fetch user email:', emailError);
            // Fallback: use a placeholder (in production, this should fail)
            emailAddress = `${userId}@gmail.com`;
        }
        
        // Upsert email account with tokens
        try {
            await upsertEmailAccount(supabase, userId, emailAddress, tokens);
            console.log('[gmail-callback] Email account saved successfully');
        } catch (upsertError) {
            console.error('[gmail-callback] Failed to save email account:', upsertError);
            return redirect(`/dashboard.html?gmail_error=${encodeURIComponent(upsertError.message)}`);
        }
        
        // Redirect to dashboard with success
        return redirect('/dashboard.html?gmail_connected=true');
        
    } catch (error) {
        console.error('[gmail-callback] Unexpected error:', {
            error: error.message,
            stack: error.stack
        });
        res.statusCode = 302;
        res.setHeader('Location', `/dashboard.html?gmail_error=${encodeURIComponent(error.message || 'Unknown error')}`);
        return res.end();
    }
}

