# MoviesDrive Stremio Addon - Vercel Deployment

This version of the addon is configured for deployment to Vercel, making it accessible from anywhere and working on all platforms.

## 🚀 Quick Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/moviesdrive-stremio)

### One-Click Deploy
1. Click the button above
2. Connect your GitHub account
3. Vercel will automatically deploy your addon
4. Get your URL: `https://your-project.vercel.app`

## 📋 Features

✅ **Works on All Platforms**
- Web Stremio (web.stremio.com)
- Desktop Stremio (Windows, Mac, Linux)
- Android Mobile
- Android TV

✅ **2-Hour Cache**
- Cache TTL set to 7200 seconds (2 hours)
- Reduces API calls and improves performance
- Automatic cache cleanup

✅ **CORS Enabled**
- Cross-Origin Resource Sharing configured
- Works from any domain
- Proper headers for all Stremio clients

✅ **Auto-Scaling**
- Vercel handles traffic automatically
- No server management needed
- Global CDN for fast loading

## 🔧 Configuration

### Environment Variables
Set these in Vercel Dashboard → Settings → Environment Variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `CACHE_TTL` | `7200` | Cache duration in seconds (2 hours) |
| `REQUEST_TIMEOUT` | `15000` | HTTP request timeout (15 seconds) |
| `MAX_CONCURRENT_REQUESTS` | `5` | Max parallel requests |
| `MOVIESDRIVE_API` | `https://new1.moviesdrive.surf` | MoviesDrive API URL |

### Files Changed for Vercel

1. **`vercel.json`** - Vercel configuration with routes and headers
2. **`api/index.js`** - Serverless entry point with Express
3. **`.env`** - Updated CACHE_TTL to 7200
4. **`src/cache.js`** - Default TTL changed to 2 hours
5. **`package.json`** - Added express and cors dependencies

## 📱 Using the Addon

After deployment, your addon URL will be:
```
https://your-project.vercel.app/manifest.json
```

### Add to Stremio (All Platforms)

1. **Web/Desktop:**
   - Open Stremio
   - Go to Addons
   - Enter: `https://your-project.vercel.app/manifest.json`

2. **Android Mobile:**
   - Open Stremio app
   - Settings → Addons → Install from URL
   - Enter: `https://your-project.vercel.app/manifest.json`

3. **Android TV:**
   - Open Stremio
   - Settings → Addons → Install from URL
   - Enter: `https://your-project.vercel.app/manifest.json`

## 🛠️ Local Development

You can still run locally:

```bash
npm install
npm start
```

Then use: `http://localhost:27828/manifest.json`

## 🔄 Updating the Addon

When you push changes to GitHub, Vercel automatically redeploys:

```bash
git add .
git commit -m "Your changes"
git push origin main
```

## 📊 Monitoring

Check Vercel Dashboard for:
- Function invocations
- Error logs
- Performance metrics
- Bandwidth usage

## 🆘 Troubleshooting

### Build Errors
```bash
# Check if all dependencies are installed
npm install
# Test locally
npm run build
```

### CORS Issues
The `vercel.json` already includes CORS headers. If issues persist:
1. Check browser console for exact error
2. Verify headers in Vercel logs

### Cache Not Working
- Verify `CACHE_TTL=7200` is set in environment variables
- Redeploy after changing variables

## 📁 Project Structure

```
moviesdrive-stremio/
├── api/
│   └── index.js          # Vercel serverless entry
├── src/
│   ├── cache.js           # 2-hour cache
│   ├── handlers/
│   ├── scrapers/
│   └── ...
├── vercel.json            # Vercel config
├── package.json           # Dependencies
└── .env                   # Environment variables
```

## 🌐 Custom Domain (Optional)

1. Buy a domain (e.g., Namecheap, GoDaddy)
2. Go to Vercel Dashboard → Project → Settings → Domains
3. Add your domain
4. Configure DNS as instructed

Example: `https://stremio.mydomain.com/manifest.json`

## 💰 Pricing

Vercel free tier includes:
- 100GB bandwidth/month
- 1000 build minutes/month
- 125,000 function invocations/day
- 10 second function timeout

Perfect for personal Stremio addons!

## 📚 Documentation

- [Vercel Docs](https://vercel.com/docs)
- [Stremio Addon Docs](https://github.com/Stremio/stremio-addon-sdk)
- [Full Deployment Guide](./VERCEL_DEPLOYMENT_GUIDE.md)

## 🎉 Success!

Your addon is now:
- ✅ Hosted on Vercel
- ✅ Accessible worldwide
- ✅ Working on all devices
- ✅ Cached for 2 hours
- ✅ Auto-scaling

**Enjoy streaming! 🍿**
