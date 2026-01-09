// Dashboard JavaScript - Premium Analytics-First CRM UI
// CloseLogic Post-Onboarding Dashboard
//
// How to test Gmail integration locally:
// 1. Start server: npm run dev:local (runs on http://localhost:5001)
// 2. Ensure .env.local has:
//    - GOOGLE_CLIENT_ID=...
//    - GOOGLE_CLIENT_SECRET=...
//    - GOOGLE_REDIRECT_URI=http://localhost:5001/api/gmail/callback (must match Google Console exactly)
//    - APP_URL=http://localhost:5001 (no trailing path)
//    - SUPABASE_URL=...
//    - SUPABASE_SERVICE_ROLE_KEY=...
//    - SUPABASE_ANON_KEY=... (for token validation)
//    - STATE_SECRET=... (optional, defaults to warning)
// 3. Open http://localhost:5001/dashboard.html and sign in
// 4. Click "Connect Gmail" → fetches /api/gmail/connect with Authorization header → receives authUrl → redirects to Google
// 5. Complete Google consent → redirects to /api/gmail/callback → stores tokens in private.gmail_tokens → redirects to dashboard
// 6. Button should update to "Sync Inbox" after connection (checkGmailConnectionStatus runs on page load)
// 7. Click "Sync Inbox" → calls /api/gmail/sync with Authorization header → success toast + last_sync_at updates
//
// Manual Test Checklist:
// ✓ Click "Connect Gmail" - should NOT show "No authorization header" error
// ✓ Browser console should show: "[dashboard] Received authUrl, redirecting to Google OAuth"
// ✓ After Google consent, should redirect back to dashboard with ?gmail_connected=true
// ✓ Button should change from "Connect Gmail" to "Sync Inbox"
// ✓ Click "Sync Inbox" - should show success toast
// ✓ Check browser console for any Authorization header errors

console.log('[dashboard] dashboard.js loaded');

// API Configuration - Single source of truth for API base URL
const API_CONFIG = {
    // Use current origin by default (works for both local and production)
    // Can be overridden via window.API_BASE_URL for local dev
    baseUrl: window.API_BASE_URL || window.location.origin
};

console.log('[dashboard] API base URL:', API_CONFIG.baseUrl);

// Initialize Supabase client (using supabaseClient to avoid shadowing global window.supabase)
let supabaseClient = null;

/**
 * Fetch helper that automatically adds Supabase Authorization header
 * @param {string} url - API endpoint URL
 * @param {RequestInit} options - Fetch options (headers will be merged)
 * @returns {Promise<Response>}
 */
