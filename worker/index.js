/**
 * Cloudflare Workers entry point
 * Optimized for edge deployment
 */

// Polyfill process.env for Cloudflare Workers
globalThis.process = globalThis.process || {
  env: {},
  version: 'v20.0.0',
  uptime: () => 0,
  memoryUsage: () => ({ heapUsed: 0, heapTotal: 0 }),
};

import { isValidEpisodeNumber } from '../src/security.js';
import MoviesDriveScraper from '../src/scrapers/moviesdrive.js';
import {
  serializeStreams,
  parseSeasonEpisode,
  normalizeImdbId,
  parseSeriesRouteId,
} from '../src/serializer.js';

// Manifest configuration
const manifest = {
  id: "community.moviesdrive",
  version: "1.0.0",
  name: "MoviesDrive",
  description: "Stream movies and TV series from MoviesDrive",
  logo: "https://moviesdrive.world/wp-content/uploads/2021/01/cropped-favicon-192x192.png",
  resources: ["stream", "meta"],
  types: ["movie", "series"],
  idPrefixes: ["tt"]
};

// Global scraper instance
let scraper;

// CORS headers
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

/**
 * Create JSON response with CORS
 */
const jsonResponse = (data, status = 200, cacheTime = 300) => new Response(
  JSON.stringify(data),
  {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      'Cache-Control': status === 200 ? `public, max-age=${cacheTime}` : 'no-cache',
    }
  }
);

/**
 * Initialize environment and scraper
 */
function initEnv(env) {
  if (env) {
    Object.assign(process.env, {
      NODE_ENV: env.NODE_ENV || 'production',
      CACHE_TTL: env.CACHE_TTL || '7200',
      REQUEST_TIMEOUT: env.REQUEST_TIMEOUT || '15000',
      MOVIESDRIVE_API: env.MOVIESDRIVE_API || 'https://new1.moviesdrive.surf',
      API_CONFIG_URL: env.API_CONFIG_URL || '',
    });
  }
  
  if (!scraper) {
    scraper = new MoviesDriveScraper();
  }
}

/**
 * Main request handler
 */
async function handleRequest(request, env, ctx) {
  initEnv(env);
  
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
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
      return jsonResponse(manifest, 200, 3600);
    }

    // Meta endpoint
    if (path.match(/^\/meta\/[^/]+\/[^/]+\.json$/)) {
      const [, type, id] = path.match(/^\/meta\/([^/]+)\/([^/]+)\.json$/);
      
      const imdbId = normalizeImdbId(id);
      if (!imdbId || !['movie', 'series'].includes(type)) {
        return jsonResponse({ error: 'Invalid request' }, 400);
      }

      const result = await scraper.searchAndGetDocument(imdbId);
      if (!result?.document) {
        return jsonResponse({ error: 'Not found' }, 404);
      }

      const $ = result.document;
      return jsonResponse({
        meta: {
          id: imdbId,
          type,
          name: $('h1').first().text() || 'Unknown',
          description: $('meta[name="description"]').attr('content') || '',
          poster: $('meta[property="og:image"]').attr('content') || '',
        }
      });
    }

    // Stream endpoint
    if (path.match(/^\/stream\/[^/]+\/[^/]+\.json$/)) {
      const [, type, id] = path.match(/^\/stream\/([^/]+)\/([^/]+)\.json$/);

      if (!['movie', 'series'].includes(type)) {
        return jsonResponse({ error: 'Invalid type', streams: [] }, 400);
      }

      const seriesRouteData = type === 'series' ? parseSeriesRouteId(id) : null;
      const imdbId = seriesRouteData?.imdbId || normalizeImdbId(id);

      if (!imdbId) {
        return jsonResponse({ error: 'Invalid IMDB ID', streams: [] }, 400);
      }

      let streams = [];

      if (type === 'movie') {
        streams = await scraper.extractMovieStreams(imdbId);
      } else {
        const searchParams = Object.fromEntries(url.searchParams);
        const { season, episode } = parseSeasonEpisode(searchParams, {
          season: seriesRouteData?.season,
          episode: seriesRouteData?.episode,
        });
        
        if (!isValidEpisodeNumber(season) || !isValidEpisodeNumber(episode)) {
          return jsonResponse({ error: 'Invalid season or episode', streams: [] }, 400);
        }

        streams = await scraper.extractSeriesStreams(imdbId, season, episode);
      }

      return jsonResponse(serializeStreams(streams, imdbId));
    }

    // 404
    return jsonResponse({ error: 'Not found' }, 404);

  } catch (error) {
    console.error('[Worker] Error:', error.message);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}

export default {
  fetch: handleRequest
};
