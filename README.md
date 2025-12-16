# CloseLogic

A premium analytics-first CRM for real estate agents with AI-powered lead analysis.

## Features

- 🔐 **Supabase Authentication** - Google OAuth sign-in
- 📊 **Analytics Dashboard** - KPI cards, charts, and pipeline visualization
- 🤖 **AI Lead Analysis** - Automatic OpenAI-powered lead scoring
- 📧 **Lead Intelligence** - Deal probability, engagement timeline, recommended actions
- 🎯 **Pipeline Management** - Hot/Warm/Cold lead categorization

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Backend**: Vercel Serverless Functions
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **AI**: OpenAI GPT-4o-mini

## Quick Start

### Prerequisites

- Node.js 18+ installed
- GitHub account
- Vercel account (free tier works)
- Supabase account (free tier works)
- OpenAI API key

### 1. Deploy to GitHub

```bash
# Initialize git repository (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: CloseLogic CRM"

# Create a new repository on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/CloseLogic.git
git branch -M main
git push -u origin main
```

### 2. Configure Supabase

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Create a new project
3. Go to **Settings** > **API**
4. Copy your:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key**
   - **service_role key** (keep this secret!)

4. Run the SQL migrations in order:
   - `supabase_schema.sql` - Creates tables and initial RLS
   - `supabase_rls_production_fix.sql` - Removes seed data, adds FK constraints
   - `supabase_rls_security_patch.sql` - Fixes security gaps
   - `supabase_rls_profiles_hardening.sql` - Final RLS hardening

5. Enable Google OAuth:
   - Go to **Authentication** > **Providers** > **Google**
   - Enable Google provider
   - Add your Google OAuth credentials
   - Add redirect URL: `https://your-vercel-app.vercel.app/dashboard.html`

### 3. Deploy to Vercel

#### Option A: Via Vercel Dashboard (Recommended)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New Project"**
3. Import your GitHub repository
4. Configure project:
   - **Framework Preset**: Other
   - **Root Directory**: `./`
   - **Build Command**: (leave empty)
   - **Output Directory**: (leave empty)

5. **Add Environment Variables**:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   OPENAI_API_KEY=sk-your-openai-key-here
   OPENAI_MODEL=gpt-4o-mini
   ```

6. Click **"Deploy"**

#### Option B: Via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# Follow prompts:
# - Set up and deploy? Yes
# - Which scope? Your account
# - Link to existing project? No
# - Project name? closelogic (or your choice)
# - Directory? ./
# - Override settings? No

# Set environment variables
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add OPENAI_API_KEY
vercel env add OPENAI_MODEL

# Deploy to production
vercel --prod
```

### 4. Update Frontend Config

After deployment, update `config.js` with your Supabase credentials:

```javascript
window.SUPABASE_CONFIG = {
    url: 'https://your-project.supabase.co',
    anonKey: 'your-anon-key-here'
};
```

**Important**: For production, consider using environment variables or a secure config endpoint instead of hardcoding in `config.js`.

### 5. Update Supabase Redirect URLs

In Supabase Dashboard > **Authentication** > **URL Configuration**:

Add your production URL:
- `https://your-app.vercel.app/dashboard.html`
- `https://your-app.vercel.app/auth.html`

## Project Structure

```
CloseLogic/
├── api/                    # Vercel serverless functions
│   ├── analyze-lead.js    # Manual analysis endpoint
│   ├── messages.js        # Message creation + auto-analysis
│   └── lib/
│       └── analyzeLead.js # Shared analysis function
├── *.html                  # Frontend pages
├── *.js                    # Frontend JavaScript
├── *.css                   # Stylesheets
├── config.js               # Supabase config (update with your keys)
└── supabase_*.sql          # Database migrations
```

## Environment Variables

### Required (Vercel)

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service_role key (server-only)
- `OPENAI_API_KEY` - Your OpenAI API key
- `OPENAI_MODEL` - Model to use (default: `gpt-4o-mini`)

### Frontend Config (`config.js`)

- `SUPABASE_CONFIG.url` - Supabase project URL
- `SUPABASE_CONFIG.anonKey` - Supabase anon/public key

## API Endpoints

### POST `/api/messages`
Creates a message and automatically triggers lead analysis.

**Headers:**
```
Authorization: Bearer <supabase_access_token>
Content-Type: application/json
```

**Body:**
```json
{
  "lead_id": "uuid",
  "direction": "inbound" | "outbound",
  "subject": "optional",
  "body": "message text",
  "sent_at": "ISO timestamp (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "message": {...},
  "analysis_triggered": true
}
```

### POST `/api/analyze-lead`
Manually trigger lead analysis (optional).

**Headers:**
```
Authorization: Bearer <supabase_access_token>
Content-Type: application/json
```

**Body:**
```json
{
  "lead_id": "uuid"
}
```

## Development

### Local Development

```bash
# Install dependencies
npm install

# Run with Vercel CLI
vercel dev

# Or use Python HTTP server (for frontend only)
python3 -m http.server 5000
```

### Testing

1. Sign up/login with Google OAuth
2. Complete onboarding flow
3. View dashboard (will show mock data)
4. When messages are created via `/api/messages`, analysis runs automatically
5. Check dashboard for updated scores and recommendations

## Troubleshooting

### Authentication Issues
- Verify `config.js` has correct Supabase URL and anon key
- Check Supabase redirect URLs include your Vercel domain
- Ensure Google OAuth is enabled in Supabase

### API Errors
- Check Vercel function logs in dashboard
- Verify all environment variables are set
- Ensure `SUPABASE_SERVICE_ROLE_KEY` is the service_role key (not anon key)

### Analysis Not Running
- Check Vercel function logs for errors
- Verify OpenAI API key is valid and has credits
- Check Supabase RLS policies allow service role to write

## Security Notes

- ✅ Never commit `config.js` with real keys (use environment variables in production)
- ✅ `SUPABASE_SERVICE_ROLE_KEY` should only be in Vercel environment variables
- ✅ `OPENAI_API_KEY` should only be in Vercel environment variables
- ✅ RLS policies enforce user data isolation

## Support

For issues or questions, check:
- Supabase logs: Dashboard > Logs
- Vercel logs: Dashboard > Your Project > Functions
- Browser console for frontend errors

## License

Proprietary - All rights reserved

