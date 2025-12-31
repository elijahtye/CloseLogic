# Gmail OAuth Setup Guide for CloseLogic

## Required Environment Variables (Vercel)

Set these in **Vercel Dashboard → Your Project → Settings → Environment Variables**:

### Production Environment:
```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://www.closelogic.net/api/gmail/callback
GMAIL_STATE_SECRET=any-long-random-string-for-security
```

### Preview/Development (optional):
```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5001/api/gmail/callback
GMAIL_STATE_SECRET=any-long-random-string-for-security
```

**Important:** 
- `GOOGLE_REDIRECT_URI` must match **exactly** what you add in Google Cloud Console
- No trailing slashes
- Use `https://` for production, `http://` for local dev

---

## Google Cloud Console Setup

### 1. Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to **APIs & Services** → **Credentials**
4. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
5. If prompted, configure the OAuth consent screen first:
   - User Type: **External** (unless you have a Google Workspace)
   - App name: **CloseLogic**
   - User support email: Your email
   - Developer contact: Your email
   - Click **Save and Continue** through the scopes step
   - Add test users if needed (for testing before verification)
   - Click **Save and Continue** → **Back to Dashboard**

### 2. Create OAuth Client ID

1. Application type: **Web application**
2. Name: **CloseLogic Gmail Integration**
3. **Authorized redirect URIs** - Add these **exact** URLs:

   **Production:**
   ```
   https://www.closelogic.net/api/gmail/callback
   ```

   **Development (optional):**
   ```
   http://localhost:5001/api/gmail/callback
   ```

4. Click **Create**
5. Copy the **Client ID** and **Client Secret**

### 3. Enable Gmail API

1. Go to **APIs & Services** → **Library**
2. Search for **Gmail API**
3. Click **Enable**

---

## Verify Setup

### Check Vercel Environment Variables:
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Verify all 4 variables are set for **Production**
3. Click **Redeploy** if you just added them

### Test Gmail Connect:
1. Sign in to CloseLogic
2. Go to Dashboard
3. Click **Connect Gmail**
4. You should be redirected to Google OAuth consent screen
5. After authorizing, you should be redirected back to CloseLogic dashboard

---

## Troubleshooting

### Error: "redirect_uri_mismatch"
- **Cause:** The redirect URI in your code doesn't match what's registered in Google Cloud Console
- **Fix:** 
  1. Check `GOOGLE_REDIRECT_URI` in Vercel matches exactly what's in Google Cloud Console
  2. Ensure no trailing slashes
  3. Ensure protocol matches (`https://` for production, `http://` for local)
  4. Redeploy Vercel after changing env vars

### Error: "Missing env var: GOOGLE_REDIRECT_URI"
- **Cause:** Environment variable not set in Vercel
- **Fix:** Add `GOOGLE_REDIRECT_URI` to Vercel environment variables and redeploy

### Error: "Invalid client"
- **Cause:** `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is incorrect
- **Fix:** Double-check the values in Vercel match what's in Google Cloud Console

### OAuth flow redirects to wrong URL
- **Cause:** `GOOGLE_REDIRECT_URI` includes wrong path or domain
- **Fix:** Ensure it's exactly `https://www.closelogic.net/api/gmail/callback` (no `/dashboard.html` or other paths)

---

## Security Notes

- **Never commit** `GOOGLE_CLIENT_SECRET` or `GMAIL_STATE_SECRET` to Git
- Use Vercel environment variables for all secrets
- Rotate `GMAIL_STATE_SECRET` periodically
- Keep Google OAuth credentials secure