async function fetchWithAuth(url, options = {}) {
    if (!supabaseClient) {
        console.error('[dashboard] fetchWithAuth: Supabase client not initialized');
        throw new Error('Supabase client not initialized');
    }
    
    // Get current session
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    
    if (sessionError || !session?.access_token) {
        console.error('[dashboard] fetchWithAuth: No valid session', {
            has_session: !!session,
            has_token: !!session?.access_token,
            error: sessionError?.message
        });
        throw new Error('Not authenticated. Please sign in again.');
    }
    
    // Merge headers
    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${session.access_token}`
    };
    
    console.log('[dashboard] fetchWithAuth:', {
        url: url,
        method: options.method || 'GET',
        has_auth_header: !!headers.Authorization
    });
    
    return fetch(url, {
        ...options,
        headers: headers
    });
}

function $(id) {
    return document.getElementById(id);
}

async function copyToClipboard(text) {
    const str = String(text ?? '');
    if (!str) return false;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(str);
            return true;
        }
    } catch (e) {
        console.warn('[dashboard] clipboard.writeText failed, falling back:', e?.message || e);
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = str;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch (e) {
        console.error('[dashboard] Copy failed:', e?.message || e);
        return false;
    }
}

function openOverlay(overlayId) {
    const el = $(overlayId);
    if (el) el.style.display = 'flex';
}

function closeOverlay(overlayId) {
    const el = $(overlayId);
    if (el) el.style.display = 'none';
}

let lastAiReplyDraft = null;

// Tier gating (viewer/agent/broker)
let currentUserPlan = 'viewer';
let currentCommissionRate = 0.03; // decimal (e.g., 0.03 = 3%)
let autoAnalyzeEnabled = false;

function getPlanFeatures() {
    return window.PLAN_FEATURES || null;
}

function normalizePlan(plan) {
    const pf = getPlanFeatures();
    return pf?.normalizePlan ? pf.normalizePlan(plan) : (String(plan || 'viewer').toLowerCase());
}

function hasFeature(featureKey) {
    const pf = getPlanFeatures();
    if (!pf?.isFeatureAvailable) return true; // fail-open in UI
    return pf.isFeatureAvailable(currentUserPlan, featureKey);
}

function upgradeMessage(featureKey) {
    const pf = getPlanFeatures();
    const feature = pf?.FEATURES?.find((f) => f.key === featureKey);
    const minPlan = feature?.minPlan || 'viewer';
    const minLabel = String(minPlan).charAt(0).toUpperCase() + String(minPlan).slice(1);
    return `Locked feature. Requires ${minLabel} tier.`;
}

function promptUpgrade(featureKey) {
    const msg = upgradeMessage(featureKey);
    try { showToast(msg, 'info'); } catch {}
    // Automatically redirect to pricing page
    window.location.href = '/pricing';
}

function setLocked(el, locked, featureKey) {
    if (!el) return;
    if (locked) {
        el.classList.add('feature-locked', 'locked-clickable');
        // Avoid double-binding
        if (el.getAttribute('data-lock-bound') !== '1') {
            el.setAttribute('data-lock-bound', '1');
            el.addEventListener('click', (e) => {
                // Block underlying handlers for locked features
                e.preventDefault();
                e.stopPropagation();
                promptUpgrade(featureKey);
            }, true);
        }
    } else {
        el.classList.remove('feature-locked', 'locked-clickable');
    }
}

async function loadCurrentUserPlan() {
    try {
        if (!supabaseClient) return 'viewer';
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return 'viewer';
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('plan, commission_rate, auto_analyze_leads')
            .eq('id', user.id)
            .maybeSingle();
        currentUserPlan = normalizePlan(profile?.plan || 'viewer');
        window.currentUserPlan = currentUserPlan;

        // Also load preferences needed for rendering (commission + auto analyze)
        const rate = profile?.commission_rate;
        currentCommissionRate = (rate === null || rate === undefined || rate === '')
            ? 0.03
            : (Number(rate) > 1 ? Number(rate) / 100 : Number(rate));
        if (!Number.isFinite(currentCommissionRate) || currentCommissionRate < 0) currentCommissionRate = 0.03;
        currentCommissionRate = Math.max(0, Math.min(0.20, currentCommissionRate));
        autoAnalyzeEnabled = !!profile?.auto_analyze_leads;

        return currentUserPlan;
    } catch (e) {
        console.warn('[dashboard] Failed to load plan (non-fatal):', e?.message || e);
        currentUserPlan = 'viewer';
        return currentUserPlan;
    }
}

function applyTierGating() {
    // Automations tabs
    const actionTab = document.querySelector('.automation-tab[data-tab="actionItems"]');
    const remindersTab = document.querySelector('.automation-tab[data-tab="replyReminders"]');
    const autoReplyTab = document.querySelector('.automation-tab[data-tab="autoReply"]');
    setLocked(actionTab, !hasFeature('action_items'), 'action_items');
    setLocked(remindersTab, !hasFeature('reply_reminders'), 'reply_reminders');
    setLocked(autoReplyTab, !hasFeature('auto_reply'), 'auto_reply');

    // Panels/controls
    setLocked($('automationTabActionItems'), !hasFeature('action_items'), 'action_items');
    setLocked($('automationTabReplyReminders'), !hasFeature('reply_reminders'), 'reply_reminders');
    setLocked($('automationTabAutoReply'), !hasFeature('auto_reply'), 'auto_reply');

    // Reply drafting + sending
    setLocked($('generateReplyBtn'), !hasFeature('ai_reply_drafts'), 'ai_reply_drafts');
    setLocked($('sendReplyBtn'), !hasFeature('send_email'), 'send_email');

    // Background sync toggle (Viewer is manual-only)
    setLocked($('autoSyncToggle'), !hasFeature('gmail_sync_background'), 'gmail_sync_background');

    // Earnings + auto-analyze (Agent+)
    // Pipeline value is available to all tiers (no lock)
    setLocked($('commissionSettingsField'), !hasFeature('estimated_earnings'), 'estimated_earnings');
    setLocked($('autoAnalyzeSettingsField'), !hasFeature('auto_analyze_leads'), 'auto_analyze_leads');

    // If a user previously enabled toggles on a higher tier, force-disable when locked
    if (!hasFeature('gmail_sync_background')) {
        try {
            setAutoSyncEnabled(false);
            setAutoSyncToggleUI(false);
            stopAutoSync();
        } catch {}
    }
    if (!hasFeature('auto_reply')) {
        try {
            setAutoReplyEnabled(false);
            setAutoReplyToggleUI(false);
        } catch {}
    }
}

function setTogglePressed(id, enabled) {
    const toggle = document.getElementById(id);
    if (!toggle) return;
    toggle.classList.toggle('is-on', !!enabled);
    toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
}

// Check authentication and onboarding on page load
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Use shared authGuard function
        const authResult = await checkAuthAndOnboarding({ 
            requireAuth: true, 
            requireOnboarding: true 
        });
        
        if (!authResult) {
            // Redirected by authGuard, exit early
            return;
        }
        
        // Initialize Supabase client for dashboard use (shared)
        try {
            supabaseClient = window.getSupabaseClient();
            console.log('[dashboard] supabase client ready:', !!supabaseClient);
            
            // Safety guard: verify client is initialized correctly
            if (!supabaseClient || typeof supabaseClient.from !== 'function') {
                console.error('[dashboard] Supabase client not initialized correctly', {
                    hasClient: !!supabaseClient,
                    hasFromMethod: supabaseClient ? typeof supabaseClient.from : 'N/A',
                    clientType: typeof supabaseClient
                });
                throw new Error('Supabase client not initialized correctly');
            }
        } catch (e) {
            console.error('[dashboard] Supabase init failed:', e);
            window.location.href = '/auth';
            return;
        }
        
        console.log('[dashboard] init start');
        
        // Load plan early and apply UI gating (do this before binding most handlers)
        await loadCurrentUserPlan();
        applyTierGating();

        // Initialize dashboard
        initializeDashboard();
        
        // Setup event listeners
        setupEventListeners();
        
        // Load and render data
        await loadDashboardData();
        
        console.log('[dashboard] currentLeads length:', currentLeads?.length);
        
        // Render KPIs and charts
        renderKPIs();
        initCharts();
        filterAndRenderLeads();
        
        // Check for Gmail connection success/error in URL params
        const urlParams = new URLSearchParams(window.location.search);
        const gmailStatus = urlParams.get('gmail');
        const gmailError = urlParams.get('gmail_error');
        
        if (gmailStatus === 'connected') {
            showToast('Gmail connected successfully!', 'success');
            // Refresh connection status
            await checkGmailConnectionStatus();
            // Auto-sync immediately after successful connect so pipeline/messages populate
            try {
                await syncInbox();
            } catch (e) {
                console.error('[dashboard] Auto-sync after Gmail connect failed:', e);
            }
            // Clean up URL after we attempt sync
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (gmailError) {
            showToast('Gmail connection failed: ' + decodeURIComponent(gmailError), 'error');
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
        
        // Select first lead (prefer hot leads with OpenAI scores)
        if (currentLeads.length > 0) {
            const hotLead = currentLeads.find(l => l.score !== null && l.score !== undefined && l.score >= 80);
            await selectLead(hotLead ? hotLead.id : currentLeads[0].id);
        }
    } catch (error) {
        console.error('[dashboard] Error during initialization:', error);
        alert('Failed to initialize dashboard. Please refresh the page.');
    }
});

// Removed local checkAuthAndOnboarding - now using shared authGuard.js

// Legacy mock data (disabled)
/* const mockLeads = [
    {
        id: 1,
        name: "Sarah Johnson",
        email: "sarah.johnson@email.com",
        score: 87,
        confidence: "high",
        lastMessage: "Thanks for the info! When can we schedule a viewing?",
        lastActivity: "2h ago",
        lastMessageAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        needsFollowup: false,
        source: "Zillow",
        pipelineValue: 450000,
        scoreExplanation: [
            "Asking about scheduling a viewing",
            "Fast response time (2 hours)",
            "Expressing specific interest in property details",
            "Engaged in active conversation"
        ],
        recommendations: [
            { text: "Respond within the next hour to maintain momentum", urgency: "high" },
            { text: "Suggest 2-3 specific viewing times", urgency: "high" },
            { text: "Send property details and neighborhood information", urgency: "medium" }
        ],
        messages: [
            {
                from: "lead",
                sender: "Sarah Johnson",
                time: "2h ago",
                sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
                body: "Thanks for the info! When can we schedule a viewing?"
            },
            {
                from: "agent",
                sender: "You",
                time: "3h ago",
                sentAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
                body: "Hi Sarah! I'd be happy to help you find your perfect home. What type of property are you looking for?"
            },
            {
                from: "lead",
                sender: "Sarah Johnson",
                time: "3h ago",
                sentAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
                body: "I'm interested in 3BR/2BA homes in the downtown area, budget around $450K."
            }
        ]
    },
    {
        id: 2,
        name: "Michael Chen",
        email: "mchen@email.com",
        score: 62,
        confidence: "medium",
        lastMessage: "Can you send me more details about the property?",
        lastActivity: "5h ago",
        lastMessageAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
        needsFollowup: true,
        source: "Realtor.com",
        pipelineValue: 320000,
        scoreExplanation: [
            "Asking for property details shows genuine interest",
            "Response time could be faster",
            "Needs more engagement to move forward",
            "Moderate engagement level"
        ],
        recommendations: [
            { text: "Send comprehensive property details immediately", urgency: "high" },
            { text: "Follow up with a phone call to gauge interest level", urgency: "medium" },
            { text: "Ask qualifying questions about timeline and financing", urgency: "medium" }
        ],
        messages: [
            {
                from: "lead",
                sender: "Michael Chen",
                time: "5h ago",
                sentAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
                body: "Can you send me more details about the property?"
            },
            {
                from: "agent",
                sender: "You",
                time: "1d ago",
                sentAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
                body: "Hi Michael, I saw you were interested in the property listing. Would you like to schedule a viewing?"
            }
        ]
    },
    {
        id: 3,
        name: "Emily Rodriguez",
        email: "emily.r@email.com",
        score: 94,
        confidence: "high",
        lastMessage: "Perfect! Let's move forward with the offer.",
        lastActivity: "30m ago",
        lastMessageAt: new Date(Date.now() - 30 * 60 * 1000),
        needsFollowup: false,
        source: "Referral",
        pipelineValue: 680000,
        scoreExplanation: [
            "Ready to make an offer",
            "Showing strong buying intent",
            "Expressing urgency",
            "High engagement and responsiveness"
        ],
        recommendations: [
            { text: "Respond immediately - this is a hot lead", urgency: "high" },
            { text: "Prepare offer documents and next steps", urgency: "high" },
            { text: "Schedule closing timeline discussion", urgency: "high" }
        ],
        messages: [
            {
                from: "lead",
                sender: "Emily Rodriguez",
                time: "30m ago",
                sentAt: new Date(Date.now() - 30 * 60 * 1000),
                body: "Perfect! Let's move forward with the offer."
            },
            {
                from: "agent",
                sender: "You",
                time: "1h ago",
                sentAt: new Date(Date.now() - 60 * 60 * 1000),
                body: "Great! I've prepared the offer documents. Would you like to review them?"
            }
        ]
    },
    {
        id: 4,
        name: "James Wilson",
        email: "jwilson@email.com",
        score: 35,
        confidence: "low",
        lastMessage: "Just browsing for now, thanks.",
        lastActivity: "2d ago",
        lastMessageAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        needsFollowup: false,
        source: "Website",
        pipelineValue: 280000,
        scoreExplanation: [
            "Casual browsing behavior",
            "No immediate buying intent detected",
            "May need nurturing over time",
            "Low engagement level"
        ],
        recommendations: [
            { text: "Add to nurture sequence with monthly property updates", urgency: "low" },
            { text: "Don't push for immediate action", urgency: "low" },
            { text: "Focus on building relationship and trust", urgency: "low" }
        ],
        messages: [
            {
                from: "lead",
                sender: "James Wilson",
                time: "2d ago",
                sentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
                body: "Just browsing for now, thanks."
            }
        ]
    },
    {
        id: 5,
        name: "Lisa Martinez",
        email: "lisa.m@email.com",
        score: 75,
        confidence: "high",
        lastMessage: "I'd like to see the property this weekend.",
        lastActivity: "1h ago",
        lastMessageAt: new Date(Date.now() - 60 * 60 * 1000),
        needsFollowup: false,
        source: "Zillow",
        pipelineValue: 520000,
        scoreExplanation: [
            "Requesting property viewing",
            "Specific timeline mentioned",
            "High engagement",
            "Quick response time"
        ],
        recommendations: [
            { text: "Schedule viewing for this weekend", urgency: "high" },
            { text: "Send property details and directions", urgency: "medium" },
            { text: "Prepare comparables for discussion", urgency: "medium" }
        ],
        messages: [
            {
                from: "lead",
                sender: "Lisa Martinez",
                time: "1h ago",
                sentAt: new Date(Date.now() - 60 * 60 * 1000),
                body: "I'd like to see the property this weekend."
            }
        ]
    },
    {
        id: 6,
        name: "David Kim",
        email: "david.kim@email.com",
        score: 58,
        confidence: "medium",
        lastMessage: "What's the HOA fee?",
        lastActivity: "8h ago",
        lastMessageAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
        needsFollowup: true,
        source: "Realtor.com",
        pipelineValue: 380000,
        scoreExplanation: [
            "Asking specific property questions",
            "Moderate engagement",
            "Needs follow-up",
            "Showing interest in details"
        ],
        recommendations: [
            { text: "Provide HOA information immediately", urgency: "high" },
            { text: "Follow up with additional property details", urgency: "medium" },
            { text: "Ask about financing pre-approval", urgency: "medium" }
        ],
        messages: [
            {
                from: "lead",
                sender: "David Kim",
                time: "8h ago",
                sentAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
                body: "What's the HOA fee?"
            }
        ]
    }
]; */

// State management
let currentLeads = [];
let selectedLeadId = null;
let selectedLeadIds = new Set(); // For multi-select deletion
let isSelectMode = false;
let currentFilter = 'all';
let searchQuery = '';
let currentDateRange = '30D';
let chartInstances = {};
const autoAnalysisRequested = new Set();

// Auto Sync (Gmail)
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_SYNC_STORAGE_KEY = 'autoSyncEnabled';
let autoSyncTimerId = null;
let autoSyncInFlight = false;

// Auto Reminder (Automations > Reply Reminders)
const AUTO_REMINDER_STORAGE_KEY = 'autoReminderEnabled';

// Follow-up score threshold (>= threshold = follow-up)
const FOLLOWUP_THRESHOLD_STORAGE_KEY = 'followupScoreThreshold';
const DEFAULT_FOLLOWUP_THRESHOLD = 75;

// Auto Reply
const AUTO_REPLY_STORAGE_KEY = 'autoReplyEnabled';
const AUTO_REPLY_RULES_KEY = 'autoReplyRules';
const AUTO_REPLY_MODE_KEY = 'autoReplyMode';
const AUTO_REPLY_TEMPLATE_KEY = 'autoReplyTemplate';
const AUTO_REPLY_SENT_MAP_KEY = 'autoReplySentMap';
let autoReplyInFlight = false;

// Helper function to get user_id from Supabase session
async function getUserId() {
    if (!supabaseClient) {
        console.warn('Supabase client not initialized');
        return null;
    }
    
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        if (error) {
            console.error('Error getting session:', error);
            return null;
        }
        
        if (session && session.user) {
            return session.user.id;
        }
        
        return null;
    } catch (error) {
        console.error('Exception getting user ID:', error);
        return null;
    }
}

// Removed duplicate DOMContentLoaded handler - initialization handled at top of file

/**
 * Check for active Supabase session
 */
async function checkSession() {
    if (!supabaseClient) {
        return false;
    }
    
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        if (error) {
            console.error('Error checking session:', error);
            return false;
        }
        
        if (session) {
            console.log('Active session found:', session.user.email);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Exception checking session:', error);
        return false;
    }
}

// (removed) localStorage onboarding state; profile data is sourced from Supabase `profiles`

/**
 * Load dashboard data from Supabase
 * Fetches leads with their latest messages and analysis
 */
async function loadDashboardData() {
    if (!supabaseClient) {
        console.error('Supabase client not initialized');
        return;
    }
    
    try {
        const userId = await getUserId();
        if (!userId) {
            console.error('User not authenticated');
            return;
        }
        
        // Fetch leads for this user (ORDER BY last_message_at DESC NULLS LAST)
        // CRITICAL: Include pipeline_value, estimated_price_min, estimated_price_max, estimated_earnings
        const { data: leads, error: leadsError } = await supabaseClient
            .from('leads')
            .select('*, pipeline_value, estimated_price_min, estimated_price_max, estimated_earnings')
            .eq('user_id', userId)
            .order('last_message_at', { ascending: false, nullsLast: true });
        
        if (leadsError) {
            console.error('Error fetching leads:', leadsError);
            showToast(`Failed to load leads: ${leadsError.message || leadsError.code || 'unknown error'}`, 'error');
            return;
        }
        
        // Fetch messages and latest scores for each lead
        const leadsWithMessages = await Promise.all(
            (leads || []).map(async (lead) => {
                // Fetch latest messages for this lead
                const { data: messages, error: messagesError } = await supabaseClient
                    .from('messages')
                    .select('*')
                    .eq('lead_id', lead.id)
                    .order('sent_at', { ascending: false })
                    .limit(10);
                
                if (messagesError) {
                    console.warn('Error fetching messages for lead:', lead.id, messagesError);
                }
                
                // Fetch latest analysis score from lead_scores table
                const { data: latestScore, error: scoreError } = await supabaseClient
                    .from('lead_scores')
                    .select('deal_probability, confidence, reason, recommended_actions, classification, created_at')
                    .eq('lead_id', lead.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                
                if (scoreError && scoreError.code !== 'PGRST116') {
                    // PGRST116 = no rows returned, which is OK
                    console.warn('Error fetching latest score for lead:', lead.id, scoreError);
                }
                
                // ONLY use scores from OpenAI (lead_scores table) - no fallback to leads.score
                // If no OpenAI score exists, set to null (not 0) to indicate unscored
                const score = latestScore?.deal_probability ?? null;
                const confidence = latestScore?.confidence ?? null;
                const classification = latestScore?.classification ?? null;
                
                // Transform messages to dashboard format
                // Messages are fetched newest first, so reverse for chronological display
                const transformedMessages = (messages || []).reverse().map(msg => {
                    const sentAt = new Date(msg.sent_at);
                    const now = new Date();
                    const diffMs = now - sentAt;
                    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                    const diffDays = Math.floor(diffHours / 24);
                    
                    let timeAgo = '';
                    if (diffDays > 0) {
                        timeAgo = `${diffDays}d ago`;
                    } else if (diffHours > 0) {
                        timeAgo = `${diffHours}h ago`;
                    } else {
                        const diffMins = Math.floor(diffMs / (1000 * 60));
                        timeAgo = diffMins > 0 ? `${diffMins}m ago` : 'Just now';
                    }
                    
                    return {
                        from: msg.direction === 'inbound' ? 'lead' : 'agent',
                        sender: msg.direction === 'inbound' ? (lead.lead_name || lead.lead_email) : 'You',
                        time: timeAgo,
                        sentAt: sentAt,
                        body: msg.body || '',
                        subject: msg.subject || ''
                    };
                });
                
                if (messages && messages.length > 0) {
                    console.log(`[loadDashboardData] Lead ${lead.id}: Found ${messages.length} messages, transformed ${transformedMessages.length}`);
                }
                
                // Get last message info
                const lastMessage = transformedMessages.length > 0 
                    ? transformedMessages[transformedMessages.length - 1]
                    : null;
                
                const lastMessageAt = lead.last_message_at ? new Date(lead.last_message_at) : new Date();
                const now = new Date();
                const diffMs = now - lastMessageAt;
                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                const diffDays = Math.floor(diffHours / 24);
                
                let lastActivity = '';
                if (diffDays > 0) {
                    lastActivity = `${diffDays}d ago`;
                } else if (diffHours > 0) {
                    lastActivity = `${diffHours}h ago`;
                } else {
                    const diffMins = Math.floor(diffMs / (1000 * 60));
                    lastActivity = diffMins > 0 ? `${diffMins}m ago` : 'Just now';
                }
                
                // Normalize numeric fields ONCE when loading leads
                // IMPORTANT: No UI-side fallbacks for pipeline_value. We only display values coming from OpenAI-backed analysis.
                const normalizedPipelineValue = toNumberOrNull(lead.pipeline_value);
                const normalizedPriceMin = toNumberOrNull(lead.estimated_price_min);
                const normalizedPriceMax = toNumberOrNull(lead.estimated_price_max);
                const normalizedEarnings = toNumberOrNull(lead.estimated_earnings);
                
                // Check pricing intent if ANY of the three fields exist
                const hasPricingIntentFlag = hasPricingIntent(
                    normalizedPipelineValue,
                    normalizedPriceMin,
                    normalizedPriceMax
                );
                
                // Debug log first lead's field types
                if (leads.indexOf(lead) === 0) {
                    console.log("[DEBUG lead fields]", {
                        pipeline_value: lead.pipeline_value,
                        pipeline_type: typeof lead.pipeline_value,
                        estimated_price_min: lead.estimated_price_min,
                        min_type: typeof lead.estimated_price_min,
                        estimated_price_max: lead.estimated_price_max,
                        max_type: typeof lead.estimated_price_max,
                        normalized_pipeline_value: normalizedPipelineValue,
                        normalized_pipeline_type: typeof normalizedPipelineValue
                    });
                }
                
                // Defensive log for pipeline rendering
                console.log('[PIPELINE_RENDER]', {
                    lead_id: lead.id,
                    pipeline_value: normalizedPipelineValue,
                    estimated_price_min: normalizedPriceMin,
                    estimated_price_max: normalizedPriceMax,
                    has_pricing_intent: hasPricingIntentFlag
                });
                
                return {
                    id: lead.id,
                    name: lead.lead_name || lead.lead_email,
                    email: lead.lead_email,
                    score: score,
                    confidence: confidence,
                    classification: classification,
                    lastMessage: lastMessage ? lastMessage.body : 'No messages yet',
                    lastActivity: lastActivity,
                    lastMessageAt: lastMessageAt,
                    lastAnalyzedAt: lead.last_analyzed_at ? new Date(lead.last_analyzed_at) : null,
                    // Follow-ups are score-based only (OpenAI), threshold configurable in Automations
                    needsFollowup: (score !== null && score !== undefined && Number(score) >= getFollowupScoreThreshold()),
                    source: lead.source || 'Unknown',
                    pipelineValue: normalizedPipelineValue, // OpenAI-backed expected value only (no UI fallbacks)
                    estimatedPriceMin: normalizedPriceMin, // Normalized number or null
                    estimatedPriceMax: normalizedPriceMax, // Normalized number or null
                    estimatedEarnings: normalizedEarnings, // Server-computed expected earnings (pipeline × commission)
                    hasPricingIntent: hasPricingIntentFlag, // True if ANY field exists
                    messages: transformedMessages,
                    // Populate from latest score if available
                    scoreExplanation: latestScore?.reason ? [latestScore.reason] : [],
                    recommendations: latestScore?.recommended_actions || []
                };
            })
        );
        
        // Update current leads
        currentLeads = leadsWithMessages;
        
        console.log(`Loaded ${currentLeads.length} leads from Supabase`);
        
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showToast('Failed to load leads. Please refresh the page.', 'error');
    }
}

function initializeDashboard() {
    // Set up user menu
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userMenuDropdown = document.getElementById('userMenuDropdown');
    
    if (userMenuBtn && userMenuDropdown) {
        userMenuBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            userMenuDropdown.classList.toggle('show');
        });
        
        document.addEventListener('click', function() {
            userMenuDropdown.classList.remove('show');
        });
    }
    
    // Set up logout
    const logoutLink = userMenuDropdown?.querySelector('a[href="/"]');
    if (logoutLink) {
        logoutLink.addEventListener('click', async function(e) {
            e.preventDefault();
            await signOut();
        });
    }

    // Profile / Settings modal entry points
    const settingsMenuItem = document.getElementById('settingsMenuItem');
    const signOutMenuItem = document.getElementById('signOutMenuItem');
    const openSettings = async (e) => {
        e?.preventDefault?.();
        userMenuDropdown?.classList?.remove('show');
        await openProfileModal();
    };
    settingsMenuItem?.addEventListener('click', openSettings);
    signOutMenuItem?.addEventListener('click', async (e) => {
        e?.preventDefault?.();
        userMenuDropdown?.classList?.remove('show');
        await signOut();
    });
}

async function signOut() {
    if (!supabaseClient) {
        window.location.href = 'auth.html';
        return;
    }
    
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            console.error('Error signing out:', error);
        }
        window.location.href = 'auth.html';
    } catch (error) {
        console.error('Exception during sign out:', error);
        window.location.href = 'auth.html';
    }
}

async function setupEventListeners() {
    try {
        // Date range buttons
        document.querySelectorAll('.date-range-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.date-range-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentDateRange = this.getAttribute('data-range');
                updateCharts(currentDateRange);
            });
        });
        
        // Content tabs
        document.querySelectorAll('.content-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                const tabName = this.getAttribute('data-tab');
                document.querySelectorAll('.content-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                this.classList.add('active');
                const tabContent = document.getElementById(`${tabName}Tab`);
                if (tabContent) {
                    tabContent.classList.add('active');
                }
                
                // Initialize performance charts if switching to performance tab
                if (tabName === 'performance') {
                    initPerformanceCharts();
                }
            });
        });
        
        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentFilter = this.getAttribute('data-filter');
                filterAndRenderLeads();
            });
        });
        
        // Follow-up toggle
        const followupToggle = document.getElementById('followupToggle');
        if (followupToggle) {
            followupToggle.addEventListener('change', function() {
                filterAndRenderLeads();
            });
        }
        
        // Search
        const searchInput = document.getElementById('leadSearch');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                searchQuery = this.value.toLowerCase();
                filterAndRenderLeads();
            });
        }
        
        // Create Demo Lead button
        const createDemoLeadBtn = document.getElementById('createDemoLeadBtn');
        if (createDemoLeadBtn) {
            createDemoLeadBtn.addEventListener('click', async function() {
                await createDemoLead();
            });
        }
        
        // TEMP: Analyze Lead button (Phase 1 testing only)
        const analyzeLeadBtn = document.getElementById('analyzeLeadBtn');
        if (analyzeLeadBtn) {
            analyzeLeadBtn.addEventListener('click', async function() {
                if (!selectedLeadId) {
                    showToast('Please select a lead first', 'error');
                    return;
                }
                await analyzeSelectedLead();
            });
        }

        // Phase 5: Generate Reply button
        const generateReplyBtn = document.getElementById('generateReplyBtn');
        if (generateReplyBtn) {
            generateReplyBtn.addEventListener('click', async function() {
                if (!selectedLeadId) {
                    showToast('Please select a lead first', 'error');
                    return;
                }
                await generateReplyForSelectedLead();
            });
        }

        // Reply composer (copy + send)
        const copyReplyBtn = document.getElementById('copyReplyBtn');
        if (copyReplyBtn) {
            copyReplyBtn.addEventListener('click', async function() {
                const subject = $('replySubjectInput')?.value || '';
                const body = $('replyBodyInput')?.value || '';
                const ok = await copyToClipboard(`Subject: ${subject}\n\n${body}`.trim());
                showToast(ok ? 'Copied' : 'Copy failed', ok ? 'success' : 'error');
            });
        }
        const sendReplyBtn = document.getElementById('sendReplyBtn');
        if (sendReplyBtn) {
            sendReplyBtn.addEventListener('click', async function() {
                await sendOutboundReply();
            });
        }
        
        // Gmail connection/sync button
        const gmailBtn = document.getElementById('gmailConnectionBtn');
        if (gmailBtn) {
            gmailBtn.addEventListener('click', handleGmailButtonClick);
        }

        // Auto Sync toggle (runs sync every 5 minutes)
        const autoToggle = document.getElementById('autoSyncToggle');
        if (autoToggle) {
            autoToggle.addEventListener('click', () => {
                const enabled = !isAutoSyncEnabled();
                setAutoSyncEnabled(enabled);
                setAutoSyncToggleUI(enabled);
                if (enabled) {
                    startAutoSync();
                    showToast('Auto Sync enabled (every 5 minutes)', 'success');
                } else {
                    stopAutoSync();
                    showToast('Auto Sync disabled', 'info');
                }
            });
        }
        
        // Check Gmail connection status and update button (don't let errors break other buttons)
        try {
            await checkGmailConnectionStatus();
        } catch (error) {
            console.error('[dashboard] Error checking Gmail status (non-fatal):', error);
        }

        // Initialize auto sync after we know current Gmail status
        try {
            const enabled = isAutoSyncEnabled();
            setAutoSyncToggleUI(enabled);
            if (enabled) startAutoSync();
        } catch (e) {
            console.warn('[dashboard] Auto Sync init failed (non-fatal):', e?.message || e);
        }

        // Initialize auto reminder toggle UI
        try {
            const enabled = isAutoReminderEnabled();
            setAutoReminderToggleUI(enabled);
            if (enabled) {
                await maybeAutoCreateReminders();
            }
        } catch (e) {
            console.warn('[dashboard] Auto Reminder init failed (non-fatal):', e?.message || e);
        }

        // Initialize follow-up threshold + auto reply UI state (automations)
        try {
            const t = getFollowupScoreThreshold();
            if ($('followupScoreThreshold')) $('followupScoreThreshold').value = String(t);
            loadAutoReplySettingsIntoUI();
        } catch (e) {
            console.warn('[dashboard] Automations settings init failed (non-fatal):', e?.message || e);
        }
        
        const connectGmailBtn = document.getElementById('connectGmailEmptyBtn');
        if (connectGmailBtn) {
            connectGmailBtn.addEventListener('click', connectGmail);
        }
        
        // Lead selection and deletion
        const selectLeadsBtn = document.getElementById('selectLeadsBtn');
        const deleteSelectedLeadsBtn = document.getElementById('deleteSelectedLeadsBtn');
        
        if (selectLeadsBtn) {
            selectLeadsBtn.addEventListener('click', toggleSelectMode);
        }
        
        if (deleteSelectedLeadsBtn) {
            deleteSelectedLeadsBtn.addEventListener('click', deleteSelectedLeads);
        }
        
        // Score help tooltip
        const scoreHelpBtn = document.getElementById('scoreHelpBtn');
        const scoreTooltip = document.getElementById('scoreTooltip');
        const tooltipClose = document.getElementById('tooltipClose');
        
        if (scoreHelpBtn && scoreTooltip) {
            scoreHelpBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                scoreTooltip.style.display = 'flex';
            });
            
            if (tooltipClose) {
                tooltipClose.addEventListener('click', function(e) {
                    e.stopPropagation();
                    scoreTooltip.style.display = 'none';
                });
            }
            
            document.addEventListener('click', function(e) {
                if (scoreTooltip.style.display === 'flex' && 
                    !scoreTooltip.contains(e.target) && 
                    !scoreHelpBtn.contains(e.target)) {
                    scoreTooltip.style.display = 'none';
                }
            });
        }
        
        // Conversation collapse
        const conversationHeader = document.getElementById('conversationHeader');
        const conversationThread = document.getElementById('conversationThread');
        if (conversationHeader && conversationThread) {
            conversationHeader.addEventListener('click', function() {
                this.classList.toggle('active');
                conversationThread.classList.toggle('collapsed');
            });
        }

        // AI Reply modal behavior
        $('aiReplyModalCloseBtn')?.addEventListener('click', () => closeOverlay('aiReplyModalOverlay'));
        $('closeAiReplyBtn')?.addEventListener('click', () => closeOverlay('aiReplyModalOverlay'));
        $('aiReplyModalOverlay')?.addEventListener('click', (e) => {
            if (e?.target?.id === 'aiReplyModalOverlay') closeOverlay('aiReplyModalOverlay');
        });
        $('copySubjectBtn')?.addEventListener('click', async () => {
            const ok = await copyToClipboard($('aiReplySubject')?.value || '');
            showToast(ok ? 'Subject copied' : 'Copy failed', ok ? 'success' : 'error');
        });
        $('copyBodyBtn')?.addEventListener('click', async () => {
            const ok = await copyToClipboard($('aiReplyBody')?.value || '');
            showToast(ok ? 'Body copied' : 'Copy failed', ok ? 'success' : 'error');
        });
        $('copyBothBtn')?.addEventListener('click', async () => {
            const subject = $('aiReplySubject')?.value || '';
            const body = $('aiReplyBody')?.value || '';
            const ok = await copyToClipboard(`Subject: ${subject}\n\n${body}`.trim());
            showToast(ok ? 'Copied' : 'Copy failed', ok ? 'success' : 'error');
        });
        $('useDraftBtn')?.addEventListener('click', async () => {
            const subject = $('aiReplySubject')?.value || '';
            const body = $('aiReplyBody')?.value || '';
            if ($('replyComposer')) {
                $('replySubjectInput').value = subject;
                $('replyBodyInput').value = body;
                $('replyComposer').style.display = 'block';
                $('replyComposer').scrollIntoView({ behavior: 'smooth', block: 'start' });
                // Close the AI reply modal for smooth transition
                closeOverlay('aiReplyModalOverlay');
                showToast('Draft added to composer', 'success');
            }
        });

        // Profile modal behavior
        $('profileModalCloseBtn')?.addEventListener('click', () => closeOverlay('profileModalOverlay'));
        $('profileCancelBtn')?.addEventListener('click', () => closeOverlay('profileModalOverlay'));
        $('profileModalOverlay')?.addEventListener('click', (e) => {
            if (e?.target?.id === 'profileModalOverlay') closeOverlay('profileModalOverlay');
        });
        $('profileSaveBtn')?.addEventListener('click', async () => {
            await saveProfileChanges();
        });
        $('disconnectGmailBtn')?.addEventListener('click', async () => {
            await disconnectGmail();
        });
        $('manageSubscriptionBtn')?.addEventListener('click', async () => {
            // Go to pricing page
            window.location.href = '/pricing';
        });

        // Commission help icon (show upgrade message for non-Agent+ users)
        $('commissionHelpBtn')?.addEventListener('click', (e) => {
            e?.preventDefault?.();
            e?.stopPropagation?.();
            if (!hasFeature('estimated_earnings')) {
                showToast('Unlock custom commission by upgrading to Agent!', 'info');
            }
        });

        // Auto-analyze toggle (Agent+). Actual persistence happens on "Save".
        $('autoAnalyzeToggle')?.addEventListener('click', (e) => {
            e?.preventDefault?.();
            const enabled = $('autoAnalyzeToggle')?.getAttribute('aria-pressed') === 'true';
            setTogglePressed('autoAnalyzeToggle', !enabled);
        });

        // (tiers modal removed; tiers managed via tiers.html)

        // Personalization modal behavior
        $('personalizationModalCloseBtn')?.addEventListener('click', () => closeOverlay('personalizationModalOverlay'));
        $('personalizationCancelBtn')?.addEventListener('click', () => closeOverlay('personalizationModalOverlay'));
        $('personalizationModalOverlay')?.addEventListener('click', (e) => {
            if (e?.target?.id === 'personalizationModalOverlay') closeOverlay('personalizationModalOverlay');
        });
        $('personalizationSaveBtn')?.addEventListener('click', async () => {
            await savePersonalization();
        });

        // Overview quick actions
        $('openPersonalizationBtn')?.addEventListener('click', async () => {
            await openPersonalizationModal();
        });
        $('openAutomationsBtn')?.addEventListener('click', async () => {
            await openAutomationsModal();
        });

        // Automations modal behavior
        $('automationsModalCloseBtn')?.addEventListener('click', () => closeOverlay('automationsModalOverlay'));
        $('automationsCloseBtn')?.addEventListener('click', () => closeOverlay('automationsModalOverlay'));
        $('automationsModalOverlay')?.addEventListener('click', (e) => {
            if (e?.target?.id === 'automationsModalOverlay') closeOverlay('automationsModalOverlay');
        });

        document.querySelectorAll('.automation-tab').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.automation-tab').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                const tab = btn.getAttribute('data-tab');
                document.querySelectorAll('.automation-panel').forEach((p) => p.classList.remove('active'));
                if (tab === 'actionItems') $('automationTabActionItems')?.classList.add('active');
                if (tab === 'replyReminders') $('automationTabReplyReminders')?.classList.add('active');
                if (tab === 'priorityLeads') $('automationTabPriorityLeads')?.classList.add('active');
                if (tab === 'autoReply') $('automationTabAutoReply')?.classList.add('active');
                refreshAutomationsLists();
            });
        });

        $('addActionItemBtn')?.addEventListener('click', async () => {
            await addActionItem();
        });
        $('followupScoreThreshold')?.addEventListener('input', () => {
            const val = Number($('followupScoreThreshold')?.value || DEFAULT_FOLLOWUP_THRESHOLD);
            setFollowupScoreThreshold(val);
            renderKPIs();
            filterAndRenderLeads();
            refreshAutomationsLists();
        });
        $('replyReminderHours')?.addEventListener('input', () => {
            localStorage.setItem('replyReminderHours', String($('replyReminderHours')?.value || '24'));
            refreshAutomationsLists();
        });
        $('autoReminderToggle')?.addEventListener('click', async () => {
            const enabled = !isAutoReminderEnabled();
            setAutoReminderEnabled(enabled);
            setAutoReminderToggleUI(enabled);
            if (enabled) {
                showToast('Auto Reminder enabled', 'success');
                await maybeAutoCreateReminders();
            } else {
                showToast('Auto Reminder disabled', 'info');
            }
        });
        $('priorityLeadThreshold')?.addEventListener('input', () => {
            localStorage.setItem('priorityLeadThreshold', String($('priorityLeadThreshold')?.value || '50000'));
            refreshAutomationsLists();
        });
        $('priorityIncludePriceMentioned')?.addEventListener('change', () => {
            localStorage.setItem('priorityIncludePriceMentioned', String(!!$('priorityIncludePriceMentioned')?.checked));
            refreshAutomationsLists();
        });

        // Auto Reply controls
        $('autoReplyToggle')?.addEventListener('click', async () => {
            const enabled = !isAutoReplyEnabled();
            setAutoReplyEnabled(enabled);
            setAutoReplyToggleUI(enabled);
            if (enabled) {
                showToast('Auto Reply enabled', 'success');
                await maybeAutoReplyTick({ manual: true });
            } else {
                showToast('Auto Reply disabled', 'info');
            }
            refreshAutomationsLists();
        });
        $('autoReplyRunOnceBtn')?.addEventListener('click', async () => {
            await maybeAutoReplyTick({ manual: true });
            refreshAutomationsLists();
        });
        $('autoReplyMinScore')?.addEventListener('input', () => { saveAutoReplySettingsFromUI(); refreshAutomationsLists(); });
        $('autoReplyPriceQualified')?.addEventListener('change', () => { saveAutoReplySettingsFromUI(); refreshAutomationsLists(); });
        $('autoReplyMentionDatesOnly')?.addEventListener('change', () => { saveAutoReplySettingsFromUI(); refreshAutomationsLists(); });
        $('autoReplyModeAi')?.addEventListener('change', () => { saveAutoReplySettingsFromUI(); refreshAutomationsLists(); });
        $('autoReplyModeTemplate')?.addEventListener('change', () => { saveAutoReplySettingsFromUI(); refreshAutomationsLists(); });
        $('autoReplySubjectTemplate')?.addEventListener('input', () => { saveAutoReplySettingsFromUI(); });
        $('autoReplyBodyTemplate')?.addEventListener('input', () => { saveAutoReplySettingsFromUI(); });
        
        // Analysis status will be updated automatically when lead is selected
    } catch (error) {
        console.error('[dashboard] Error setting up event listeners:', error);
        showToast(`Dashboard UI error: ${error?.message || error}`, 'error');
    }
}

function isAutoSyncEnabled() {
    try {
        return localStorage.getItem(AUTO_SYNC_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}

function setAutoSyncEnabled(enabled) {
    try {
        localStorage.setItem(AUTO_SYNC_STORAGE_KEY, String(!!enabled));
    } catch {}
}

function setAutoSyncToggleUI(enabled) {
    const toggle = document.getElementById('autoSyncToggle');
    if (!toggle) return;
    toggle.classList.toggle('is-on', !!enabled);
    toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
}

function isAutoReminderEnabled() {
    try {
        return localStorage.getItem(AUTO_REMINDER_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}

function setAutoReminderEnabled(enabled) {
    try {
        localStorage.setItem(AUTO_REMINDER_STORAGE_KEY, String(!!enabled));
    } catch {}
}

function setAutoReminderToggleUI(enabled) {
    const toggle = document.getElementById('autoReminderToggle');
    if (!toggle) return;
    toggle.classList.toggle('is-on', !!enabled);
    toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
}

function clampNumber(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    return Math.min(max, Math.max(min, x));
}

function getFollowupScoreThreshold() {
    try {
        const v = localStorage.getItem(FOLLOWUP_THRESHOLD_STORAGE_KEY);
        if (v === null || v === undefined || v === '') return DEFAULT_FOLLOWUP_THRESHOLD;
        return clampNumber(v, 0, 100);
    } catch {
        return DEFAULT_FOLLOWUP_THRESHOLD;
    }
}

function setFollowupScoreThreshold(v) {
    try {
        localStorage.setItem(FOLLOWUP_THRESHOLD_STORAGE_KEY, String(clampNumber(v, 0, 100)));
    } catch {}
}

function leadNeedsFollowup(lead) {
    const threshold = getFollowupScoreThreshold();
    const score = lead?.score;
    if (score === null || score === undefined) return false;
    const n = Number(score);
    if (!Number.isFinite(n)) return false;
    return n >= threshold;
}

function isHotLead(lead) {
    const score = lead?.score;
    if (score === null || score === undefined) return false;
    const n = Number(score);
    return Number.isFinite(n) && n >= 70;
}

function getLastInboundOutboundTimes(lead) {
    // lead.messages are chronological (oldest -> newest)
    let lastInbound = null;
    let lastOutbound = null;
    const msgs = Array.isArray(lead?.messages) ? lead.messages : [];
    for (const m of msgs) {
        if (!m?.sentAt || !(m.sentAt instanceof Date) || isNaN(m.sentAt.getTime())) continue;
        if (m.from === 'lead') lastInbound = m.sentAt;
        if (m.from === 'agent') lastOutbound = m.sentAt;
    }
    return { lastInbound, lastOutbound };
}

function messageMentionsDate(text) {
    const t = String(text || '');
    if (!t) return false;
    const re = /\b(today|tomorrow|mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?|jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(tember)?|oct(ober)?|nov(ember)?|dec(ember)?|\d{1,2}\/\d{1,2}(\/\d{2,4})?|\d{1,2}:\d{2}\s?(am|pm)?)\b/i;
    return re.test(t);
}

function isAutoReplyEnabled() {
    try { return localStorage.getItem(AUTO_REPLY_STORAGE_KEY) === 'true'; } catch { return false; }
}
function setAutoReplyEnabled(enabled) {
    try { localStorage.setItem(AUTO_REPLY_STORAGE_KEY, String(!!enabled)); } catch {}
}
function setAutoReplyToggleUI(enabled) {
    const toggle = document.getElementById('autoReplyToggle');
    if (!toggle) return;
    toggle.classList.toggle('is-on', !!enabled);
    toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
}

function loadAutoReplySettingsIntoUI() {
    const enabled = isAutoReplyEnabled();
    setAutoReplyToggleUI(enabled);

    let rules = { minScore: 70, priceQualified: false, mentionDatesOnly: false };
    try {
        const raw = localStorage.getItem(AUTO_REPLY_RULES_KEY);
        if (raw) {
            const parsed = (JSON.parse(raw) || {});
            // Back-compat: older setting was hotOnly boolean (>= 70). Map it to minScore if present.
            if (typeof parsed.hotOnly === 'boolean' && parsed.minScore === undefined) {
                parsed.minScore = parsed.hotOnly ? 70 : 0;
            }
            rules = { ...rules, ...parsed };
        }
    } catch {}
    if ($('autoReplyMinScore')) $('autoReplyMinScore').value = String(clampNumber(rules.minScore, 0, 100));
    if ($('autoReplyPriceQualified')) $('autoReplyPriceQualified').checked = !!rules.priceQualified;
    if ($('autoReplyMentionDatesOnly')) $('autoReplyMentionDatesOnly').checked = !!rules.mentionDatesOnly;

    let mode = 'ai';
    try {
        const rawMode = localStorage.getItem(AUTO_REPLY_MODE_KEY);
        if (rawMode === 'template' || rawMode === 'ai') mode = rawMode;
    } catch {}
    if ($('autoReplyModeAi')) $('autoReplyModeAi').checked = mode === 'ai';
    if ($('autoReplyModeTemplate')) $('autoReplyModeTemplate').checked = mode === 'template';

    let tpl = { subject: 'Re: {lead_name}', body: 'Hi {lead_name},\n\nThanks for reaching out — what time works best for a quick call or showing?\n' };
    try {
        const rawTpl = localStorage.getItem(AUTO_REPLY_TEMPLATE_KEY);
        if (rawTpl) tpl = { ...tpl, ...(JSON.parse(rawTpl) || {}) };
    } catch {}
    if ($('autoReplySubjectTemplate')) $('autoReplySubjectTemplate').value = tpl.subject || '';
    if ($('autoReplyBodyTemplate')) $('autoReplyBodyTemplate').value = tpl.body || '';

    updateAutoReplyTemplateVisibility();
}

function saveAutoReplySettingsFromUI() {
    const rules = {
        minScore: clampNumber($('autoReplyMinScore')?.value || 0, 0, 100),
        priceQualified: !!$('autoReplyPriceQualified')?.checked,
        mentionDatesOnly: !!$('autoReplyMentionDatesOnly')?.checked
    };
    try { localStorage.setItem(AUTO_REPLY_RULES_KEY, JSON.stringify(rules)); } catch {}

    const mode = $('autoReplyModeTemplate')?.checked ? 'template' : 'ai';
    try { localStorage.setItem(AUTO_REPLY_MODE_KEY, mode); } catch {}

    const tpl = {
        subject: String($('autoReplySubjectTemplate')?.value || '').trim(),
        body: String($('autoReplyBodyTemplate')?.value || '').trim()
    };
    try { localStorage.setItem(AUTO_REPLY_TEMPLATE_KEY, JSON.stringify(tpl)); } catch {}

    updateAutoReplyTemplateVisibility();
}

function updateAutoReplyTemplateVisibility() {
    const mode = $('autoReplyModeTemplate')?.checked ? 'template' : 'ai';
    const fields = $('autoReplyTemplateFields');
    const bodyField = $('autoReplyBodyTemplateField');
    if (fields) fields.style.display = mode === 'template' ? '' : 'none';
    if (bodyField) bodyField.style.display = mode === 'template' ? '' : 'none';
}

function getAutoReplySentMap() {
    try {
        const raw = localStorage.getItem(AUTO_REPLY_SENT_MAP_KEY);
        return raw ? (JSON.parse(raw) || {}) : {};
    } catch {
        return {};
    }
}

function setAutoReplySentMap(map) {
    try { localStorage.setItem(AUTO_REPLY_SENT_MAP_KEY, JSON.stringify(map || {})); } catch {}
}

function buildAutoReplyEligibleLeads() {
    let rules = { minScore: 70, priceQualified: false, mentionDatesOnly: false };
    try {
        const raw = localStorage.getItem(AUTO_REPLY_RULES_KEY);
        if (raw) {
            const parsed = (JSON.parse(raw) || {});
            if (typeof parsed.hotOnly === 'boolean' && parsed.minScore === undefined) {
                parsed.minScore = parsed.hotOnly ? 70 : 0;
            }
            rules = { ...rules, ...parsed };
        }
    } catch {}

    const sentMap = getAutoReplySentMap();
    const now = Date.now();
    const sentCooldownMs = 24 * 60 * 60 * 1000;

    return (Array.isArray(currentLeads) ? currentLeads : [])
        .filter((lead) => leadNeedsFollowup(lead))
        .filter((lead) => {
            const { lastInbound, lastOutbound } = getLastInboundOutboundTimes(lead);
            if (!lastInbound) return false;
            if (lastOutbound && lastOutbound.getTime() >= lastInbound.getTime()) return false;
            return true;
        })
        .filter((lead) => {
            const score = lead?.score;
            if (score === null || score === undefined) return false;
            const n = Number(score);
            if (!Number.isFinite(n)) return false;
            return n >= clampNumber(rules.minScore, 0, 100);
        })
        .filter((lead) => (rules.priceQualified ? !!lead.hasPricingIntent : true))
        .filter((lead) => {
            if (!rules.mentionDatesOnly) return true;
            const { lastInbound } = getLastInboundOutboundTimes(lead);
            const lastInboundMsg = (Array.isArray(lead.messages) ? lead.messages : []).slice().reverse().find((m) => m.from === 'lead');
            return messageMentionsDate(lastInboundMsg?.body || '') || (lastInbound ? messageMentionsDate(String(lastInbound)) : false);
        })
        .filter((lead) => {
            const lastSent = sentMap[String(lead.id)];
            if (!lastSent) return true;
            return (now - Number(lastSent)) > sentCooldownMs;
        });
}

async function renderAutoReplyEligibleList() {
    const el = $('autoReplyEligibleList');
    if (!el) return;
    const leads = buildAutoReplyEligibleLeads();
    if (!leads.length) {
        el.innerHTML = '<div class="muted">No eligible leads right now.</div>';
        return;
    }
    el.innerHTML = leads.slice(0, 25).map((lead) => {
        const scoreText = (lead?.score !== null && lead?.score !== undefined) ? `score ${lead.score}` : 'unscored';
        const reason = [
            scoreText,
            lead.hasPricingIntent ? 'price' : null,
            leadNeedsFollowup(lead) ? 'follow-up' : null
        ].filter(Boolean).join(' • ');
        return `
          <div class="automation-row" data-lead-id="${lead.id}">
            <div style="flex:1;">
              <strong>${escapeHtml(lead.name)}</strong>
              <div class="muted">${escapeHtml(lead.email)} • ${escapeHtml(reason || 'eligible')}</div>
            </div>
            <button class="btn btn-outline btn-small jump-lead-btn">Open</button>
            <button class="btn btn-primary btn-small auto-reply-send-btn">Send</button>
          </div>
        `;
    }).join('');

    el.querySelectorAll('.jump-lead-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            const row = e.target.closest('.automation-row');
            const id = row?.getAttribute('data-lead-id');
            if (!id) return;
            closeOverlay('automationsModalOverlay');
            await selectLead(id);
        });
    });
    el.querySelectorAll('.auto-reply-send-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            const row = e.target.closest('.automation-row');
            const id = row?.getAttribute('data-lead-id');
            if (!id) return;
            await sendAutoReplyForLead(id);
            await renderAutoReplyEligibleList();
        });
    });
}

async function maybeAutoReplyTick({ manual = false } = {}) {
    if (!hasFeature('auto_reply')) {
        if (manual) promptUpgrade('auto_reply');
        return;
    }
    if (!manual && !isAutoReplyEnabled()) return;
    if (autoReplyInFlight) return;

    // Only run if Gmail is connected
    const gmailBtn = document.getElementById('gmailConnectionBtn');
    const action = gmailBtn?.dataset?.action || 'connect';
    if (action !== 'sync') {
        if (manual) showToast('Connect Gmail first to enable Auto Reply', 'error');
        return;
    }

    const leads = buildAutoReplyEligibleLeads();
    if (manual && !leads.length) {
        showToast('No eligible leads for auto reply', 'info');
        return;
    }

    // Rate-limit: send at most 1 per tick to avoid spam
    const target = leads[0];
    if (!target) return;

    autoReplyInFlight = true;
    try {
        await sendAutoReplyForLead(String(target.id));
    } finally {
        autoReplyInFlight = false;
    }
}

function fillTemplate(str, lead) {
    return String(str || '')
        .replaceAll('{lead_name}', String(lead?.name || ''))
        .replaceAll('{lead_email}', String(lead?.email || ''));
}

async function appendSignatureToBody(body) {
    let out = String(body || '');
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
            const { data: profile } = await supabaseClient
                .from('profiles')
                .select('full_name')
                .eq('id', user.id)
                .maybeSingle();
            if (profile?.full_name) {
                const signature = `\n\n${profile.full_name}`;
                if (!out.endsWith(signature)) out = out + signature;
            }
        }
    } catch {}
    return out;
}

async function sendAutoReplyForLead(leadId) {
    if (!supabaseClient) return;
    if (!hasFeature('auto_reply')) {
        promptUpgrade('auto_reply');
        return;
    }
    const lead = (Array.isArray(currentLeads) ? currentLeads : []).find((l) => String(l.id) === String(leadId));
    if (!lead) return;

    saveAutoReplySettingsFromUI(); // ensure latest settings
    const mode = $('autoReplyModeTemplate')?.checked ? 'template' : 'ai';

    let subject = '';
    let body = '';

    if (mode === 'template') {
        const tplRaw = (() => {
            try { return JSON.parse(localStorage.getItem(AUTO_REPLY_TEMPLATE_KEY) || '{}'); } catch { return {}; }
        })();
        subject = fillTemplate(tplRaw.subject || 'Re: {lead_name}', lead);
        body = fillTemplate(tplRaw.body || '', lead);
    } else {
        // AI draft
        const url = `${API_CONFIG.baseUrl}/api/ai/reply`;
        const resp = await fetchWithAuth(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lead_id: String(leadId) })
        });
        const txt = await resp.text();
        let result = {};
        try { result = JSON.parse(txt); } catch {}
        if (!resp.ok || result.ok !== true) {
            const msg = result.error || `HTTP ${resp.status}`;
            showToast(`Auto Reply failed: ${msg}`, 'error');
            return;
        }
        subject = String(result.subject || '');
        body = String(result.body || '');
    }

    if (!String(body).trim()) {
        showToast('Auto Reply body is empty', 'error');
        return;
    }

    body = await appendSignatureToBody(body);

    // Send email
    const sendUrl = `${API_CONFIG.baseUrl}/api/gmail/send`;
    const sendResp = await fetchWithAuth(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            lead_id: String(leadId),
            subject: subject || null,
            body
        })
    });
    const sendTxt = await sendResp.text();
    let sendResult = {};
    try { sendResult = JSON.parse(sendTxt); } catch {}
    if (!sendResp.ok || sendResult.success !== true) {
        const msg = sendResult.details || sendResult.error || `HTTP ${sendResp.status}`;
        showToast(`Auto Reply send failed: ${msg}`, 'error');
        return;
    }

    // Log outbound message
    try {
        const logUrl = `${API_CONFIG.baseUrl}/api/messages`;
        await fetchWithAuth(logUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lead_id: String(leadId),
                direction: 'outbound',
                subject: subject || null,
                body,
                sent_at: new Date().toISOString()
            })
        });
    } catch {}

    const sentMap = getAutoReplySentMap();
    sentMap[String(leadId)] = Date.now();
    setAutoReplySentMap(sentMap);

    showToast(`Auto Reply sent to ${lead.name}`, 'success');

    // Refresh data
    await loadDashboardData();
    filterAndRenderLeads();
}

async function maybeAutoCreateReminders() {
    if (!isAutoReminderEnabled()) return;
    if (!supabaseClient) return;

    // Only auto-create reminders when the Reminders tab exists (automations modal present)
    if (!document.getElementById('replyRemindersList')) return;

    const hours = Number($('replyReminderHours')?.value || 24);
    const cutoffMs = Date.now() - hours * 60 * 60 * 1000;

    const eligible = (Array.isArray(currentLeads) ? currentLeads : [])
        .filter((l) => leadNeedsFollowup(l) && l.lastMessageAt && l.lastMessageAt.getTime() < cutoffMs);

    if (!eligible.length) return;

    try {
        const { data: { user }, error: userErr } = await supabaseClient.auth.getUser();
        if (userErr || !user) return;

        const leadIds = eligible.map((l) => String(l.id));

        // Fetch existing pending reminders for these leads (de-dupe)
        const { data: existing, error: existingErr } = await supabaseClient
            .from('action_items')
            .select('id, lead_id, title, status')
            .eq('user_id', user.id)
            .in('lead_id', leadIds)
            .eq('status', 'pending')
            .ilike('title', 'Reply reminder:%');

        if (existingErr) {
            console.warn('[auto-reminder] Failed to read existing action items (non-fatal):', existingErr.message);
        }

        const existingLeadIdSet = new Set((existing || []).map((x) => String(x.lead_id)));
        const toCreate = eligible.filter((l) => !existingLeadIdSet.has(String(l.id)));
        if (!toCreate.length) return;

        const rows = toCreate.map((l) => ({
            user_id: user.id,
            lead_id: String(l.id),
            title: `Reply reminder: ${String(l.name || 'Lead')} (${String(l.email || '')})`,
            priority: 'high',
            status: 'pending'
        }));

        const { error: insertErr } = await supabaseClient.from('action_items').insert(rows);
        if (insertErr) {
            console.error('[auto-reminder] Failed to create reminders:', insertErr.message);
            return;
        }

        console.log('[auto-reminder] Created reminders', { count: rows.length });
        // Refresh action items if user is viewing that tab later
        // and update the list UI
        await loadActionItems();
    } catch (e) {
        console.warn('[auto-reminder] create failed (non-fatal):', e?.message || e);
    }
}

function startAutoSync() {
    stopAutoSync(); // de-dupe
    console.log('[auto-sync] starting interval', { every_ms: AUTO_SYNC_INTERVAL_MS });

    // Run a first tick shortly after enabling
    setTimeout(() => {
        autoSyncTick().catch(() => {});
    }, 800);

    autoSyncTimerId = setInterval(() => {
        autoSyncTick().catch(() => {});
    }, AUTO_SYNC_INTERVAL_MS);
}

function stopAutoSync() {
    if (autoSyncTimerId) {
        clearInterval(autoSyncTimerId);
        autoSyncTimerId = null;
    }
}

async function autoSyncTick() {
    if (!isAutoSyncEnabled()) return;
    if (autoSyncInFlight) return;

    // Only run if Gmail button is currently in "sync" state (connected)
    const gmailBtn = document.getElementById('gmailConnectionBtn');
    const action = gmailBtn?.dataset?.action || 'connect';
    if (action !== 'sync') {
        console.log('[auto-sync] skipped (gmail not connected)');
        return;
    }

    // Avoid overlapping with manual sync
    if (gmailBtn?.disabled) {
        console.log('[auto-sync] skipped (sync already running)');
        return;
    }

    autoSyncInFlight = true;
    try {
        console.log('[auto-sync] tick → syncInbox()');
        await syncInbox();
    } catch (e) {
        console.warn('[auto-sync] tick failed (non-fatal):', e?.message || e);
    } finally {
        autoSyncInFlight = false;
    }
}

async function openAutomationsModal() {
    // Restore user preferences
    const hrs = localStorage.getItem('replyReminderHours');
    if (hrs && $('replyReminderHours')) $('replyReminderHours').value = hrs;
    const thr = localStorage.getItem('priorityLeadThreshold');
    if (thr && $('priorityLeadThreshold')) $('priorityLeadThreshold').value = thr;
    const inc = localStorage.getItem('priorityIncludePriceMentioned');
    if (inc !== null && $('priorityIncludePriceMentioned')) $('priorityIncludePriceMentioned').checked = inc === 'true';

    openOverlay('automationsModalOverlay');
    await refreshAutomationsLists(true);
}

async function refreshAutomationsLists(loadActionItems = false) {
    // Panels are lightweight; action items requires DB call.
    if (loadActionItems) {
        await loadActionItems();
    }
    renderReplyReminders();
    renderPriorityLeads();
    await renderAutoReplyEligibleList();

    // If enabled, auto-create reminders based on the reminders rule.
    // Best-effort only; never crash the dashboard.
    try {
        await maybeAutoCreateReminders();
    } catch {}
}

async function loadActionItems() {
    if (!supabaseClient) return;
    const listEl = $('actionItemsList');
    if (!listEl) return;
    listEl.innerHTML = '<div class="muted">Loading...</div>';
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabaseClient
            .from('action_items')
            .select('id,title,priority,status,created_at,updated_at,lead_id')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(100);
        if (error) throw new Error(error.message);
        renderActionItems(data || []);
    } catch (e) {
        console.error('[automations] loadActionItems failed:', e);
        listEl.innerHTML = '<div class="muted">Failed to load action items.</div>';
    }
}

function renderActionItems(items) {
    const listEl = $('actionItemsList');
    if (!listEl) return;
    if (!items.length) {
        listEl.innerHTML = '<div class="muted">No action items yet.</div>';
        return;
    }
    listEl.innerHTML = items.map((it) => {
        const badgeClass = it.priority === 'high' ? 'badge-high' : it.priority === 'low' ? 'badge-low' : 'badge-medium';
        const checked = it.status === 'done' ? 'checked' : '';
        return `
          <div class="action-item-row" data-action-id="${it.id}">
            <input type="checkbox" class="action-item-toggle" ${checked} />
            <div class="action-item-title">${escapeHtml(it.title || '')}</div>
            <span class="badge ${badgeClass}">${escapeHtml(it.priority || 'medium')}</span>
            <button class="btn btn-outline btn-small action-item-delete">Delete</button>
          </div>
        `;
    }).join('');

    // Bind events
    listEl.querySelectorAll('.action-item-toggle').forEach((el) => {
        el.addEventListener('change', async (e) => {
            const row = e.target.closest('.action-item-row');
            const id = row?.getAttribute('data-action-id');
            if (!id) return;
            await updateActionItemStatus(id, e.target.checked ? 'done' : 'pending');
        });
    });
    listEl.querySelectorAll('.action-item-delete').forEach((el) => {
        el.addEventListener('click', async (e) => {
            const row = e.target.closest('.action-item-row');
            const id = row?.getAttribute('data-action-id');
            if (!id) return;
            await deleteActionItem(id);
        });
    });
}

async function addActionItem() {
    if (!supabaseClient) return;
    if (!hasFeature('action_items')) {
        promptUpgrade('action_items');
        return;
    }
    const title = String($('newActionItemTitle')?.value || '').trim();
    const priority = String($('newActionItemPriority')?.value || 'medium');
    if (!title) {
        showToast('Please enter an action item', 'error');
        return;
    }
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { error } = await supabaseClient
            .from('action_items')
            .insert({ user_id: user.id, title, priority, status: 'pending' });
        if (error) throw new Error(error.message);

        $('newActionItemTitle').value = '';
        showToast('Action item added', 'success');
        await loadActionItems();
    } catch (e) {
        console.error('[automations] addActionItem failed:', e);
        showToast('Failed to add action item', 'error');
    }
}

async function updateActionItemStatus(id, status) {
    if (!hasFeature('action_items')) {
        promptUpgrade('action_items');
        return;
    }
    try {
        const { error } = await supabaseClient
            .from('action_items')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw new Error(error.message);
    } catch (e) {
        console.error('[automations] updateActionItemStatus failed:', e);
        showToast('Failed to update action item', 'error');
    }
}

async function deleteActionItem(id) {
    if (!hasFeature('action_items')) {
        promptUpgrade('action_items');
        return;
    }
    try {
        const { error } = await supabaseClient.from('action_items').delete().eq('id', id);
        if (error) throw new Error(error.message);
        showToast('Deleted', 'success');
        await loadActionItems();
    } catch (e) {
        console.error('[automations] deleteActionItem failed:', e);
        showToast('Failed to delete', 'error');
    }
}

function renderReplyReminders() {
    const listEl = $('replyRemindersList');
    if (!listEl) return;
    const hours = Number($('replyReminderHours')?.value || 24);
    const cutoffMs = Date.now() - hours * 60 * 60 * 1000;

    const leads = (Array.isArray(currentLeads) ? currentLeads : [])
        .filter((l) => leadNeedsFollowup(l) && l.lastMessageAt && l.lastMessageAt.getTime() < cutoffMs)
        .sort((a, b) => (a.lastMessageAt?.getTime?.() || 0) - (b.lastMessageAt?.getTime?.() || 0));

    if (!leads.length) {
        listEl.innerHTML = '<div class="muted">No reply reminders right now.</div>';
        return;
    }

    listEl.innerHTML = leads.slice(0, 25).map((l) => {
        const ageHrs = Math.round((Date.now() - l.lastMessageAt.getTime()) / (1000 * 60 * 60));
        return `
          <div class="automation-row" data-lead-id="${l.id}">
            <div style="flex:1;">
              <strong>${escapeHtml(l.name)}</strong>
              <div class="muted">${escapeHtml(l.email)} • last message ${ageHrs}h ago</div>
            </div>
            <button class="btn btn-outline btn-small create-reminder-btn">Create reminder</button>
            <button class="btn btn-primary btn-small jump-lead-btn">Open</button>
          </div>
        `;
    }).join('');

    listEl.querySelectorAll('.jump-lead-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            const row = e.target.closest('.automation-row');
            const id = row?.getAttribute('data-lead-id');
            if (!id) return;
            closeOverlay('automationsModalOverlay');
            await selectLead(id);
        });
    });

    listEl.querySelectorAll('.create-reminder-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            const row = e.target.closest('.automation-row');
            const id = row?.getAttribute('data-lead-id');
            const lead = currentLeads.find((x) => String(x.id) === String(id));
            if (!lead) return;
            $('newActionItemTitle').value = `Reply reminder: ${lead.name} (${lead.email})`;
            document.querySelector('.automation-tab[data-tab="actionItems"]')?.click();
        });
    });
}

function renderPriorityLeads() {
    const listEl = $('priorityLeadsList');
    if (!listEl) return;
    const threshold = Number($('priorityLeadThreshold')?.value || 50000);
    const includePriceMentioned = !!$('priorityIncludePriceMentioned')?.checked;

    const leads = (Array.isArray(currentLeads) ? currentLeads : [])
        .map((l) => ({ lead: l, ev: toNumberOrNull(l.pipelineValue) || 0 }))
        .filter(({ lead, ev }) => ev >= threshold || (includePriceMentioned && !!lead.hasPricingIntent))
        .sort((a, b) => b.ev - a.ev);

    if (!leads.length) {
        listEl.innerHTML = '<div class="muted">No priority leads based on current rules.</div>';
        return;
    }

    listEl.innerHTML = leads.slice(0, 25).map(({ lead, ev }) => {
        const reason = ev >= threshold ? `EV ${formatUSD(ev)} ≥ ${formatUSD(threshold)}` : 'Price mentioned';
        return `
          <div class="automation-row" data-lead-id="${lead.id}">
            <div style="flex:1;">
              <strong>${escapeHtml(lead.name)}</strong>
              <div class="muted">${escapeHtml(lead.email)} • ${escapeHtml(reason)}</div>
            </div>
            <button class="btn btn-primary btn-small jump-lead-btn">Open</button>
          </div>
        `;
    }).join('');

    listEl.querySelectorAll('.jump-lead-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            const row = e.target.closest('.automation-row');
            const id = row?.getAttribute('data-lead-id');
            if (!id) return;
            closeOverlay('automationsModalOverlay');
            await selectLead(id);
        });
    });
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function openPersonalizationModal() {
    if (!supabaseClient) {
        showToast('Supabase not initialized', 'error');
        return;
    }
    try {
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
        if (userError || !user) {
            showToast('Not authenticated. Please sign in again.', 'error');
            return;
        }

        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('communication_style, primary_goal, lead_volume')
            .eq('id', user.id)
            .maybeSingle();
        if (profileError) {
            console.error('[dashboard] Failed to load personalization:', profileError.message);
            showToast('Failed to load personalization settings', 'error');
            return;
        }
        if (!profile) {
            showToast('Missing profile. Please complete onboarding.', 'error');
            return;
        }

        if ($('personalizationStyleSelect')) $('personalizationStyleSelect').value = profile.communication_style || 'professional-direct';
        if ($('personalizationGoalSelect')) $('personalizationGoalSelect').value = profile.primary_goal || 'closing-more-deals';
        if ($('personalizationLeadVolumeSelect')) $('personalizationLeadVolumeSelect').value = profile.lead_volume || '0-25';

        openOverlay('personalizationModalOverlay');
    } catch (e) {
        console.error('[dashboard] openPersonalizationModal failed:', e);
        showToast('Failed to open personalization', 'error');
    }
}

async function savePersonalization() {
    if (!supabaseClient) {
        showToast('Supabase not initialized', 'error');
        return;
    }
    const saveBtn = $('personalizationSaveBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }
    try {
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
        if (userError || !user) {
            showToast('Not authenticated. Please sign in again.', 'error');
            return;
        }

        const communication_style = String($('personalizationStyleSelect')?.value || 'professional-direct');
        const primary_goal = String($('personalizationGoalSelect')?.value || 'closing-more-deals');
        const lead_volume = String($('personalizationLeadVolumeSelect')?.value || '0-25');

        const { error: updateError } = await supabaseClient
            .from('profiles')
            .update({
                communication_style,
                primary_goal,
                lead_volume,
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id);
        if (updateError) {
            console.error('[dashboard] Personalization save failed:', updateError.message);
            showToast(`Failed to save: ${updateError.message}`, 'error');
            return;
        }

        showToast('Personalization saved', 'success');
        closeOverlay('personalizationModalOverlay');
    } catch (e) {
        console.error('[dashboard] savePersonalization failed:', e);
        showToast(`Failed to save: ${e.message}`, 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
        }
    }
}

async function openProfileModal() {
    if (!supabaseClient) {
        showToast('Supabase not initialized', 'error');
        return;
    }
    try {
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
        if (userError || !user) {
            showToast('Not authenticated. Please sign in again.', 'error');
            return;
        }

        // Load profile data (name, email, plan, commission, auto-analyze)
        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('full_name, email, plan, commission_rate, auto_analyze_leads')
            .eq('id', user.id)
            .maybeSingle();
        if (profileError) {
            console.warn('[dashboard] Failed to fetch profile (non-fatal):', profileError.message);
        }

        // Prefill name
        const nameInput = $('profileNameInput');
        if (nameInput) nameInput.value = profile?.full_name || '';

        // Prefill email from auth user (fallback to profile.email)
        const emailInput = $('profileEmailInput');
        if (emailInput) emailInput.value = user.email || profile?.email || '';

        // Load current tier
        const currentTier = profile?.plan || 'free';
        const tierDisplay = $('profileCurrentTierDisplay');
        if (tierDisplay) {
            tierDisplay.textContent = currentTier.charAt(0).toUpperCase() + currentTier.slice(1);
        }

        // Load Gmail connection status
        await loadGmailStatusInProfile();

        // Prefill commission rate (%)
        const commissionInput = $('commissionRateInput');
        const canEditCommission = hasFeature('estimated_earnings');
        // For non-Agent+ users, always use 3% default (don't read from profile)
        const rate = canEditCommission ? (profile?.commission_rate) : null;
        currentCommissionRate = (rate === null || rate === undefined || rate === '')
            ? 0.03
            : (Number(rate) > 1 ? Number(rate) / 100 : Number(rate));
        if (!Number.isFinite(currentCommissionRate) || currentCommissionRate < 0) currentCommissionRate = 0.03;
        if (commissionInput) {
            commissionInput.value = String(Math.round(currentCommissionRate * 1000) / 10); // one decimal %
            commissionInput.disabled = !canEditCommission;
            if (!canEditCommission) {
                commissionInput.style.opacity = '0.6';
                commissionInput.style.cursor = 'not-allowed';
                commissionInput.value = '3.0'; // Always show 3.0 for non-Agent+ users
            }
        }

        // Prefill auto-analyze toggle
        autoAnalyzeEnabled = !!profile?.auto_analyze_leads;
        setTogglePressed('autoAnalyzeToggle', autoAnalyzeEnabled);

        openOverlay('profileModalOverlay');
    } catch (e) {
        console.error('[dashboard] openProfileModal failed:', e);
        showToast('Failed to open profile', 'error');
    }
}

async function loadGmailStatusInProfile() {
    const statusDisplay = $('profileGmailStatusDisplay');
    const disconnectBtn = $('disconnectGmailBtn');
    const helpText = $('profileGmailHelp');
    
    if (!statusDisplay) return;

    try {
        statusDisplay.textContent = 'Checking...';
        if (disconnectBtn) disconnectBtn.style.display = 'none';

        const statusUrl = `${API_CONFIG.baseUrl}/api/gmail/status`;
        const response = await fetchWithAuth(statusUrl, { method: 'GET' });
        const responseText = await response.text();
        let result = {};
        try {
            result = JSON.parse(responseText);
        } catch (parseError) {
            console.error('[dashboard] Failed to parse Gmail status:', parseError);
            statusDisplay.textContent = 'Unable to check status';
            return;
        }

        if (result.success && result.connected) {
            statusDisplay.textContent = `Connected (${result.email_address || 'Gmail'})`;
            statusDisplay.style.color = '#10b981';
            if (disconnectBtn) disconnectBtn.style.display = 'inline-flex';
            if (helpText) helpText.textContent = 'Disconnect to reconnect with updated permissions (send/modify).';
        } else {
            statusDisplay.textContent = 'Not connected';
            statusDisplay.style.color = '#999';
            if (disconnectBtn) disconnectBtn.style.display = 'none';
            if (helpText) helpText.textContent = 'Connect Gmail from the dashboard to sync your inbox.';
        }
    } catch (error) {
        console.error('[dashboard] Failed to load Gmail status:', error);
        statusDisplay.textContent = 'Unable to check status';
        statusDisplay.style.color = '#999';
        if (disconnectBtn) disconnectBtn.style.display = 'none';
    }
}

async function disconnectGmail() {
    const btn = $('disconnectGmailBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Disconnecting...';
    }

    try {
        const disconnectUrl = `${API_CONFIG.baseUrl}/api/gmail/disconnect`;
        const response = await fetchWithAuth(disconnectUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const responseText = await response.text();
        let result = {};
        try {
            result = JSON.parse(responseText);
        } catch (parseError) {
            console.error('[dashboard] Failed to parse disconnect response:', parseError);
            showToast('Failed to disconnect Gmail', 'error');
            return;
        }

        if (!response.ok || !result.success) {
            const errorMsg = result.error || `HTTP ${response.status}`;
            console.error('[dashboard] Gmail disconnect failed:', errorMsg);
            showToast(`Failed to disconnect: ${errorMsg}`, 'error');
            return;
        }

        showToast('Gmail disconnected successfully. You can reconnect from the dashboard.', 'success');
        
        // Update status display
        await loadGmailStatusInProfile();
        
        // Update Gmail connection button on dashboard
        await checkGmailConnectionStatus();
    } catch (error) {
        console.error('[dashboard] Error disconnecting Gmail:', error);
        showToast(`Failed to disconnect: ${error.message}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Sign out of Gmail';
        }
    }
}

