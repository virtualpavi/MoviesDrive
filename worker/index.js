/**
 * Cloudflare Workers entry point
 * Converts Express app to Cloudflare Workers format
 */

// Polyfill process.env for Cloudflare Workers
if (typeof process === 'undefined') {
  globalThis.process = {
    env: {},
    version: 'v20.0.0',
    uptime: () => 0,
    memoryUsage: () => ({ heapUsed: 0, heapTotal: 0 }),
  };
}

import { isValidImdbId, sanitizeString, isValidEpisodeNumber } from '../src/security.js';
import MoviesDriveScraper from '../src/scrapers/moviesdrive.js';
import {
  serializeStreams,
  parseSeasonEpisode,
  normalizeImdbId,
  parseSeriesRouteId,
} from '../src/serializer.js';

// Load manifest inline (more compatible than JSON import)
const manifest = {
  "id": "community.moviesdrive",
  "version": "1.0.0",
  "name": "MoviesDrive",
  "description": "Stream movies and TV series from MoviesDrive",
  "logo": "https://moviesdrive.world/wp-content/uploads/2021/01/cropped-favicon-192x192.png",
  "resources": ["catalog", "stream", "meta"],
  "types": ["movie", "series"],
  "catalogs": [
    {
      "type": "movie",
      "id": "moviesdrive-movies",
      "name": "MoviesDrive Movies"
    },
    {
      "type": "series",
      "id": "moviesdrive-series",
      "name": "MoviesDrive Series"
    }
  ]
};

// Initialize scraper (will be instantiated per request in Cloudflare Workers)
let scraper;

/**
 * Helper to create JSON response with CORS headers
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
      'Access-Control-Max-Age': '86400',
      'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-cache'
    }
  });
}

/**
 * Route handler
 */
async function handleRequest(request, env, ctx) {
  // Set environment variables from Cloudflare env
  if (env) {
    process.env.NODE_ENV = env.NODE_ENV || 'production';
    process.env.CACHE_TTL = env.CACHE_TTL || '7200';
    process.env.REQUEST_TIMEOUT = env.REQUEST_TIMEOUT || '15000';
    process.env.MAX_CONCURRENT_REQUESTS = env.MAX_CONCURRENT_REQUESTS || '5';
    process.env.MOVIESDRIVE_API = env.MOVIESDRIVE_API || 'https://new1.moviesdrive.surf';
  }

  // Initialize scraper with environment variables
  if (!scraper) {
    scraper = new MoviesDriveScraper();
  }

  const url = new URL(request.url);
  const path = url.pathname;
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
        'Access-Control-Max-Age': '86400',
      }
    });
  }

  try {
    // Health check
    if (path === '/health') {
      return jsonResponse({
        status: 'ok',
        addon: manifest.name,
        version: manifest.version,
        timestamp: new Date().toISOString(),
      });
    }

    // Manifest
    if (path === '/manifest.json' || path === '/') {
      return jsonResponse(manifest);
    }

    // Catalog endpoint
    if (path.match(/^\/catalog\/[^/]+\/[^/]+\.json$/)) {
      const matches = path.match(/^\/catalog\/([^/]+)\/([^/]+)\.json$/);
      const type = matches[1];
      const id = matches[2];
      
      if (!['movie', 'series'].includes(type)) {
        return jsonResponse({ error: 'Invalid type' }, 400);
      }

      return jsonResponse({
        metas: [],
        cacheMaxAge: 3600,
      });
    }

    // Meta endpoint
    if (path.match(/^\/meta\/[^/]+\/[^/]+\.json$/)) {
      const matches = path.match(/^\/meta\/([^/]+)\/([^/]+)\.json$/);
      const type = matches[1];
      const id = matches[2];
      
      const imdbId = normalizeImdbId(id);
      if (!imdbId) {
        return jsonResponse({ error: 'Invalid IMDB ID' }, 400);
      }

      if (!['movie', 'series'].includes(type)) {
        return jsonResponse({ error: 'Invalid type' }, 400);
      }

      const result = await scraper.searchAndGetDocument(imdbId);
      
      if (!result || !result.document) {
        return jsonResponse({ error: 'Not found' }, 404);
      }

      const $ = result.document;
      const title = $('h1').first().text() || 'Unknown';
      const description = $('meta[name="description"]').attr('content') || '';
      const poster = $('meta[property="og:image"]').attr('content') || '';

      const meta = {
        id: imdbId,
        type: type,
        name: title,
        description: description,
        poster: poster,
        background: poster,
      };

      return jsonResponse({ meta });
    }

    // Stream endpoint - Main endpoint for getting streaming links
    if (path.match(/^\/stream\/[^/]+\/[^/]+\.json$/)) {
      const matches = path.match(/^\/stream\/([^/]+)\/([^/]+)\.json$/);
      const type = matches[1];
      const id = matches[2];

      const seriesRouteData = type === 'series' ? parseSeriesRouteId(id) : null;
      const imdbId = seriesRouteData?.imdbId || normalizeImdbId(id);

      if (!imdbId) {
        console.warn(`[API] Invalid IMDB ID: ${id}`);
        return jsonResponse({ 
          error: 'Invalid IMDB ID',
          streams: [] 
        }, 400);
      }

      if (!['movie', 'series'].includes(type)) {
        return jsonResponse({ 
          error: 'Invalid type',
          streams: [] 
        }, 400);
      }

      console.log(`[API] Stream request: ${type} ${imdbId}`);

      let streams = [];

      if (type === 'movie') {
        streams = await scraper.extractMovieStreams(imdbId);
      } else if (type === 'series') {
        const searchParams = Object.fromEntries(url.searchParams);
        const { season, episode } = parseSeasonEpisode(searchParams, {
          season: seriesRouteData?.season,
          episode: seriesRouteData?.episode,
        });
        
        if (!isValidEpisodeNumber(season) || !isValidEpisodeNumber(episode)) {
          return jsonResponse({ 
            error: 'Invalid season or episode',
            streams: [] 
          }, 400);
        }

        console.log(`[API] Series request: S${season}E${episode}`);
        streams = await scraper.extractSeriesStreams(imdbId, season, episode);
      }

      const response = serializeStreams(streams, imdbId);
      console.log(`[API] Returning ${response.streams.length} stream(s)`);
      
      return jsonResponse(response);
    }

    // Subtitles endpoint
    if (path.match(/^\/subtitles\/[^/]+\/[^/]+\.json$/)) {
      const matches = path.match(/^\/subtitles\/([^/]+)\/([^/]+)\.json$/);
      const type = matches[1];
      const id = matches[2];
      
      const imdbId = normalizeImdbId(id);
      if (!imdbId) {
        return jsonResponse({ error: 'Invalid IMDB ID' }, 400);
      }

      const subtitles = await scraper.getSubtitles(imdbId);
      return jsonResponse({ subtitles });
    }

    // Info endpoint
    if (path === '/info') {
      const stats = scraper.getCacheStats();
      return jsonResponse({
        addon: manifest.name,
        version: manifest.version,
        cache: stats,
      });
    }

    // Clear cache endpoint
    if (path === '/clear-cache' && request.method === 'POST') {
      scraper.clearCache();
      return jsonResponse({ message: 'Cache cleared' });
    }

    // 404
    return jsonResponse({ error: 'Not found' }, 404);

  } catch (error) {
    console.error('[Worker] Error:', error.message);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error.message
    }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  }
};
