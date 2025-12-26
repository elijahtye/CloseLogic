# Gmail OAuth Testing Guide

## Prerequisites

1. **Run Database Migration**
   - Go to Supabase Dashboard → SQL Editor
   - Copy/paste contents of `supabase/migrations/20240102000001_add_gmail_token_columns.sql`
   - Click "Run"
   - Verify columns exist: `refresh_token`, `access_token`, `token_expires_at`, `scope`, `connected_at`

2. **Set Environment Variables**
   Create `.env.local` or set in Vercel:
   ```
   GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   APP_URL=http://localhost:5001
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

3. **Configure Google OAuth**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create OAuth 2.0 credentials
   - Add authorized redirect URI: `http://localhost:5001/api/gmail/callback`
   - Copy Client ID and Client Secret

## Step-by-Step Testing

### Step 1: Start Local Server
```bash
npm run dev:local
```
Expected: Server starts on `http://localhost:5001`

### Step 2: Open Dashboard
1. Navigate to `http://localhost:5001/dashboard.html`
2. Login if needed
3. Open Browser DevTools → Network tab
4. Open Browser DevTools → Console tab

### Step 3: Click "Connect Gmail"
1. Click the "Connect Gmail" button in top-right
2. **Expected Network Activity:**
   - `GET /api/gmail/connect?returnTo=/dashboard.html&token=...` → Status 302
   - Redirect to `https://accounts.google.com/o/oauth2/v2/auth?...`
3. **Expected Console Logs:**
   ```
   [dashboard] Initiating Gmail OAuth flow
   [gmail/connect] User authenticated: <user-id>
   [gmail/connect] Redirecting to Google OAuth: { user_id: ..., redirect_uri: ... }
   ```

### Step 4: Authorize with Google
1. You'll be redirected to Google OAuth consent screen
2. Select your Gmail account
3. Click "Allow" to grant permissions
4. **Expected:** Redirect back to `http://localhost:5001/api/gmail/callback?code=...&state=...`

### Step 5: OAuth Callback Processing
**Expected Network Activity:**
- `GET /api/gmail/callback?code=...&state=...` → Status 302
- Redirect to `/dashboard.html?gmail=connected`

**Expected Server Logs (Terminal):**
```
[gmail/callback] Processing callback: { user_id: ..., return_to: ..., has_code: true }
[gmail/callback] Exchanging code for tokens
[gmail/callback] Token exchange successful: { has_access_token: true, has_refresh_token: true, ... }
[gmail/callback] User email fetched: your-email@gmail.com
[gmail/callback] Upserting email account: { user_id: ..., email_address: ..., has_access_token: true, has_refresh_token: true }
[gmail/callback] Email account upserted successfully: { account_id: ..., email_address: ..., status: 'connected' }
[gmail/callback] OAuth flow completed successfully
```

**Expected Console Logs (Browser):**
```
[dashboard] Gmail connected successfully!
```

**Expected UI:**
- Toast notification: "Gmail connected successfully!"
- Button changes from "Connect Gmail" to "Sync Inbox"
- Button icon changes to sync icon

### Step 6: Verify Database
Run in Supabase SQL Editor:
```sql
SELECT 
    id, 
    user_id, 
    provider, 
    status, 
    email_address, 
    connected_at,
    token_expires_at,
    scope,
    CASE WHEN access_token IS NOT NULL THEN 'YES' ELSE 'NO' END as has_access_token,
    CASE WHEN refresh_token IS NOT NULL THEN 'YES' ELSE 'NO' END as has_refresh_token
FROM email_accounts
WHERE provider = 'gmail'
ORDER BY connected_at DESC
LIMIT 1;
```

**Expected:**
- `status` = 'connected'
- `email_address` = your Gmail address
- `has_access_token` = 'YES'
- `has_refresh_token` = 'YES'
- `connected_at` = recent timestamp
- `token_expires_at` = future timestamp
- `scope` contains 'gmail.readonly'

### Step 7: Test Sync Inbox
1. Click "Sync Inbox" button
2. **Expected Network Activity:**
   - `POST /api/gmail/sync` → Status 200
   - Response: `{ success: true, ok: true, message: "Connected. Sync stub running.", ... }`
3. **Expected Console Logs:**
   ```
   [dashboard] Syncing inbox from Gmail
   [gmail/sync] User authenticated: <user-id>
   [gmail/sync] Gmail connection verified: { user_id: ..., email_address: ..., connected_at: ... }
   [gmail/sync] Sync stub completed successfully
   ```
4. **Expected UI:**
   - Toast: "Inbox synced successfully!"
   - Button shows "Syncing..." then returns to "Sync Inbox"

## Error Scenarios

### Error: "Missing env var: GOOGLE_CLIENT_ID"
**Cause:** Environment variable not set
**Fix:** Add `GOOGLE_CLIENT_ID` to `.env.local`

### Error: "Token exchange failed: 400"
**Cause:** Invalid redirect URI or expired code
**Fix:** 
- Verify redirect URI in Google Console matches exactly: `http://localhost:5001/api/gmail/callback`
- Try connecting again (codes expire quickly)

### Error: "Failed to fetch user email"
**Cause:** Access token invalid or insufficient permissions
**Fix:** Check that scope includes `https://www.googleapis.com/auth/gmail.readonly`

### Error: "Gmail is not connected"
**Cause:** Trying to sync before connecting
**Fix:** Click "Connect Gmail" first

## Success Indicators

✅ **Connection Success:**
- Button changes to "Sync Inbox"
- Database record shows `status='connected'`
- Tokens stored in database (server-side only)
- No tokens visible in browser console/network

✅ **Sync Success:**
- Returns `{ success: true, ok: true }`
- `last_sync_at` timestamp updated
- No errors in console

## Security Verification

1. **Tokens Not Exposed:**
   - Check Network tab: No `access_token` or `refresh_token` in responses
   - Check Console: No token values logged
   - Check Database: Tokens only accessible via SERVICE_ROLE_KEY

2. **RLS Protection:**
   - Client queries to `email_accounts` should NOT return token columns
   - Only `status`, `email_address`, `connected_at` visible to client

## Troubleshooting

**Issue: 500 Internal Server Error**
- Check server logs (terminal) for exact error
- Verify all env vars are set
- Check Supabase connection

**Issue: Redirect loop**
- Check `APP_URL` matches your local URL
- Verify redirect URI in Google Console

**Issue: "Invalid state"**
- State expires after 10 minutes
- Try connecting again

**Issue: Button doesn't change**
- Check browser console for errors
- Verify `checkGmailConnectionStatus()` runs
- Check database record exists with `status='connected'`

