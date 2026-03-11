# MoviesDrive Stremio Addon

Self-hosted Stremio addon for MoviesDrive streams - Delivers HTTP direct download links for movies and series.

## ✨ Features

- 🎬 **Multi-resolution streams**: 480p, 720p, 1080p support
- 📺 **Movies & TV Series**: Full season/episode support
- ⚡ **Parallel scraping**: 3x faster performance (~3 seconds)
- 🔗 **HubCloud resolution**: Automatic redirect chain following
- 🌐 **Dynamic config**: Auto-fetches MoviesDrive URLs from GitHub
- 🔒 **Security**: SSRF protection and rate limiting built-in
- 🎯 **AIOStreams compatible**: Works with AIOStreams via passthrough mode

## 🚀 Quick Start

### Local Installation

```bash
# Install dependencies
npm install

# Run server
npm start
```

Server runs at: `http://localhost:27828`

Add to Stremio: `http://localhost:27828/manifest.json`

### Deploy to Coolify

1. **Push to Git Repository**:
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **In Coolify Dashboard**:
   - Create new resource → Git Repository
   - Select your MoviesDrive repository
   - Set build command: `npm install`
   - Set start command: `npm start`
   - Set port: `27828`
   - Deploy!

3. **Environment Variables** (optional):
   - No environment variables required
   - Config auto-fetches from GitHub

## 📡 API Endpoints

- `GET /manifest.json` - Stremio addon manifest
- `GET /stream/:type/:id.json` - Stream extraction
- `GET /health` - Health check endpoint

### Examples

**Movie:**
```
GET /stream/movie/tt8205190.json
```

**TV Series:**
```
GET /stream/series/tt32590226:3:32.json
Format: imdbId:season:episode
```

## 🔧 Configuration

No environment variables required! Config auto-fetches from:
```
https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json
```

### Optional Environment Variables

Create `.env` file (see `.env.example`):

```env
# Optional overrides
API_CONFIG_URL=https://your-config-url.json
REQUEST_TIMEOUT=30000
```

## 🧪 Testing After Deployment

```bash
# Test manifest
curl "https://your-domain.com/manifest.json"

# Test movie stream
curl "https://your-domain.com/stream/movie/tt8205190.json"

# Test series stream
curl "https://your-domain.com/stream/series/tt32590226:3:32.json"
```

Expected response: `{"streams": [...]}` with 6+ streams

## 🎯 AIOStreams Integration

Works with self-hosted AIOStreams using passthrough mode:

### Prerequisites
1. Self-hosted AIOStreams instance
2. Enable in AIOStreams config:
   - `RESULT_PASSTHROUGH=true`
   - `FILTER_PASSTHROUGH=true`
   - Allow HTTP streams

### Add to AIOStreams
In AIOStreams settings → Custom Scrapers:
```
http://localhost:27828/manifest.json
```
Or use your Coolify URL for remote access.

## 🏗️ Architecture

- **Runtime:** Node.js 20+ with ES modules (.mjs)
- **HTTP Client:** Native fetch API
- **HTML Parser:** Cheerio 1.0.0-rc.12
- **Server:** Express 4.18.2 with CORS
- **Performance:** Parallel scraping (~3 seconds)
- **Security:** SSRF protection, input validation
- **Dynamic Config:** Auto-fetches MoviesDrive URLs from GitHub

## 📦 Stream Sources

- **PixelDrain**: Direct HTTP downloads
- **FSL Server**: Direct HTTP downloads (hub.raj.lat)
- **Format**: AIOStreams-compatible metadata (quality, resolution, codec tags)

## 📝 License

MIT

---

**Note:** This addon provides HTTP direct download links. For use with AIOStreams, ensure passthrough mode is enabled.
