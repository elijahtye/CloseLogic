# Gmail Connect Fix - Complete Implementation

## Problem Fixed
- **Issue**: "Connect Gmail" returned 404 or "Not found" errors
- **Root Cause**: Server-side OAuth URL generation was incomplete or endpoints weren't properly routed

## Solution Overview

### 1. Shared OAuth Logic (`api/lib/gmailOAuth.js`)
Created centralized functions used by both connect endpoints:
- `validateUserAuth()` - Validates user token using Supabase Admin client (service role)
- `buildGmailOAuthUrl()` - Builds Google OAuth URL with proper parameters
- `getSiteUrl()` - Determines site URL from env vars or request headers

### 2. Connect Endpoints

**POST /api/connect-gmail** (`api/connect-gmail.js`):
- Validates user authentication
- Builds OAuth URL server-side
- Returns `{ success: true, auth_url: "..." }`

**GET /api/gmail/connect** (`api/gmail/connect.js`):
- Same logic as POST endpoint
- Supports GET requests for compatibility
- Returns same JSON response

### 3. Updated Dashboard (`dashboard.js`)
- `connectGmail()` now calls server endpoint (POST `/api/connect-gmail`)
- No client-side OAuth URL building
- Improved error handling with response text logging
- Redirects to `result.auth_url` on success

### 4. Callback Consistency (`api/gmail-callback.js`)
- Updated redirect URI logic to match connect endpoint
- Uses same `getSiteUrl()` pattern for consistency

## Key Features

✅ **Server-side OAuth URL generation** - Never exposes `GOOGLE_CLIENT_ID` to client  
✅ **Dual endpoint support** - Both GET and POST routes work  
✅ **Proper authentication** - Uses Supabase Admin client to validate tokens  
✅ **Consistent redirect URIs** - Connect and callback use same logic  
✅ **Better error handling** - Logs full response text for debugging  
✅ **Production ready** - Works with Vercel serverless functions  

## Environment Variables Required

- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret (validated, not exposed)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase admin key for token validation
- `SITE_URL` (optional) - Site URL, otherwise inferred from request headers

## Testing

### Local Development:
```bash
# Use Vercel CLI for /api routes
vercel dev

# Navigate to http://localhost:3000/dashboard.html
# Click "Connect Gmail"
# Should redirect to Google OAuth immediately
```

### Expected Flow:
1. User clicks "Connect Gmail"
2. Dashboard calls `POST /api/connect-gmail` with auth token
3. Server validates token and builds OAuth URL
4. Server returns `{ success: true, auth_url: "..." }`
5. Dashboard redirects to `auth_url` (Google OAuth)
6. User authorizes
7. Google redirects to `/api/gmail-callback`
8. Callback exchanges code for tokens
9. Tokens stored in database
10. User redirected to dashboard with success

## Files Created/Modified

**New Files:**
- `api/lib/gmailOAuth.js` - Shared OAuth logic

**Modified Files:**
- `api/connect-gmail.js` - Rewritten to use shared logic
- `api/gmail/connect.js` - Rewritten to use shared logic
- `api/gmail-callback.js` - Updated redirect URI logic
- `dashboard.js` - Updated to call server endpoint
- `DEPLOYMENT.md` - Added local testing note

## Security Improvements

- ✅ No `GOOGLE_CLIENT_ID` in client-side code
- ✅ Server-side token validation using Admin client
- ✅ State parameter includes user ID for verification
- ✅ Proper CORS headers
- ✅ Error messages don't expose sensitive data