// Tiers are managed via tiers.html

async function saveProfileChanges() {
    if (!supabaseClient) {
        showToast('Supabase not initialized', 'error');
        return;
    }

    const saveBtn = $('profileSaveBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }

    try {
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
        if (userError || !user) {
            showToast('Not authenticated. Please sign in again.', 'error');
            return;
        }

        const newName = String($('profileNameInput')?.value || '').trim();
        const newEmail = String($('profileEmailInput')?.value || '').trim();
        const canEditCommission = hasFeature('estimated_earnings');
        const commissionPctRaw = String($('commissionRateInput')?.value || '').trim();
        const commissionPct = commissionPctRaw ? Number(commissionPctRaw) : NaN;
        const commissionRateDecimal = canEditCommission && Number.isFinite(commissionPct)
            ? Math.max(0, Math.min(0.20, commissionPct / 100))
            : (canEditCommission ? currentCommissionRate : 0.03); // Default 3% for non-Agent+
        const autoAnalyzeNext = hasFeature('auto_analyze_leads') && $('autoAnalyzeToggle')?.getAttribute('aria-pressed') === 'true';

        // 1) Update name + settings in profiles
        const updateData = {
            full_name: newName || null,
            updated_at: new Date().toISOString()
        };
        
        // Only update commission_rate and auto_analyze_leads if user has the feature
        if (canEditCommission) {
            updateData.commission_rate = commissionRateDecimal;
        }
        if (hasFeature('auto_analyze_leads')) {
            updateData.auto_analyze_leads = !!autoAnalyzeNext;
        }
        
        const { error: nameError } = await supabaseClient
            .from('profiles')
            .update(updateData)
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id);
        if (nameError) {
            console.error('[dashboard] Profile name update failed:', nameError.message);
            showToast(`Failed to update name: ${nameError.message}`, 'error');
            return;
        }

        // Update in-memory settings used for rendering
        currentCommissionRate = commissionRateDecimal;
        autoAnalyzeEnabled = !!autoAnalyzeNext;

        // 2) Update email (Supabase auth) only if changed
        if (newEmail && newEmail !== user.email) {
            const { error: emailError } = await supabaseClient.auth.updateUser({ email: newEmail });
            if (emailError) {
                console.error('[dashboard] Email update failed:', emailError.message);
                showToast(`Email update failed: ${emailError.message}`, 'error');
                return;
            }
            // Also update profiles.email for consistency (best-effort)
            await supabaseClient.from('profiles').update({ email: newEmail }).eq('id', user.id);
            showToast('Email update requested — check your inbox to confirm.', 'success');
        } else {
            showToast('Saved', 'success');
        }

        closeOverlay('profileModalOverlay');
    } catch (e) {
        console.error('[dashboard] saveProfileChanges failed:', e);
        showToast(`Save failed: ${e.message}`, 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
        }
    }
}

