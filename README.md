# MoviesDrive Stremio Addon

Stremio addon for MoviesDrive streams (movies + series) - Built for **Cloudflare Workers**

Features:
- 🎬 Multi-resolution stream extraction
- 📺 Movies & TV Series support
- 🔗 HubCloud chain resolution
- ⚡ Edge-deployed on Cloudflare's global network

## 🚀 Deploy to Cloudflare

### Automatic Deployment from GitHub

**⚡ Quick Start:** See [QUICKSTART.md](QUICKSTART.md) - 3 minutes!

**How it works:**
1. Push code to GitHub
2. Connect repo in Cloudflare Dashboard (one-time setup)
3. Done! Every push auto-deploys to the edge

**Why Cloudflare Workers:**
- ⚡ ~1ms cold starts (10-500x faster than serverless functions)
- 🌍 300+ edge locations worldwide  
- 💰 100k free requests/day
- 🔒 Built-in DDoS protection
- 🔄 Automatic deployments from GitHub

## Local Development

```bash
# Install dependencies
npm install

# Run locally
npm start
# Runs at http://localhost:27828

# Test as Cloudflare Worker
npm run dev
# Runs at http://localhost:8787
```

## Commands

```bash
npm start       # Run local Node.js server
npm run dev     # Run Cloudflare Workers dev server
npm run deploy  # Deploy to Cloudflare Workers
npm run logs    # View live logs from Cloudflare
```

## Endpoints
- `GET /manifest.json`
- `GET /health`
- `GET /stream/:type/:id.json`
- `GET /subtitles/:type/:id.json`
- `GET /catalog/:type/:id.json`
- `GET /meta/:type/:id.json`

Examples:
- Movie: `/stream/movie/tt32820897.json`
- Series tuple format: `/stream/series/tt14186672:1:1.json`

## One-Click Vercel Deployment (GitHub Integration)
1. Push this repo to GitHub.
2. In Vercel, click **Add New Project**.
3. Import `premiumytgemini/moviesdrive-stremio`.
4. Framework Preset: **Other**.
5. Root Directory: repository root.
6. Click **Deploy**.

No manual server start command is required on Vercel.

## Environment Variables
Optional (safe defaults exist):
- `MOVIESDRIVE_API` (default: `https://new1.moviesdrive.surf`)
- `CACHE_TTL` (default: `3600`)
- `REQUEST_TIMEOUT` (default: `10000`)
- `USER_AGENT`

For Vercel, set them in **Project Settings > Environment Variables** if you need overrides.

## Quick Verification After Deploy
Replace `<deployment>` with your Vercel URL:

```bash
curl "https://<deployment>/manifest.json"
curl "https://<deployment>/health"
curl "https://<deployment>/stream/movie/tt32820897.json"
curl "https://<deployment>/stream/series/tt14186672:1:1.json"
```

Expected:
- `manifest.json` returns valid addon manifest
- `health` returns `{"status":"ok",...}`
- stream endpoints return `{"streams":[...]}` (may be empty if upstream source is unavailable)
