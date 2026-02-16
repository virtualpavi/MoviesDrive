#!/usr/bin/env node

/**
 * Test script to extract and display streams for a specific TV series episode
 * Usage: node test-series.js [IMDB_ID] [SEASON] [EPISODE]
 * Example: node test-series.js tt14186672 1 1
 */

import 'dotenv/config';
import MoviesDriveScraper from './src/scrapers/moviesdrive.js';

const args = process.argv.slice(2);

if (args.length < 3) {
  console.error('Usage: node test-series.js [IMDB_ID] [SEASON] [EPISODE]');
  console.error('');
  console.error('Example:');
  console.error('  node test-series.js tt14186672 1 1');
  console.error('');
  console.error('Test series:');
  console.error('  - Landman: tt14186672');
  console.error('  - Breaking Bad: tt0903747');
  console.error('  - Game of Thrones: tt0944947');
  process.exit(1);
}

const imdbId = args[0];
const season = parseInt(args[1]);
const episode = parseInt(args[2]);

if (!imdbId.startsWith('tt')) {
  console.error('Invalid IMDB ID. Must start with "tt"');
  process.exit(1);
}

console.log('='.repeat(80));
console.log(`📺 Testing Series Stream Extraction`);
console.log(`   Series: ${imdbId}`);
console.log(`   Season: ${season}`);
console.log(`   Episode: ${episode}`);
console.log('='.repeat(80));
console.log('');

async function testSeriesStreams() {
  const scraper = new MoviesDriveScraper();

  try {
    console.log('📋 Fetching streams...');
    console.log('');

    const streams = await scraper.extractSeriesStreams(imdbId, season, episode);

    if (streams.length === 0) {
      console.log('✗ No streams found');
      console.log('');
      console.log('Possible reasons:');
      console.log('  - Series not available on MoviesDrive');
      console.log('  - Season/Episode not found');
      console.log('  - Network error');
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
        console.log(`  [${i + 1}] Source: ${stream.source}`);
        console.log(`      Title: ${stream.title || 'N/A'}`);
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

testSeriesStreams().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
