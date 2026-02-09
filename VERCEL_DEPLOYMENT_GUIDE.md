# Deploy MoviesDrive Stremio Addon to Vercel

This guide will help you deploy the addon to Vercel so it works on all devices (Web, Desktop, Android Mobile, Android TV) with 2-hour caching.

## Prerequisites

1. **GitHub Account** - https://github.com
2. **Vercel Account** - https://vercel.com (can sign up with GitHub)
3. **Git installed** on your computer

## Step 1: Prepare Your Repository

### 1.1 Initialize Git Repository
```bash
cd moviesdrive-stremio
git init
```

### 1.2 Create .gitignore
```bash
cat > .gitignore << 'EOF'
node_modules/
.env
.env.local
.DS_Store
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.vscode/
.idea/
*.swp
*.swo
*~
.cache/
cache/
temp/
tmp/
coverage/
.nyc_output/
.turbo/
.next/
out/
dist/
build/
EOF
```

### 1.3 Add all files and commit
```bash
git add .
git commit -m "Initial commit - MoviesDrive Stremio Addon"
```

## Step 2: Create GitHub Repository

### Option A: Using GitHub CLI (if installed)
```bash
gh repo create moviesdrive-stremio --public --source=. --remote=origin --push
```

### Option B: Using GitHub Website
1. Go to https://github.com/new
2. Repository name: `moviesdrive-stremio`
3. Make it **Public** (required for free Vercel deployment)
4. Click **Create repository**
5. Follow the instructions to push your code:
```bash
git remote add origin https://github.com/YOUR_USERNAME/moviesdrive-stremio.git
git branch -M main
git push -u origin main
```

## Step 3: Deploy to Vercel

### Option A: Using Vercel CLI (Recommended)

1. **Install Vercel CLI**
```bash
npm i -g vercel
```

2. **Login to Vercel**
```bash
vercel login
```

3. **Deploy**
```bash
cd moviesdrive-stremio
vercel
```

4. **Follow the prompts:**
   - Set up and deploy? **Y**
   - Which scope? Select your account
   - Link to existing project? **N** (create new)
   - Project name: `moviesdrive-stremio`
   - Directory: `./` (current directory)

5. **For production deployment:**
```bash
vercel --prod
```

### Option B: Using Vercel Dashboard (Easier)

1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Vercel will auto-detect the configuration from `vercel.json`
4. Click **Deploy**

## Step 4: Configure Environment Variables

After deployment, go to your Vercel project dashboard:

1. Go to **Settings** → **Environment Variables**
2. Add these variables:

| Name | Value |
|------|-------|
| `CACHE_TTL` | `7200` |
| `REQUEST_TIMEOUT` | `15000` |
| `MAX_CONCURRENT_REQUESTS` | `5` |
| `MOVIESDRIVE_API` | `https://new1.moviesdrive.surf` |

3. Click **Save**
4. Redeploy: Go to **Deployments** → Click **...** on latest → **Redeploy**

## Step 5: Get Your Addon URL

After successful deployment, Vercel will give you a URL like:
```
https://moviesdrive-stremio.vercel.app
```

Your Stremio manifest URL will be:
```
https://moviesdrive-stremio.vercel.app/manifest.json
```

## Step 6: Test on All Platforms

### Web Browser
1. Open: `https://moviesdrive-stremio.vercel.app/health`
2. Should show: `{"status":"ok","addon":"MoviesDrive",...}`

### Desktop Stremio
1. Open Stremio
2. Addons → Install Addon
3. Enter: `https://moviesdrive-stremio.vercel.app/manifest.json`

### Android Mobile
1. Open Stremio app
2. Go to Addons
3. Add: `https://moviesdrive-stremio.vercel.app/manifest.json`

### Android TV
1. Open Stremio
2. Settings → Addons → Install from URL
3. Enter: `https://moviesdrive-stremio.vercel.app/manifest.json`

## Features of This Deployment

✅ **Works on all platforms** - Web, Desktop, Android Mobile, Android TV
✅ **2-hour cache** - CACHE_TTL=7200 seconds
✅ **CORS enabled** - Cross-origin requests allowed
✅ **Auto-scaling** - Vercel handles traffic automatically
✅ **HTTPS by default** - Secure connections
✅ **Global CDN** - Fast loading worldwide

## Custom Domain (Optional)

If you want a custom domain:

1. Go to Vercel Dashboard → Your Project → Settings → Domains
2. Add your domain (e.g., `stremio.mydomain.com`)
3. Follow DNS configuration instructions

## Updating Your Addon

When you make changes:

```bash
git add .
git commit -m "Your changes"
git push origin main
```

Vercel will automatically redeploy!

## Troubleshooting

### Build Fails
Check the build logs in Vercel dashboard. Common issues:
- Missing dependencies: Make sure `package.json` is correct
- Node version: Vercel uses Node 18+ by default

### Addon Not Working
1. Check `/health` endpoint
2. Verify environment variables are set
3. Check Vercel function logs

### CORS Errors
The `vercel.json` already includes CORS headers. If issues persist:
1. Check browser console for exact error
2. Verify headers in Vercel dashboard logs

## Free Tier Limits

Vercel free tier includes:
- 100GB bandwidth/month
- 1000 build minutes/month
- 125,000 function invocations/day
- 10 second function timeout

For a Stremio addon, this is usually plenty!

## Need Help?

- Vercel Docs: https://vercel.com/docs
- Stremio Addon Docs: https://github.com/Stremio/stremio-addon-sdk
- GitHub Issues: Create an issue in your repository

---

**Your addon will be live and accessible from anywhere in the world! 🌍**
