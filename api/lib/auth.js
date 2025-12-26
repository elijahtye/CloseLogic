// Supabase JWT Validation Helper
// Validates Authorization Bearer tokens using Supabase Admin

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const admin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

/**
 * Validate Supabase JWT from Authorization header
 * @param {Object} req - Request object with headers
 * @returns {Promise<{ok: boolean, status?: number, error?: string, userId?: string, email?: string}>}
 */
export async function validateSupabaseJwt(req) {
    const authHeader = req.headers.authorization || req.headers.get?.('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return {
            ok: false,
            status: 401,
            error: 'No authorization header'
        };
    }
    
    const token = authHeader.substring(7);
    
    if (!token) {
        return {
            ok: false,
            status: 401,
            error: 'Invalid authorization header format'
        };
    }
    
    try {
        const { data: { user }, error } = await admin.auth.getUser(token);
        
        if (error || !user) {
            return {
                ok: false,
                status: 401,
                error: error?.message || 'Invalid token'
            };
        }
        
        return {
            ok: true,
            userId: user.id,
            email: user.email
        };
    } catch (err) {
        return {
            ok: false,
            status: 401,
            error: err.message || 'Token validation failed'
        };
    }
}

