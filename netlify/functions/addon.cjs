/**
 * Netlify Function for MoviesDrive Stremio Addon (CommonJS)
 */

// Use dynamic imports for ES modules
let scraper;
let isValidEpisodeNumber;
let MoviesDriveScraper;
let serializeStreams;
let parseSeasonEpisode;
let normalizeImdbId;
let parseSeriesRouteId;

// Manifest configuration
const manifest = {
  id: "community.moviesdrive",
  version: "1.0.1",
  name: "MoviesDrive",
  description: "Stream movies and TV series from MoviesDrive",
  logo: "https://moviesdrive.world/wp-content/uploads/2021/01/cropped-favicon-192x192.png",
  resources: ["stream", "meta"],
  types: ["movie", "series"],
  idPrefixes: ["tt"]
};

// CORS headers
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Initialize modules and scraper
 */
async function initScraper() {
  if (!scraper) {
    // Load dotenv
    await import('dotenv/config');
    
    // Import ES modules dynamically
    const securityModule = await import('../../src/security.mjs');
    isValidEpisodeNumber = securityModule.isValidEpisodeNumber;
    
    const scraperModule = await import('../../src/scrapers/moviesdrive.mjs');
    MoviesDriveScraper = scraperModule.default;
    
    const serializerModule = await import('../../src/serializer.mjs');
    serializeStreams = serializerModule.serializeStreams;
    parseSeasonEpisode = serializerModule.parseSeasonEpisode;
    normalizeImdbId = serializerModule.normalizeImdbId;
    parseSeriesRouteId = serializerModule.parseSeriesRouteId;
    
    scraper = new MoviesDriveScraper();
  }
}

/**
 * Main handler
 */
exports.handler = async (event) => {
  await initScraper();
  
  const path = event.path.replace('/.netlify/functions/addon', '');
  
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  try {
    // Health check
    if (path === '/health' || path === '/.netlify/functions/addon/health') {
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'ok',
          addon: manifest.name,
          version: manifest.version,
          timestamp: new Date().toISOString(),
          platform: 'netlify',
        }),
      };
    }

    // Manifest
    if (path === '/manifest.json' || path === '/' || path === '') {
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
        body: JSON.stringify(manifest),
      };
    }

    // Meta endpoint
    if (path.match(/^\/meta\/[^/]+\/[^/]+\.json$/)) {
      const [, type, id] = path.match(/^\/meta\/([^/]+)\/([^/]+)\.json$/);
      
      const imdbId = normalizeImdbId(id);
      if (!imdbId || !['movie', 'series'].includes(type)) {
        return {
          statusCode: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid request' }),
        };
      }

      const result = await scraper.searchAndGetDocument(imdbId);
      if (!result?.document) {
        return {
          statusCode: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Not found' }),
        };
      }

      const $ = result.$;
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meta: {
            id: imdbId,
            type,
            name: $('h1').first().text() || 'Unknown',
            description: $('meta[name="description"]').attr('content') || '',
            poster: $('meta[property="og:image"]').attr('content') || '',
          }
        }),
      };
    }

    // Stream endpoint
    if (path.match(/^\/stream\/[^/]+\/[^/]+\.json$/)) {
      const [, type, id] = path.match(/^\/stream\/([^/]+)\/([^/]+)\.json$/);

      if (!['movie', 'series'].includes(type)) {
        return {
          statusCode: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid type', streams: [] }),
        };
      }

      const seriesRouteData = type === 'series' ? parseSeriesRouteId(id) : null;
      const imdbId = seriesRouteData?.imdbId || normalizeImdbId(id);

      if (!imdbId) {
        return {
          statusCode: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid IMDB ID', streams: [] }),
        };
      }

      let streams = [];

      if (type === 'movie') {
        streams = await scraper.extractMovieStreams(imdbId);
      } else {
        const queryParams = event.queryStringParameters || {};
        const { season, episode } = parseSeasonEpisode(queryParams, {
          season: seriesRouteData?.season,
          episode: seriesRouteData?.episode,
        });
        
        if (!isValidEpisodeNumber(season) || !isValidEpisodeNumber(episode)) {
          return {
            statusCode: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Invalid season or episode', streams: [] }),
          };
        }

        streams = await scraper.extractSeriesStreams(imdbId, season, episode);
      }

      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify(serializeStreams(streams, imdbId)),
      };
    }

    // 404
    return {
      statusCode: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Not found' }),
    };

  } catch (error) {
    console.error('[Netlify] Error:', error.message);
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

