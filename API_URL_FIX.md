# API URL Configuration Fix

## Problem Fixed
- **Issue**: Gmail connect failing with "Could not connect to the server" and "Load failed"
- **Root Cause**: Hardcoded relative URLs (`/api/...`) that don't work when frontend and API are on different origins

## Solution

### 1. Centralized API Base URL Configuration
- **File**: `dashboard.js`
- **Config**: `API_CONFIG.baseUrl` defaults to `window.location.origin`
- **Override**: Can be set via `window.API_BASE_URL` before loading dashboard.js
- **Logging**: Logs API base URL on load: `[dashboard] API base URL: ...`

### 2. Health Check Endpoint
- **File**: `api/health.js` (new)
- **Route**: `GET /api/health`
- **Response**: `{ ok: true, status: 'healthy', timestamp: ..., server: 'CloseLogic API' }`
- **Purpose**: Preflight check before making API calls

### 3. Preflight Health Check Function
- **File**: `dashboard.js`
- **Function**: `checkApiHealth()`
- **Behavior**:
  - Calls `/api/health` before Gmail connect
  - 5 second timeout
  - Shows user-friendly error if server is down
  - Returns `true`/`false` to indicate health

### 4. Updated All API Calls
All fetch calls now use `${API_CONFIG.baseUrl}/api/...`:
- `/api/gmail/connect` → `${API_CONFIG.baseUrl}/api/gmail/connect`
- `/api/gmail/sync` → `${API_CONFIG.baseUrl}/api/gmail/sync`
- `/api/analyze-lead` → `${API_CONFIG.baseUrl}/api/analyze-lead`
- `/api/messages` → `${API_CONFIG.baseUrl}/api/messages`

### 5. Safe Console Logging
All API calls log:
- `[dashboard] API base URL: ...`
- `[dashboard] Calling [endpoint]: [full URL]`
- `[dashboard] Checking API health: [full URL]`

## How It Works

### Default Behavior (Same Origin)
When frontend and API are on the same origin (e.g., `http://localhost:5001`):
- `API_CONFIG.baseUrl = window.location.origin` (automatic)
- All API calls work seamlessly
- No configuration needed

### Custom API Server
If API runs on a different origin:
```html
<script>
  window.API_BASE_URL = 'http://localhost:5001';
</script>
<script src="dashboard.js"></script>
```

### Health Check Flow
1. User clicks "Connect Gmail"
2. `checkApiHealth()` runs first
3. If healthy → proceed with OAuth flow
4. If unhealthy → show error, don't proceed

## Testing

### Test Health Endpoint:
```bash
curl http://localhost:5001/api/health
```

Expected response:
```json
{
  "ok": true,
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "server": "CloseLogic API"
}
```

### Test Gmail Connect:
1. Start server: `npm run dev:local`
2. Open: `http://localhost:5001/dashboard.html`
3. Open browser console
4. Click "Connect Gmail"
5. **Expected logs**:
   ```
   [dashboard] API base URL: http://localhost:5001
   [dashboard] connectGmail clicked - initiating OAuth flow
   [dashboard] Using API base URL: http://localhost:5001
   [dashboard] Checking API health: http://localhost:5001/api/health
   [dashboard] API health check passed
   [dashboard] Calling Gmail connect endpoint: http://localhost:5001/api/gmail/connect?returnTo=...
   ```

### Test Server Down Scenario:
1. Stop the server
2. Click "Connect Gmail"
3. **Expected**: Error toast: "API server is not responding. Please ensure the server is running."

## Files Modified

- `dashboard.js` - Added API_CONFIG, health check, updated all fetch calls
- `api/health.js` - New health check endpoint
- `dev-server.mjs` - Registered `/api/health` route
- `README.md` - Updated dev instructions

## Benefits

✅ **No hardcoded ports** - Uses `window.location.origin` by default  
✅ **Works in production** - Automatically uses production origin  
✅ **Clear error messages** - Users know when server is down  
✅ **Preflight checks** - Fail fast before making actual API calls  
✅ **Easy override** - Can set custom API URL if needed  
✅ **Safe logging** - No secrets exposed in console  

