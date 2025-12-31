// Gmail OAuth Callback Handler
// GET /api/gmail/callback?code=...&state=...
// Handles OAuth callback from Google and stores tokens in email_accounts

import { supabaseAdmin } from '../_utils/supabaseAdmin.js';
import crypto from 'crypto';

function inferSiteUrl(req) {
    // Prefer explicit env var if set
    const explicit = process.env.SITE_URL || process.env.APP_URL;
    if (explicit) {
        const cleaned = String(explicit).replace(/\/$/, '');
        // Remove any path components (should only be domain)
        try {
            const url = new URL(cleaned);
            return `${url.protocol}//${url.host}`;
        } catch {
            return cleaned;
        }
    }

    // Infer from request headers (Vercel provides these)
    const host = req.headers.host || req.headers['x-forwarded-host'];
    const proto = req.headers['x-forwarded-proto'] || (String(host || '').includes('localhost') ? 'http' : 'https');
    
    if (host) {
        // Ensure host doesn't include path components
        const cleanHost = String(host).split('/')[0].split('?')[0];
        return `${proto}://${cleanHost}`;
    }

    // Fallback for local dev
    return 'http://localhost:5001';
}

/**
 * Verify and decode HMAC-signed state
 */
function verifyState(encodedState) {
    try {
        const secret = process.env.GMAIL_STATE_SECRET || 'default-secret-change-in-production';
        
        // Base64URL decode
        let padded = encodedState.replace(/-/g, '+').replace(/_/g, '/');
        while (padded.length % 4) padded += '=';
        const decoded = Buffer.from(padded, 'base64').toString('utf-8');
        const signed = JSON.parse(decoded);
        
        if (!signed.payload || !signed.signature) {
            throw new Error('Invalid state structure');
        }
        
        // Verify HMAC
        const payloadJson = JSON.stringify(signed.payload);
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(payloadJson);
        const expectedSignature = hmac.digest('hex');
        
        if (signed.signature !== expectedSignature) {
            throw new Error('Invalid state signature');
        }
        
        return signed.payload;
    } catch (error) {
        console.error('[gmail-callback] State verification failed:', error.message);
        throw new Error('Invalid or tampered state');
    }
}

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
            error: errorText.substring(0, 200)
        });
        throw new Error(`Token exchange failed: ${response.status}`);
    }
    
    const tokenData = await response.json();
    console.log('[gmail-callback] Token exchange successful:', {
        has_access_token: !!tokenData.access_token,
        has_refresh_token: !!tokenData.refresh_token,
        expires_in: tokenData.expires_in
    });
    
    return {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        scope: tokenData.scope || 'https://www.googleapis.com/auth/gmail.readonly',
        token_type: tokenData.token_type || 'Bearer'
    };
}

/**
 * Get user email from Google
 */
async function getUserEmail(accessToken) {
    try {
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[gmail-callback] Failed to fetch user info:', {
                status: response.status,
                error: errorText.substring(0, 200)
            });
            throw new Error(`Failed to fetch user info: ${response.status}`);
        }
        
        const userinfo = await response.json();
        console.log('[gmail-callback] User info fetched:', {
            email: userinfo.email,
            has_sub: !!userinfo.id
        });
        return {
            email: userinfo.email,
            sub: userinfo.id || userinfo.email
        };
    } catch (error) {
        console.error('[gmail-callback] Error fetching user info:', error.message);
        throw error;
    }
}

/**
 * Main handler function
 */
