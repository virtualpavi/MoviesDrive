# 🚀 Quick Start - Cloudflare Deployment

## Super Simple: Push Code → Cloudflare Deploys

### Step 1: Push to GitHub (1 minute)

```bash
cd your-project-folder
git add .
git commit -m "Deploy to Cloudflare"
git push origin main
```

### Step 2: Connect in Cloudflare (2 minutes)

1. Open: https://dash.cloudflare.com/
2. Click: **Workers & Pages** (left sidebar)
3. Click: **Create application** → **Pages** → **Connect to Git**
4. Select: Your GitHub repository
5. Configure:
   - Project name: `moviesdrive-addon`
   - Build command: `npm install`
6. Click: **Save and Deploy**

### Step 3: Done! ✨

Your app is now live at: `https://moviesdrive-addon.pages.dev`

Every time you push to GitHub, Cloudflare automatically redeploys!

---

## That's It!

```
┌─────────────┐
│  Push Code  │
│  to GitHub  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Cloudflare  │
│   Detects   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Builds &  │
│   Deploys   │
└──────┬──────┘
       │
       ▼
    ✨ LIVE!
```

**No GitHub Actions**  
**No API Tokens**  
**No Secrets**  
**No Configuration**

Just connect once and push anytime! 🎉

---

## View Your Deployments

Go to Cloudflare Dashboard → Workers & Pages → Your Project

You'll see every deployment with:
- Commit message
- Build logs
- Deployment status
- Live URL

---

## Need Help?

See [GITHUB_DEPLOY.md](GITHUB_DEPLOY.md) for more details.
