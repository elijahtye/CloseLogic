# OpenAI Integration - Phase 0

## Overview

Phase 0 OpenAI integration for CloseLogic that analyzes lead threads and stores results in Supabase.

## Files Created/Modified

### 1. `/api/analyze-lead.js` (NEW)
- Vercel serverless endpoint for lead analysis
- Authenticates requests using Supabase tokens
- Fetches lead data from Supabase
- Calls OpenAI API with structured prompt
- Saves analysis results to `lead_scores` table
- Updates `leads` table with new score and confidence

### 2. `dashboard.html` (MODIFIED)
- Added "Analyze Lead" button in Recommended Actions section
- Added Draft Reply section (hidden by default, shown after analysis)

### 3. `dashboard.js` (MODIFIED)
- Added `analyzeLead()` function to call API
- Added `updateUIWithAnalysis()` to update UI with results
- Added `showToast()` for user feedback
- Wired up Analyze Lead button click handler

### 4. `dashboard.css` (MODIFIED)
- Added styles for draft reply section
- Added toast notification animations

## Environment Variables Required

Set these in Vercel dashboard (Settings > Environment Variables):

```
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ... (service_role key, not anon key)
OPENAI_MODEL=gpt-4o-mini (optional, defaults to gpt-4o-mini)
```

**Important:** 
- `SUPABASE_SERVICE_ROLE_KEY` is the **service_role** key (not anon key)
- Get it from: Supabase Dashboard > Settings > API > service_role key
- Never expose this key to the client

## API Endpoint

### POST `/api/analyze-lead`

**Headers:**
```
Authorization: Bearer <supabase_access_token>
Content-Type: application/json
```

**Body:**
```json
{
  "lead_id": "uuid-of-lead"
}
```

**Response (Success):**
```json
{
  "success": true,
  "analysis": {
    "deal_probability": 87,
    "confidence": "high",
    "reason": "High intent score due to...",
    "recommended_actions": ["Action 1", "Action 2", ...],
    "draft_reply": "Generated reply text..."
  }
}
```

**Response (Error):**
```json
{
  "error": "Error message"
}
```

## How It Works

1. **User clicks "Analyze Lead" button**
   - Button shows loading state
   - Gets Supabase session token

2. **API receives request**
   - Validates Authorization header
   - Verifies token with Supabase
   - Gets authenticated user ID

3. **Fetches data from Supabase**
   - Loads lead by ID (verifies ownership)
   - Fetches last 10 messages
   - Gets user profile (communication_style, primary_goal)

4. **Calls OpenAI**
   - Builds conversation context
   - Sends structured prompt with system instruction
   - Requests JSON-only response
   - Parses and validates response

5. **Saves to Supabase**
   - Inserts row into `lead_scores` table
   - Updates `leads` table:
     - `score` = deal_probability
     - `confidence` = confidence
     - `needs_followup` = true if deal_probability >= 60

6. **Updates UI**
   - Deal probability bar
   - Recommended actions list
   - Draft reply section (with copy button)
   - Success toast notification

## OpenAI Prompt Structure

The system prompt instructs OpenAI to:
- Analyze real estate lead engagement
- Output ONLY valid JSON (no markdown)
- Provide deal_probability (0-100)
- Provide confidence (low/medium/high)
- Provide short reason (<= 200 chars)
- Provide 3-6 recommended actions
- Generate draft reply in user's communication style (<= 600 chars)

## Security

- ✅ Authentication required (Supabase token)
- ✅ Ownership verification (lead must belong to user)
- ✅ Server-side only (API keys never exposed)
- ✅ RLS policies enforced (service role bypasses for writes, but ownership verified)

## Testing

1. **Set environment variables in Vercel**
2. **Deploy to Vercel** (or test locally with Vercel CLI)
3. **Sign in to dashboard**
4. **Select a lead**
5. **Click "Analyze Lead" button**
6. **Check console logs** for debugging
7. **Verify results** appear in UI and Supabase

## Debugging

- Check Vercel function logs for API errors
- Check browser console for frontend errors
- Verify environment variables are set correctly
- Ensure Supabase RLS allows service role to write
- Check OpenAI API key is valid and has credits

## Next Steps (Future Phases)

- Batch analysis for multiple leads
- Scheduled automatic analysis
- Analysis history tracking
- Custom prompt templates
- A/B testing different models