export default async function handler(req, res) {
    try {
        // Set CORS headers (callback doesn't need auth, but allow same-origin)
        const origin = req.headers.origin || req.headers.get?.('origin');
        if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
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
        
        // Helper function for redirects (works in both dev-server Vercel-like res and real Node/Vercel)
        const redirect = (url) => {
            if (typeof res.redirect === 'function') {
                return res.redirect(url);
            }
            res.statusCode = 302;
            res.setHeader('Location', url);
            res.end();
        };
        
        // Parse query parameters
        const code = req.query?.code || (req.url ? new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams.get('code') : null);
        const state = req.query?.state || (req.url ? new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams.get('state') : null);
        const error = req.query?.error || (req.url ? new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams.get('error') : null);
        
        // Detect app URL from request headers (for production) or use env/localhost fallback
        const protocol = req.headers['x-forwarded-proto'] || (req.headers.host?.includes('localhost') ? 'http' : 'https');
        const host = req.headers.host || req.headers['x-forwarded-host'];
        
        // Helper to clean URL (remove path, query, trailing slash)
        function cleanBaseUrl(url) {
            if (!url) return null;
            try {
                const parsed = new URL(url);
                return `${parsed.protocol}//${parsed.host}`;
            } catch {
                // If URL parsing fails, try manual cleanup
                const cleaned = String(url).replace(/\/$/, '').split('/').slice(0, 3).join('/');
                return cleaned.includes('://') ? cleaned : null;
            }
        }
        
        const appUrl = process.env.APP_URL || 
                      (host ? cleanBaseUrl(`${protocol}://${host}`) : null) ||
                      'http://localhost:5001';
        const cleanAppUrl = cleanBaseUrl(appUrl) || appUrl.replace(/\/$/, '');
        const returnTo = '/dashboard';
        
        // Handle OAuth errors from Google
        if (error) {
            console.error('[gmail-callback] OAuth error from Google:', error);
            return redirect(`${cleanAppUrl}${returnTo}?gmail_error=${encodeURIComponent(error)}`);
        }
        
        // Validate code
        if (!code) {
            console.error('[gmail-callback] No authorization code provided');
            return redirect(`${cleanAppUrl}${returnTo}?gmail_error=no_code`);
        }
        
        // Validate and verify state
        if (!state) {
            console.error('[gmail-callback] No state parameter provided');
            return redirect(`${cleanAppUrl}${returnTo}?gmail_error=no_state`);
        }
        
        let statePayload;
        try {
            statePayload = verifyState(state);
        } catch (stateError) {
            console.error('[gmail-callback] Invalid state:', stateError.message);
            return redirect(`${cleanAppUrl}${returnTo}?gmail_error=invalid_state`);
        }
        
        const userId = statePayload.user_id;
        const returnToFromState = statePayload.returnTo || returnTo;
        
        console.log('[gmail-callback] State verified, processing callback:', {
            user_id: userId,
            returnTo: returnToFromState,
            has_code: !!code
        });
        
        // Redirect URI must match what was used in /gmail/connect (and what is allowlisted in Google Cloud).
        // Prefer explicit env var, but derive from request host if missing.
        const baseUrl = inferSiteUrl(req);
        const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/gmail/callback`;
        
        // Exchange code for tokens
        let tokens;
        try {
            tokens = await exchangeCodeForTokens(code, redirectUri);
        } catch (tokenError) {
            console.error('[gmail-callback] Token exchange error:', tokenError.message);
            return redirect(`${cleanAppUrl}${returnToFromState}?gmail_error=${encodeURIComponent(tokenError.message)}`);
        }
        
        // Get user email from Google
        let userInfo;
        try {
            userInfo = await getUserEmail(tokens.access_token);
        } catch (infoError) {
            console.error('[gmail-callback] Failed to fetch user info:', infoError.message);
            return redirect(`${cleanAppUrl}${returnToFromState}?gmail_error=${encodeURIComponent(infoError.message)}`);
        }
        
        // Calculate expiry
        const expiresAt = tokens.expires_in 
            ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
            : null;
        
        // Check if existing email_account exists to preserve refresh_token
        const { data: existingAccount } = await supabaseAdmin
            .from('email_accounts')
            .select('id, refresh_token')
            .eq('user_id', userId)
            .eq('provider', 'gmail')
            .maybeSingle();
        
        // Preserve existing refresh_token if Google didn't return a new one
        const refreshToken = tokens.refresh_token || existingAccount?.refresh_token || null;
        
        // Prepare email_accounts token/status update
        const accountData = {
            user_id: userId,
            provider: 'gmail',
            status: 'connected',
            // NOTE: your schema has email_address NOT NULL
            email_address: userInfo.email,
            provider_user_id: userInfo.sub,
            access_token: tokens.access_token,
            refresh_token: refreshToken,
            token_expires_at: expiresAt,
            // store scopes in both fields (schema has both token_scope + granted_scopes)
            token_scope: tokens.scope,
            granted_scopes: tokens.scope,
            token_type: tokens.token_type || 'Bearer',
            // keep both expiry columns in sync
            expires_at: expiresAt,
            connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_error: null
        };
        
        console.log('[gmail-callback] Upserting email_accounts:', {
            user_id: userId,
            email: userInfo.email,
            has_access_token: !!accountData.access_token,
            has_refresh_token: !!accountData.refresh_token
        });
        
        // IMPORTANT: avoid upsert(onConflict: user_id,provider) since your schema does not
        // necessarily have a unique constraint on (user_id, provider).
        let emailAccountId = existingAccount?.id || null;
        if (emailAccountId) {
            const { error: updateError } = await supabaseAdmin
                .from('email_accounts')
                .update(accountData)
                .eq('id', emailAccountId);
            if (updateError) {
                console.error('[gmail-callback] Failed to update email_accounts:', {
                    error: updateError.message,
                    error_code: updateError.code
                });
                return redirect(`${cleanAppUrl}${returnToFromState}?gmail_error=${encodeURIComponent(updateError.message)}`);
            }
        } else {
            const { data: created, error: insertError } = await supabaseAdmin
                .from('email_accounts')
                .insert(accountData)
                .select('id')
                .single();
            if (insertError || !created) {
                console.error('[gmail-callback] Failed to insert email_accounts:', {
                    error: insertError?.message,
                    error_code: insertError?.code
                });
                return redirect(`${cleanAppUrl}${returnToFromState}?gmail_error=${encodeURIComponent(insertError?.message || 'Failed to save email account')}`);
            }
            emailAccountId = created.id;
        }
        
        console.log('[gmail-callback] OAuth flow completed successfully:', {
            user_id: userId,
            email_account_id: emailAccountId,
            email: userInfo.email,
            has_access_token: !!tokens.access_token,
            has_refresh_token: !!refreshToken
        });
        
        // Redirect back to returnTo URL
        const redirectTo = `${cleanAppUrl}${returnToFromState}?gmail=connected`;
        console.log('[gmail-callback] Redirecting back to app:', redirectTo);
        return redirect(redirectTo);
        
    } catch (error) {
        console.error('[gmail-callback] Unexpected error:', {
            error: error.message,
            stack: error.stack
        });
        // Use same logic for error redirect
        const protocol = req.headers['x-forwarded-proto'] || (req.headers.host?.includes('localhost') ? 'http' : 'https');
        const host = req.headers.host || req.headers['x-forwarded-host'];
        const errorAppUrl = process.env.APP_URL || 
                           (host ? `${protocol}://${host}`.replace(/\/$/, '') : null) ||
                           'http://localhost:5001';
        const cleanErrorAppUrl = errorAppUrl.replace(/\/$/, '');
        const errorUrl = `${cleanErrorAppUrl}/dashboard?gmail_error=${encodeURIComponent(error.message || 'Unknown error')}`;
        if (typeof res.redirect === 'function') {
            return res.redirect(errorUrl);
        }
        res.statusCode = 302;
        res.setHeader('Location', errorUrl);
        return res.end();
    }
}
