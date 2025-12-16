# CloseLogic Supabase Deployment Checklist

## How to Deploy Schema to Supabase

### Prerequisites
1. Create a Supabase project at https://supabase.com
2. Note your project URL and anon/public key
3. Install Supabase CLI (optional but recommended):
   ```bash
   npm install -g supabase
   ```

### Step 1: Access Supabase SQL Editor
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**

### Step 2: Run Schema SQL
1. Open `supabase_schema.sql` file
2. Copy the entire contents
3. Paste into the SQL Editor
4. Click **Run** (or press Cmd/Ctrl + Enter)
5. Verify all tables are created successfully

### Step 3: Verify Tables
1. Go to **Table Editor** in Supabase dashboard
2. Confirm these tables exist:
   - `profiles`
   - `email_accounts`
   - `leads`
   - `messages`
   - `lead_scores`
   - `action_items`
   - `feedback`

### Step 4: Verify RLS Policies
1. Go to **Authentication** > **Policies** (or check each table's RLS settings)
2. Confirm RLS is enabled on all tables
3. Verify dev-friendly policies are active (allow all for now)

### Step 5: Check Seed Data
1. Go to **Table Editor** > `profiles`
2. Verify test profile exists: `test@closelogic.com`
3. Check that test leads and messages were inserted

### Step 6: Update Environment Variables
Create a `.env` file in your project root:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

---

## How to Test Endpoints Locally

### Option 1: Using Supabase Client Library (Recommended)

1. **Install Supabase JS client:**
   ```bash
   npm install @supabase/supabase-js
   ```

2. **Create Supabase client:**
   ```typescript
   // lib/supabase.ts
   import { createClient } from '@supabase/supabase-js';
   
   const supabaseUrl = process.env.SUPABASE_URL!;
   const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;
   
   export const supabase = createClient(supabaseUrl, supabaseAnonKey);
   ```

3. **Update API routes to use Supabase:**
   - Replace placeholder queries in `api/*.ts` files
   - Use Supabase client to query tables
   - Example:
     ```typescript
     const { data, error } = await supabase
       .from('leads')
       .select('*')
       .eq('user_id', userId);
     ```

### Option 2: Using Next.js API Routes

1. **Create API route files:**
   ```
   pages/api/profile.ts
   pages/api/leads.ts
   pages/api/leads/[id].ts
   pages/api/sync.ts
   pages/api/score-lead.ts
   pages/api/generate-reply.ts
   pages/api/feedback.ts
   ```

2. **Implement handlers:**
   - Copy logic from `api/*.ts` files
   - Add Supabase client calls
   - Handle errors appropriately

3. **Test endpoints:**
   ```bash
   # Start dev server
   npm run dev
   
   # Test GET /api/profile
   curl "http://localhost:3000/api/profile?user_id=00000000-0000-0000-0000-000000000001"
   
   # Test GET /api/leads
   curl "http://localhost:3000/api/leads?user_id=00000000-0000-0000-0000-000000000001"
   ```

### Option 3: Using Express Server

1. **Create Express server:**
   ```bash
   npm install express cors dotenv
   ```

2. **Create `server.js`:**
   ```javascript
   const express = require('express');
   const cors = require('cors');
   require('dotenv').config();
   
   const app = express();
   app.use(cors());
   app.use(express.json());
   
   // Import route handlers
   // app.get('/api/profile', ...)
   // app.get('/api/leads', ...)
   // etc.
   
   app.listen(3001, () => {
     console.log('Server running on http://localhost:3001');
   });
   ```

3. **Test endpoints:**
   ```bash
   node server.js
   curl "http://localhost:3001/api/profile?user_id=00000000-0000-0000-0000-000000000001"
   ```

### Testing Checklist

- [ ] GET /api/profile returns user profile
- [ ] POST /api/profile updates/creates profile
- [ ] GET /api/leads returns list of leads
- [ ] GET /api/leads/[id] returns lead details with messages
- [ ] POST /api/sync triggers sync (or inserts sample data)
- [ ] POST /api/score-lead calculates and saves score
- [ ] POST /api/generate-reply generates reply text
- [ ] POST /api/feedback saves feedback

### Frontend Integration

1. **Update dashboard.js:**
   - API calls are already structured
   - Ensure `API_BASE_URL` matches your backend
   - Test with real user_id from Supabase

2. **Test dashboard:**
   - Open `dashboard.html` in browser
   - Check browser console for API calls
   - Verify leads load correctly
   - Test filtering and search
   - Test reply generation

---

## Next Steps After Deployment

1. **Replace dev RLS policies** with auth-based policies:
   ```sql
   -- Example for leads table
   CREATE POLICY "Users can view own leads" ON leads
     FOR SELECT USING (auth.uid() = user_id);
   ```

2. **Implement Supabase Auth:**
   - Set up email/password or OAuth
   - Replace `user_id` parameter with `auth.uid()`

3. **Implement Gmail OAuth:**
   - Set up Google OAuth credentials
   - Store tokens securely
   - Implement sync logic

4. **Implement Stripe:**
   - Add Stripe webhook handlers
   - Update `profiles.plan` based on subscriptions
   - Add billing endpoints

5. **Add error handling:**
   - Implement proper error responses
   - Add logging
   - Add monitoring

