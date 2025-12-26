// Gmail OAuth Connection API
// POST /api/connect-gmail
// Initiates Gmail OAuth flow by returning auth_url

import { validateUserAuth, buildGmailOAuthUrl, getSiteUrl } from './lib/gmailOAuth.js';

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
            console.error('[connect-gmail] Invalid method:', req.method);
            return res.status(405).json({ 
                success: false,
                error: 'Method not allowed' 
            });
        }
        
        console.log('[connect-gmail] Endpoint hit');
        
        // Validate user authentication
        const { error: authError, user } = await validateUserAuth(req);
        if (authError || !user) {
            console.error('[connect-gmail] Auth failed:', authError);
            return res.status(401).json({ 
                success: false,
                error: authError || 'Unauthorized' 
            });
        }
        
        console.log('[connect-gmail] User authenticated:', user.id);
        
        // Get site URL for redirect URI
        const siteUrl = getSiteUrl(req);
        
        // Build OAuth URL
        let authUrl;
        try {
            authUrl = buildGmailOAuthUrl(user.id, siteUrl);
        } catch (error) {
            console.error('[connect-gmail] Failed to build OAuth URL:', error.message);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
        
        // Return auth URL
        return res.status(200).json({
            success: true,
            auth_url: authUrl
        });
        
    } catch (error) {
        console.error('[connect-gmail] Error:', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            error: error?.message || 'Internal server error'
        });
    }
}
