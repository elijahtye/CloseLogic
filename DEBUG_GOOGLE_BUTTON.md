# Debugging Google Sign-In Button

## Quick Checks

1. **Open Browser Console** (F12 or Cmd+Option+I)
2. **Check for errors** when page loads
3. **Click the Google button** and watch console for messages

## Expected Console Messages

When page loads successfully:
```
DOM loaded, initializing auth...
Supabase client initialized successfully
Attached Google OAuth handlers to 2 button(s)
```

When button is clicked:
```
Google sign-in button clicked
handleGoogleSignIn called
Initiating Google OAuth...
Redirect URL: http://localhost:5000/dashboard.html
Supabase URL: https://your-project.supabase.co
OAuth initiated successfully
```

## Common Issues

### Issue 1: "Supabase library not loaded"
**Solution:** Check that the Supabase CDN script is loading:
- Open Network tab in DevTools
- Refresh page
- Look for `@supabase/supabase-js@2` - should show status 200

### Issue 2: "SUPABASE_CONFIG not defined"
**Solution:** Check that `config.js` loads before `auth.js`:
- Verify script order in `<head>`:
  1. Supabase CDN
  2. config.js
  3. (auth.js loads at bottom of body)

### Issue 3: "Supabase configuration missing"
**Solution:** Set your credentials in `config.js`:
```javascript
const SUPABASE_CONFIG = {
    url: 'https://your-project.supabase.co',
    anonKey: 'your-anon-key-here'
};
```

### Issue 4: Button click does nothing
**Check:**
- Open Console, click button
- Should see "Google sign-in button clicked"
- If not, button selector might be wrong

**Test manually in console:**
```javascript
document.querySelectorAll('.google-signin-btn').forEach(btn => {
    console.log('Found button:', btn);
    btn.addEventListener('click', () => console.log('Button clicked!'));
});
```

### Issue 5: OAuth redirect fails
**Check:**
- Redirect URL in Supabase dashboard matches exactly
- Should be: `http://localhost:5000/dashboard.html` (or your domain)
- No trailing slashes

## Manual Test

Test the button directly:
```javascript
// In browser console
const btn = document.querySelector('.google-signin-btn');
if (btn) {
    btn.click();
} else {
    console.error('Button not found!');
}
```

Test Supabase client:
```javascript
// In browser console
console.log('Supabase:', typeof window.supabase);
console.log('Config:', SUPABASE_CONFIG);
console.log('Client:', supabase);
```

