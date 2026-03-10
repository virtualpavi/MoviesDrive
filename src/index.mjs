#!/usr/bin/env node

/**
 * MoviesDrive Stremio Addon Server
 * Main entry point for the addon
 */

import 'dotenv/config';
import express from 'express';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { securityHeaders, rateLimit, isValidImdbId, sanitizeString, isValidEpisodeNumber } from './security.js';
import MoviesDriveScraper from './scrapers/moviesdrive.js';
import {
  serializeStreams,
  serializeCatalog,
  serializeMeta,
  parseSeasonEpisode,
  normalizeImdbId,
  parseSeriesRouteId,
} from './serializer.js';

const require = createRequire(import.meta.url);
const manifest = require('../manifest.json');

// Initialize Express app
const app = express();

// Security middleware
app.use(securityHeaders);
app.use(rateLimit);

// Parse JSON bodies
app.use(express.json());

// Initialize scraper
const scraper = new MoviesDriveScraper();

// Server configuration
const PORT = process.env.PORT || 27828;
const HOST = process.env.HOST || '0.0.0.0';
const isDirectExecution =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === process.argv[1];

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    addon: manifest.name,
    version: manifest.version,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Addon manifest endpoint
 */
app.get('/manifest.json', (req, res) => {
  res.json(manifest);
});

/**
 * Catalog endpoint
 */
app.get('/catalog/:type/:id.json', async (req, res) => {
  try {
    const { type, id } = req.params;
    
    // Validate type
    if (!['movie', 'series'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type' });
    }

    // Search query if provided
    const searchQuery = sanitizeString(req.query.search || '');

    // This is a placeholder - in a real implementation, you'd fetch from MoviesDrive
    // For now, return empty catalog
    res.json({
      metas: [],
      cacheMaxAge: 3600,
    });
  } catch (error) {
    console.error('[API] Catalog error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Meta endpoint
 */
app.get('/meta/:type/:id.json', async (req, res) => {
  try {
    const { type, id } = req.params;
    
    // Validate IMDB ID
    const imdbId = normalizeImdbId(id);
    if (!imdbId) {
      return res.status(400).json({ error: 'Invalid IMDB ID' });
    }

    // Validate type
    if (!['movie', 'series'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type' });
    }

    // Search for the item
    const result = await scraper.searchAndGetDocument(imdbId);
    
    if (!result || !result.document) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Extract basic info from the document
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

    res.json({ meta });
  } catch (error) {
    console.error('[API] Meta error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Stream endpoint - Main endpoint for getting streaming links
 */
app.get('/stream/:type/:id.json', async (req, res) => {
  try {
    const { type, id } = req.params;

    const seriesRouteData = type === 'series' ? parseSeriesRouteId(id) : null;
    const imdbId = seriesRouteData?.imdbId || normalizeImdbId(id);

    // Validate IMDB ID
    if (!imdbId) {
      console.warn(`[API] Invalid IMDB ID: ${id}`);
      return res.status(400).json({ 
        error: 'Invalid IMDB ID',
        streams: [] 
      });
    }

    // Validate type
    if (!['movie', 'series'].includes(type)) {
      return res.status(400).json({ 
        error: 'Invalid type',
        streams: [] 
      });
    }

    console.log(`[API] Stream request: ${type} ${imdbId}`);

    let streams = [];

    if (type === 'movie') {
      // Extract movie streams
      streams = await scraper.extractMovieStreams(imdbId);
    } else if (type === 'series') {
      // Route tuple values take precedence over query params.
      const { season, episode } = parseSeasonEpisode(req.query, {
        season: seriesRouteData?.season,
        episode: seriesRouteData?.episode,
      });
      
      // Validate season and episode
      if (!isValidEpisodeNumber(season) || !isValidEpisodeNumber(episode)) {
        return res.status(400).json({ 
          error: 'Invalid season or episode',
          streams: [] 
        });
      }

      console.log(`[API] Series request: S${season}E${episode}`);
      
      // Extract series streams
      streams = await scraper.extractSeriesStreams(imdbId, season, episode);
    }

    // Serialize streams for Stremio
    const response = serializeStreams(streams, imdbId);
    
    console.log(`[API] Returning ${response.streams.length} stream(s)`);
    
    // Set cache headers
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
    
    res.json(response);
  } catch (error) {
    console.error('[API] Stream error:', error.message);
    res.status(500).json({ 
      error: 'Internal server error',
      streams: [] 
    });
  }
});

/**
 * Subtitles endpoint
 */
app.get('/subtitles/:type/:id.json', async (req, res) => {
  try {
    const { type, id } = req.params;
    
    // Validate IMDB ID
    const imdbId = normalizeImdbId(id);
    if (!imdbId) {
      return res.status(400).json({ error: 'Invalid IMDB ID' });
    }

    // Get subtitles
    const subtitles = await scraper.getSubtitles(imdbId);
    
    res.json({ subtitles });
  } catch (error) {
    console.error('[API] Subtitles error:', error.message);
    res.json({ subtitles: [] });
  }
});

/**
 * Cache stats endpoint (for debugging)
 */
app.get('/info', (req, res) => {
  const stats = scraper.getCacheStats();
  res.json({
    addon: manifest.name,
    version: manifest.version,
    cache: stats,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

/**
 * Clear cache endpoint (for debugging)
 */
app.post('/clear-cache', (req, res) => {
  scraper.clearCache();
  res.json({ message: 'Cache cleared' });
});

/**
 * Error handling middleware
 */
app.use((err, req, res, next) => {
  console.error('[API] Unhandled error:', err.message);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

if (isDirectExecution) {
  // Start server only when executed directly (not when imported by Vercel).
  app.listen(PORT, HOST, () => {
    console.log('🎬 MoviesDrive Stremio Addon Server');
    console.log(`📡 Server running at http://${HOST}:${PORT}`);
    console.log(`📋 Manifest available at http://${HOST}:${PORT}/manifest.json`);
    console.log(`💾 Node.js version: ${process.version}`);
    console.log('');
    console.log('Usage:');
    console.log(`  Stream:    http://${HOST}:${PORT}/stream/:type/:id.json`);
    console.log(`  Subtitles: http://${HOST}:${PORT}/subtitles/:type/:id.json`);
    console.log(`  Meta:      http://${HOST}:${PORT}/meta/:type/:id.json`);
    console.log(`  Health:    http://${HOST}:${PORT}/health`);
    console.log('');
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    process.exit(0);
  });
}

export default app;
