import MoviesDriveScraper from './src/scrapers/moviesdrive.js';

async function testMovieExtraction(imdbId) {
  console.log(`================================================================================`);
  console.log(`📺 Testing Movie Stream Extraction`);
  console.log(`   Movie: ${imdbId}`);
  console.log(`================================================================================`);

  const scraper = new MoviesDriveScraper();
  
  try {
    const streams = await scraper.extractMovieStreams(imdbId, 'Test Movie');
    
    console.log(`\n📋 Fetching streams...`);
    console.log(`\n📊 Stream Summary:`);
    
    if (streams.length === 0) {
      console.log(`✗ No streams found`);
      console.log(`\nPossible reasons:`);
      console.log(`  - Movie not available on MoviesDrive`);
      console.log(`  - Network error`);
      return;
    }

    // Group by quality
    const qualityGroups = {};
    streams.forEach(stream => {
      const quality = stream.quality || 720;
      if (!qualityGroups[quality]) {
        qualityGroups[quality] = [];
      }
      qualityGroups[quality].push(stream);
    });

    // Sort qualities in descending order
    const sortedQualities = Object.keys(qualityGroups).map(Number).sort((a, b) => b - a);

    let totalStreams = 0;
    
    for (const quality of sortedQualities) {
      const qualityStreams = qualityGroups[quality];
      totalStreams += qualityStreams.length;
      
      console.log(`\n📊 ${quality}p Quality (${qualityStreams.length} streams)`);
      console.log(`----------------------------------------------------------------------------`);
      
      qualityStreams.forEach((stream, idx) => {
        console.log(`  [${idx + 1}] Source: ${stream.source}`);
        if (stream.title && stream.title !== 'N/A') {
          console.log(`      Title: ${stream.title}`);
        }
        console.log(`      URL: ${stream.url}`);
      });
    }

    console.log(`\n================================================================================`);
    console.log(`✓ Total: ${totalStreams} unique stream(s)`);
    console.log(`================================================================================`);
    
    // Save full output to file if there are many streams
    if (totalStreams > 10) {
      const fs = await import('fs/promises');
      const output = `Full output saved to: ${process.cwd()}/movie-output.txt\n`;
      await fs.writeFile('movie-output.txt', output);
      console.log(output);
    }
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

// Get IMDB ID from command line arguments
const imdbId = process.argv[2] || 'tt32820897';

testMovieExtraction(imdbId).catch(console.error);