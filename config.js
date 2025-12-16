// Supabase Configuration
// Set your Supabase project URL and anon key here
// Get these from: Supabase Dashboard > Settings > API

console.log('config.js loaded');

window.SUPABASE_CONFIG = {
    url: 'https://gazdbodmpiqzxtufqckh.supabase.co',  // Replace with your Supabase project URL
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhemRib2RtcGlxenh0dWZxY2toIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4OTA0NjAsImV4cCI6MjA4MTQ2NjQ2MH0.3_OFuyczcFEEk1412ByJG-psohgjdVvTmN_bQxU0C9c'          // Replace with your Supabase anon/public key
};

// Validate configuration
if (!window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.anonKey) {
    console.error('Supabase configuration missing!');
    console.error('Please set SUPABASE_CONFIG.url and SUPABASE_CONFIG.anonKey in config.js');
} else {
    // Check for placeholder values - use exact match, not substring
    // (Real keys contain "anon" in JWT payload, so .includes() would give false positives)
    const isPlaceholderUrl = window.SUPABASE_CONFIG.url.includes('your-project');
    const isPlaceholderKey = window.SUPABASE_CONFIG.anonKey === 'your-anon-public-key-here' ||
                             (window.SUPABASE_CONFIG.anonKey && window.SUPABASE_CONFIG.anonKey.length < 50);
    
    if (isPlaceholderUrl || isPlaceholderKey) {
        console.error('Supabase configuration using placeholders!');
        console.error('Please replace placeholder values with your actual Supabase credentials');
    } else {
        console.log('✓ Supabase configuration validated successfully');
    }
}

