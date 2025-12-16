// Auth Page JavaScript
// Initialize Supabase client
let supabase = null;

document.addEventListener('DOMContentLoaded', async function() {
    console.log('DOM loaded, initializing auth...');
    
    // Initialize Supabase client
    try {
        if (typeof window.supabase === 'undefined') {
            console.error('Supabase library not loaded. Check script tag.');
            alert('Authentication library not loaded. Please refresh the page.');
            return;
        }
        
        if (typeof window.SUPABASE_CONFIG === 'undefined') {
            console.error('window.SUPABASE_CONFIG not defined. Check config.js script tag.');
            alert('Configuration error: config.js not loaded. Please check script tags.');
            return;
        }
        
        // Validate config exists
        console.log('Checking Supabase config:', {
            url: window.SUPABASE_CONFIG?.url,
            anonKeyLength: window.SUPABASE_CONFIG?.anonKey?.length,
            anonKeyPreview: window.SUPABASE_CONFIG?.anonKey?.substring(0, 20) + '...'
        });
        
        if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.anonKey) {
            console.error('Supabase configuration missing:', window.SUPABASE_CONFIG);
            alert('Configuration error: Supabase URL and anon key are required. Please check config.js');
            return;
        }
        
        // Check for placeholder values (but allow valid keys that contain 'anon' in JWT payload)
        // Valid JWT tokens are long (typically 200+ chars), so check length
        const urlCheck = window.SUPABASE_CONFIG.url.includes('your-project');
        const keyCheck = window.SUPABASE_CONFIG.anonKey === 'your-anon-public-key-here';
        const lengthCheck = window.SUPABASE_CONFIG.anonKey && window.SUPABASE_CONFIG.anonKey.length < 50;
        
        console.log('Validation checks:', {
            urlHasPlaceholder: urlCheck,
            keyIsPlaceholder: keyCheck,
            keyTooShort: lengthCheck,
            actualKeyLength: window.SUPABASE_CONFIG.anonKey.length
        });
        
        if (urlCheck || keyCheck || lengthCheck) {
            console.error('Supabase configuration appears to use placeholders:', {
                url: window.SUPABASE_CONFIG.url,
                anonKeyLength: window.SUPABASE_CONFIG.anonKey?.length,
                urlCheck,
                keyCheck,
                lengthCheck
            });
            alert('Configuration error: Please replace placeholder values with your actual Supabase credentials in config.js');
            return;
        }
        
        // Validate URL format
        if (!window.SUPABASE_CONFIG.url.startsWith('https://') || !window.SUPABASE_CONFIG.url.includes('.supabase.co')) {
            console.error('Invalid Supabase URL format:', window.SUPABASE_CONFIG.url);
            alert('Configuration error: Invalid Supabase URL format. Should be: https://your-project.supabase.co');
            return;
        }
        
        console.log('Config validation passed!');
        
        supabase = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
        console.log('Supabase client initialized successfully');
    } catch (error) {
        console.error('Error initializing Supabase:', error);
        alert('Error initializing authentication. Please refresh the page.');
        return;
    }
    
    const tabButtons = document.querySelectorAll('.tab-btn');
    const formContainers = document.querySelectorAll('.auth-form-container');
    const signupForm = document.getElementById('signupForm');
    const loginForm = document.getElementById('loginForm');
    const googleSignInBtn = document.getElementById('googleSignInBtn');
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

    // Sign up form validation
    if (signupForm) {
        signupForm.addEventListener('submit', function(e) {
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
            
            // Here you would typically send the data to your backend
            console.log('Sign up form submitted');
            
            // After successful signup, redirect to onboarding
            // In production, this would happen after backend confirms account creation
            window.location.href = 'onboarding.html';
        });
    }

    // Login form submission
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Here you would typically send the data to your backend
            console.log('Login form submitted');
            
            // Check if user has completed onboarding
            // In production, this would be checked from the backend
            const hasCompletedOnboarding = localStorage.getItem('onboardingData');
            
            if (hasCompletedOnboarding) {
                // Redirect to dashboard if onboarding is complete
                window.location.href = 'dashboard.html';
            } else {
                // Redirect to onboarding if not completed
                window.location.href = 'onboarding.html';
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
    
    // Google OAuth Sign In
    // Attach listeners to ALL Google buttons (both signup and login forms)
    console.log('Setting up Google OAuth buttons...');
    console.log('Found buttons by class:', googleSignInButtons.length);
    console.log('Found button by ID (signup):', googleSignInBtn ? 'Yes' : 'No');
    
    if (supabase) {
        // Attach to all buttons with the class (both signup and login)
        if (googleSignInButtons.length > 0) {
            googleSignInButtons.forEach((button, index) => {
                const formType = button.getAttribute('data-form') || 'unknown';
                const buttonId = button.id || 'no-id';
                console.log(`Attaching listener to button ${index + 1}: form="${formType}", id="${buttonId}"`);
                
                button.addEventListener('click', async function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log(`✓ Google sign-in button clicked (${formType} form, id="${buttonId}")`);
                    await handleGoogleSignIn();
                });
            });
            console.log(`✓ Attached Google OAuth handlers to ${googleSignInButtons.length} button(s)`);
        } else {
            console.warn('No buttons found with class "google-signin-btn"');
        }
        
        // Also attach to button by ID if it exists and wasn't already handled
        if (googleSignInBtn) {
            const alreadyAttached = Array.from(googleSignInButtons).includes(googleSignInBtn);
            if (!alreadyAttached) {
                console.log('Attaching listener to signup button by ID');
                googleSignInBtn.addEventListener('click', async function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('✓ Google sign-in button clicked (signup form, by ID)');
                    await handleGoogleSignIn();
                });
            } else {
                console.log('Signup button already has listener from class selector');
            }
        }
        
        // Also attach to login button by ID if it exists
        const googleSignInBtnLogin = document.getElementById('googleSignInBtnLogin');
        if (googleSignInBtnLogin) {
            const alreadyAttached = Array.from(googleSignInButtons).includes(googleSignInBtnLogin);
            if (!alreadyAttached) {
                console.log('Attaching listener to login button by ID');
                googleSignInBtnLogin.addEventListener('click', async function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('✓ Google sign-in button clicked (login form, by ID)');
                    await handleGoogleSignIn();
                });
            } else {
                console.log('Login button already has listener from class selector');
            }
        }
        
        if (googleSignInButtons.length === 0 && !googleSignInBtn && !googleSignInBtnLogin) {
            console.error('❌ No Google sign-in buttons found at all!');
        }
    } else {
        console.error('❌ Supabase client not initialized - cannot attach Google OAuth handlers');
    }
    
    // Check for OAuth callback (handles redirect after Google login) - PKCE flow
    await handleOAuthCallback();
});

