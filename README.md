# MoviesDrive Stremio Addon

Stremio addon for MoviesDrive streams (movies + series), including multi-resolution extraction and HubCloud chain resolution.

## Requirements
- Node.js `20+`
- npm `9+`

## Local Run
```bash
npm ci
npm start
```

Server defaults:
- Base URL: `http://localhost:27828`
- Manifest: `http://localhost:27828/manifest.json`

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
