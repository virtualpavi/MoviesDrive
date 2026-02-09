# MoviesDrive Stremio Addon

A modern Node.js Stremio addon for streaming movies and TV series from MoviesDrive provider with support for multiple quality options and specifications parsing.

## Features

- 🎬 Stream movies and TV series
- 📺 Multiple quality options (720p, 1080p, 2160p, etc.)
- 🔍 Automatic specification parsing (codec, audio, HDR, language)
- ⚡ Fast link extraction with caching
- 🛡️ Cloudflare bypass with retry logic
- 📦 Built with Node.js 20+ and latest engines
- 🚀 Easy deployment with Docker
- 🔧 Comprehensive error handling

## Installation

### Prerequisites

- Node.js 20.0.0 or higher
- npm or yarn package manager

### Local Setup

```bash
# Clone the repository
git clone <repository-url>
cd moviesdrive-stremio

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Start the addon server
npm start
```

The addon will be available at `http://localhost:27828`

## Usage

### Install in Stremio

1. Go to Stremio Add-ons
2. Click "Install Add-on"
3. Enter the manifest URL: `http://localhost:27828/manifest.json`
4. Install and enable the addon

### API Endpoints

#### Get Manifest
```bash
GET /manifest.json
```

#### Get Streams
```bash
GET /stream/:type/:id.json?season=1&episode=1
```

Parameters:
- `type`: `movie` or `series`
- `id`: IMDB ID (e.g., `tt1234567`)
- `season`: (optional) Season number for series
- `episode`: (optional) Episode number for series

Example:
```bash
curl http://localhost:27828/stream/movie/tt0468569.json
```

#### Health Check
```bash
GET /health
```

#### Addon Info
```bash
GET /info
```

## Configuration

Edit `.env` file to customize:

```env
# Server
PORT=27828
HOST=0.0.0.0

# API
MOVIESDRIVE_API=https://api.moviesdrive.com
API_CONFIG_URL=https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json

# Cache
REDIS_ENABLED=false
CACHE_TTL=3600

# Requests
REQUEST_TIMEOUT=10000
MAX_CONCURRENT_REQUESTS=5
```

## Development

### Run with Auto-Reload

```bash
npm run dev
```

### Linting

```bash
npm run lint
```

### Code Formatting

```bash
npm run format
```

## Docker Deployment

### Build Image

```bash
docker build -t moviesdrive-stremio:latest .
```

### Run Container

```bash
docker run -p 27828:27828 \
  -e PORT=27828 \
  -e MOVIESDRIVE_API=https://api.moviesdrive.com \
  moviesdrive-stremio:latest
```

### Docker Compose

```yaml
version: '3.8'
services:
  moviesdrive:
    image: moviesdrive-stremio:latest
    ports:
      - "27828:27828"
    environment:
      PORT: 27828
      HOST: 0.0.0.0
      MOVIESDRIVE_API: https://api.moviesdrive.com
    restart: unless-stopped
```

## Project Structure

```
moviesdrive-stremio/
├── src/
│   ├── index.js                 # Main server entry point
│   ├── http-client.js           # HTTP client with retry logic
│   ├── utils.js                 # Utility functions (parsing, extraction)
│   ├── serializer.js            # Data serialization
│   ├── scrapers/
│   │   └── moviesdrive.js       # MoviesDrive scraper implementation
│   └── handlers/
│       └── streams.js           # Stremio addon handlers
├── package.json                 # NPM dependencies
├── manifest.json                # Stremio addon manifest
├── .env.example                 # Environment variables template
├── Dockerfile                   # Docker configuration
├── docker-compose.yml           # Docker Compose configuration
└── README.md                    # This file
```

## Features Explained

### Video Specification Parsing

The addon automatically extracts and displays video information:
- **Quality**: 4K, 1080p, 720p, 480p, etc.
- **Codec**: x265 (HEVC), x264, VP9, etc.
- **Audio**: DTS-HD MA, Dolby Atmos, AC3, AAC, etc.
- **HDR**: HDR10+, Dolby Vision, HDR10, SDR
- **Language**: Hindi, English, Korean, Japanese, Tamil, etc.
- **File Size**: Automatically detected from filenames

Example output: `1080p • x265 (HEVC) • DTS • HDR10+ 🇮🇳 Hindi 💾 [2.5GB]`

### Link Extraction

Extracts links from multiple hosting providers:
- Google Drive (gdrive, gdflix)
- HubCloud
- Direct streaming URLs

### Caching

- In-memory cache for API responses (configurable TTL)
- Optional Redis support for distributed caching
- Automatic cache invalidation

## Troubleshooting

### Server won't start
- Check if port 27828 is already in use
- Verify Node.js version: `node --version` (must be 20.0.0+)
- Check `.env` file for syntax errors

### No streams found
- Verify IMDB ID is correct (format: `ttXXXXXXX`)
- Check API configuration URL is accessible
- Review console logs for detailed error messages

### Slow link extraction
- Increase `REQUEST_TIMEOUT` in `.env`
- Reduce `MAX_CONCURRENT_REQUESTS` if getting rate limited
- Enable Redis for faster caching

## API Response Format

### Stream Response

```json
{
  "streams": [
    {
      "url": "https://example.com/stream",
      "title": "1080p • x265 (HEVC) • DTS 💾 [2.5GB]",
      "quality": "1080p",
      "sources": ["MoviesDrive"],
      "externalUrl": "https://example.com/stream",
      "subtitles": [],
      "behaviorHints": {
        "bingeGroup": "stremio"
      }
    }
  ]
}
```

## Performance

- Response time: < 2 seconds for most requests
- Concurrent request handling: Configurable (default: 5)
- Memory usage: ~50-100MB
- CPU usage: Minimal (event-driven)

## Security

- User-Agent spoofing to bypass basic protections
- Request timeout protection
- Error handling without exposing internal paths
- Rate limiting support (via environment variables)

## License

MIT License - See LICENSE file for details

## Contributing

Contributions are welcome! Please follow these guidelines:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

For issues or questions:
- Open an issue on GitHub
- Email: support@moviesdrive.addon

---

**Note**: This addon provides a framework for accessing streaming content. Ensure you have proper rights to access and stream the content. The addon creators are not responsible for unauthorized use.
