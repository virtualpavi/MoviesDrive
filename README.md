# MoviesDrive Stremio Addon

Stremio addon for MoviesDrive streams (movies + series) - Built for **Netlify Functions**

Features:
- 🎬 Multi-resolution stream extraction
- 📺 Movies & TV Series support
- 🔗 HubCloud chain resolution
- 🌐 Dynamic URL fetching from GitHub config
- ⚡ Serverless deployment with auto-scaling
- 🔒 Built-in security (SSRF protection, rate limiting)

## 🚀 Deploy to Netlify

### Automatic Deployment from GitHub

**⚡ Quick Start:** See [NETLIFY_DEPLOY.md](NETLIFY_DEPLOY.md) for detailed instructions!

**How it works:**
1. Push code to GitHub
2. Sign in to Netlify and import your repository
3. Netlify auto-detects settings from `netlify.toml`
4. Add environment variables in Netlify Dashboard
5. Done! Every push auto-deploys

**Why Netlify Functions:**
- ⚡ Fast cold starts with AWS Lambda backend
- 🌍 Global CDN with edge caching
- 💰 125k free invocations/month
- 🔄 Automatic deployments from GitHub
- 🚫 No CPU time limits (unlike Cloudflare Workers)

## Local Development

```bash
# Install dependencies
npm install

# Run locally
npm start
# Runs at http://localhost:27828
```

## Commands

```bash
npm start       # Run local Node.js server
npm run deploy  # Deploy to Netlify (requires Netlify CLI)
```

## Endpoints
- `GET /manifest.json` - Addon manifest for Stremio
- `GET /stream/:type/:id.json` - Stream extraction
- `GET /subtitles/:type/:id.json` - Subtitle fetching

Examples:
- Movie: `/stream/movie/tt8205190.json`
- Series: `/stream/series/tt32590226:3:32.json` (format: `imdbId:season:episode`)

## Environment Variables

Set these in **Netlify Dashboard → Site settings → Environment variables**:

**Required:**
- `MOVIESDRIVE_API` - MoviesDrive base URL (e.g., `https://new1.moviesdrive.surf`)

**Optional:**
- `API_CONFIG_URL` - Dynamic URL config from GitHub (default: `https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json`)
- `CACHE_TTL` - Cache duration in ms (default: `7200000` = 2 hours)
- `REQUEST_TIMEOUT` - HTTP request timeout in ms (default: `30000` = 30 seconds)

## Quick Verification After Deploy

Replace `<your-site-name>` with your Netlify site name:

```bash
curl "https://<your-site-name>.netlify.app/manifest.json"
curl "https://<your-site-name>.netlify.app/stream/movie/tt8205190.json"
curl "https://<your-site-name>.netlify.app/stream/series/tt32590226:3:32.json"
```

Expected:
- `manifest.json` returns valid addon manifest
- Stream endpoints return `{"streams":[...]}` with available streams

## Adding to Stremio

1. Deploy to Netlify
2. Copy your addon URL: `https://<your-site-name>.netlify.app/manifest.json`
3. In Stremio, go to **Addons** → **Community Addons**
4. Paste your URL and click **Install**

## Architecture

- **Runtime:** Node.js 20+ with ES modules
- **Platform:** Netlify Functions (AWS Lambda)
- **Scraping:** Cheerio for HTML parsing
- **Caching:** In-memory cache with TTL
- **Security:** SSRF protection, rate limiting (30 req/min), input validation
- **Dynamic Config:** Fetches MoviesDrive URL from GitHub JSON with fallback
