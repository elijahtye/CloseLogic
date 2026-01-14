// Auth Page JavaScript (email/password sign-in only)
let supabaseClient = null;

document.addEventListener('DOMContentLoaded', async function() {
    try {
        supabaseClient = window.getSupabaseClient();
    } catch (e) {
        console.error('[auth] Supabase init failed:', e);
        alert('Configuration error. Please refresh and check console.');
        return;
    }

    // If already authenticated, never stay on auth screen
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session?.user) {
            await window.authGuard.redirectAfterLogin();
            return;
        }
    } catch (_) {
        // continue to show auth screen
    }
    
    const loginForm = document.getElementById('loginForm');

    // Email/password login
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            
            try {
                const { data, error } = await supabaseClient.auth.signInWithPassword({
                    email: email,
                    password: password
                });
                
                if (error) {
                    alert(`Login failed: ${error.message}`);
                    return;
                }
                
                if (data.session) {
                    await supabaseClient.auth.setSession(data.session);
                    await window.authGuard.redirectAfterLogin();
                } else {
                    alert('Login failed. Please try again.');
                }
            } catch (error) {
                alert('Login failed. Please try again.');
            }
        });
    }
});
