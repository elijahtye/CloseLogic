// Auth Page JavaScript (email/password + Google OAuth)
// Using supabaseClient to avoid shadowing global window.supabase
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
    
    const tabButtons = document.querySelectorAll('.tab-btn');
    const formContainers = document.querySelectorAll('.auth-form-container');
    const signupForm = document.getElementById('signupForm');
    const loginForm = document.getElementById('loginForm');
    const googleSignInButtons = document.querySelectorAll('.google-signin-btn');

    // Tab switching
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            
            // Update active tab
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Update active form
            formContainers.forEach(container => container.classList.remove('active'));
            document.getElementById(`${targetTab}-form`).classList.add('active');
        });
    });

    // Email/password signup
    if (signupForm) {
        signupForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            // Check if passwords match
            if (password !== confirmPassword) {
                alert('Passwords do not match. Please try again.');
                return;
            }
            
            // Check password length
            if (password.length < 8) {
                alert('Password must be at least 8 characters long.');
                return;
            }
            
            const email = document.getElementById('email').value;
            const firstName = document.getElementById('firstName').value;
            const lastName = document.getElementById('lastName').value;
            const fullName = `${firstName} ${lastName}`.trim();
            
            try {
                const { data, error } = await supabaseClient.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            full_name: fullName || email.split('@')[0] // Fallback to email prefix if no name
                        }
                    }
                });
                
                if (error) {
                    alert(`Sign up failed: ${error.message}`);
                    return;
                }
                
                if (data.session) {
                    await supabaseClient.auth.setSession(data.session);
                    await window.authGuard.redirectAfterLogin();
                } else {
                    // Email confirmation required
                    alert('Please check your email to confirm your account.');
                }
            } catch (error) {
                alert('Sign up failed. Please try again.');
            }
        });
    }

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

    // Phone number formatting
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 0) {
                if (value.length <= 3) {
                    value = `(${value}`;
                } else if (value.length <= 6) {
                    value = `(${value.slice(0, 3)}) ${value.slice(3)}`;
                } else {
                    value = `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6, 10)}`;
                }
            }
            e.target.value = value;
        });
    }
    
    // Google OAuth Sign In (both forms)
    if (googleSignInButtons.length > 0) {
        googleSignInButtons.forEach((button) => {
            button.addEventListener('click', async function(e) {
                e.preventDefault();
                e.stopPropagation();
                await handleGoogleSignIn();
            });
        });
    }
    
    // Check for OAuth callback (handles redirect after Google login) - PKCE flow
    await handleOAuthCallback();
});

/**
 * Handle Google OAuth Sign In
 */
async function handleGoogleSignIn() {
    if (!supabaseClient) {
        alert('Authentication service not available. Please refresh the page.');
        return;
    }
    
    try {
        // Get the redirect URL for callback handling.
        // IMPORTANT: Supabase will only redirect to allowlisted URLs. If a user visits
        // closelogic.net (non-www) but only www.closelogic.net is allowlisted, Supabase
        // can fall back to its configured Site URL (often localhost). Canonicalize.
        const hostname = (window.location.hostname || '').toLowerCase();
        const isCloseLogicDomain = hostname === 'closelogic.net' || hostname === 'www.closelogic.net';
        const canonicalOrigin = isCloseLogicDomain ? 'https://www.closelogic.net' : window.location.origin;
        const redirectTo = `${canonicalOrigin}/auth`;
        
        // Sign in with Google OAuth (PKCE flow)
        const { data, error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: redirectTo
            }
        });
        
        if (error) {
            console.error('[auth] OAuth error:', error);
            throw error;
        }
        
        // User will be redirected to Google, then back to redirectTo
        // The callback will be handled in handleOAuthCallback()
        void data;
        
    } catch (error) {
        alert(`Failed to sign in with Google: ${error.message || 'Unknown error'}\n\nCheck console for details.`);
    }
}

/**
 * Handle OAuth callback after redirect from Google (PKCE flow)
 */
async function handleOAuthCallback() {
    if (!supabaseClient) {
        return;
    }
    
    try {
        // Check URL for OAuth callback parameters (PKCE uses ?code= instead of hash)
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');
        const errorDescription = urlParams.get('error_description');
        
        // Handle OAuth errors
        if (error) {
            console.error('OAuth error detected:', error, errorDescription);
            alert(`Authentication failed: ${errorDescription || error}`);
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
        }
        
        // Handle PKCE code exchange
        if (code) {
            // Exchange code for session (PKCE flow)
            const { data, error: exchangeError } = await supabaseClient.auth.exchangeCodeForSession(code);
            
            if (exchangeError) {
                console.error('Session exchange failure:', exchangeError);
                throw exchangeError;
            }
            
            if (data.session) {
                // Clean up URL (remove code and other params)
                const cleanUrl = window.location.pathname;
                window.history.replaceState({}, document.title, cleanUrl);
                // Check onboarding status and redirect accordingly
                await window.authGuard.redirectAfterLogin();
            } else {
                // no-op
            }
        }
    } catch (error) {
        alert(`Error completing sign in: ${error.message || 'Unknown error'}`);
        // Clean up URL on error
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}


