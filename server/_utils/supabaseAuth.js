// Supabase Authentication Helper
// Validates user JWT tokens from Authorization header

import { supabaseAdmin } from './supabaseAdmin.js';

/**
 * Require authenticated user from request
 * @param {Object} req - Request object with headers
 * @returns {Promise<{user: Object, jwt: string}>}
 * @throws {Object} Error object with status and message
 */
export async function requireUser(req) {
    const authHeader = req.headers.authorization || req.headers.get?.('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        const error = new Error('No authorization header');
        error.status = 401;
        throw error;
    }
    
    const jwt = authHeader.substring(7);
    
    if (!jwt) {
        const error = new Error('Invalid authorization header format');
        error.status = 401;
        throw error;
    }
    
    // Use admin client to validate user token
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(jwt);
    
    if (error || !user) {
        const authError = new Error(error?.message || 'Invalid token');
        authError.status = 401;
        throw authError;
    }
    
    return { user, jwt };
}