async function generateReplyForSelectedLead() {
    if (!hasFeature('ai_reply_drafts')) {
        promptUpgrade('ai_reply_drafts');
        return;
    }
    const btn = $('generateReplyBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Generating...';
    }
    try {
        const url = `${API_CONFIG.baseUrl}/api/ai/reply`;
        console.log('[dashboard] Calling /api/ai/reply:', { url, lead_id: selectedLeadId });

        const resp = await fetchWithAuth(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lead_id: String(selectedLeadId) })
        });

        const text = await resp.text();
        let result = {};
        try { result = JSON.parse(text); } catch {}

        if (!resp.ok || result.ok !== true) {
            const msg = result.error || `HTTP ${resp.status}: ${resp.statusText}`;
            console.error('[dashboard] /api/ai/reply failed:', { status: resp.status, error: msg, body: text?.slice(0, 200) });
            const userMsg = (msg === 'openai_failed' || resp.status === 502 || resp.status === 503)
                ? 'AI unavailable—retry'
                : `Generate Reply failed: ${msg}`;
            showToast(userMsg, 'error');
            return;
        }

        lastAiReplyDraft = result;
        if ($('aiReplySubject')) $('aiReplySubject').value = result.subject || '';
        if ($('aiReplyBody')) $('aiReplyBody').value = result.body || '';
        const notesEl = $('aiReplyNotes');
        if (notesEl) {
            const notes = String(result.notes || '').trim();
            if (notes) {
                notesEl.style.display = '';
                notesEl.textContent = `AI notes: ${notes}`;
            } else {
                notesEl.style.display = 'none';
                notesEl.textContent = '';
            }
        }

        openOverlay('aiReplyModalOverlay');
    } catch (e) {
        console.error('[dashboard] generateReplyForSelectedLead exception:', e);
        showToast(`Generate Reply failed: ${e.message}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Generate Reply';
        }
    }
}

async function sendOutboundReply() {
    if (!hasFeature('send_email')) {
        promptUpgrade('send_email');
        return;
    }
    if (!selectedLeadId) {
        showToast('Please select a lead first', 'error');
        return;
    }
    const subject = $('replySubjectInput')?.value || '';
    let body = $('replyBodyInput')?.value || '';
    if (!String(body).trim()) {
        showToast('Message body is required', 'error');
        return;
    }

    // Append user's name as signature if available
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
            const { data: profile } = await supabaseClient
                .from('profiles')
                .select('full_name')
                .eq('id', user.id)
                .maybeSingle();
            if (profile?.full_name) {
                const signature = `\n\n${profile.full_name}`;
                if (!body.endsWith(signature)) {
                    body = body + signature;
                }
            }
        }
    } catch (sigError) {
        console.warn('[dashboard] Failed to load signature (non-fatal):', sigError);
    }

    const btn = $('sendReplyBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sending...';
    }

    try {
        // 1) Send email via Gmail (server-side tokens)
        const sendUrl = `${API_CONFIG.baseUrl}/api/gmail/send`;
        const sendResp = await fetchWithAuth(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lead_id: String(selectedLeadId),
                subject: subject || null,
                body: body // Includes signature
            })
        });

        const sendText = await sendResp.text();
        let sendResult = {};
        try { sendResult = JSON.parse(sendText); } catch {}

        if (!sendResp.ok || sendResult.success !== true) {
            const msg = sendResult.details || sendResult.error || `HTTP ${sendResp.status}: ${sendResp.statusText}`;
            console.error('[dashboard] /api/gmail/send failed:', { status: sendResp.status, error: msg, body: sendText?.slice(0, 200) });
            if (sendResult.error === 'missing_scope') {
                showToast('Gmail needs re-connection for Send/Modify permissions. Click Connect Gmail again.', 'error');
            } else {
                showToast(`Send failed: ${msg}`, 'error');
            }
            return;
        }

        // 2) Log outbound message to conversation thread (DB) - use body WITH signature
        const logUrl = `${API_CONFIG.baseUrl}/api/messages`;
        const logResp = await fetchWithAuth(logUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lead_id: String(selectedLeadId),
                direction: 'outbound',
                subject: subject || null,
                body: body, // Includes signature
                sent_at: new Date().toISOString()
            })
        });
        if (!logResp.ok) {
            const logText = await logResp.text();
            console.warn('[dashboard] Sent email but failed to log message:', { status: logResp.status, body: logText?.slice(0, 200) });
        }

        $('replyBodyInput').value = '';
        showToast('Email sent', 'success');

        await loadDashboardData();
        filterAndRenderLeads();
        await loadLeadDetailWithAnalysis(selectedLeadId);
    } catch (e) {
        console.error('[dashboard] sendOutboundReply exception:', e);
        showToast(`Send failed: ${e.message}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Send Email';
        }
    }
}

