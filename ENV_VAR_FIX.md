# Environment Variable Loading Fix

## Problem Fixed
- **Issue**: Gmail connect endpoint returned 500 error: "Missing env var: GOOGLE_CLIENT_ID" even though it existed in `.env.local`
- **Root Cause**: Environment variables were loaded AFTER API handlers were imported, so handlers couldn't access them

## Solution

### 1. Moved Environment Loading to Top of File
- **File**: `dev-server.mjs`
- **Change**: Environment variables are now loaded BEFORE any imports
- **Priority**: `.env.local` loads first, then `.env` as fallback
- **Logging**: Added `[dev-server] Loaded .env.local` confirmation message

### 2. Added Safe Debug Logging
- **File**: `api/gmail/connect.js`
- **Change**: Added boolean-only logging (no secrets exposed)
- **Logs**: 
  ```javascript
  console.log('[gmail/connect] env present', {
    hasClientId: !!clientId,
    hasSecret: !!clientSecret,
    hasRedirect: !!redirectUri,
    hasAppUrl: !!process.env.APP_URL,
    hasVercelUrl: !!process.env.VERCEL_URL
  });
  ```

### 3. Updated Documentation
- **File**: `README.md`
- **Change**: Added clear instruction: "After setting/changing .env.local, restart the local server"

## How It Works

1. **Server Startup** (`dev-server.mjs`):
   - Loads `.env.local` first (highest priority)
   - Falls back to `.env` for any missing vars
   - Sets `process.env[key]` for each variable
   - Logs: `[dev-server] Loaded .env.local`

2. **API Handler** (`api/gmail/connect.js`):
   - Reads from `process.env.GOOGLE_CLIENT_ID`
   - Reads from `process.env.GOOGLE_CLIENT_SECRET`
   - Reads from `process.env.GOOGLE_REDIRECT_URI` (optional)
   - Logs boolean presence checks (no secrets)

## Testing

### Verify Environment Loading:
```bash
# Start server
npm run dev:local

# Check logs - should see:
[dev-server] Loaded .env.local

# Test endpoint (will fail auth but should NOT fail on missing env vars)
curl "http://localhost:5001/api/gmail/connect?returnTo=/dashboard.html" \
  -H "Authorization: Bearer test"

# Should see in logs:
[gmail/connect] env present { hasClientId: true, hasSecret: true, ... }
```

### Expected Behavior:
- ✅ No "Missing env var" errors
- ✅ `hasClientId: true` in logs
- ✅ `hasSecret: true` in logs
- ✅ Endpoint responds (may fail auth, but not env vars)

## Important Notes

1. **Restart Required**: After changing `.env.local`, you MUST restart the server:
   ```bash
   npm run dev:restart
   ```

2. **No Secrets in Logs**: All debug logging uses booleans only - never prints actual client IDs or secrets

3. **Priority Order**:
   - System environment variables (highest)
   - `.env.local` (loaded first)
   - `.env` (fallback)

## Files Modified

- `dev-server.mjs` - Moved env loading to top, before imports
- `api/gmail/connect.js` - Added safe debug logging
- `README.md` - Added restart instruction

## Verification

Run this to verify env vars are loaded:
```bash
node -e "import('./dev-server.mjs').then(() => console.log('GOOGLE_CLIENT_ID:', !!process.env.GOOGLE_CLIENT_ID))"
```

Expected output:
```
[dev-server] Loaded .env.local
GOOGLE_CLIENT_ID: true
```

