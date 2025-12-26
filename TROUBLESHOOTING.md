# Troubleshooting Gmail Connect on localhost:5001

## Quick Checks

### 1. Is the server running?

```bash
# Check if port 5001 is in use
lsof -ti:5001

# If not running, start it:
npm run dev:local
# OR
PORT=5001 node dev-server.mjs
```

### 2. Test the endpoints directly

```bash
# Health check (should return {"ok":true})
curl http://localhost:5001/api/health

# Connect endpoint (will fail auth, but should return JSON error, not 404)
curl -X POST http://localhost:5001/api/connect-gmail \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test"
```

Expected response: `{"success":false,"error":"..."}` (not 404)

### 3. Check browser console

Open `http://localhost:5001/dashboard.html` and check the browser console for:
- `[dashboard] API base URL: http://localhost:5001`
- Any CORS errors
- Any network errors

### 4. Verify environment variables

Make sure `.env.local` exists and has:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### 5. Common Issues

**Issue: "Failed to connect to server"**
- Solution: Make sure `dev-server.mjs` is running on port 5001
- Check: `lsof -ti:5001` should return a process ID

**Issue: CORS errors in browser**
- Solution: The server sets CORS headers, but make sure you're accessing from `http://localhost:5001`
- Check: Browser console for CORS error messages

**Issue: "Not found" (404)**
- Solution: Make sure the route is registered in `dev-server.mjs`
- Check: Server logs should show `[dev-server] API request: { method: 'POST', pathname: '/api/connect-gmail' }`

**Issue: "Missing env var: GOOGLE_CLIENT_ID"**
- Solution: Restart the server after adding env vars to `.env.local`
- Check: Server logs should show `[dev-server] Loaded .env.local`

### 6. Restart the server

If you made changes to `.env.local` or code:

```bash
# Kill existing server
lsof -ti:5001 | xargs kill -9

# Start fresh
npm run dev:local
```

### 7. Test the full flow

1. Open `http://localhost:5001/dashboard.html` in browser
2. Open browser DevTools → Console tab
3. Click "Connect Gmail"
4. Check console logs:
   - Should see: `[dashboard] Calling Gmail connect endpoint: http://localhost:5001/api/connect-gmail`
   - Should see: Response from server (success or error)
   - Should NOT see: "Failed to connect" or "Not found"

### 8. Debug server logs

Watch server logs while testing:
```bash
# In terminal running dev-server.mjs, you should see:
[dev-server] API request: { method: 'POST', pathname: '/api/connect-gmail' }
[connect-gmail] Endpoint hit
[connect-gmail] User authenticated: <user-id>
[gmail-oauth] Built OAuth URL: ...
```

If you don't see these logs, the request isn't reaching the server.

