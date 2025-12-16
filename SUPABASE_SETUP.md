# Supabase Google OAuth Setup Guide

## Quick Setup

### 1. Get Your Supabase Credentials

1. Go to your Supabase project dashboard: https://app.supabase.com
2. Navigate to **Settings** > **API**
3. Copy your:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)

### 2. Configure Environment Variables

Edit `config.js` and set your Supabase credentials:

```javascript
const SUPABASE_CONFIG = {
    url: 'https://your-project.supabase.co',  // Replace with your Project URL
    anonKey: 'your-anon-key-here'             // Replace with your anon key
};
```

**OR** set them as global variables before loading config.js:

```html
<script>
    window.SUPABASE_URL = 'https://your-project.supabase.co';
    window.SUPABASE_ANON_KEY = 'your-anon-key-here';
</script>
<script src="config.js"></script>
```

### 3. Enable Google OAuth in Supabase

1. Go to **Authentication** > **Providers** in your Supabase dashboard
2. Find **Google** and click to enable it
3. You'll need to:
   - Create a Google OAuth app in Google Cloud Console
   - Add your OAuth credentials to Supabase
   - Set authorized redirect URIs

### 4. Configure Redirect URLs

In your Supabase project:
1. Go to **Authentication** > **URL Configuration**
2. Add to **Redirect URLs**:
   - `http://localhost:5000/dashboard.html` (for local dev)
   - `https://yourdomain.com/dashboard.html` (for production)

## How It Works

1. User clicks "Continue with Google" button
2. Supabase redirects to Google OAuth
3. User authorizes with Google
4. Google redirects back to your app with auth tokens
5. Supabase creates/updates user session
6. User is redirected to `/dashboard.html`
7. Dashboard checks for session and allows access

## Testing

1. Open `auth.html` in your browser
2. Click "Continue with Google"
3. Complete Google OAuth flow
4. You should be redirected to `dashboard.html`
5. Dashboard should load successfully

## Troubleshooting

- **"Supabase configuration missing"**: Check that `config.js` has valid URL and anon key
- **"Authentication failed"**: Verify Google OAuth is enabled in Supabase and redirect URLs are configured
- **Redirect loop**: Ensure redirect URL matches exactly what's configured in Supabase
- **Session not persisting**: Check browser console for errors, verify Supabase client initialization

