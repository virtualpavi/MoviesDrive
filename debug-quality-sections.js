import MoviesDriveScraper from './src/scrapers/moviesdrive.js';

async function debugQualitySections(imdbId, season, episode) {
  console.log(`🔍 Debugging quality sections for series: ${imdbId} S${season}E${episode}`);
  
  const scraper = new MoviesDriveScraper();
  
  // Search for the series
  const result = await scraper.searchAndGetDocument(imdbId, season);
  if (!result) {
    console.log('❌ No results found');
    return;
  }

  const { $, document } = result;
  
  // Find the season heading
  const seasonMap = new Map();
  $('h2, h3, h4, h5').each((_, elem) => {
    const text = $(elem).text();
    const seasonMatch = text.match(/Season\s+(\d+)|S(\d+)/i);
    if (seasonMatch) {
      const seasonNum = parseInt(seasonMatch[1] || seasonMatch[2]);
      if (!seasonMap.has(seasonNum)) {
        seasonMap.set(seasonNum, { num: seasonNum, element: $(elem) });
      }
    }
  });

  const availableSeasons = Array.from(seasonMap.values());
  console.log(`📄 Available seasons on page: ${availableSeasons.map(s => s.num).join(', ')}`);

  const seasonData = availableSeasons.find(s => s.num === season);
  if (!seasonData) {
    console.log(`❌ Season ${season} not found`);
    return;
  }

  const seasonHeading = seasonData.element;
  console.log(`📄 Found season ${seasonData.num} heading: "${seasonHeading.text().trim()}"`);

  // Look for quality sections
  let currentElement = seasonHeading.next();
  let sectionIndex = 0;
  
  while (currentElement.length > 0 && !currentElement.is('h2, h3, h4')) {
    const text = currentElement.text();
    const qualityMatch = text.match(/(\d{3,4})p|4K|2160p/i);
    
    if (qualityMatch) {
      sectionIndex++;
      console.log(`\n🔍 Quality Section ${sectionIndex}:`);
      console.log(`  Text: "${text}"`);
      console.log(`  Quality: ${qualityMatch[1] ? parseInt(qualityMatch[1]) : 2160}p`);
      
      // Look for links in this section
      let sectionElement = currentElement;
      let linkFound = false;
      
      while (sectionElement.length > 0 && !sectionElement.is('h2, h3, h4')) {
        const sectionText = sectionElement.text();
        console.log(`  Section element text: "${sectionText}"`);
        
        // Check if this section contains episode patterns
        const episodePattern = new RegExp(`ep\\s*0*${episode}\\b|episode\\s+0*${episode}\\b|e\\s*0*${episode}\\b|s\\d+e0*${episode}\\b`, 'i');
        const hasEpisodePattern = episodePattern.test(sectionText);
        console.log(`  Contains episode ${episode} pattern: ${hasEpisodePattern}`);
        
        if (sectionElement.find('a').length > 0) {
          console.log(`  Found ${sectionElement.find('a').length} links in this element:`);
          sectionElement.find('a').each((_, linkElem) => {
            const href = $(linkElem).attr('href');
            const linkText = $(linkElem).text();
            if (href) {
              const fullUrl = href.startsWith('http') ? href : new URL(href, scraper.apiUrl).href;
              console.log(`    - Link: "${linkText}" -> ${fullUrl}`);
              
              // Check if this link matches the episode
              const linkMatchesEpisode = episodePattern.test(linkText);
              console.log(`      Matches episode ${episode}: ${linkMatchesEpisode}`);
              
              if (linkMatchesEpisode) {
                linkFound = true;
                console.log(`    ✅ EPISODE ${episode} LINK FOUND!`);
              }
            }
          });
        }
        
        // Stop if we hit another quality section
        if (sectionElement !== currentElement && sectionText.match(/(\d{3,4})p|4K|2160p/i)) {
          console.log(`  📋 Hit another quality section, stopping`);
          break;
        }
        
        sectionElement = sectionElement.next();
      }
      
      if (!linkFound) {
        console.log(`  ❌ No episode ${episode} links found in this quality section`);
      }
    }
    
    currentElement = currentElement.next();
  }
}

// Get IMDB ID from command line arguments
const imdbId = process.argv[2] || 'tt14186672';
const season = parseInt(process.argv[3]) || 1;
const episode = parseInt(process.argv[4]) || 1;

debugQualitySections(imdbId, season, episode).catch(console.error);