// KPI Calculations and Rendering
function renderKPIs() {
    // ONLY count leads with OpenAI scores (no fallback)
    const hotLeads = currentLeads.filter(l => l.score !== null && l.score !== undefined && l.score >= 80).length;
    const avgResponseTime = calculateAvgResponseTime();
    const followupsDue = currentLeads.filter(l => leadNeedsFollowup(l)).length;
    const pipelineValue = calculatePipelineValue();
    
    document.getElementById('kpiHotLeads').textContent = hotLeads;
    document.getElementById('kpiResponseTime').textContent = avgResponseTime;
    document.getElementById('kpiFollowups').textContent = followupsDue;
    document.getElementById('kpiPipelineValue').textContent = formatCurrency(pipelineValue);
    
    // Update trends (mock data for now)
    updateKPITrends();
}

function calculateAvgResponseTime() {
    let totalMinutes = 0;
    let count = 0;
    
    currentLeads.forEach(lead => {
        if (lead.messages && lead.messages.length > 1) {
            for (let i = 0; i < lead.messages.length - 1; i++) {
                const msg1 = lead.messages[i];
                const msg2 = lead.messages[i + 1];
                if (msg1.from === 'lead' && msg2.from === 'agent') {
                    const diff = msg2.sentAt - msg1.sentAt;
                    totalMinutes += diff / (1000 * 60);
                    count++;
                }
            }
        }
    });
    
    return count > 0 ? Math.round(totalMinutes / count) : 0;
}

/**
 * Normalize a value to a number or null
 * Handles strings, objects, and edge cases from Supabase
 */
function toNumberOrNull(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string") {
        const n = Number(v.replace(/[^0-9.-]/g, ""));
        return Number.isFinite(n) ? n : null;
    }
    // if PostgREST returned an object (bad mapping), try common shapes
    if (typeof v === "object") {
        if ("value" in v) return toNumberOrNull(v.value);
        if ("amount" in v) return toNumberOrNull(v.amount);
    }
    return null;
}

/**
 * DEPRECATED: Previously computed pipeline_value from min/max as a UI fallback.
 * We no longer use this to avoid showing numbers that didn't come from OpenAI-backed analysis.
 */
function computePipelineValue(pipelineValue, priceMin, priceMax) {
    // If pipeline_value exists, use it
    const normalizedPipeline = toNumberOrNull(pipelineValue);
    if (normalizedPipeline !== null && Number.isFinite(normalizedPipeline)) {
        return normalizedPipeline;
    }
    
    // Otherwise, compute from min/max
    const normalizedMin = toNumberOrNull(priceMin);
    const normalizedMax = toNumberOrNull(priceMax);
    
    if (normalizedMin !== null && normalizedMax !== null && Number.isFinite(normalizedMin) && Number.isFinite(normalizedMax)) {
        // Both min and max exist → compute midpoint
        return Math.round((normalizedMin + normalizedMax) / 2);
    } else if (normalizedMin !== null && Number.isFinite(normalizedMin)) {
        // Only min exists → use min
        return normalizedMin;
    } else if (normalizedMax !== null && Number.isFinite(normalizedMax)) {
        // Only max exists → use max
        return normalizedMax;
    }
    
    // No valid values
    return null;
}

/**
 * Check if lead has pricing intent (any of pipeline_value, min, or max)
 */
function hasPricingIntent(pipelineValue, priceMin, priceMax) {
    return (pipelineValue !== null && pipelineValue !== undefined) ||
           (priceMin !== null && priceMin !== undefined) ||
           (priceMax !== null && priceMax !== undefined);
}

function calculatePipelineValue() {
    // ONLY count leads with AI-estimated pipeline values (conditional)
    // No fallbacks: only count OpenAI-backed expected_value stored in leads.pipeline_value
    let total = 0;
    let leadsWithPipeline = 0;
    
    currentLeads.forEach(lead => {
        // Try to get pipeline_value first
        let pipelineVal = toNumberOrNull(lead.pipelineValue);
        
        // Add to total if we have a valid pipeline value
        if (pipelineVal !== null && Number.isFinite(pipelineVal) && pipelineVal > 0) {
            total += pipelineVal;
            leadsWithPipeline++;
        } else if (lead.pipelineValue !== null && lead.pipelineValue !== undefined) {
            // Log warning if pipelineValue exists but couldn't be parsed
            console.warn('[PIPELINE_SUMMARY] Failed to parse pipeline value for lead:', {
                lead_id: lead.id,
                pipelineValue: lead.pipelineValue,
                estimatedPriceMin: lead.estimatedPriceMin,
                estimatedPriceMax: lead.estimatedPriceMax
            });
        }
    });
    
    console.log('[PIPELINE_SUMMARY] total=', total, 'leadsCount=', currentLeads.length, 'leadsWithPipeline=', leadsWithPipeline);
    
    return total;
}

function formatCurrency(amount) {
    // Normalize amount to number before formatting
    const num = toNumberOrNull(amount);
    if (num === null || !Number.isFinite(num)) {
        return '$0';
    }
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(num);
}

/**
 * Format USD currency (alias for formatCurrency, but more explicit)
 */
function formatUSD(n) {
    return formatCurrency(n);
}

function updateKPITrends() {
    // Mock trend data - in production, compare with previous period
    document.getElementById('kpiHotLeadsTrend').innerHTML = '<span class="trend-icon">↑</span><span class="trend-text">+12%</span>';
    document.getElementById('kpiHotLeadsTrend').className = 'kpi-trend up';
    
    document.getElementById('kpiResponseTimeTrend').innerHTML = '<span class="trend-icon">↓</span><span class="trend-text">-8%</span>';
    document.getElementById('kpiResponseTimeTrend').className = 'kpi-trend down';
    
    document.getElementById('kpiFollowupsTrend').innerHTML = '<span class="trend-icon">↑</span><span class="trend-text">+5</span>';
    document.getElementById('kpiFollowupsTrend').className = 'kpi-trend up';
    
    document.getElementById('kpiPipelineValueTrend').innerHTML = '<span class="trend-icon">↑</span><span class="trend-text">+18%</span>';
    document.getElementById('kpiPipelineValueTrend').className = 'kpi-trend up';
}

// Chart Initialization
function initCharts() {
    initLeadMomentumChart();
    initPipelineMixChart();
}

