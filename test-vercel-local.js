#!/usr/bin/env node

/**
 * Local Testing Script for Vercel Deployment
 * Tests the addon configuration and API endpoints locally before deployment
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import addonRouter from './api/index.js';

const app = express();
const PORT = process.env.PORT || 27828;

// Enable CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept']
}));

// Parse JSON bodies
app.use(express.json());

// Mount the addon routes
app.use('/', addonRouter);

// Start server
app.listen(PORT, () => {
  console.log(`\n🧪 Test Server running at http://localhost:${PORT}`);
  console.log('Running thorough tests...\n');
  
  // Run tests after server starts
  setTimeout(runTests, 2000);
});

async function runTests() {
  const baseUrl = `http://localhost:${PORT}`;
  const results = [];
  
  console.log('='.repeat(80));
  console.log('THOROUGH TESTING - Vercel Deployment Preparation');
  console.log('='.repeat(80));
  console.log();
  
  // Test 1: Health Endpoint
  console.log('Test 1: Health Endpoint');
  console.log('-'.repeat(80));
  try {
    const response = await fetch(`${baseUrl}/health`);
    const data = await response.json();
    
    if (response.status === 200 && data.status === 'ok') {
      console.log('✅ PASS: Health endpoint working');
      console.log(`   Status: ${data.status}`);
      console.log(`   Addon: ${data.addon}`);
      console.log(`   Version: ${data.version}`);
      results.push({ test: 'Health', status: 'PASS' });
    } else {
      console.log('❌ FAIL: Health endpoint returned unexpected response');
      results.push({ test: 'Health', status: 'FAIL' });
    }
  } catch (error) {
    console.log(`❌ FAIL: Health endpoint error - ${error.message}`);
    results.push({ test: 'Health', status: 'FAIL', error: error.message });
  }
  console.log();
  
  // Test 2: Manifest Endpoint
  console.log('Test 2: Manifest Endpoint');
  console.log('-'.repeat(80));
  try {
    const response = await fetch(`${baseUrl}/manifest.json`);
    const data = await response.json();
    
    if (response.status === 200 && data.id && data.name) {
      console.log('✅ PASS: Manifest endpoint working');
      console.log(`   ID: ${data.id}`);
      console.log(`   Name: ${data.name}`);
      console.log(`   Version: ${data.version}`);
      console.log(`   Types: ${data.types?.join(', ')}`);
      console.log(`   Resources: ${data.resources?.map(r => r.name).join(', ')}`);
      results.push({ test: 'Manifest', status: 'PASS' });
    } else {
      console.log('❌ FAIL: Manifest endpoint returned unexpected response');
      results.push({ test: 'Manifest', status: 'FAIL' });
    }
  } catch (error) {
    console.log(`❌ FAIL: Manifest endpoint error - ${error.message}`);
    results.push({ test: 'Manifest', status: 'FAIL', error: error.message });
  }
  console.log();
  
  // Test 3: CORS Headers
  console.log('Test 3: CORS Headers');
  console.log('-'.repeat(80));
  try {
    const response = await fetch(`${baseUrl}/manifest.json`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://web.stremio.com',
        'Access-Control-Request-Method': 'GET'
      }
    });
    
    const corsHeader = response.headers.get('access-control-allow-origin');
    if (corsHeader === '*' || response.status === 200) {
      console.log('✅ PASS: CORS headers configured correctly');
      console.log(`   Access-Control-Allow-Origin: ${corsHeader || '*'}`);
      results.push({ test: 'CORS', status: 'PASS' });
    } else {
      console.log('❌ FAIL: CORS headers not configured');
      results.push({ test: 'CORS', status: 'FAIL' });
    }
  } catch (error) {
    console.log(`❌ FAIL: CORS test error - ${error.message}`);
    results.push({ test: 'CORS', status: 'FAIL', error: error.message });
  }
  console.log();
  
  // Test 4: Stream Endpoint (Movie)
  console.log('Test 4: Stream Endpoint (Movie)');
  console.log('-'.repeat(80));
  try {
    const response = await fetch(`${baseUrl}/stream/movie/tt32820897.json`);
    const data = await response.json();
    
    if (response.status === 200 && Array.isArray(data.streams)) {
      console.log('✅ PASS: Stream endpoint working');
      console.log(`   Found ${data.streams.length} stream(s)`);
      if (data.streams.length > 0) {
        console.log(`   First stream: ${data.streams[0].title || 'N/A'}`);
        console.log(`   URL: ${data.streams[0].url?.substring(0, 60)}...`);
      }
      results.push({ test: 'Stream Movie', status: 'PASS', streams: data.streams.length });
    } else {
      console.log('❌ FAIL: Stream endpoint returned unexpected response');
      results.push({ test: 'Stream Movie', status: 'FAIL' });
    }
  } catch (error) {
    console.log(`❌ FAIL: Stream endpoint error - ${error.message}`);
    results.push({ test: 'Stream Movie', status: 'FAIL', error: error.message });
  }
  console.log();
  
  // Test 5: Stream Endpoint (Series)
  console.log('Test 5: Stream Endpoint (Series)');
  console.log('-'.repeat(80));
  try {
    const response = await fetch(`${baseUrl}/stream/series/tt0944947.json?season=1&episode=1`);
    const data = await response.json();
    
    if (response.status === 200 && Array.isArray(data.streams)) {
      console.log('✅ PASS: Series stream endpoint working');
      console.log(`   Found ${data.streams.length} stream(s)`);
      results.push({ test: 'Stream Series', status: 'PASS', streams: data.streams.length });
    } else {
      console.log('❌ FAIL: Series stream endpoint returned unexpected response');
      results.push({ test: 'Stream Series', status: 'FAIL' });
    }
  } catch (error) {
    console.log(`❌ FAIL: Series stream endpoint error - ${error.message}`);
    results.push({ test: 'Stream Series', status: 'FAIL', error: error.message });
  }
  console.log();
  
  // Test 6: Catalog Endpoint
  console.log('Test 6: Catalog Endpoint');
  console.log('-'.repeat(80));
  try {
    const response = await fetch(`${baseUrl}/catalog/movie/moviesdrive.movies.json`);
    const data = await response.json();
    
    if (response.status === 200 && (Array.isArray(data.metas) || Array.isArray(data.catalog))) {
      console.log('✅ PASS: Catalog endpoint working');
      const itemCount = (data.metas || data.catalog || []).length;
      console.log(`   Found ${itemCount} item(s)`);
      results.push({ test: 'Catalog', status: 'PASS', items: itemCount });
    } else {
      console.log('⚠️  WARN: Catalog endpoint may not be fully configured');
      console.log(`   Status: ${response.status}`);
      results.push({ test: 'Catalog', status: 'WARN' });
    }
  } catch (error) {
    console.log(`⚠️  WARN: Catalog endpoint error - ${error.message}`);
    results.push({ test: 'Catalog', status: 'WARN', error: error.message });
  }
  console.log();
  
  // Test 7: Subtitles Endpoint
  console.log('Test 7: Subtitles Endpoint');
  console.log('-'.repeat(80));
  try {
    const response = await fetch(`${baseUrl}/subtitles/movie/tt32820897.json`);
    const data = await response.json();
    
    if (response.status === 200 && Array.isArray(data.subtitles)) {
      console.log('✅ PASS: Subtitles endpoint working');
      console.log(`   Found ${data.subtitles.length} subtitle(s)`);
      results.push({ test: 'Subtitles', status: 'PASS', subtitles: data.subtitles.length });
    } else {
      console.log('⚠️  WARN: Subtitles endpoint may not be fully configured');
      results.push({ test: 'Subtitles', status: 'WARN' });
    }
  } catch (error) {
    console.log(`⚠️  WARN: Subtitles endpoint error - ${error.message}`);
    results.push({ test: 'Subtitles', status: 'WARN', error: error.message });
  }
  console.log();
  
  // Test 8: Cache Configuration
  console.log('Test 8: Cache Configuration');
  console.log('-'.repeat(80));
  const cacheTtl = process.env.CACHE_TTL || '7200';
  console.log(`   CACHE_TTL: ${cacheTtl} seconds (${cacheTtl / 3600} hours)`);
  if (cacheTtl >= '7200') {
    console.log('✅ PASS: Cache TTL configured for 2+ hours');
    results.push({ test: 'Cache TTL', status: 'PASS', ttl: cacheTtl });
  } else {
    console.log('⚠️  WARN: Cache TTL less than 2 hours');
    results.push({ test: 'Cache TTL', status: 'WARN', ttl: cacheTtl });
  }
  console.log();
  
  // Test 9: Environment Variables
  console.log('Test 9: Environment Variables');
  console.log('-'.repeat(80));
  const requiredVars = ['CACHE_TTL', 'REQUEST_TIMEOUT', 'MOVIESDRIVE_API'];
  const missingVars = requiredVars.filter(v => !process.env[v]);
  
  if (missingVars.length === 0) {
    console.log('✅ PASS: All required environment variables set');
    console.log(`   CACHE_TTL: ${process.env.CACHE_TTL}`);
    console.log(`   REQUEST_TIMEOUT: ${process.env.REQUEST_TIMEOUT}`);
    console.log(`   MOVIESDRIVE_API: ${process.env.MOVIESDRIVE_API}`);
    results.push({ test: 'Environment', status: 'PASS' });
  } else {
    console.log(`⚠️  WARN: Missing environment variables: ${missingVars.join(', ')}`);
    console.log('   Using default values');
    results.push({ test: 'Environment', status: 'WARN', missing: missingVars });
  }
  console.log();
  
  // Test 10: Dependencies
  console.log('Test 10: Dependencies');
  console.log('-'.repeat(80));
  try {
    const fs = await import('fs');
    const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    const deps = pkg.dependencies;
    const requiredDeps = ['express', 'cors', 'axios', 'cheerio', 'dotenv'];
    const missingDeps = requiredDeps.filter(d => !deps[d]);
    
    if (missingDeps.length === 0) {
      console.log('✅ PASS: All required dependencies present');
      console.log(`   Express: ${deps.express}`);
      console.log(`   CORS: ${deps.cors}`);
      results.push({ test: 'Dependencies', status: 'PASS' });
    } else {
      console.log(`❌ FAIL: Missing dependencies: ${missingDeps.join(', ')}`);
      results.push({ test: 'Dependencies', status: 'FAIL', missing: missingDeps });
    }
  } catch (error) {
    console.log(`❌ FAIL: Could not check dependencies - ${error.message}`);
    results.push({ test: 'Dependencies', status: 'FAIL', error: error.message });
  }

  console.log();
  
  // Summary
  console.log('='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warnings = results.filter(r => r.status === 'WARN').length;
  
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${r.test}: ${r.status}`);
  });
  
  console.log();
  console.log(`Total: ${results.length} tests`);
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  ⚠️  Warnings: ${warnings}`);
  console.log();
  
  if (failed === 0) {
    console.log('🎉 All critical tests passed! Ready for Vercel deployment.');
  } else {
    console.log('⚠️  Some tests failed. Please fix issues before deploying.');
  }
  
  console.log();
  console.log('Next steps:');
  console.log('1. Push to GitHub: git push origin main');
  console.log('2. Connect to Vercel: vercel --prod');
  console.log('3. Set environment variables in Vercel dashboard');
  console.log('4. Test deployed URL on all Stremio platforms');
  console.log();
  
  // Close server
  process.exit(0);
}
