/**
 * MoviesDrive Stremio Addon - Vercel Serverless Entry Point
 * Works on all platforms: Web, Desktop, Android Mobile, Android TV
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { streamHandler, manifestHandler, catalogHandler, subtitlesHandler } from '../src/handlers/streams.js';

// Load environment variables
dotenv.config();

const app = express();

// Enable CORS for all origins (required for Stremio on all platforms)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  credentials: false,
  maxAge: 86400 // 24 hours
}));

// Parse JSON bodies
app.use(express.json());

// Request logging for debugging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`[${timestamp}] ${req.method} ${req.url} - IP: ${clientIP}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    addon: 'MoviesDrive',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    platform: 'vercel',
    cache_ttl: process.env.CACHE_TTL || '7200'
  });
});

// Manifest endpoint - CRITICAL for Stremio
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour cache
  
  const manifest = manifestHandler();
  res.json(manifest);
});

// Stream endpoint
app.get('/stream/:type/:id.json', async (req, res) => {
  try {
    const { type, id } = req.params;
    const { season, episode } = req.query;
    
    const args = {
      type,
      id,
      extra: {
        season: season ? parseInt(season) : undefined,
        episode: episode ? parseInt(episode) : undefined
      }
    };
    
    const result = await streamHandler(args);
    res.json(result);
  } catch (error) {
    console.error('Stream error:', error);
    res.status(500).json({ streams: [], error: error.message });
  }
});

// Catalog endpoint
app.get('/catalog/:type/:id.json', async (req, res) => {
  try {
    const { type, id } = req.params;
    const { search } = req.query;
    
    const args = {
      type,
      id,
      extra: { search }
    };
    
    const result = await catalogHandler(args);
    res.json(result);
  } catch (error) {
    console.error('Catalog error:', error);
    res.status(500).json({ metas: [], error: error.message });
  }
});

// Subtitles endpoint
app.get('/subtitles/:type/:id.json', async (req, res) => {
  try {
    const { type, id } = req.params;
    
    const args = { type, id, extra: {} };
    const result = await subtitlesHandler(args);
    res.json(result);
  } catch (error) {
    console.error('Subtitles error:', error);
    res.status(500).json({ subtitles: [], error: error.message });
  }
});

// Root endpoint - redirect to manifest
app.get('/', (req, res) => {
  res.redirect('/manifest.json');
});

// Handle 404s
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Export for Vercel serverless
export default app;
