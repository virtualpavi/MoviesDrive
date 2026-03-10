/**
 * Debug script for Laughter Chefs series stream extraction
 */

import 'dotenv/config';
import MoviesDriveScraper from './src/scrapers/moviesdrive.js';

async function main() {
  const scraper = new MoviesDriveScraper();
  const imdbId = 'tt32590226';
  const season = 3;
  const episode = 1;
  
  console.log('='.repeat(80));
  console.log(`Testing Series Stream Extraction for ${imdbId}`);
  console.log(`Season: ${season}, Episode: ${episode}`);
  console.log('='.repeat(80));
  console.log('API URL:', scraper.apiUrl);
  console.log();

  try {
    // Step 1: Search and get document
    console.log('Step 1: Searching for series...');
    const result = await scraper.searchAndGetDocument(imdbId, season);
    
    if (!result) {
      console.log('❌ No search results found');
      return;
    }
    
    console.log('✅ Found document:');
    console.log('  - Title:', result.document?.post_title || result.document?.title);
    console.log('  - Permalink:', result.document?.permalink);
    console.log('  - IMDB ID:', result.document?.imdb_id);
    console.log();

    // Step 2: Extract streams
    console.log('Step 2: Extracting streams...');
    const streams = await scraper.extractSeriesStreams(imdbId, season, episode);
    
    console.log(`\nFound ${streams.length} streams`);
    
    if (streams.length === 0) {
      console.log('\n❌ No streams found. Let me check the page structure...\n');
      
      // Check page content
      console.log('Checking h5 tags on the page:');
      const h5Count = result.$('h5').length;
      console.log(`Total h5 tags: ${h5Count}`);
      
      console.log('\nFirst 15 h5 tags:');
      result.$('h5').slice(0, 15).each((i, elem) => {
        const text = result.$(elem).text().trim();
        const hasLink = result.$(elem).find('a[href]').length > 0;
        console.log(`  ${i + 1}. ${text.substring(0, 120)}${text.length > 120 ? '...' : ''}${hasLink ? ' [has link]' : ''}`);
      });
      
      return;
    }
    
    streams.forEach((stream, i) => {
      console.log(`\nStream ${i + 1}:`);
      console.log(`  - Title: ${stream.title}`);
      console.log(`  - Quality: ${stream.quality}p`);
      console.log(`  - Source: ${stream.source}`);
      console.log(`  - Size: ${stream.fileSize || 'N/A'}`);
      console.log(`  - URL: ${stream.url.substring(0, 80)}...`);
    });

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

main();
