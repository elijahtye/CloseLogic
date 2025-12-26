# Gmail Connect Fix - Implementation Complete

## Problem Fixed
- **Issue**: Clicking "Connect Gmail" returned 404 "Not found"
- **Root Cause**: Route was registered but server needed restart + frontend was navigating directly instead of fetching

## Changes Made

### 1. API Endpoint (`/api/gmail/connect.js`)
- ✅ Returns JSON `{ ok: true, authUrl: "..." }` instead of redirecting
- ✅ Validates user via Authorization header (preferred) or token query param (fallback)
- ✅ Checks for required env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- ✅ Uses `GOOGLE_REDIRECT_URI` if set, otherwise constructs from `APP_URL`
- ✅ Generates OAuth URL with proper scopes and state parameter
- ✅ Comprehensive error logging with `[gmail/connect]` prefix

### 2. Frontend (`dashboard.js`)
- ✅ Updated `connectGmail()` to use `fetch()` instead of direct navigation
- ✅ Sends Authorization header with Bearer token
- ✅ Handles response JSON and extracts `authUrl`
- ✅ Redirects to `authUrl` after receiving it
- ✅ Error handling with user-friendly messages
- ✅ Debug logging: `[dashboard] connectGmail clicked` and `[dashboard] Received authUrl`

### 3. Dev Server (`dev-server.mjs`)
- ✅ Added debug logging for route matching
- ✅ Added error handling for import failures
- ✅ Route `/api/gmail/connect` properly registered

### 4. Callback Endpoint (`/api/gmail/callback.js`)
- ✅ Already exists and handles OAuth callback
- ✅ Uses same redirect URI pattern: `${appUrl}/api/gmail/callback`

## Testing Steps

### Prerequisites
1. Set environment variables in `.env.local`:
   ```
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   APP_URL=http://localhost:5001
   ```

2. Configure Google OAuth:
   - Add redirect URI: `http://localhost:5001/api/gmail/callback`
   - Enable Gmail API in Google Cloud Console

### Test Flow

1. **Start Server**:
   ```bash
   npm run dev:local
   ```

2. **Open Dashboard**:
   - Navigate to `http://localhost:5001/dashboard.html`
   - Open Browser DevTools → Network tab
   - Open Browser DevTools → Console tab

3. **Click "Connect Gmail"**:
   - **Expected Network Activity**:
     - `GET /api/gmail/connect?returnTo=/dashboard.html` → Status 200
     - Response: `{ ok: true, authUrl: "https://accounts.google.com/..." }`
   - **Expected Console Logs**:
     ```
     [dashboard] connectGmail clicked - initiating OAuth flow
     [gmail/connect] Endpoint hit: { method: 'GET', url: '...', has_auth_header: true }
     [gmail/connect] User authenticated: <user-id>
     [gmail/connect] Generated OAuth URL: { user_id: ..., redirect_uri: ... }
     [dashboard] Received authUrl, redirecting to Google OAuth
     ```
   - **Expected**: Browser redirects to Google OAuth consent screen

4. **Authorize with Google**:
   - Select Gmail account
   - Click "Allow"
   - **Expected**: Redirects to `/api/gmail/callback?code=...&state=...`

5. **Callback Processing**:
   - **Expected Server Logs**:
     ```
     [gmail/callback] Processing callback: { user_id: ..., has_code: true }
     [gmail/callback] Token exchange successful
     [gmail/callback] User email fetched: your-email@gmail.com
     [gmail/callback] Email account upserted successfully
     ```
   - **Expected**: Redirects to `/dashboard.html?gmail=connected`

6. **Dashboard Updates**:
   - **Expected Console**: `[dashboard] Gmail connected successfully!`
   - **Expected UI**: Toast notification + button changes to "Sync Inbox"

## Success Indicators

✅ **Connection Success**:
- No 404 errors
- OAuth URL generated successfully
- Redirects to Google OAuth
- Callback processes tokens
- Database record created with `status='connected'`
- Button updates to "Sync Inbox"

✅ **Error Handling**:
- Missing env vars → Clear error message
- Invalid token → 401 with error
- OAuth errors → Redirected with error in URL
- All errors logged server-side

## Debugging

If you see 404:
- Check server logs for `[dev-server] API request:` - should show pathname
- Verify route is registered: `[dev-server] Routing to /api/gmail/connect`
- Check for import errors in logs

If you see "Missing env var":
- Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`
- Restart server after adding env vars

If OAuth redirect fails:
- Verify redirect URI in Google Console matches exactly: `http://localhost:5001/api/gmail/callback`
- Check `APP_URL` env var matches your local URL

## Files Modified
- `api/gmail/connect.js` - Returns JSON with authUrl
- `dashboard.js` - Uses fetch() instead of direct navigation
- `dev-server.mjs` - Added debug logging and error handling