function initLeadMomentumChart() {
    const ctx = document.getElementById('leadMomentumChart');
    if (!ctx) return;
    
    const data = generateMomentumData(currentDateRange);
    
    if (chartInstances.leadMomentum) {
        chartInstances.leadMomentum.destroy();
    }
    
    chartInstances.leadMomentum = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Hot Leads',
                data: data.hot,
                borderColor: '#dc2626',
                backgroundColor: 'rgba(220, 38, 38, 0.1)',
                tension: 0.4,
                fill: true
            }, {
                label: 'Total Leads',
                data: data.total,
                borderColor: '#D4AF37',
                backgroundColor: 'rgba(212, 175, 55, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

function initPipelineMixChart() {
    const ctx = document.getElementById('pipelineMixChart');
    if (!ctx) return;
    
    // Compute classification ONLY from OpenAI scores (no fallback)
    // Score ranges (requested): Low 0-49 (cold), Medium 50-79 (warm), High 80-100 (hot)
    const hot = currentLeads.filter(l => l.score !== null && l.score !== undefined && l.score >= 80).length;
    const warm = currentLeads.filter(l => {
        const score = l.score;
        return score !== null && score !== undefined && score >= 50 && score <= 79;
    }).length;
    const cold = currentLeads.filter(l => {
        const score = l.score;
        return score !== null && score !== undefined && score < 50;
    }).length;
    
    if (chartInstances.pipelineMix) {
        chartInstances.pipelineMix.destroy();
    }
    
    chartInstances.pipelineMix = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Hot', 'Warm', 'Cold'],
            datasets: [{
                data: [hot, warm, cold],
                backgroundColor: ['#dc2626', '#f59e0b', '#6b7280'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom'
                }
            }
        }
    });
}

function generateMomentumData(range) {
    const days = range === '7D' ? 7 : range === '30D' ? 30 : 90;
    const labels = [];
    const hot = [];
    const total = [];

    // Build day buckets (local midnight)
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    function dayKey(d) {
        const dt = new Date(d);
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    }

    const indexByDay = new Map();
    for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        hot.push(0);
        total.push(0);
        indexByDay.set(dayKey(d), i);
    }

    // Momentum = number of unique leads with activity on that day
    // Activity source: message.sentAt (preferred) else lead.lastMessageAt
    (Array.isArray(currentLeads) ? currentLeads : []).forEach((lead) => {
        const isHotLead = lead?.score !== null && lead?.score !== undefined && Number(lead.score) >= 80;

        const activityDates = [];
        if (Array.isArray(lead?.messages) && lead.messages.length) {
            for (const m of lead.messages) {
                if (m?.sentAt instanceof Date && !isNaN(m.sentAt.getTime())) {
                    activityDates.push(m.sentAt);
                }
            }
        }
        if (!activityDates.length && lead?.lastMessageAt instanceof Date && !isNaN(lead.lastMessageAt.getTime())) {
            activityDates.push(lead.lastMessageAt);
        }

        const daySet = new Set();
        for (const d of activityDates) {
            if (!(d instanceof Date) || isNaN(d.getTime())) continue;
            if (d.getTime() < start.getTime()) continue;
            if (d.getTime() > now.getTime()) continue;
            const k = dayKey(d);
            if (indexByDay.has(k)) daySet.add(k);
        }

        daySet.forEach((k) => {
            const idx = indexByDay.get(k);
            if (idx === undefined) return;
            total[idx] += 1;
            if (isHotLead) hot[idx] += 1;
        });
    });

    return { labels, hot, total };
}

function updateCharts(range) {
    currentDateRange = range;
    initLeadMomentumChart();
    renderKPIs();
}

// Performance Charts
function initPerformanceCharts() {
    initResponseTimeChart();
    initLeadSourceChart();
    initPipelineVelocityChart();
}

function initResponseTimeChart() {
    const ctx = document.getElementById('responseTimeChart');
    if (!ctx) return;
    
    const data = generateResponseTimeData(currentDateRange);
    
    if (chartInstances.responseTime) {
        chartInstances.responseTime.destroy();
    }
    
    chartInstances.responseTime = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Avg Response Time (min)',
                data: data.values,
                borderColor: '#D4AF37',
                backgroundColor: 'rgba(212, 175, 55, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value + ' min';
                        }
                    }
                }
            }
        }
    });
}

function initLeadSourceChart() {
    const ctx = document.getElementById('leadSourceChart');
    if (!ctx) return;
    
    const sources = {};
    currentLeads.forEach(lead => {
        const source = lead.source || 'Other';
        if (!sources[source]) {
            sources[source] = 0;
        }
        // ONLY count leads with AI-estimated pipeline values (conditional)
        // Use computed pipeline_value (which may be derived from min/max)
        const pipelineVal = toNumberOrNull(lead.pipelineValue);
        if (pipelineVal !== null && Number.isFinite(pipelineVal)) {
            sources[source] += pipelineVal;
        }
    });
    
    const labels = Object.keys(sources);
    const values = Object.values(sources);
    
    if (chartInstances.leadSource) {
        chartInstances.leadSource.destroy();
    }
    
    chartInstances.leadSource = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Pipeline Value',
                data: values,
                backgroundColor: '#D4AF37',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + (value / 1000).toFixed(0) + 'k';
                        }
                    }
                }
            }
        }
    });
}

function initPipelineVelocityChart() {
    const ctx = document.getElementById('pipelineVelocityChart');
    if (!ctx) return;
    
    const data = generateVelocityData(currentDateRange);
    
    if (chartInstances.pipelineVelocity) {
        chartInstances.pipelineVelocity.destroy();
    }
    
    chartInstances.pipelineVelocity = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Deals Closed',
                data: data.values,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

function generateResponseTimeData(range) {
    const days = range === '7D' ? 7 : range === '30D' ? 30 : 90;
    const labels = [];
    const values = [];
    
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        values.push(Math.floor(Math.random() * 60) + 30);
    }
    
    return { labels, values };
}

function generateVelocityData(range) {
    const weeks = range === '7D' ? 1 : range === '30D' ? 4 : 12;
    const labels = [];
    const values = [];
    
    for (let i = weeks - 1; i >= 0; i--) {
        labels.push(`Week ${weeks - i}`);
        values.push(Math.floor(Math.random() * 5) + 1);
    }
    
    return { labels, values };
}

// Pipeline Rendering
function filterAndRenderLeads() {
    // Safe array copy - handle undefined currentLeads
    let filtered = Array.isArray(currentLeads) ? [...currentLeads] : [];
    
    // Apply filter ONLY using OpenAI scores (no fallback)
    if (currentFilter !== 'all') {
        if (currentFilter === 'hot') {
            filtered = filtered.filter(l => {
                const score = l.score;
                return score !== null && score !== undefined && score >= 80;
            });
        } else if (currentFilter === 'warm') {
            filtered = filtered.filter(l => {
                const score = l.score;
                return score !== null && score !== undefined && score >= 50 && score <= 79;
            });
        } else if (currentFilter === 'cold') {
            filtered = filtered.filter(l => {
                const score = l.score;
                return score !== null && score !== undefined && score < 50;
            });
        }
    }
    
    // Apply follow-up toggle
    const followupToggle = document.getElementById('followupToggle');
    if (followupToggle && followupToggle.checked) {
        filtered = filtered.filter(l => leadNeedsFollowup(l));
    }
    
    // Apply search
    if (searchQuery) {
        filtered = filtered.filter(l => 
            l.name.toLowerCase().includes(searchQuery) ||
            l.email.toLowerCase().includes(searchQuery) ||
            l.lastMessage.toLowerCase().includes(searchQuery)
        );
    }
    
    renderLeadList(filtered);
    
    // Show empty state if no leads
    const emptyState = document.getElementById('emptyState');
    const leadList = document.getElementById('leadList');
    if (filtered.length === 0 && currentLeads.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        if (leadList) leadList.style.display = 'none';
    } else {
        if (emptyState) emptyState.style.display = 'none';
        if (leadList) leadList.style.display = 'block';
    }
}

function renderLeadList(leads) {
    const container = document.getElementById('leadList');
    if (!container) return;
    
    container.innerHTML = leads.map(lead => createLeadCard(lead)).join('');
    
    // Use helper function to attach listeners
    attachLeadCardListeners(container);
}

function createLeadCard(lead) {
    // ONLY use OpenAI scores - if score is null/undefined, lead hasn't been analyzed yet
    const score = lead.score ?? null;
    const hasScore = score !== null && score !== undefined;
    
    // Only compute classification if we have an OpenAI score
    let classification = null;
    let scoreClass = 'unscored';
    if (hasScore) {
        // Score ranges (requested): Low 0-49, Medium 50-79, High 80-100
        // We map these to cold/warm/hot styling buckets for the UI.
        if (score >= 80) {
            classification = 'hot';
            scoreClass = 'hot';
        } else if (score >= 50) {
            classification = 'warm';
            scoreClass = 'warm';
        } else {
            classification = 'cold';
            scoreClass = 'cold';
        }
    }
    
    const isSelected = String(selectedLeadId) === String(lead.id);
    const isChecked = selectedLeadIds.has(String(lead.id));
    const selectModeClass = isSelectMode ? 'select-mode' : '';
    
    // Only show score badge if OpenAI has analyzed this lead
    const scoreBadge = hasScore 
        ? `<span class="score-badge ${scoreClass}">${score}</span>`
        : `<span class="score-badge unscored" title="Not yet analyzed by AI">-</span>`;
    
    // IMPORTANT: Show score tier (Low/Medium/High) next to the score.
    // Do NOT show OpenAI "confidence" as a bare "High" beside a score (it can be high confidence in a 0 score).
    const tierBadge = hasScore
        ? `<span class="confidence-badge ${score < 50 ? 'low' : score < 80 ? 'medium' : 'high'}">${score < 50 ? 'Low' : score < 80 ? 'Medium' : 'High'}</span>`
        : '';
    
    return `
        <div class="lead-card ${isSelected ? 'selected' : ''} ${selectModeClass}" data-lead-id="${lead.id}">
            ${isSelectMode ? `<input type="checkbox" class="lead-card-checkbox" data-lead-id="${lead.id}" ${isChecked ? 'checked' : ''}>` : ''}
            <div class="lead-card-content">
                <div class="lead-card-header">
                    <div>
                        <div class="lead-card-name">${lead.name}</div>
                        <div class="lead-card-email">${lead.email}</div>
                    </div>
                    <div class="lead-card-badges">
                        ${scoreBadge}
                        ${tierBadge}
                    </div>
                </div>
                <div class="lead-card-snippet">${lead.lastMessage}</div>
                <div class="lead-card-footer">
                    <span class="lead-card-activity">${lead.lastActivity}</span>
                    ${leadNeedsFollowup(lead) ? '<span class="followup-indicator" style="font-size: 11px; color: #dc2626;">⚠ Follow-up</span>' : ''}
                </div>
            </div>
        </div>
    `;
}

async function selectLead(leadId) {
    selectedLeadId = leadId;
    
    // Update UI
    document.querySelectorAll('.lead-card').forEach(card => {
        card.classList.remove('selected');
        const cardLeadId = card.getAttribute('data-lead-id');
        // Handle UUID strings
        if (cardLeadId === String(leadId)) {
            card.classList.add('selected');
        }
    });
    
    // Expand conversation by default when selecting a lead
    const conversationHeader = document.getElementById('conversationHeader');
    const conversationThread = document.getElementById('conversationThread');
    if (conversationHeader && conversationThread) {
        conversationHeader.classList.add('active');
        conversationThread.classList.remove('collapsed');
    }

    // Show reply composer and prefill subject from latest inbound message
    try {
        const lead = currentLeads.find(l => String(l.id) === String(leadId));
        const composer = $('replyComposer');
        if (composer) {
            composer.style.display = 'block';
        }
        const latestInbound = Array.isArray(lead?.messages)
            ? [...lead.messages].reverse().find(m => m.from === 'lead') // newest-first scan (messages are chronological)
            : null;
        const subj = latestInbound?.subject ? String(latestInbound.subject) : '';
        if ($('replySubjectInput')) {
            $('replySubjectInput').value = subj
                ? (subj.toLowerCase().startsWith('re:') ? subj : `Re: ${subj}`)
                : 'Re:';
        }
    } catch (e) {
        console.warn('[dashboard] Failed to prefill reply composer (non-fatal):', e?.message || e);
    }
    
    // Load and display lead details with latest analysis
    await loadLeadDetailWithAnalysis(leadId);
}

/**
 * Load lead detail with latest analysis from Supabase
 */
async function loadLeadDetailWithAnalysis(leadId) {
    try {
        if (!supabaseClient) {
            throw new Error('Supabase client not initialized');
        }
        
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError || !session || !session.access_token) {
            throw new Error('Not authenticated');
        }
        
        // Fetch lead details (handle both UUID strings and legacy numeric IDs)
        const lead = currentLeads.find(l => String(l.id) === String(leadId));
        if (!lead) {
            throw new Error('Lead not found');
        }
        
        // Fetch latest analysis from Supabase
        let { data: latestScore, error: scoreError } = await supabaseClient
            .from('lead_scores')
            .select('*')
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        if (scoreError && scoreError.code !== 'PGRST116') {
            // PGRST116 = no rows returned, which is OK
            console.warn('Error fetching latest analysis:', scoreError);
        }
        
        // Auto-analyze if there's no score yet (server-side endpoint; guarded to avoid loops)
        const hasInbound = Array.isArray(lead.messages) && lead.messages.some(m => m.from === 'lead');
        if (!latestScore && hasInbound && !autoAnalysisRequested.has(String(leadId))) {
            autoAnalysisRequested.add(String(leadId));
            updateAnalysisStatus('analyzing', 'Analyzing...');
            try {
                const analysisResult = await requestLeadAnalysis(String(leadId));
                
                // Update currentLeads with new pipeline values from analysis
                // analyze-lead returns: { success:true, score, classification, confidence, pipeline_value, estimated_price_min/max }
                const leadIndex = currentLeads.findIndex(l => String(l.id) === String(leadId));
                if (leadIndex !== -1 && (analysisResult.success === true || analysisResult.ok === true)) {
                    currentLeads[leadIndex].pipelineValue = toNumberOrNull(analysisResult.pipeline_value);
                    currentLeads[leadIndex].estimatedPriceMin = toNumberOrNull(analysisResult.estimated_price_min);
                    currentLeads[leadIndex].estimatedPriceMax = toNumberOrNull(analysisResult.estimated_price_max);
                    currentLeads[leadIndex].estimatedEarnings = toNumberOrNull(analysisResult.estimated_earnings);
                    currentLeads[leadIndex].classification = analysisResult.classification || null;
                    currentLeads[leadIndex].score = analysisResult.score ?? null;
                    currentLeads[leadIndex].confidence = analysisResult.confidence || null;

                    console.log('[dashboard] Updated currentLeads with analysis result:', {
                        lead_id: leadId,
                        pipeline_value: analysisResult.pipeline_value,
                        estimated_price_min: analysisResult.estimated_price_min,
                        estimated_price_max: analysisResult.estimated_price_max,
                        estimated_earnings: analysisResult.estimated_earnings
                    });

                    // Refresh KPIs to update top pipeline card
                    renderKPIs();
                }
                
                const refetch = await supabaseClient
                    .from('lead_scores')
                    .select('*')
                    .eq('lead_id', leadId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                latestScore = refetch.data || null;
            } catch (e) {
                console.error('[dashboard] Auto-analysis failed:', {
                    error: e?.message || e,
                    stack: e?.stack,
                    lead_id: leadId
                });
                // Error already shown via showToast in requestLeadAnalysis
            }
        }

        // ONLY update lead with OpenAI score if available - no fallback to leads.score
        if (latestScore) {
            // This score came from OpenAI - safe to use
            lead.score = latestScore.deal_probability;
            lead.confidence = latestScore.confidence;
            lead.classification = latestScore.classification || (latestScore.deal_probability >= 70 ? 'hot' : latestScore.deal_probability >= 40 ? 'warm' : 'cold');
            
            // Build score explanation from reason
            const explanationItems = [];
            if (latestScore.reason) {
                explanationItems.push(latestScore.reason);
            }
            lead.scoreExplanation = explanationItems.length > 0 ? explanationItems : lead.scoreExplanation;
            lead.recommendations = latestScore.recommended_actions || lead.recommendations;
            
            // Also fetch updated pipeline values from leads table to ensure we have latest
            const { data: updatedLead, error: leadError } = await supabaseClient
                .from('leads')
                .select('pipeline_value, estimated_price_min, estimated_price_max, estimated_earnings, classification')
                .eq('id', leadId)
                .single();
            
            if (!leadError && updatedLead) {
                // Update lead object with pipeline values
                lead.pipelineValue = toNumberOrNull(updatedLead.pipeline_value);
                lead.estimatedPriceMin = toNumberOrNull(updatedLead.estimated_price_min);
                lead.estimatedPriceMax = toNumberOrNull(updatedLead.estimated_price_max);
                lead.estimatedEarnings = toNumberOrNull(updatedLead.estimated_earnings);
                
                // Also update in currentLeads array
                const leadIndex = currentLeads.findIndex(l => String(l.id) === String(leadId));
                if (leadIndex !== -1) {
                    currentLeads[leadIndex].pipelineValue = lead.pipelineValue;
                    currentLeads[leadIndex].estimatedPriceMin = lead.estimatedPriceMin;
                    currentLeads[leadIndex].estimatedPriceMax = lead.estimatedPriceMax;
                    currentLeads[leadIndex].estimatedEarnings = lead.estimatedEarnings;
                    currentLeads[leadIndex].classification = updatedLead.classification || lead.classification;
                    
                    // Refresh KPIs to update top pipeline card
                    renderKPIs();
                }
            }
            
            updateAnalysisStatus('complete', 'Analysis complete');
            
            // Re-render the lead card with the new score
            filterAndRenderLeads();
        } else {
            // No OpenAI analysis found - clear any fallback scores
            lead.score = null;
            lead.confidence = null;
            lead.classification = null;
            
            // Re-render to show unscored state
            filterAndRenderLeads();
            
            // Show pending status - user can manually trigger analysis with "Analyze Lead" button
            updateAnalysisStatus('pending', 'No analysis yet');
        }
        
        // Render lead detail
        renderLeadDetail(lead, latestScore);
        
    } catch (error) {
        console.error('Error loading lead detail:', error);
        updateAnalysisStatus('error', 'Error loading analysis');
        // Still render lead detail with available data
        const lead = currentLeads.find(l => String(l.id) === String(leadId));
        if (lead) {
            renderLeadDetail(lead, null);
        }
    }
}

