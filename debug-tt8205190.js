/**
 * Debug script for tt8205190 movie stream extraction
 */

import 'dotenv/config';
import MoviesDriveScraper from './src/scrapers/moviesdrive.js';

async function main() {
  const scraper = new MoviesDriveScraper();
  const imdbId = 'tt8205190';
  
  console.log('='.repeat(80));
  console.log(`Testing Movie Stream Extraction for ${imdbId}`);
  console.log('='.repeat(80));
  console.log('API URL:', scraper.apiUrl);
  console.log();

  try {
    // Step 1: Search and get document
    console.log('Step 1: Searching for movie...');
    const result = await scraper.searchAndGetDocument(imdbId);
    
    if (!result) {
      console.log('❌ No search results found');
      return;
    }
    
    console.log('✅ Found document:');
    console.log('  - Title:', result.document?.post_title || result.document?.title);
    console.log('  - Permalink:', result.document?.permalink);
    console.log('  - IMDB ID:', result.document?.imdb_id);
    console.log();

    // Step 2: Parse download blocks
    console.log('Step 2: Parsing download blocks...');
    const blocks = scraper.parseMovieDownloadBlocks(result.$);
    console.log(`Found ${blocks.length} download blocks`);
    
    if (blocks.length === 0) {
      console.log('❌ No download blocks found in the page HTML');
      console.log('Checking page structure...');
      
      // Check for h5 tags
      const h5Count = result.$('h5').length;
      console.log(`  - Total h5 tags: ${h5Count}`);
      
      // Check for links
      const linkCount = result.$('a[href]').length;
      console.log(`  - Total links: ${linkCount}`);
      
      // Show first few h5 tags
      console.log('\nFirst 10 h5 tags:');
      result.$('h5').slice(0, 10).each((i, elem) => {
        const text = result.$(elem).text().trim().substring(0, 100);
        const hasLink = result.$(elem).find('a[href]').length > 0;
        console.log(`  ${i + 1}. ${text}${hasLink ? ' [has link]' : ''}`);
      });
      
      return;
    }
    
    blocks.forEach((block, i) => {
      console.log(`  Block ${i + 1}:`);
      console.log(`    - Title: ${block.titleFromH5}`);
      console.log(`    - Quality: ${block.parsedQuality}p`);
      console.log(`    - URL: ${block.mdrivePageUrl}`);
    });
    console.log();

    // Step 3: Extract streams
    console.log('Step 3: Extracting streams...');
    const streams = await scraper.extractMovieStreams(imdbId);
    
    console.log(`\nFound ${streams.length} streams`);
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
