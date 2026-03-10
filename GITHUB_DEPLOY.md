# GitHub to Cloudflare Deployment

## Simple Setup - Cloudflare Watches Your GitHub Repo

Just push your code to GitHub, and Cloudflare automatically deploys it!

### Setup Steps (3 minutes)

#### 1. Push Your Code to GitHub

```bash
git add .
git commit -m "Deploy to Cloudflare"
git push origin main
```

#### 2. Connect GitHub to Cloudflare

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Click **Workers & Pages** in sidebar
3. Click **Create application** → **Pages**
4. Click **Connect to Git**
5. **Authorize** Cloudflare to access your GitHub
6. **Select your repository** from the list

#### 3. Configure Build Settings

Cloudflare will ask for build configuration:

```
Project name: moviesdrive-addon
Production branch: main
Framework preset: None
Build command: npm install
Build output directory: /
Root directory: (leave empty)
```

Click **Save and Deploy**

#### 4. Done! 🎉

Cloudflare deploys your worker automatically. Every push to GitHub = automatic deployment!

Your worker URL: `https://moviesdrive-addon.pages.dev`

---

## How It Works

```
You push code to GitHub
         ↓
Cloudflare detects the push
         ↓
Cloudflare builds & deploys
         ↓
✨ Live on Cloudflare's edge!
```

**No GitHub Actions needed!**  
**No API tokens needed!**  
**No secrets to configure!**

Just connect once and forget about it.

---

## View Deployments

Go to **Cloudflare Dashboard** → **Workers & Pages** → Your Project

You'll see:
- ✅ Every deployment (with commit message)
- 📋 Build logs for each deployment
- 🌍 Live URL
- 📊 Traffic analytics
- 🔄 Rollback to previous versions

---

## Redeploy

Want to redeploy? Just push to GitHub:

```bash
git add .
git commit -m "Update something"
git push
```

Cloudflare automatically builds and deploys!

---

## Troubleshooting

**Can't find my repo when connecting**
- Make sure repo is pushed to GitHub
- Check if repo is public or grant Cloudflare access to private repos

**Build fails**
- Check **Build logs** in Cloudflare Dashboard
- Make sure `package.json` is in your repo
- Verify `wrangler.toml` exists

**Deployed but not working**
- Click on your deployment in Cloudflare Dashboard
- Copy the actual URL (shown after deployment)
- Test: `https://your-project.pages.dev/manifest.json`

---

## Local Testing (Optional)

Want to test before pushing?

```bash
npm install
npm run cf:dev
```

Runs locally at http://localhost:8787

---

## That's It!

**Push → Cloudflare Deploys Automatically**

No complicated setup, no GitHub Actions, no secrets. Just connect and go! 🚀
