# Google OAuth PKCE Flow - Fixes Applied

## Summary of Changes

All files have been updated to properly implement Google OAuth with PKCE (Proof Key for Code Exchange) flow.

## 1. config.js ✅

- **Changed**: Now exports `window.SUPABASE_CONFIG` as a global variable
- **Format**: 
  ```javascript
  window.SUPABASE_CONFIG = {
      url: 'https://your-project-ref.supabase.co',
      anonKey: 'your-anon-public-key-here'
  };
  ```
- **Action Required**: Replace placeholder values with your actual Supabase credentials

## 2. auth.html ✅

- **Script Order Fixed**: Scripts now load at bottom of `<body>` in correct order:
  1. Supabase CDN
  2. config.js
  3. auth.js
- **Button ID Added**: Signup Google button now has `id="googleSignInBtn"`
- **Both buttons**: Support both ID and class selectors

## 3. auth.js ✅

### Initialization
- Uses `window.SUPABASE_CONFIG` instead of `SUPABASE_CONFIG`
- Clear error messages if config missing
- Console logs for debugging

### Google Button Handler
- Attaches to `id="googleSignInBtn"` OR `.google-signin-btn` class
- Calls `supabase.auth.signInWithOAuth()` with proper redirect URL
- Console logs: "OAuth redirect started"

### PKCE Callback Handler (NEW)
- **Replaced hash-based callback** with PKCE code exchange
- Checks for `?code=` in URL query params (not hash)
- Calls `supabase.auth.exchangeCodeForSession(code)` 
- Handles errors from `?error=` and `?error_description=` params
- Cleans URL after successful exchange
- Console logs: "Code detected", "Session exchange success"

## 4. dashboard.html ✅

- **Script Order Fixed**: Same pattern as auth.html
- Scripts load at bottom: Supabase CDN → config.js → dashboard.js

## 5. dashboard.js ✅

### Session Check
- Uses `window.SUPABASE_CONFIG` for initialization
- Calls `supabase.auth.getSession()` on load
- Redirects to `auth.html` if no session
- Console logs: "Active session found" or "No active session"

### Sign Out Function (NEW)
- Added `signOut()` function
- Attached to logout link in user menu
- Calls `supabase.auth.signOut()`
- Redirects to auth.html after sign out

## Testing Checklist

1. **Set Config**: Update `config.js` with real Supabase credentials
2. **Enable Google OAuth**: In Supabase Dashboard > Authentication > Providers > Google
3. **Set Redirect URL**: Add `http://localhost:5000/dashboard.html` to Supabase redirect URLs
4. **Test Flow**:
   - Open `auth.html`
   - Click "Continue with Google"
   - Should redirect to Google login
   - After login, should redirect back to `dashboard.html`
   - Dashboard should load with session

## Console Messages to Watch For

**On auth.html load:**
```
DOM loaded, initializing auth...
Supabase client initialized successfully
Button found - listener attached
Attached Google OAuth handlers to 2 button(s)
```

**On button click:**
```
Google sign-in button clicked
OAuth redirect started
Redirect URL: http://localhost:5000/dashboard.html
OAuth initiated successfully
```

**On callback (after Google redirect):**
```
Code detected in URL - exchanging for session
Session exchange success - session established
```

**On dashboard load:**
```
Supabase client initialized
Active session found: user@email.com
```

## Common Issues

- **"Configuration missing"**: Set values in `config.js`
- **"Button not found"**: Check HTML has `id="googleSignInBtn"` or `.google-signin-btn` class
- **OAuth fails**: Verify Google OAuth enabled in Supabase and redirect URL matches exactly
- **No session on dashboard**: Check callback completed successfully (look for "Session exchange success")

