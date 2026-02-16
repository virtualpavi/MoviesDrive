# Vercel Deployment (GitHub Integration)

This project is configured for direct GitHub-to-Vercel deployment.

## Goal
Import repository in Vercel and click Deploy. No manual server process needed.

## Preconfigured Files
- `api/index.js`: serverless entrypoint adapter
- `src/index.js`: exports Express app and only listens when run directly
- `vercel.json`: routes all requests to `api/index.js` with CORS headers

## Deploy Steps
1. Push code to GitHub branch (typically `main`).
2. Open Vercel dashboard.
3. Click **Add New Project**.
4. Import `premiumytgemini/moviesdrive-stremio`.
5. Configure:
   - Framework Preset: **Other**
   - Root Directory: repo root
6. Click **Deploy**.

## Recommended Environment Variables (Optional)
- `MOVIESDRIVE_API=https://new1.moviesdrive.surf`
- `CACHE_TTL=7200`
- `REQUEST_TIMEOUT=15000`
- `MAX_CONCURRENT_REQUESTS=5`

## Post-Deploy Smoke Test
```bash
curl "https://<deployment>/manifest.json"
curl "https://<deployment>/health"
curl "https://<deployment>/stream/movie/tt32820897.json"
curl "https://<deployment>/stream/series/tt14186672:1:1.json"
```

## Stremio Install URL
Use this in Stremio:

`https://<deployment>/manifest.json`
