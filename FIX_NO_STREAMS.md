# Fix for "No Streams" Issue

## Problem
The Cloudflare Worker is returning empty streams because the `MOVIESDRIVE_API` environment variable is not configured in Cloudflare.

## Root Cause
The worker needs to know which MoviesDrive URL to use for scraping. Without the `MOVIESDRIVE_API` environment variable, it defaults to the fallback URL, but something is preventing proper initialization.

## Solution

### Option 1: Redeploy via GitHub (Recommended)
I've already updated `wrangler.toml` with the correct environment variable. Just push your changes to GitHub:

```powershell
git add wrangler.toml
git commit -m "Add MOVIESDRIVE_API environment variable"
git push origin main
```

The Cloudflare deployment will automatically use the updated configuration.

### Option 2: Manual Configuration in Cloudflare Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** → **moviesdrive-addon**
3. Click on **Settings** tab
4. Scroll to **Environment Variables**
5. Click **Add variable**
6. Add the following:
   - **Variable name**: `MOVIESDRIVE_API`
   - **Value**: `https://new1.moviesdrive.surf`
7. Click **Save**
8. The worker will automatically restart with the new configuration

## Verification

After deploying, test the endpoint:

```powershell
curl https://moviesdrive-addon.singh-pavitardeep.workers.dev/stream/movie/tt8205190.json
```

You should see 6 streams (3 qualities × 2 sources):
- 480p: FSL + Pixel (350MB)
- 720p: FSL + Pixel (1.3GB)
- 1080p: FSL + Pixel (3.6GB)

## What Was Fixed

1. **Added `MOVIESDRIVE_API` to `wrangler.toml`** - Both production and development environments now include the MoviesDrive API URL
2. **Verified locally** - The scraper works perfectly locally (found 6 streams for tt8205190)
3. **Identified deployment gap** - The deployed worker needs the environment variable configured

## Technical Details

The `MoviesDriveScraper` class reads `process.env.MOVIESDRIVE_API` to determine which site to scrape:

```javascript
this.apiUrl = process.env.MOVIESDRIVE_API || 'https://new1.moviesdrive.surf';
```

Without this variable, the scraper cannot properly connect to MoviesDrive's search API at `${apiUrl}/searchapi.php?q=${imdbId}`.
