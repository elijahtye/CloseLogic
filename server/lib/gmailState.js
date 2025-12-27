// Gmail OAuth State Management
// HMAC-signed state for security

import crypto from 'crypto';

/**
 * Base64URL encode (URL-safe base64)
 */
function base64UrlEncode(str) {
    return Buffer.from(str)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

/**
 * Base64URL decode
 */
function base64UrlDecode(str) {
    // Add padding if needed
    let padded = str.replace(/-/g, '+').replace(/_/g, '/');
    while (padded.length % 4) {
        padded += '=';
    }
    return Buffer.from(padded, 'base64').toString('utf-8');
}

/**
 * Sign state payload with HMAC
 */
export function signState(payload) {
    const stateSecret = process.env.STATE_SECRET || 'default-secret-change-in-production';
    
    if (!stateSecret || stateSecret === 'default-secret-change-in-production') {
        console.warn('[gmail-state] Using default STATE_SECRET - set STATE_SECRET env var in production!');
    }
    
    const payloadJson = JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', stateSecret);
    hmac.update(payloadJson);
    const signature = hmac.digest('hex');
    
    const signed = {
        payload: payload,
        signature: signature
    };
    
    const encoded = base64UrlEncode(JSON.stringify(signed));
    
    console.log('[gmail-state] Signed state:', {
        user_id: payload.user_id,
        returnTo: payload.returnTo,
        has_signature: !!signature
    });
    
    return encoded;
}

/**
 * Verify and decode state
 */
export function verifyState(encodedState) {
    try {
        const stateSecret = process.env.STATE_SECRET || 'default-secret-change-in-production';
        
        const decoded = base64UrlDecode(encodedState);
        const signed = JSON.parse(decoded);
        
        if (!signed.payload || !signed.signature) {
            throw new Error('Invalid state structure');
        }
        
        // Verify HMAC
        const payloadJson = JSON.stringify(signed.payload);
        const hmac = crypto.createHmac('sha256', stateSecret);
        hmac.update(payloadJson);
        const expectedSignature = hmac.digest('hex');
        
        // Constant-time comparison
        if (signed.signature !== expectedSignature) {
            throw new Error('Invalid state signature');
        }
        
        console.log('[gmail-state] State verified:', {
            user_id: signed.payload.user_id,
            returnTo: signed.payload.returnTo
        });
        
        return signed.payload;
    } catch (error) {
        console.error('[gmail-state] State verification failed:', error.message);
        throw new Error('Invalid or tampered state');
    }
}

