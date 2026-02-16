#!/usr/bin/env node

/**
 * Debug script to analyze Season 1 page structure
 * Usage: node debug-season1.js [IMDB_ID]
 */

import 'dotenv/config';
import HttpClient from './src/http-client.js';
import { load } from 'cheerio';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node debug-season1.js [IMDB_ID]');
  console.error('Example: node debug-season1.js tt14186672');
  process.exit(1);
}

const imdbId = args[0];

async function debugSeason1() {
  const http = new HttpClient();
  
  console.log(`🔍 Debugging Season 1 for series: ${imdbId}\n`);
  
  try {
    // Step 1: Search API
    const searchUrl = `https://new1.moviesdrive.surf/searchapi.php?q=${imdbId}`;
    console.log(`📡 Searching: ${searchUrl}`);
    
    const searchResponse = await http.get(searchUrl);
    const searchData = JSON.parse(searchResponse.text);
    
    if (!searchData.hits || searchData.hits.length === 0) {
      console.log('❌ No results found');
      return;
    }
    
    console.log(`✅ Found ${searchData.hits.length} result(s)\n`);
    
    // Find Season 1 result
    const season1Result = searchData.hits.find(hit => {
      const permalink = hit.document.permalink || '';
      return /season-1/i.test(permalink);
    });
    
    if (!season1Result) {
      console.log('❌ No Season 1 result found');
      return;
    }
    
    const doc = season1Result.document;
    console.log(`📄 Season 1 Result:`);
    console.log(`  Title: ${doc.title || 'N/A'}`);
    console.log(`  Permalink: ${doc.permalink || 'N/A'}`);
    console.log(`  Type: ${doc.type || 'N/A'}`);
    console.log(`  Season: ${doc.season || 'N/A'}`);
    console.log('');
    
    // Step 2: Fetch Season 1 content page
    const contentUrl = `https://new1.moviesdrive.surf${doc.permalink}`;
    console.log(`📡 Fetching Season 1 content page: ${contentUrl}`);
    
    const contentResponse = await http.get(contentUrl);
    const $ = load(contentResponse.text);
    
    console.log(`\n📄 Page Title: ${$('title').text()}`);
    console.log(`📄 Page length: ${contentResponse.text.length} bytes\n`);
    
    // Step 3: Find all h5 elements (season/quality headers)
    console.log('🔍 Looking for h5 elements (season/quality headers):');
    $('h5').each((i, elem) => {
      const $h5 = $(elem);
      const text = $h5.text().trim();
      console.log(`\n  [${i}] ${text.substring(0, 100)}`);
      
      // Look for links in parent container and siblings
      let linkCount = 0;
      
      // Check parent's next siblings
      const $parent = $h5.parent();
      let $container = $h5.next();
      
      // Check up to 3 levels deep for links
      for (let depth = 0; depth < 3; depth++) {
        if ($container.length === 0) break;
        
        const $links = $container.find('a').add($container.filter('a'));
        $links.each((_, linkElem) => {
          const $link = $(linkElem);
          const href = $link.attr('href');
          const linkText = $link.text().trim();
          if (href) {
            console.log(`      → Link [depth ${depth}]: ${linkText.substring(0, 50)} | ${href.substring(0, 60)}`);
            linkCount++;
          }
        });
        
        $container = $container.next();
      }
      
      if (linkCount === 0) {
        console.log(`      (no links found in container)`);
      }
    });

    
    // Step 4: Look for specific patterns
    console.log('\n🔍 Looking for "Single Episode" or "Zip" patterns:');
    const pageText = contentResponse.text;
    
    const singleEpisodeMatches = pageText.match(/Single Episode/gi);
    const zipMatches = pageText.match(/Zip/gi);
    const episodeMatches = pageText.match(/Ep\d+|Episode \d+/gi);
    
    console.log(`  "Single Episode" mentions: ${singleEpisodeMatches ? singleEpisodeMatches.length : 0}`);
    console.log(`  "Zip" mentions: ${zipMatches ? zipMatches.length : 0}`);
    console.log(`  Episode patterns found: ${episodeMatches ? episodeMatches.slice(0, 10).join(', ') : 'none'}`);
    
    // Step 5: Look for quality headers
    console.log('\n🔍 Quality headers found:');
    const qualities = ['480p', '720p', '1080p', '2160p', '4K'];
    qualities.forEach(q => {
      const regex = new RegExp(q, 'gi');
      const matches = pageText.match(regex);
      if (matches) {
        console.log(`  ${q}: ${matches.length} mentions`);
      }
    });
    
    // Step 6: Look for episode-specific content
    console.log('\n🔍 Looking for episode-specific content:');
    const episode1Patterns = [
      /ep\s*0*1\b/i,
      /episode\s+0*1\b/i,
      /e\s*0*1\b/i,
      /s\d+e0*1\b/i
    ];
    
    episode1Patterns.forEach((pattern, i) => {
      const matches = pageText.match(pattern);
      console.log(`  Pattern ${i + 1} (${pattern}): ${matches ? matches.length : 0} matches`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

debugSeason1();