function renderLeadDetail(lead, latestScore = null) {
    const content = document.getElementById('leadDetailContent');
    const empty = document.getElementById('detailEmptyState');
    
    if (content) content.style.display = 'block';
    if (empty) empty.style.display = 'none';
    
    // Update header
    document.getElementById('leadDetailName').textContent = lead.name;
    document.getElementById('leadDetailEmail').textContent = lead.email;
    
    // ONLY use OpenAI scores - if no score, show unscored state
    const score = lead.score ?? null;
    const hasScore = score !== null && score !== undefined;
    let classification = null;
    if (hasScore) {
        // Score ranges (requested): Low 0-49, Medium 50-79, High 80-100
        if (score >= 80) {
            classification = 'hot';
        } else if (score >= 50) {
            classification = 'warm';
        } else {
            classification = 'cold';
        }
    }
    const scoreClass = classification || 'unscored';
    const scoreDisplay = hasScore ? score : '-';
    document.getElementById('leadDetailScore').textContent = scoreDisplay;
    document.getElementById('leadDetailScore').className = `score-badge ${scoreClass}`;
    document.getElementById('leadDetailScore').title = hasScore ? 'AI Score' : 'Not yet analyzed by AI';
    
    // Show score tier (Low/Medium/High) next to score. Do NOT show OpenAI confidence here.
    if (hasScore) {
        const tierKey = score < 50 ? 'low' : score < 80 ? 'medium' : 'high';
        const tierLabel = score < 50 ? 'Low' : score < 80 ? 'Medium' : 'High';
        document.getElementById('leadDetailConfidence').textContent = tierLabel;
        document.getElementById('leadDetailConfidence').className = `confidence-badge ${tierKey}`;
        document.getElementById('leadDetailConfidence').style.display = '';
    } else {
        document.getElementById('leadDetailConfidence').style.display = 'none';
    }
    
    // Deal Probability - only show if we have an OpenAI score
    const probability = hasScore ? score : null;
    if (probability !== null) {
        document.getElementById('dealProbability').textContent = probability + '%';
        document.getElementById('probabilityFill').style.width = probability + '%';
    } else {
        document.getElementById('dealProbability').textContent = 'N/A';
        document.getElementById('probabilityFill').style.width = '0%';
    }
    
    // Pipeline Value + Earnings (Agent+)
    const pipelineValueEl = document.getElementById('leadPipelineValue');
    const priceRangeEl = document.getElementById('leadPriceRange');
    const priceRangeTextEl = document.getElementById('priceRangeText');
    const earningsRowEl = document.getElementById('leadEarningsRow');
    const earningsEl = document.getElementById('leadEstimatedEarnings');
    const commissionHintEl = document.getElementById('leadCommissionHint');
    if (pipelineValueEl) {
        const expectedValue = toNumberOrNull(lead.pipelineValue);
        const priceMin = toNumberOrNull(lead.estimatedPriceMin);
        const priceMax = toNumberOrNull(lead.estimatedPriceMax);
        const earnings = toNumberOrNull(lead.estimatedEarnings);
        const hasPipelineValue = expectedValue !== null && Number.isFinite(expectedValue);
        
        // Defensive log
        console.log('[PIPELINE_RENDER]', {
            lead_id: lead.id,
            pipeline_value: lead.pipelineValue,
            estimated_price_min: lead.estimatedPriceMin,
            estimated_price_max: lead.estimatedPriceMax,
            has_pipeline_value: hasPipelineValue
        });
        
        if (hasPipelineValue) {
            // Show pipeline value with estimated price range
            const valueText = formatUSD(expectedValue);
            pipelineValueEl.textContent = valueText;
            pipelineValueEl.className = 'pipeline-value';

            // Estimated earnings (pipeline × commission). Prefer server value; fallback to client calc if missing.
            const commissionPct = Math.round((Number(currentCommissionRate || 0.03) * 100) * 10) / 10;
            const earningsValue = (earnings !== null && Number.isFinite(earnings))
                ? earnings
                : Math.round((expectedValue * Number(currentCommissionRate || 0.03)) / 1000) * 1000;
            if (earningsRowEl && earningsEl) {
                earningsEl.textContent = formatUSD(earningsValue);
                if (commissionHintEl) commissionHintEl.textContent = `(at ${commissionPct}% commission)`;
                earningsRowEl.style.display = '';
            }

            if (priceRangeEl && priceRangeTextEl && priceMin !== null && priceMax !== null && Number.isFinite(priceMin) && Number.isFinite(priceMax)) {
                const mid = Math.round((priceMin + priceMax) / 2);
                // Display breakdown for transparency (still no numeric fallbacks; EV comes from OpenAI)
                priceRangeTextEl.textContent = `${formatUSD(priceMin)} - ${formatUSD(priceMax)} • ~${formatUSD(mid)} midpoint × ${probability ?? '—'}%`;
                priceRangeEl.style.display = '';
            } else if (priceRangeEl) {
                priceRangeEl.style.display = 'none';
            }
        } else {
            // Show "—" if no valid pipeline value
            pipelineValueEl.textContent = '—';
            pipelineValueEl.className = 'pipeline-value no-value';
            if (earningsRowEl) earningsRowEl.style.display = 'none';
            if (priceRangeEl) {
                priceRangeEl.style.display = 'none';
            }
        }
    }
    
    // Engagement Timeline
    initEngagementTimeline(lead);
    
    // Score explanation (from latest analysis or fallback)
    const scoreExplanationEl = document.getElementById('scoreExplanation');
    if (scoreExplanationEl) {
        if (latestScore && latestScore.reason) {
            // Use reason as explanation
            scoreExplanationEl.innerHTML = `<li>${latestScore.reason}</li>`;
        } else if (lead.scoreExplanation) {
            if (Array.isArray(lead.scoreExplanation)) {
                scoreExplanationEl.innerHTML = lead.scoreExplanation.map(item => `<li>${item}</li>`).join('');
            } else {
                scoreExplanationEl.innerHTML = `<li>${lead.scoreExplanation}</li>`;
            }
        } else {
            scoreExplanationEl.innerHTML = '<li>No analysis available yet</li>';
        }
    }
    
    // Recommended Actions (from latest analysis or fallback)
    const recommendationsList = document.getElementById('recommendationsList');
    if (recommendationsList) {
        const actions = latestScore?.recommended_actions || lead.recommendations || [];
        if (actions.length > 0) {
            recommendationsList.innerHTML = actions.map(action => {
                const text = typeof action === 'string' ? action : action.text;
                const urgency = typeof action === 'object' ? action.urgency : 'medium';
                const icon = urgency === 'high' ? '🔥' : urgency === 'medium' ? '📋' : '💡';
                return `
                    <li>
                        <span class="action-icon">${icon}</span>
                        <span class="action-text">${text}</span>
                        ${typeof action === 'object' ? `<span class="action-urgency ${urgency}">${urgency}</span>` : ''}
                    </li>
                `;
            }).join('');
        } else {
            recommendationsList.innerHTML = '<li>No recommendations available yet</li>';
        }
    }
    
    // Render conversation
    renderConversation(lead.messages);
}

function formatConfidenceLabel(confidence) {
    const c = String(confidence || '').toLowerCase();
    if (c === 'low') return 'Low';
    if (c === 'medium') return 'Medium';
    if (c === 'high') return 'High';
    return String(confidence || '');
}

/**
 * Update analysis status indicator
 */
function updateAnalysisStatus(status, text) {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const analysisStatus = document.getElementById('analysisStatus');
    
    if (!statusIndicator || !statusText || !analysisStatus) return;
    
    statusText.textContent = text;
    
    // Remove all status classes
    analysisStatus.className = 'analysis-status';
    
    switch (status) {
        case 'loading':
        case 'analyzing':
            analysisStatus.classList.add('status-analyzing');
            statusIndicator.textContent = '⏳';
            break;
        case 'complete':
            analysisStatus.classList.add('status-complete');
            statusIndicator.textContent = '✓';
            break;
        case 'error':
            analysisStatus.classList.add('status-error');
            statusIndicator.textContent = '⚠';
            break;
        case 'pending':
        default:
            analysisStatus.classList.add('status-pending');
            statusIndicator.textContent = '—';
            break;
    }
}

function initEngagementTimeline(lead) {
    const ctx = document.getElementById('engagementTimelineChart');
    if (!ctx || !lead.messages) return;
    
    // Prepare timeline data
    const messages = lead.messages.sort((a, b) => b.sentAt - a.sentAt).slice(0, 7);
    const labels = messages.map(m => {
        const date = new Date(m.sentAt);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }).reverse();
    const inbound = messages.map(m => m.from === 'lead' ? 1 : 0).reverse();
    const outbound = messages.map(m => m.from === 'agent' ? 1 : 0).reverse();
    
    if (chartInstances.engagementTimeline) {
        chartInstances.engagementTimeline.destroy();
    }
    
    chartInstances.engagementTimeline = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Inbound',
                data: inbound,
                backgroundColor: '#D4AF37'
            }, {
                label: 'Outbound',
                data: outbound,
                backgroundColor: '#6b7280'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom'
                }
            },
            scales: {
                x: {
                    stacked: true
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

function renderConversation(messages) {
    const container = document.getElementById('conversationThread');
    if (!container) return;
    
    if (!messages || messages.length === 0) {
        container.innerHTML = '<div class="message-item"><div class="message-body">No messages yet.</div></div>';
        return;
    }
    
    container.innerHTML = messages.map(msg => `
        <div class="message-item ${msg.from === 'lead' ? 'from-lead' : ''}">
            <div class="message-header">
                <span class="message-sender">${msg.sender}</span>
                <span class="message-time">${msg.time}</span>
            </div>
            ${msg.subject ? `<div class="message-subject">${msg.subject}</div>` : ''}
            <div class="message-body">${msg.body}</div>
        </div>
    `).join('');
}

/**
 * Check Gmail connection status and update button accordingly
 * Uses API endpoint instead of direct Supabase query
 */
async function checkGmailConnectionStatus() {
    try {
        if (!supabaseClient) {
            console.error('[dashboard] Supabase not initialized');
            return; // Don't crash, just return
        }
        
        // Call API endpoint with Authorization header (fetchWithAuth handles session check)
        const statusUrl = `${API_CONFIG.baseUrl}/api/gmail/status`;
        console.log('[dashboard] Checking Gmail status:', statusUrl);
        
        let response;
        try {
            response = await fetchWithAuth(statusUrl, {
                method: 'GET'
            });
        } catch (authError) {
            console.error('[dashboard] fetchWithAuth failed in checkGmailConnectionStatus:', authError.message);
            return; // Silently fail - user might not be authenticated yet, don't crash dashboard
        }
        
        // Read response text first for better error messages
        const responseText = await response.text();
        let result;
        try {
            result = JSON.parse(responseText);
        } catch (parseError) {
            console.error('[dashboard] Failed to parse status response:', {
                status: response.status,
                statusText: response.statusText,
                body: responseText.substring(0, 200)
            });
            return; // Don't crash, just return
        }
        
        if (!response.ok) {
            // Handle 404 gracefully (treat as disconnected and keep dashboard working)
            if (response.status === 404) {
                console.log('[dashboard] Gmail status endpoint not found (404), treating as disconnected');
                result = { success: true, connected: false };
            } else {
                console.error('[dashboard] Gmail status check failed:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: result.error,
                    responseBody: responseText.substring(0, 200)
                });
                return; // Don't crash, just return
            }
        }
        
        if (!result.success) {
            console.error('[dashboard] Gmail status check error:', result.error);
            return; // Don't crash, just return
        }
        
        const btn = document.getElementById('gmailConnectionBtn');
        const btnText = document.getElementById('gmailConnectionBtnText');
        
        if (!btn) return;
        
        if (result.connected) {
            // Show Sync Inbox button
            btn.dataset.action = 'sync';
            // Update icon and text without replacing entire innerHTML (preserves event listeners)
            const svg = btn.querySelector('svg');
            if (svg) {
                svg.innerHTML = `
                    <path d="M21.5 2V6H17.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M2.5 22V18H6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M21.5 6C20.57 4.14 18.99 2.71 17.05 2.04C15.11 1.37 13.01 1.5 11.15 2.43C9.29 3.36 7.86 4.94 7.19 6.88C6.52 8.82 6.65 10.92 7.58 12.78L2.5 17.86" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M21.5 6L17.5 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M2.5 18L6.5 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M2.5 18C3.43 19.86 5.01 21.29 6.95 21.96C8.89 22.63 10.99 22.5 12.85 21.57C14.71 20.64 16.14 19.06 16.81 17.12C17.48 15.18 17.35 13.08 16.42 11.22L21.5 6.14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                `;
            }
            if (btnText) btnText.textContent = 'Sync Inbox';
        } else {
            // Show Connect Gmail button
            btn.dataset.action = 'connect';
            // Update icon and text without replacing entire innerHTML (preserves event listeners)
            const svg = btn.querySelector('svg');
            if (svg) {
                svg.innerHTML = `
                    <path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M22 6L12 13L2 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                `;
            }
            if (btnText) btnText.textContent = 'Connect Gmail';
        }
    } catch (error) {
        console.error('[dashboard] Error checking Gmail connection status:', error);
    }
}

/**
 * Handle Gmail button click - either connect or sync
 */
async function handleGmailButtonClick() {
    const btn = document.getElementById('gmailConnectionBtn');
    if (!btn) return;
    
    const action = btn.dataset.action || 'connect';
    
    if (action === 'sync') {
        await syncInbox();
    } else {
        await connectGmail();
    }
}

/**
 * Check API server health before making requests
 */
async function checkApiHealth() {
    try {
        const healthUrl = `${API_CONFIG.baseUrl}/api/health`;
        console.log('[dashboard] Checking API health:', healthUrl);
        
        const response = await fetch(healthUrl, {
            method: 'GET',
            // Add timeout to detect if server is down
            signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        
        if (!response.ok) {
            throw new Error(`Health check failed: HTTP ${response.status}`);
        }
        
        const result = await response.json();
        if (!result.ok) {
            throw new Error('Health check returned unhealthy status');
        }
        
        console.log('[dashboard] API health check passed');
        return true;
    } catch (error) {
        console.error('[dashboard] API health check failed:', {
            error: error.message,
            apiBaseUrl: API_CONFIG.baseUrl
        });
        
        // Show user-friendly error message
        const errorMsg = error.name === 'TimeoutError' 
            ? 'API server is not responding. Please ensure the server is running.'
            : `Cannot connect to API server at ${API_CONFIG.baseUrl}. Please check that the server is running.`;
        
        showToast(errorMsg, 'error');
        return false;
    }
}

/**
 * Connect Gmail via OAuth
 */
async function connectGmail() {
    try {
        if (!supabaseClient) {
            showToast('Supabase not initialized', 'error');
            return;
        }
        
        const btn = document.getElementById('gmailConnectionBtn');
        const btnText = document.getElementById('gmailConnectionBtnText');
        
        if (btn) {
            btn.disabled = true;
            if (btnText) btnText.textContent = 'Connecting...';
        }
        
        console.log('[dashboard] connectGmail clicked - initiating OAuth flow');
        console.log('[dashboard] Using API base URL:', API_CONFIG.baseUrl);
        
        // Preflight health check
        const isHealthy = await checkApiHealth();
        if (!isHealthy) {
            if (btn) btn.disabled = false;
            if (btnText) btnText.textContent = 'Connect Gmail';
            return;
        }
        
        // Call server endpoint to get OAuth URL (POST with Authorization header)
        const connectUrl = `${API_CONFIG.baseUrl}/api/gmail/connect`;
        console.log('[dashboard] Calling Gmail connect endpoint (POST):', connectUrl);
        
        let response;
        try {
            response = await fetchWithAuth(connectUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    returnTo: '/dashboard'
                })
            });
        } catch (authError) {
            console.error('[dashboard] fetchWithAuth failed in connectGmail:', authError.message);
            showToast('Not authenticated. Please sign in again.', 'error');
            if (btn) btn.disabled = false;
            if (btnText) btnText.textContent = 'Connect Gmail';
            return;
        }
        
        // Read response text first for better error messages
        const responseText = await response.text();
        let result;
        try {
            result = JSON.parse(responseText);
        } catch (parseError) {
            console.error('[dashboard] Failed to parse response:', {
                status: response.status,
                statusText: response.statusText,
                body: responseText.substring(0, 200)
            });
            showToast(`Invalid response from server: ${response.status} ${response.statusText}`, 'error');
            if (btn) btn.disabled = false;
            if (btnText) btnText.textContent = 'Connect Gmail';
            return;
        }
        
        if (!response.ok || !result.success) {
            const errorMsg = result.error || `HTTP ${response.status}`;
            console.error('[dashboard] Gmail connect failed:', {
                status: response.status,
                statusText: response.statusText,
                error: errorMsg,
                responseBody: responseText.substring(0, 200)
            });
            showToast(`Failed to connect Gmail: ${errorMsg}`, 'error');
            if (btn) btn.disabled = false;
            if (btnText) btnText.textContent = 'Connect Gmail';
            return;
        }
        
        if (!result.authUrl) {
            console.error('[dashboard] No authUrl in response. Full response:', JSON.stringify(result, null, 2));
            showToast('Invalid response from server: missing authUrl', 'error');
            if (btn) btn.disabled = false;
            if (btnText) btnText.textContent = 'Connect Gmail';
            return;
        }
        
        console.log('[dashboard] Received authUrl, redirecting to Google OAuth');
        
        // Redirect browser to Google OAuth
        window.location.href = result.authUrl;
        
    } catch (error) {
        console.error('[dashboard] Error connecting Gmail:', {
            error: error.message,
            stack: error.stack,
            apiBaseUrl: API_CONFIG.baseUrl
        });
        
        // Handle network errors specifically
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showToast(`Cannot connect to API server at ${API_CONFIG.baseUrl}. Please ensure the server is running.`, 'error');
        } else {
            showToast('Failed to connect Gmail: ' + error.message, 'error');
        }
        
        const btn = document.getElementById('gmailConnectionBtn');
        if (btn) btn.disabled = false;
        await checkGmailConnectionStatus();
    }
}

/**
 * Sync inbox from Gmail
 */
