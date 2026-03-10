# Cloudflare Workers Deployment Guide

This guide will help you deploy your MoviesDrive Stremio addon to Cloudflare Workers.

## Deployment Method

This app is built specifically for Cloudflare Workers and deploys automatically when you connect your GitHub repository to Cloudflare. No GitHub Actions or CI/CD configuration needed - Cloudflare handles everything.

## What Changed for Cloudflare Workers

Your app has been converted from Vercel (Express.js) to Cloudflare Workers with these key changes:

1. **Replaced axios with native fetch API** - More efficient and Worker-native
2. **Removed Node.js built-in imports** - `timers/promises`, `url` module replaced with Web APIs
3. **Converted Express routes to fetch handler** - Uses standard Request/Response Web APIs
4. **Removed jsdom dependency** - Kept cheerio which is lighter and Worker-compatible
5. **Environment variables in wrangler.toml** - Instead of vercel.json

## Prerequisites

1. **Cloudflare Account**: Sign up for free at [cloudflare.com](https://dash.cloudflare.com/sign-up)
2. **Node.js**: Version 20 or higher
3. **Wrangler CLI**: Will be installed via npm

## Pre-Deployment Verification

Before deploying, verify your setup:

```bash
npm run cf:verify
```

This checks if all compatibility changes are in place.

## Step 1: Get Cloudflare Credentials

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Copy your **Account ID** from the right sidebar
3. Create an **API Token**:
   - Go to **My Profile** → **API Tokens**
   - Click **Create Token**
   - Use the **Edit Cloudflare Workers** template
   - Or create custom token with these permissions:
     - Account: Workers Scripts (Edit)
     - Zone: Workers Routes (Edit)
   - Click **Continue to summary** → **Create Token**
   - **Copy the token** (you won't see it again!)

## Step 2: Configure GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add these two secrets:

   **Secret 1:**
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: Your API token from Step 1

   **Secret 2:**
   - Name: `CLOUDFLARE_ACCOUNT_ID`
   - Value: Your Account ID from Step 1

## Step 3: Push to GitHub

```bash
git add .
git commit -m "Add Cloudflare Workers deployment"
git push origin main
```

The GitHub Action will automatically deploy your worker!

## Step 4: Monitor Deployment

1. Go to your GitHub repository
2. Click the **Actions** tab
3. You'll see the deployment workflow running
4. Click on it to see real-time logs
5. When complete, you'll see your worker URL in the logs

Your worker will be deployed to: `https://moviesdrive-addon.your-account.workers.dev`

## Step 5: Verify Deployment

Test your deployed endpoints:

```bash
# Check health
curl https://moviesdrive-addon.your-account.workers.dev/health

# Get manifest
curl https://moviesdrive-addon.your-account.workers.dev/manifest.json
```

## Optional: Test Locally Before Pushing

If you want to test locally first:

```bash
# Install dependencies
npm install

# Login to Cloudflare (one-time)
npx wrangler login

# Run locally
npm run cf:dev
```

This starts a local development server at `http://localhost:8787`

## Step 6: Automatic Deployments

Every time you push to your main/master branch, GitHub Actions will automatically:
1. Install dependencies
2. Build your worker
3. Deploy to Cloudflare Workers
4. Update your live endpoint

No manual deployment needed! 🚀

## Step 7: Configure Custom Domain (Optional)

To use a custom domain:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** → Your Worker
3. Click **Settings** → **Domains & Routes**
4. Add your custom domain

## Environment Variables

Environment variables are configured in `wrangler.toml`:

- `NODE_ENV`: production or development
- `CACHE_TTL`: Cache time-to-live in seconds (default: 7200)
- `REQUEST_TIMEOUT`: Request timeout in milliseconds (default: 15000)
- `MAX_CODeployment Status

Check GitHub Actions:
1. Go to your repository → **Actions** tab
2. See all deployment runs and their status
3. Click any run to see detailed logs

### View Real-time Worker Logs

Install Wrangler locally and login:

```bash
npm install
npx wrangler loginsecrets (sensitive data):

```bash
npx wrangler secret put SECRET_NAME
```

## Monitoring & Logs

### View Real-time Logs

```bash
npm run cf:tail
```

### View Analytics

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** → Your Worker
3. Click **Metrics** to see requests, errors, and performance

## Limits

### Free Tier
- 100,000 requests/day
- 10ms CPU time per request
- 1GB storage for KV (if needed)

### Paid Tier ($5/month)
- 10 million requests/month (included)
- 50ms CPU time per request
- Unlimited requests ($0.50 per additional million)

## Troubleshooting

### Error: "account_id is required"
Add your Account ID to `wrangler.toml` as shown in Step 3.

### Error: "Module not found"
Make sure all dependencies are installed and your import paths are correct. Cloudflare Workers use ES modules.

### Error: "Script startup exceeded CPU time limit"
Your initialization code is taking too long. The code has been optimized to:
- Use fetch API instead of axios (faster)
- Lazy initialize the scraper
- Remove heavy dependencies like jsdom

If you still see this, consider:
- Moving initialization to first request
- Using Cloudflare's Durable Objects for stateful operations

### Error: "setTimeout is not a function"
Already fixed - using native `setTimeout` available in Workers, not Node.js timers/promises.

### Worker returning 500 errors
Check logs with `npm run cf:tail` to see runtime errors. Common issues:
- Import statements using Node.js built-ins (fixed in worker/index.js)
- Missing polyfills for process.env (added polyfill in worker)

### Cheerio not working
Cheerio should work fine in Workers. If you see issues, ensure you're using version 1.0.0-rc.12 or higher.

### Fetch errors or CORS issues
The worker handles CORS headers automatically. If you see fetch errors:
- Verify URLs are accessible from Cloudflare's network
- Check SSRF protection isn't blocking legitimate requests
- Ensure target sites allow requests from Cloudflare IPs

## Key Differences from Vercel

1. **No Express.js**: Cloudflare Workers use fetch API instead of Express middleware
2. **Request/Response Objects**: Use standard Web APIs (Request/Response) instead of Express req/res
3. **No File System**: Can't read from file system; manifest embedded in worker code
4. **CPU Time Limits**: 10ms (free) or 50ms (paid) per request - very efficient!
5. **Cold Starts**: Much faster than Vercel (typically <1ms vs 200-500ms)
6. **Native fetch**: Using Web APIs instead of axios for better performance
7. **No Node.js built-ins**: Compatible with standard Web APIs only

## Performance Benefits

- **Faster cold starts**: ~1ms vs Vercel's 200-500ms
- **Lower latency**: Deployed to 300+ edge locations worldwide
- **Better caching**: Built-in edge caching with Cache API
- **No node_modules overhead**: Smaller bundle size

## Using Stremio with Your Worker

Add your worker URL to Stremio:

1. Copy your worker URL: `https://moviesdrive-addon.your-account.workers.dev`
2. In Stremio, go to **Addons** → **Community Addons**
3. Click **Install from URL**
4. Paste: `https://moviesdrive-addon.your-account.workers.dev/manifest.json`
5. Click **Install**

## Updating Your Worker

To update your deployed worker:

```bash
# Make your changes, then deploy
npm run cf:deploy:prod
```

Changes are deployed instantly with zero downtime.

## Cost Estimation

Based on typical usage:

- **100 users**: ~10,000 requests/day = **FREE**
- **1,000 users**: ~100,000 requests/day = **FREE**
- **10,000 users**: ~1M requests/day = **$5/month** (paid plan)

## Additional Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [Workers Examples](https://developers.cloudflare.com/workers/examples/)
- [Pricing](https://developers.cloudflare.com/workers/platform/pricing/)

## Support

For issues or questions:
- [Cloudflare Community](https://community.cloudflare.com/)
- [Workers Discord](https://discord.gg/cloudflaredev)
