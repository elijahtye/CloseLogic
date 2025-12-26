// Supabase configuration + shared client factory (single source of truth for frontend).
// NOTE: Supabase anon key is public by design. Do not place service role keys in frontend code.

window.SUPABASE_CONFIG = window.SUPABASE_CONFIG || {
    url: 'https://gazdbodmpiqzxtufqckh.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhemRib2RtcGlxenh0dWZxY2toIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4OTA0NjAsImV4cCI6MjA4MTQ2NjQ2MH0.3_OFuyczcFEEk1412ByJG-psohgjdVvTmN_bQxU0C9c'
};

function assertSupabaseConfigured() {
    if (!window.supabase) {
        throw new Error('Supabase library not loaded');
    }
    const cfg = window.SUPABASE_CONFIG;
    if (!cfg || !cfg.url || !cfg.anonKey) {
        throw new Error('Supabase configuration missing (SUPABASE_CONFIG.url/anonKey)');
    }
    if (!cfg.url.startsWith('https://') || !cfg.url.includes('.supabase.co')) {
        throw new Error('Invalid Supabase URL format');
    }
    if (cfg.anonKey === 'your-anon-public-key-here' || cfg.anonKey.length < 50) {
        throw new Error('Supabase anon key appears invalid/placeholder');
    }
    return cfg;
}

window.assertSupabaseConfigured = assertSupabaseConfigured;

// Memoized Supabase client (shared across pages)
window.getSupabaseClient = (() => {
    let client = null;
    return () => {
        if (client) return client;
        const cfg = assertSupabaseConfigured();
        client = window.supabase.createClient(cfg.url, cfg.anonKey);
        return client;
    };
})();