/**
 * Handle Google OAuth Sign In
 */
async function handleGoogleSignIn() {
    console.log('handleGoogleSignIn called');
    
    if (!supabase) {
        console.error('Supabase client not initialized');
        alert('Authentication service not available. Please refresh the page.');
        return;
    }
    
    // Check if config is valid
    if (!window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.anonKey) {
        console.error('Supabase config missing:', window.SUPABASE_CONFIG);
        alert('Configuration error: Supabase credentials not found. Please check config.js');
        return;
    }
    
    try {
        // Get the redirect URL (current page origin + /dashboard.html)
        const redirectTo = `${window.location.origin}/dashboard.html`;
        
        console.log('OAuth redirect started');
        console.log('Redirect URL:', redirectTo);
        console.log('Supabase URL:', window.SUPABASE_CONFIG.url);
        
        // Sign in with Google OAuth (PKCE flow)
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: redirectTo
            }
        });
        
        if (error) {
            console.error('OAuth error:', error);
            throw error;
        }
        
        // User will be redirected to Google, then back to redirectTo
        // The callback will be handled in handleOAuthCallback()
        console.log('OAuth initiated successfully', data);
        
    } catch (error) {
        console.error('Error during Google OAuth:', error);
        alert(`Failed to sign in with Google: ${error.message || 'Unknown error'}\n\nCheck console for details.`);
    }
}

/**
 * Handle OAuth callback after redirect from Google (PKCE flow)
 */
async function handleOAuthCallback() {
    if (!supabase) {
        console.log('Supabase not initialized, skipping OAuth callback');
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
            console.log('Code detected in URL - exchanging for session');
            
            // Exchange code for session (PKCE flow)
            const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            
            if (exchangeError) {
                console.error('Session exchange failure:', exchangeError);
                throw exchangeError;
            }
            
            if (data.session) {
                console.log('Session exchange success - session established');
                // Clean up URL (remove code and other params)
                const cleanUrl = window.location.pathname;
                window.history.replaceState({}, document.title, cleanUrl);
                // Redirect to dashboard
                window.location.href = 'dashboard.html';
            } else {
                console.warn('Session exchange returned no session');
            }
        }
    } catch (error) {
        console.error('Error handling OAuth callback:', error);
        alert(`Error completing sign in: ${error.message || 'Unknown error'}`);
        // Clean up URL on error
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

