#!/usr/bin/env node

/**
 * Test script to extract and display streams for a specific IMDB ID
 * Usage: node test-streams.js [IMDB_ID]
 */

import 'dotenv/config';
import MoviesDriveScraper from './src/scrapers/moviesdrive.js';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node test-streams.js [IMDB_ID]');
  console.error('');
  console.error('Example:');
  console.error('  node test-streams.js tt32820897');
  process.exit(1);
}

const imdbId = args[0];

if (!imdbId.startsWith('tt')) {
  console.error('Invalid IMDB ID. Must start with "tt"');
  process.exit(1);
}

console.log('='.repeat(80));
console.log(`🎬 Testing Stream Extraction for: ${imdbId}`);
console.log('='.repeat(80));
console.log('');

async function testStreams() {
  const scraper = new MoviesDriveScraper();

  try {
    console.log('📋 Fetching streams...');
    console.log('');

    const streams = await scraper.extractMovieStreams(imdbId, 'Test Movie');

    if (streams.length === 0) {
      console.log('✗ No streams found');
      return;
    }

    console.log(`✓ Found ${streams.length} stream(s):`);
    console.log('');

    // Group by quality
    const byQuality = {};
    streams.forEach(stream => {
      if (!byQuality[stream.quality]) {
        byQuality[stream.quality] = [];
      }
      byQuality[stream.quality].push(stream);
    });

    // Sort qualities descending
    const qualities = Object.keys(byQuality).map(q => parseInt(q)).sort((a, b) => b - a);

    qualities.forEach(quality => {
      const streamsAtQuality = byQuality[quality];
      console.log(`📊 ${quality}p Quality (${streamsAtQuality.length} stream${streamsAtQuality.length !== 1 ? 's' : ''})`);
      console.log('-'.repeat(76));

      streamsAtQuality.forEach((stream, i) => {
        console.log(`  [${i + 1}] Title: ${stream.title || 'N/A'}`);
        console.log(`      Source: ${stream.source}`);
        console.log(`      URL: ${stream.url}`);
        console.log('');
      });

    });

    console.log('='.repeat(80));
    console.log(`✓ Total: ${streams.length} unique stream(s)`);
    console.log('='.repeat(80));

  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.error(error.stack);
  }
}

testStreams().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
