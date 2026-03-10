# Deploy to Netlify

## Why Netlify?

Netlify Functions run on AWS Lambda with:
- **No CPU time limit** (vs Cloudflare's 10ms)
- **10 second timeout** (26 seconds on paid)
- **125k requests/month free**
- **100 hours execution time/month**
- Perfect for web scraping workloads

## Quick Setup

### 1. Push to GitHub

```bash
git add .
git commit -m "Add Netlify Functions support"
git push origin main
```

### 2. Deploy on Netlify

1. Go to [Netlify](https://netlify.com)
2. Sign in with GitHub
3. Click **Add new site** → **Import an existing project**
4. Select your GitHub repository
5. Build settings will be auto-detected from `netlify.toml`
6. Click **Deploy site**

### 3. Set Environment Variables

After deployment, go to:
- **Site settings** → **Environment variables**
- Add these variables:

```
MOVIESDRIVE_API=https://new1.moviesdrive.surf
API_CONFIG_URL=https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json
CACHE_TTL=7200
REQUEST_TIMEOUT=15000
```

### 4. Test Your Deployment

Your addon will be at: `https://your-site-name.netlify.app`

Test endpoints:
```bash
curl https://your-site-name.netlify.app/health
curl https://your-site-name.netlify.app/manifest.json
curl https://your-site-name.netlify.app/stream/movie/tt8205190.json
```

## Custom Domain (Optional)

1. Go to **Domain settings**
2. Add your domain
3. Update DNS records as instructed

## Advantages Over Cloudflare Workers

| Feature | Netlify | Cloudflare (Free) |
|---------|---------|-------------------|
| CPU Limit | None | 10ms |
| Timeout | 10s | Instant |
| Requests/month | 125k | 100k |
| Execution time | 100 hours | Limited |
| Scraping | ✅ Perfect | ❌ Too restrictive |

## Monitoring

- **Build logs**: Site overview → Deploys → Build log
- **Function logs**: Site overview → Functions → View logs
- **Analytics**: Site overview → Analytics

## Troubleshooting

If streams don't work:
1. Check function logs for errors
2. Verify environment variables are set
3. Test with `/health` endpoint first
4. Check `/test-extract` endpoint

## Upgrade Options

**Netlify Pro** ($19/month):
- 1M requests/month
- 1,000 hours execution
- 26 second timeout
- Background functions
