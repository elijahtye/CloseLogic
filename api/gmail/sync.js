// Gmail Sync Endpoint
// POST /api/gmail/sync
// Syncs inbox from Gmail using stored tokens

import { validateSupabaseJwt } from '../lib/auth.js';
import { supabaseAdmin } from '../_utils/supabaseAdmin.js';

function parseFromHeader(fromHeader) {
    // Examples:
    // "Name <email@domain.com>"
    // "email@domain.com"
    const trimmed = (fromHeader || '').trim();
    const m = trimmed.match(/^(.*)<([^>]+)>$/);
    if (m) {
        const name = m[1].trim().replace(/^"|"$/g, '') || null;
        const email = m[2].trim().toLowerCase();
        return { name, email };
    }
    if (trimmed.includes('@')) return { name: null, email: trimmed.replace(/^"|"$/g, '').toLowerCase() };
    return { name: null, email: null };
}

function headerValue(headers = [], name) {
    const h = headers.find((x) => (x.name || '').toLowerCase() === name.toLowerCase());
    return h?.value || null;
}

function pickExpiry(emailAccount) {
    // Support either column name (schema may have both)
    return emailAccount?.token_expires_at || emailAccount?.expires_at || null;
}

/**
 * Refresh access token if expired
 */
async function refreshAccessToken(refreshToken) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
        throw new Error('Google OAuth credentials not configured');
    }
    
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
        }).toString()
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token refresh failed: ${response.status} - ${errorText.substring(0, 200)}`);
    }
    
    return await response.json();
}

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
            console.error('[gmail-sync] Invalid method:', req.method);
            return res.status(405).json({ 
                success: false,
                error: 'Method not allowed' 
            });
        }
        
        console.log('[gmail-sync] Endpoint hit');
        
        // Validate JWT
        const authResult = await validateSupabaseJwt(req);
        if (!authResult.ok) {
            console.error('[gmail-sync] Auth failed:', authResult.error);
            return res.status(authResult.status || 401).json({ 
                success: false,
                error: authResult.error || 'Unauthorized'
            });
        }
        
        console.log('[gmail-sync] User authenticated:', authResult.userId);
        
        // Ensure migration is applied (messages.gmail_message_id exists)
        {
            const { error: colErr } = await supabaseAdmin
                .from('messages')
                .select('gmail_message_id')
                .limit(1);
            if (colErr) {
                const msg = colErr.message || '';
                if (msg.includes('gmail_message_id') || msg.includes('column') || msg.includes('schema cache')) {
                    return res.status(500).json({
                        success: false,
                        error: 'missing_migration',
                        details: 'Missing column public.messages.gmail_message_id. Apply supabase/migrations/20251219000000_add_messages_gmail_message_id.sql'
                    });
                }
            }
        }

        // Load email_account with tokens
        const { data: emailAccount, error: accountError } = await supabaseAdmin
            .from('email_accounts')
            .select('id, status, email_address, access_token, refresh_token, token_expires_at, expires_at')
            .eq('user_id', authResult.userId)
            .eq('provider', 'gmail')
            .maybeSingle();
        
        if (accountError) {
            console.error('[gmail-sync] Error fetching email account:', {
                error: accountError.message,
                error_code: accountError.code
            });
            return res.status(500).json({
                success: false,
                error: `Failed to fetch email account: ${accountError.message}`
            });
        }
        
        if (!emailAccount || emailAccount.status !== 'connected') {
            console.error('[gmail-sync] Gmail not connected:', {
                user_id: authResult.userId,
                account_exists: !!emailAccount,
                status: emailAccount?.status
            });
            return res.status(400).json({
                success: false,
                error: 'not_connected'
            });
        }
        
        if (!emailAccount.access_token) {
            console.error('[gmail-sync] No access token found');
            return res.status(400).json({
                success: false,
                error: 'Gmail tokens not found. Please reconnect your Gmail account.'
            });
        }
        
        // Check if token is expired and refresh if needed
        let accessToken = emailAccount.access_token;
        const expiresAt = pickExpiry(emailAccount);
        if (expiresAt && new Date(expiresAt) < new Date()) {
            console.log('[gmail-sync] Access token expired, refreshing...');
            
            if (!emailAccount.refresh_token) {
                return res.status(400).json({
                    success: false,
                    error: 'Access token expired and no refresh token available. Please reconnect your Gmail account.'
                });
            }
            
            try {
                const refreshData = await refreshAccessToken(emailAccount.refresh_token);
                accessToken = refreshData.access_token;
                const newExpiresAt = refreshData.expires_in 
                    ? new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
                    : null;
                
                // Update tokens in email_accounts
                await supabaseAdmin
                    .from('email_accounts')
                    .update({
                        access_token: accessToken,
                        token_expires_at: newExpiresAt,
                        expires_at: newExpiresAt,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', emailAccount.id);
                
                console.log('[gmail-sync] Token refreshed successfully');
            } catch (refreshError) {
                console.error('[gmail-sync] Token refresh failed:', refreshError.message);
                // Update status to error
                await supabaseAdmin
                    .from('email_accounts')
                    .update({
                        status: 'error',
                        last_error: refreshError.message
                    })
                    .eq('id', emailAccount.id);
                
                return res.status(401).json({
                    success: false,
                    error: `Failed to refresh token: ${refreshError.message}`
                });
            }
        }
        
        // Fetch the most recent 50 inbox messages and upsert into leads/messages
        let insertedMessages = 0;
        let skippedMessages = 0;
        let insertedLeads = 0;
        let updatedLeads = 0;
        try {
            const listUrl = 'https://www.googleapis.com/gmail/v1/users/me/messages?q=in%3Ainbox&maxResults=50';
            const listResp = await fetch(listUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (!listResp.ok) {
                const t = await listResp.text();
                throw new Error(`Gmail list failed: ${listResp.status} - ${t.substring(0, 200)}`);
            }
            const listJson = await listResp.json();
            const messages = Array.isArray(listJson.messages) ? listJson.messages : [];

            for (const msg of messages) {
                const msgId = msg.id;
                if (!msgId) continue;

                // Dedupe: if we've already stored this Gmail message id, skip without hitting Gmail again
                const { data: existingStoredMsg, error: existingMsgErr } = await supabaseAdmin
                    .from('messages')
                    .select('id')
                    .eq('user_id', authResult.userId)
                    .eq('gmail_message_id', msgId)
                    .maybeSingle();
                if (existingMsgErr) {
                    // If the migration hasn't been applied yet, surface a clear error.
                    const m = existingMsgErr.message || '';
                    if (m.includes('gmail_message_id')) {
                        return res.status(500).json({
                            success: false,
                            error: 'missing_migration',
                            details: 'Missing column public.messages.gmail_message_id. Apply supabase/migrations/20251219000000_add_messages_gmail_message_id.sql'
                        });
                    }
                }
                if (existingStoredMsg?.id) {
                    skippedMessages += 1;
                    continue;
                }

                const msgUrl =
                    `https://www.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(msgId)}` +
                    '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID';
                const msgResp = await fetch(msgUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (!msgResp.ok) continue;
                const msgJson = await msgResp.json();

                const from = headerValue(msgJson.payload?.headers || [], 'From');
                const subject = headerValue(msgJson.payload?.headers || [], 'Subject') || '';
                const dateHeader = headerValue(msgJson.payload?.headers || [], 'Date');
                const messageIdHeader = headerValue(msgJson.payload?.headers || [], 'Message-ID') || headerValue(msgJson.payload?.headers || [], 'Message-Id');
                const sentAt = dateHeader ? new Date(dateHeader) : new Date(Number(msgJson.internalDate || Date.now()));
                const body = msgJson.snippet || '';

                const { name, email } = parseFromHeader(from);
                if (!email) continue;

                // Find or create lead for this sender
                const { data: existingLead } = await supabaseAdmin
                    .from('leads')
                    .select('id, lead_name')
                    .eq('user_id', authResult.userId)
                    .eq('lead_email', email)
                    .maybeSingle();

                let leadId = existingLead?.id || null;
                if (!leadId) {
                    const { data: createdLead, error: createLeadError } = await supabaseAdmin
                        .from('leads')
                        .insert({
                            user_id: authResult.userId,
                            email_account_id: emailAccount.id,
                            lead_name: name || email.split('@')[0],
                            lead_email: email,
                            source: 'gmail',
                            last_message_at: sentAt.toISOString(),
                            needs_followup: true
                        })
                        .select('id')
                        .single();
                    if (createLeadError || !createdLead) continue;
                    leadId = createdLead.id;
                    insertedLeads += 1;
                } else {
                    // Best-effort update lead name and last_message_at
                    const { error: updateLeadError } = await supabaseAdmin
                        .from('leads')
                        .update({
                            lead_name: existingLead?.lead_name || name || undefined,
                            last_message_at: sentAt.toISOString(),
                            needs_followup: true,
                            // Ensure lead is linked to the gmail account
                            email_account_id: emailAccount.id
                        })
                        .eq('id', leadId);
                    if (!updateLeadError) updatedLeads += 1;
                }

                // Idempotent insert using gmail_message_id (requires migration)
                const msgRow = {
                    lead_id: leadId,
                    user_id: authResult.userId,
                    direction: 'inbound',
                    subject,
                    body: body || '(no preview)',
                    sent_at: sentAt.toISOString(),
                    gmail_message_id: msgId
                };

                const { error: insertMsgError } = await supabaseAdmin
                    .from('messages')
                    .insert(msgRow);
                if (insertMsgError) {
                    const m = insertMsgError.message || '';
                    // Unique violation → treat as skipped (race or double sync)
                    if (m.toLowerCase().includes('duplicate') || m.includes('unique')) {
                        skippedMessages += 1;
                        continue;
                    }
                    console.error('[gmail-sync] Message insert failed:', { gmail_message_id: msgId, error: insertMsgError.message });
                } else {
                    insertedMessages += 1;
                }
            }
        } catch (gmailErr) {
            console.error('[gmail-sync] Gmail fetch failed:', gmailErr.message);
            await supabaseAdmin
                .from('email_accounts')
                .update({ status: 'error', last_error: gmailErr.message, updated_at: new Date().toISOString() })
                .eq('id', emailAccount.id);
            return res.status(502).json({ success: false, error: gmailErr.message });
        }

        // Update last_sync_at
        const { error: updateError } = await supabaseAdmin
            .from('email_accounts')
            .update({
                last_sync_at: new Date().toISOString(),
                status: 'connected',
                last_error: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', emailAccount.id);
        
        if (updateError) {
            console.error('[gmail-sync] Error updating sync timestamp:', {
                error: updateError.message,
                error_code: updateError.code
            });
            return res.status(500).json({
                success: false,
                error: `Failed to update sync timestamp: ${updateError.message}`
            });
        }
        
        console.log('[gmail-sync] Sync completed successfully:', {
            user_id: authResult.userId,
            email_account_id: emailAccount.id,
            email_address: emailAccount.email_address
        });
        
        return res.status(200).json({
            success: true,
            synced: true,
            email_address: emailAccount.email_address,
            last_sync_at: new Date().toISOString(),
            insertedCount: insertedMessages,
            skippedCount: skippedMessages,
            inserted_leads: insertedLeads,
            updated_leads: updatedLeads
        });
        
    } catch (error) {
        console.error('[gmail-sync] Unexpected error:', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            error: error?.message || 'Internal server error'
        });
    }
}
