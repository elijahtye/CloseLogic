// Auth Guard - Shared authentication and onboarding check
// Used across dashboard, onboarding, and other protected pages

/**
 * Check authentication and onboarding status
 * @param {Object} options - Configuration options
 * @param {boolean} options.requireAuth - If true, redirect to auth.html if not authenticated
 * @param {boolean} options.requireOnboarding - If true, redirect to onboarding.html if not onboarded
 * @param {boolean} options.redirectIfOnboarded - If true and onboarding is completed, redirect to dashboard.html
 * @returns {Promise<Object|null>} Returns { session, profile } if valid, null otherwise
 */
async function checkAuthAndOnboarding(options = {}) {
    const { requireAuth = true, requireOnboarding = true, redirectIfOnboarded = false } = options;
    
    // Require shared config helper
    if (typeof window.getSupabaseClient !== 'function') {
        console.error('[authGuard] getSupabaseClient not available (check script order: config.js must load first)');
        if (requireAuth) {
            window.location.href = '/auth';
        }
        return null;
    }
    
    let supabaseClient = null;
    try {
        supabaseClient = window.getSupabaseClient();
    } catch (error) {
        console.error('[authGuard] Supabase init failed:', error);
        if (requireAuth) {
            window.location.href = '/auth';
        }
        return null;
    }
    
    const session = await resolveSession(supabaseClient);
    
    if (!session || !session.user) {
        console.log('[authGuard] No session');
        if (requireAuth) {
            window.location.href = '/auth';
        }
        return null;
    }
    
    const userId = session.user.id;
    
    // Ensure profile exists (removes race condition across auth providers)
    await ensureProfile(supabaseClient, session.user);
    const profile = await fetchProfile(supabaseClient, userId);
    
    if (!profile) {
        if (requireOnboarding) {
            window.location.href = '/onboarding';
        }
        return { session, profile: null };
    }
    
    if (redirectIfOnboarded && profile.onboarding_completed === true) {
        window.location.href = '/dashboard';
        return { session, profile };
    }

    // Check onboarding status
    if (requireOnboarding && profile.onboarding_completed !== true) {
        window.location.href = '/onboarding';
        return { session, profile };
    }
    
    return { session, profile };
}

async function resolveSession(supabaseClient, timeoutMs = 1500) {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) return session;
    } catch (_) {
        // fall through to auth state listener
    }

    return await new Promise((resolve) => {
        let settled = false;
        let sub = null;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            sub?.subscription?.unsubscribe?.();
            resolve(null);
        }, timeoutMs);

        const { data: subscription } = supabaseClient.auth.onAuthStateChange((_event, session) => {
            sub = subscription;
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            subscription?.subscription?.unsubscribe?.();
            resolve(session || null);
        });
    });
}

async function ensureProfile(supabaseClient, user) {
    if (!user?.id) return;
    const email = user.email || user.user_metadata?.email || null;
    const fullName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        (email ? email.split('@')[0] : null) ||
        'User';

    // Best-effort upsert (RLS should allow user to upsert their own profile)
    try {
        await supabaseClient
            .from('profiles')
            .upsert(
                {
                    id: user.id,
                    email,
                    full_name: fullName
                },
                { onConflict: 'id' }
            );
    } catch (e) {
        // Non-fatal: triggers might handle it, or RLS may block depending on environment.
        console.warn('[authGuard] ensureProfile failed (non-fatal):', e?.message || e);
    }
}

async function fetchProfile(supabaseClient, userId) {
    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('id, onboarding_completed, primary_goal, communication_style, lead_volume')
            .eq('id', userId)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            console.warn('[authGuard] fetchProfile error:', error);
        }
        return data || null;
    } catch (e) {
        console.warn('[authGuard] fetchProfile exception:', e?.message || e);
        return null;
    }
}

async function redirectAfterLogin() {
    const supabaseClient = window.getSupabaseClient();
    const session = await resolveSession(supabaseClient, 2000);
    if (!session || !session.user) {
        window.location.href = '/auth';
        return;
    }
    await ensureProfile(supabaseClient, session.user);
    const profile = await fetchProfile(supabaseClient, session.user.id);
    if (!profile || profile.onboarding_completed !== true) {
        window.location.href = '/onboarding';
        return;
    }
    window.location.href = '/dashboard';
}

window.authGuard = {
    checkAuthAndOnboarding,
    redirectAfterLogin
};

