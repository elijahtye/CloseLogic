# CloseLogic Deployment Guide

Step-by-step instructions to deploy CloseLogic to GitHub and Vercel.

## Part 1: Deploy to GitHub

### Step 1: Initialize Git Repository

Open terminal in your project directory:

```bash
cd /Users/elijahtye/CloseLogic

# Initialize git (if not already done)
git init

# Check status
git status
```

### Step 2: Create .gitignore (Already Created)

The `.gitignore` file is already created and will exclude:
- `node_modules/`
- `.env` files
- OS files (`.DS_Store`, etc.)
- Build outputs

### Step 3: Stage and Commit Files

```bash
# Add all files
git add .

# Commit
git commit -m "Initial commit: CloseLogic CRM with OpenAI integration"
```

### Step 4: Create GitHub Repository

1. Go to [GitHub.com](https://github.com)
2. Click **"New repository"** (or the **+** icon)
3. Repository name: `CloseLogic` (or your choice)
4. Description: "Real Estate CRM with AI-powered lead analysis"
5. Visibility: **Private** (recommended) or **Public**
6. **DO NOT** initialize with README, .gitignore, or license (we already have these)
7. Click **"Create repository"**

### Step 5: Push to GitHub

```bash
# Add remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/CloseLogic.git

# Rename branch to main (if needed)
git branch -M main

# Push to GitHub
git push -u origin main
```

You may be prompted for GitHub credentials. Use a Personal Access Token if 2FA is enabled.

## Part 2: Deploy to Vercel

### Step 1: Sign Up for Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click **"Sign Up"**
3. Sign up with GitHub (recommended for easy integration)

### Step 2: Import Project

1. In Vercel Dashboard, click **"Add New Project"**
2. Click **"Import Git Repository"**
3. Find and select your `CloseLogic` repository
4. Click **"Import"**

### Step 3: Configure Project Settings

**Framework Preset:** Other  
**Root Directory:** `./` (leave as default)  
**Build Command:** (leave empty)  
**Output Directory:** (leave empty)  
**Install Command:** `npm install` (or leave empty)

### Step 4: Add Environment Variables

Click **"Environment Variables"** and add:

#### Required Variables:

1. **SUPABASE_URL**
   - Value: `https://your-project-ref.supabase.co`
   - Environments: Production, Preview, Development

2. **SUPABASE_ANON_KEY**
   - Value: Your Supabase anon/public key
   - Environments: Production, Preview, Development

3. **SUPABASE_SERVICE_ROLE_KEY**
   - Value: Your Supabase **service_role** key (NOT anon key!)
   - Environments: Production, Preview, Development
   - ⚠️ **Keep this secret** - never expose to client

4. **OPENAI_API_KEY**
   - Value: `sk-...` (your OpenAI API key)
   - Environments: Production, Preview, Development

5. **OPENAI_MODEL** (Optional)
   - Value: `gpt-4o-mini` (or your preferred model)
   - Environments: Production, Preview, Development

### Step 5: Deploy

1. Click **"Deploy"**
2. Wait for deployment to complete (usually 1-2 minutes)
3. Vercel will provide a URL like: `https://closelogic-xxxxx.vercel.app`

### Step 6: Update Supabase Redirect URLs

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **Authentication** > **URL Configuration**
4. Add to **Redirect URLs**:
   ```
   https://your-app.vercel.app/dashboard.html
   https://your-app.vercel.app/auth.html
   ```
5. Also add for preview deployments (optional):
   ```
   https://*.vercel.app/dashboard.html
   https://*.vercel.app/auth.html
   ```

### Step 7: Update Frontend Config

**Option A: Update config.js** (Quick but not ideal for production)

Edit `config.js` with your Supabase credentials and commit:

```javascript
window.SUPABASE_CONFIG = {
    url: 'https://your-project.supabase.co',
    anonKey: 'your-anon-key-here'
};
```

Then push to GitHub - Vercel will auto-deploy.

**Option B: Use Environment Variables** (Recommended for production)

Create a small API endpoint `/api/config.js` that returns config from environment variables, or inject them at build time.

## Part 3: Verify Deployment

### Test Checklist

1. ✅ **Visit your Vercel URL**: `https://your-app.vercel.app`
2. ✅ **Test Authentication**: Click "Continue with Google"
3. ✅ **Complete Onboarding**: Fill out onboarding form
4. ✅ **View Dashboard**: Should load with KPIs and charts
5. ✅ **Test Message Creation**: Use `/api/messages` endpoint
6. ✅ **Verify Auto-Analysis**: Check that analysis runs automatically
7. ✅ **Check Logs**: Vercel Dashboard > Your Project > Functions > Logs

### Common Issues

**Issue: "Supabase configuration missing"**
- Solution: Update `config.js` with your Supabase URL and anon key

**Issue: "Unauthorized" errors**
- Solution: Check Supabase redirect URLs include your Vercel domain

**Issue: API functions return 500**
- Solution: Check Vercel function logs, verify environment variables are set

**Issue: Analysis not running**
- Solution: Check OpenAI API key is valid, verify `SUPABASE_SERVICE_ROLE_KEY` is correct

## Part 4: Custom Domain (Optional)

1. In Vercel Dashboard, go to your project
2. Click **"Settings"** > **"Domains"**
3. Add your custom domain
4. Follow DNS configuration instructions
5. Update Supabase redirect URLs with your custom domain

## Part 5: Continuous Deployment

Vercel automatically deploys when you push to GitHub:

```bash
# Make changes
git add .
git commit -m "Your changes"
git push

# Vercel will automatically deploy
```

## Monitoring

- **Vercel Dashboard**: View deployments, logs, and analytics
- **Supabase Dashboard**: View database logs and auth logs
- **Browser Console**: Check for frontend errors

## Next Steps

- Set up error tracking (e.g., Sentry)
- Configure custom domain
- Set up staging environment
- Add monitoring and alerts

