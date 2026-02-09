#!/usr/bin/env node

/**
 * MoviesDrive Stremio Addon Server
 * Main entry point for the addon
 * Implements Stremio addon protocol
 */

import 'dotenv/config';
import express from 'express';
import { streamHandler, manifestHandler, subtitlesHandler } from './handlers/streams.js';

const PORT = process.env.PORT || 27828;
// Use '0.0.0.0' to allow connections from any device on the network (Android TV, etc.)
// Can be overridden with HOST environment variable for specific network configurations
const HOST = process.env.HOST || '0.0.0.0';

// Log configuration for debugging
console.log(`[Config] HOST=${HOST}, PORT=${PORT}`);

// Create addon manifest
const addonConfig = manifestHandler();

// Create Express app
const app = express();

// Middleware
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${clientIp}`);
  next();
});

// Enable CORS for Stremio - Enhanced for cross-platform compatibility
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
  res.header('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Routes
app.get('/manifest.json', (req, res) => {
  console.log('[Manifest] Serving manifest.json');
  // Ensure proper content type for Stremio
  res.setHeader('Content-Type', 'application/json');
  res.json(addonConfig);
});

app.get('/stream/:type/:id.json', async (req, res) => {
  try {
    const { type, id } = req.params;
    const season = req.query.season ? parseInt(req.query.season) : 1;
    const episode = req.query.episode ? parseInt(req.query.episode) : 1;

    const result = await streamHandler({
      type,
      id,
      extra: { season, episode },
    });

    res.json(result);
  } catch (error) {
    console.error('Stream handler error:', error);
    res.status(500).json({ error: error.message, streams: [] });
  }
});

app.get('/subtitles/:type/:id.json', async (req, res) => {
  try {
    const { type, id } = req.params;

    const result = await subtitlesHandler({
      type,
      id,
    });

    res.json(result);
  } catch (error) {
    console.error('Subtitles handler error:', error);
    res.status(500).json({ error: error.message, subtitles: [] });
  }
});

app.get('/meta/:type/:id.json', (req, res) => {
  const { type, id } = req.params;
  res.json({
    meta: {
      id,
      type,
      name: 'Content',
    },
  });
});

app.get('/catalog/:type/:id.json', (req, res) => {
  res.json({
    metas: [],
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`[Health] Health check from ${clientIp}`);
  res.json({
    status: 'ok',
    addon: 'MoviesDrive',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Info endpoint
app.get('/info', (req, res) => {
  res.json({
    addon: addonConfig,
    uptime: process.uptime(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
  });
});

// Start server
const server = app.listen(PORT, HOST, async () => {
  console.log(`🎬 MoviesDrive Stremio Addon Server`);
  console.log(`📡 Server running at http://${HOST}:${PORT}`);
  console.log(`📋 Manifest available at http://${HOST}:${PORT}/manifest.json`);
  console.log(`💾 Node.js version: ${process.version}`);
  console.log('');
  
  // Display connection info for different platforms
  console.log('🔗 Connection URLs:');
  console.log(`  Local (Desktop):    http://localhost:${PORT}/manifest.json`);
  console.log(`  Network (All IPs):  http://0.0.0.0:${PORT}/manifest.json`);
  
  // Try to get all local IPs for Android TV connection
  try {
    const os = await import('os');
    const interfaces = os.default.networkInterfaces();
    let ipFound = false;
    
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // Skip internal and non-IPv4 addresses
        if (iface.family === 'IPv4' && !iface.internal && iface.address) {
          console.log(`  Android TV URL:     http://${iface.address}:${PORT}/manifest.json`);
          ipFound = true;
        }
      }
    }
    
    if (!ipFound) {
      console.log('  ⚠️  No external IP found. Check network connection.');
    }
  } catch (err) {
    console.log('  ⚠️  Could not detect network interfaces');
  }
  
  console.log('');
  console.log('📱 To connect from Android TV:');
  console.log('   1. Make sure this PC and Android TV are on the same WiFi');
  console.log('   2. Use one of the "Android TV URL" addresses above');
  console.log('   3. If connection fails, check Windows Firewall settings');
  console.log('');
  console.log('🔧 Windows Firewall Fix:');
  console.log('   Run PowerShell as Admin and execute:');
  console.log(`   netsh advfirewall firewall add rule name="Stremio Addon" dir=in action=allow protocol=TCP localport=${PORT}`);
  console.log('');
  console.log('Usage:');
  console.log(`  Stream:    http://${HOST}:${PORT}/stream/:type/:id.json`);
  console.log(`  Subtitles: http://${HOST}:${PORT}/subtitles/:type/:id.json`);
  console.log(`  Meta:      http://${HOST}:${PORT}/meta/:type/:id.json`);
  console.log(`  Health:    http://${HOST}:${PORT}/health`);
});

// Log when server actually starts listening
server.on('listening', () => {
  const addr = server.address();
  console.log(`[Server] Listening on ${addr.address}:${addr.port}`);
});

// Handle server errors
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Try: PORT=${parseInt(PORT)+1} npm start`);
  } else {
    console.error('❌ Server error:', err.message);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Termination signal received...');
  server.close(() => {
    process.exit(0);
  });
});

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

export default app;