async function syncInbox() {
    try {
        if (!supabaseClient) {
            showToast('Supabase not initialized', 'error');
            return;
        }
        
        const btn = document.getElementById('gmailConnectionBtn');
        const btnText = document.getElementById('gmailConnectionBtnText');
        
        if (btn) {
            btn.disabled = true;
            if (btnText) btnText.textContent = 'Syncing...';
        }
        
        console.log('[dashboard] Syncing inbox from Gmail');
        
        // Call API endpoint to sync inbox (fetchWithAuth handles session check)
        const syncUrl = `${API_CONFIG.baseUrl}/api/gmail/sync`;
        console.log('[dashboard] Calling sync endpoint:', syncUrl);
        
        let response;
        try {
            response = await fetchWithAuth(syncUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        } catch (authError) {
            console.error('[dashboard] fetchWithAuth failed in syncInbox:', authError.message);
            showToast('Not authenticated. Please sign in again.', 'error');
            if (btn) btn.disabled = false;
            if (btnText) btnText.textContent = 'Sync Inbox';
            return;
        }
        
        const responseText = await response.text();
        let result;
        try {
            result = JSON.parse(responseText);
        } catch (parseError) {
            console.error('[dashboard] Failed to parse sync response:', parseError);
            throw new Error(`Invalid response from server: ${response.status}`);
        }
        
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Failed to sync inbox');
        }
        
        console.log('[dashboard] Inbox sync successful:', result);
        const insertedMessages = result.insertedCount ?? result.inserted_messages ?? 0;
        const skippedMessages = result.skippedCount ?? 0;
        const insertedLeads = result.inserted_leads ?? 0;
        const updatedLeads = result.updated_leads ?? 0;
        const skippedPart = skippedMessages ? `, ${skippedMessages} skipped` : '';
        showToast(`Inbox synced: +${insertedMessages} msgs${skippedPart}, +${insertedLeads} leads, ~${updatedLeads} updated`, 'success');
        
        // Reload dashboard data
        await loadDashboardData();
        renderKPIs();
        filterAndRenderLeads();
        updateCharts(currentDateRange);

        // Auto Reminder: after new emails/leads come in, create reminders if enabled
        try {
            await maybeAutoCreateReminders();
        } catch {}

        // Auto Reply: after new emails/leads come in, attempt to auto reply (rate-limited)
        try {
            await maybeAutoReplyTick({ manual: false });
        } catch {}

        // Auto Analyze: after new emails/leads come in, analyze eligible leads (Agent+ toggle)
        try {
            await maybeAutoAnalyzeAfterSync();
        } catch (e) {
            console.warn('[auto-analyze] failed (non-fatal):', e?.message || e);
        }
        
    } catch (error) {
        console.error('[dashboard] Error syncing inbox:', {
            error: error.message,
            stack: error.stack
        });
        showToast('Failed to sync inbox: ' + error.message, 'error');
    } finally {
        const btn = document.getElementById('gmailConnectionBtn');
        if (btn) btn.disabled = false;
        await checkGmailConnectionStatus();
    }
}

async function maybeAutoAnalyzeAfterSync() {
    if (!autoAnalyzeEnabled) return;
    if (!hasFeature('auto_analyze_leads')) return;
    if (!supabaseClient) return;

    // Analyze a small batch to avoid heavy OpenAI usage
    const MAX = 10;
    const eligible = (Array.isArray(currentLeads) ? currentLeads : [])
        .filter((l) => {
            const hasInbound = Array.isArray(l?.messages) && l.messages.some((m) => m?.from === 'lead');
            if (!hasInbound) return false;
            // If never analyzed or new message arrived since last analysis, analyze.
            const la = l?.lastAnalyzedAt instanceof Date ? l.lastAnalyzedAt : null;
            const lm = l?.lastMessageAt instanceof Date ? l.lastMessageAt : null;
            if (!la) return true;
            if (lm && la.getTime() < lm.getTime()) return true;
            // Also re-run if pipeline fields are missing (backfill)
            const pv = toNumberOrNull(l?.pipelineValue);
            const emin = toNumberOrNull(l?.estimatedPriceMin);
            const emax = toNumberOrNull(l?.estimatedPriceMax);
            return pv === null && emin === null && emax === null;
        })
        .slice(0, MAX);

    if (eligible.length === 0) return;

    console.log('[auto-analyze] running', { count: eligible.length });
    for (const lead of eligible) {
        try {
            const r = await requestLeadAnalysis(String(lead.id));
            const idx = currentLeads.findIndex((x) => String(x.id) === String(lead.id));
            if (idx !== -1 && (r.success === true || r.ok === true)) {
                currentLeads[idx].pipelineValue = toNumberOrNull(r.pipeline_value);
                currentLeads[idx].estimatedPriceMin = toNumberOrNull(r.estimated_price_min);
                currentLeads[idx].estimatedPriceMax = toNumberOrNull(r.estimated_price_max);
                currentLeads[idx].estimatedEarnings = toNumberOrNull(r.estimated_earnings);
                currentLeads[idx].score = r.score ?? currentLeads[idx].score ?? null;
                currentLeads[idx].confidence = r.confidence || currentLeads[idx].confidence || null;
                currentLeads[idx].classification = r.classification || currentLeads[idx].classification || null;
                currentLeads[idx].lastAnalyzedAt = new Date();
            }
        } catch (e) {
            // requestLeadAnalysis already toasts errors when relevant
            console.warn('[auto-analyze] lead failed', { lead_id: lead?.id, error: e?.message || e });
        }
    }

    // Refresh UI
    try { renderKPIs(); } catch {}
    try { filterAndRenderLeads(); } catch {}
    try {
        if (selectedLeadId) {
            const selected = currentLeads.find((l) => String(l.id) === String(selectedLeadId));
            if (selected) renderLeadDetail(selected, null);
        }
    } catch {}
}

async function requestLeadAnalysis(leadId) {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !session?.access_token) {
        throw new Error('Not authenticated');
    }

    const analyzeUrl = `${API_CONFIG.baseUrl}/api/analyze-lead`;
    console.log('[dashboard] Calling analyze endpoint:', analyzeUrl);
    const response = await fetch(analyzeUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ lead_id: leadId })
    });

    // Get response text first for better error messages
    const responseText = await response.text();
    let result = {};
    try {
        result = JSON.parse(responseText);
    } catch (parseError) {
        console.error('[dashboard] Failed to parse API response:', parseError);
        console.error('[dashboard] Raw response:', responseText.substring(0, 500));
        throw new Error(`Invalid API response: ${responseText.substring(0, 100)}`);
    }

    // Backwards-compat: some endpoints used { ok: true }, analyze-lead returns { success: true }
    const isSuccess = result.success === true || result.ok === true;
        if (!response.ok || !isSuccess) {
        const errorMsg = result.error || `HTTP ${response.status}: ${response.statusText}`;
        console.error('[dashboard] Auto-analysis failed:', {
            status: response.status,
            statusText: response.statusText,
            error: errorMsg,
            details: result.details,
            lead_id: leadId
        });
        
        // Show visible error to user
        const userMsg = (errorMsg === 'openai_failed' || response.status === 502)
            ? 'AI unavailable—retry'
            : `Analysis failed: ${errorMsg} — check console`;
        showToast(userMsg, 'error');
        
        throw new Error(errorMsg);
    }
    
    // Log success with pipeline values
    console.log('[dashboard] Analysis successful:', {
        lead_id: leadId,
        score: result.score,
        classification: result.classification,
        pipeline_value: result.pipeline_value
    });
    
    return result;
}

/**
 * TEMP: Analyze selected lead (Phase 1 testing only)
 * Calls /api/analyze-lead endpoint
 */
async function analyzeSelectedLead() {
    if (!selectedLeadId) {
        showToast('No lead selected', 'error');
        return;
    }
    
    if (!supabaseClient) {
        showToast('Supabase not initialized', 'error');
        return;
    }
    
    try {
        const analyzeBtn = document.getElementById('analyzeLeadBtn');
        
        // Disable button and show loading
        if (analyzeBtn) {
            analyzeBtn.disabled = true;
            analyzeBtn.textContent = 'Analyzing...';
        }
        updateAnalysisStatus('analyzing', 'Analyzing lead...');
        
        const result = await requestLeadAnalysis(String(selectedLeadId));
        if (result.success === true || result.ok === true) {
            showToast('Analysis complete!', 'success');
            
            // Update currentLeads with new pipeline values from analysis
            const leadIndex = currentLeads.findIndex(l => String(l.id) === String(selectedLeadId));
            if (leadIndex !== -1) {
                currentLeads[leadIndex].pipelineValue = result.pipeline_value;
                currentLeads[leadIndex].estimatedPriceMin = result.estimated_price_min;
                currentLeads[leadIndex].estimatedPriceMax = result.estimated_price_max;
                currentLeads[leadIndex].classification = result.classification;
                currentLeads[leadIndex].score = result.score;
                currentLeads[leadIndex].confidence = result.confidence;
                
                console.log('[dashboard] Updated currentLeads after manual analysis:', {
                    lead_id: selectedLeadId,
                    pipeline_value: result.pipeline_value
                });
            }
            
            // Refresh KPIs and UI to show updated pipeline value
            renderKPIs();
            filterAndRenderLeads();
            
            // Reload lead detail to show new analysis
            await loadLeadDetailWithAnalysis(selectedLeadId);
        } else {
            throw new Error(result.error || 'Analysis failed');
        }
        
    } catch (error) {
        console.error('Error analyzing lead:', error);
        showToast('Failed to analyze lead: ' + error.message, 'error');
        updateAnalysisStatus('error', 'Analysis failed');
    } finally {
        // Re-enable button
        const analyzeBtn = document.getElementById('analyzeLeadBtn');
        if (analyzeBtn) {
            analyzeBtn.disabled = false;
            analyzeBtn.textContent = 'Analyze Lead';
        }
    }
}

/**
 * Create a demo lead with messages and trigger analysis
 */
async function createDemoLead() {
    if (!supabaseClient) {
        showToast('Supabase not initialized', 'error');
        return;
    }
    
    try {
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError || !session || !session.user) {
            showToast('Not authenticated. Please log in.', 'error');
            return;
        }
        
        const userId = session.user.id;
        const accessToken = session.access_token;
        
        // Generate random demo lead data
        const demoNames = ['Alex Thompson', 'Jessica Martinez', 'David Kim', 'Rachel Green', 'Chris Wilson'];
        const randomIndex = Math.floor(Math.random() * demoNames.length);
        const demoName = demoNames[randomIndex];
        
        showToast('Creating demo lead...', 'info');

        // Create lead with unique (user_id, lead_email)
        let newLead = null;
        let demoEmail = null;
        const maxLeadAttempts = 5;
        for (let attempt = 0; attempt < maxLeadAttempts; attempt++) {
            demoEmail = generateUniqueDemoEmail(demoName);
            const { data, error: leadError } = await supabaseClient
                .from('leads')
                .insert({
                    user_id: userId,
                    lead_name: demoName,
                    lead_email: demoEmail,
                    source: 'demo'
                    // score and confidence will be set by OpenAI analysis only
                })
                .select()
                .single();

            if (!leadError && data) {
                newLead = data;
                break;
            }

            if (leadError?.code === '23505' && attempt < maxLeadAttempts - 1) {
                continue; // retry with a new email
            }

            console.error('Error creating lead:', leadError);
            showToast('Failed to create lead: ' + (leadError?.message || 'Unknown error'), 'error');
            return;
        }

        if (!newLead) {
            showToast('Failed to create demo lead (unique constraint)', 'error');
            return;
        }
        
        const leadId = newLead.id;
        console.log('Created lead:', leadId);
        
        // Create demo messages (conversation thread)
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
        
        const messages = [
            {
                lead_id: leadId,
                user_id: userId,
                direction: 'inbound',
                subject: 'Property Inquiry',
                body: `Hi! I'm interested in viewing properties in the area. I'm looking for a single family home with 3 bedrooms and my budget is around $400,000. Can you help me find something?`,
                sent_at: threeHoursAgo.toISOString()
            },
            {
                lead_id: leadId,
                user_id: userId,
                direction: 'outbound',
                subject: 'Re: Property Inquiry',
                body: `Hi ${demoName.split(' ')[0]}! I'd be happy to help you find the perfect property. What type of home are you looking for? Single family, condo, or townhouse?`,
                sent_at: twoHoursAgo.toISOString()
            },
            {
                lead_id: leadId,
                user_id: userId,
                direction: 'inbound',
                subject: 'Re: Property Inquiry',
                body: `I'm looking for a single family home with at least 3 bedrooms and 2 bathrooms. My price range is $350,000 to $450,000. Do you have anything available? I'm ready to move forward soon.`,
                sent_at: oneHourAgo.toISOString()
            }
        ];
        
        // Insert messages via server endpoint to auto-trigger OpenAI analysis on inbound messages
        // This MUST go through /api/messages to ensure OpenAI analysis runs properly
        for (const message of messages) {
            const messagesUrl = `${API_CONFIG.baseUrl}/api/messages`;
            const resp = await fetch(messagesUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify(message)
            });
            
            if (!resp.ok) {
                const errorData = await resp.json().catch(() => ({}));
                const errorMsg = errorData.error || `HTTP ${resp.status}`;
                console.error('Error creating message via API:', errorMsg);
                showToast(`Failed to create message: ${errorMsg}`, 'error');
                return;
            }
        }

        showToast('Demo lead created! Analysis will appear shortly.', 'success');
        
        // Reload dashboard data immediately to show messages
        await loadDashboardData();
        filterAndRenderLeads();
        
        // Select the new lead (this will expand conversation)
        if (newLead) {
            await selectLead(leadId);
        }
        
        // Refresh after a moment to show analysis results if available
        setTimeout(async () => {
            await loadDashboardData();
            filterAndRenderLeads();
            // Refresh KPIs to update top pipeline card with new values
            renderKPIs();
            if (selectedLeadId === leadId) {
                await loadLeadDetailWithAnalysis(leadId);
            }
        }, 3000);
        
    } catch (error) {
        console.error('Error creating demo lead:', error);
        showToast('Failed to create demo lead: ' + error.message, 'error');
    }
}

function generateUniqueDemoEmail(name) {
    const base =
        String(name || 'lead')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '.')
            .replace(/^\.+|\.+$/g, '') || 'lead';
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    return `${base}+demo-${ts}-${rand}@closelogic.dev`;
}

function showToast(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#dc2626' : '#10b981'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        font-size: 14px;
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

/**
 * Toggle select mode for leads
 */
function toggleSelectMode() {
    isSelectMode = !isSelectMode;
    
    const selectBtn = document.getElementById('selectLeadsBtn');
    const deleteBtn = document.getElementById('deleteSelectedLeadsBtn');
    
    if (!selectBtn) {
        console.error('[dashboard] Select button not found in DOM');
        return;
    }
    
    if (isSelectMode) {
        // Entering select mode - show trash button
        selectBtn.textContent = 'Cancel';
        if (deleteBtn) {
            deleteBtn.style.display = 'inline-flex';
        }
    } else {
        // Exiting select mode - hide trash button and clear selections
        selectBtn.textContent = 'Select';
        selectedLeadIds.clear();
        if (deleteBtn) {
            deleteBtn.style.display = 'none';
        }
    }
    
    // Re-render leads to show/hide checkboxes
    filterAndRenderLeads();
}

/**
 * Update delete button visibility based on selected leads
 * Delete button shows when in select mode (no count)
 */
function updateDeleteButtonVisibility() {
    const deleteBtn = document.getElementById('deleteSelectedLeadsBtn');
    if (deleteBtn && isSelectMode) {
        // Always show delete button when in select mode (regardless of selection count)
        deleteBtn.style.display = 'inline-flex';
    }
}

/**
 * Delete selected leads
 */
async function deleteSelectedLeads() {
    if (selectedLeadIds.size === 0) {
        showToast('No leads selected', 'error');
        return;
    }
    
    if (!supabaseClient) {
        showToast('Supabase not initialized', 'error');
        return;
    }
    
    const confirmDelete = confirm(`Are you sure you want to delete the selected lead(s)? This action cannot be undone.`);
    if (!confirmDelete) {
        return;
    }
    
    try {
        const userId = await getUserId();
        if (!userId) {
            showToast('Not authenticated', 'error');
            return;
        }
        
        const leadIdsArray = Array.from(selectedLeadIds);
        
        // Delete leads (cascade will delete messages and scores)
        const { error } = await supabaseClient
            .from('leads')
            .delete()
            .in('id', leadIdsArray)
            .eq('user_id', userId);
        
        if (error) {
            console.error('Error deleting leads:', error);
            showToast('Failed to delete leads: ' + error.message, 'error');
            return;
        }
        
        showToast(`Successfully deleted ${leadIdsArray.length} lead(s)`, 'success');
        
        // Clear selection and exit select mode
        selectedLeadIds.clear();
        isSelectMode = false;
        toggleSelectMode();
        
        // Reload dashboard data (this will refresh currentLeads array from database)
        // This ensures deleted leads are completely removed from all calculations
        await loadDashboardData();
        
        // Remove deleted leads from currentLeads array immediately (in case of race condition)
        // This ensures pipeline value calculations exclude deleted leads
        const deletedIdsSet = new Set(leadIdsArray.map(id => String(id)));
        currentLeads = currentLeads.filter(lead => !deletedIdsSet.has(String(lead.id)));
        
        // Refresh all visualizations to completely remove deleted leads from:
        // - Pipeline list
        // - KPIs (hot leads count, pipeline value, followups, response time)
        // - All charts (pipeline mix, lead source, momentum, response time, velocity)
        filterAndRenderLeads();
        
        // CRITICAL: Recalculate pipeline value KPI after removing deleted leads
        // This ensures the pipeline value reflects only active leads with pricing intent
        renderKPIs();
        
        initCharts();
        
        // Refresh lead source chart (part of main charts, uses currentLeads)
        initLeadSourceChart();
        
        // Also refresh performance charts if they're visible
        const performanceTab = document.getElementById('performanceTab');
        if (performanceTab && performanceTab.classList.contains('active')) {
            initPerformanceCharts();
        }
        
        // Clear selected lead detail if it was deleted
        if (selectedLeadId && leadIdsArray.includes(String(selectedLeadId))) {
            selectedLeadId = null;
            const detailContent = document.getElementById('leadDetailContent');
            const detailEmpty = document.getElementById('detailEmptyState');
            if (detailContent) detailContent.style.display = 'none';
            if (detailEmpty) detailEmpty.style.display = 'flex';
        }
        
    } catch (error) {
        console.error('Error deleting leads:', error);
        showToast('Failed to delete leads: ' + error.message, 'error');
    }
}

/**
 * Attach event listeners to lead cards
 */
function attachLeadCardListeners(container) {
    if (!container) return;
    
    // Re-attach click handlers
    container.querySelectorAll('.lead-card').forEach(card => {
        if (!isSelectMode) {
            card.addEventListener('click', function(e) {
                // Don't select if clicking checkbox
                if (!e.target.classList.contains('lead-card-checkbox')) {
                    const leadId = this.getAttribute('data-lead-id');
                    selectLead(leadId);
                }
            });
        }
    });
    
    // Attach checkbox handlers
    container.querySelectorAll('.lead-card-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function(e) {
            e.stopPropagation();
            const leadId = this.getAttribute('data-lead-id');
            if (this.checked) {
                selectedLeadIds.add(leadId);
            } else {
                selectedLeadIds.delete(leadId);
            }
            updateDeleteButtonVisibility();
        });
    });
}
