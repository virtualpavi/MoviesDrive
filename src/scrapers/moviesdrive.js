/**
 * MoviesDrive Scraper Module
 * Handles searching and extracting streaming links from MoviesDrive API
 * Uses extractors to get actual streaming URLs from hosting providers
 */

import HttpClient from '../http-client.js';
import SourceExtractors from '../utils.js';
import SubtitlesExtractor from '../subtitles.js';
import CacheManager from '../cache.js';
import { load } from 'cheerio';

class MoviesDriveScraper {
  constructor() {
    this.http = new HttpClient();
    this.extractors = new SourceExtractors();
    this.subtitles = new SubtitlesExtractor();
    this.apiUrl = process.env.MOVIESDRIVE_API || 'https://new1.moviesdrive.surf';
    this.cache = new CacheManager({
      ttl: (process.env.CACHE_TTL || 3600) * 1000, // Convert to ms
      maxSize: 500,
    });
  }

  /**
   * Extract hosting provider links from a page
   * Matches the Kotlin: extractMdrive function from CineStreamUtils.kt
   * Looks for links containing: hubcloud, gdflix, gdlink
   * @param {string} url - The URL to extract from
   * @returns {Promise<Array<string>>} Extracted hosting links
   */
  async extractMdrive(url) {
    try {
      const response = await this.http.get(url);
      
      // Safely handle text response
      const textResponse = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
      const $ = load(textResponse);
      const links = [];

      // Hosting providers that MoviesDrive uses
      // These are the providers mentioned in Kotlin: hubcloud, gdflix, gdlink
      const hostingProviders = [
        'hubcloud',
        'gdflix',
        'gdlink',
        'gdfilm',
        'filezone',
        'droplinks',
        'verystream',
        'uptobox',
        'mixdrop',
        'streamtape',
        'pixeldrain',
        'gofile'
      ];

      // Create regex pattern for all providers
      const providerRegex = new RegExp(hostingProviders.join('|'), 'i');

      // Select all <a> tags and extract hrefs that match hosting providers
      $('a').each((_, elem) => {
        const href = $(elem).attr('href');
        if (href && providerRegex.test(href)) {
          links.push(href);
        }
      });

      console.debug(`[MoviesDrive] Extracted ${links.length} hosting provider links from ${url}`);
      return [...new Set(links)]; // Remove duplicates
    } catch (error) {
      console.error(`[MoviesDrive] Error extracting links from ${url}:`, error.message);
      return [];
    }
  }

  /**
   * Search for content by IMDB ID
   * Matches the Kotlin: invokeMoviesdrive search logic
   * @param {string} imdbId - IMDB ID (e.g., 'tt1234567')
   * @returns {Promise<Object>} Search results document
   */
  async searchAndGetDocument(imdbId) {
    if (!imdbId || !imdbId.startsWith('tt')) {
      throw new Error('Invalid IMDB ID format');
    }

    // Check cache first
    const cacheKey = `moviesdrive-${imdbId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.debug(`[MoviesDrive] Using cached document for ${imdbId}`);
      return cached;
    }

    try {
      // Step 1: Search using the API
      const searchUrl = `${this.apiUrl}/searchapi.php?q=${imdbId}`;
      console.debug(`[MoviesDrive] Searching at: ${searchUrl}`);
      
      const response = await this.http.get(searchUrl);
      
      // Safely parse the response
      let data;
      try {
        const textData = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
        data = typeof textData === 'string' ? JSON.parse(textData) : textData;
      } catch (parseError) {
        console.error(`[MoviesDrive] Error parsing JSON for ${imdbId}:`, parseError.message);
        return null;
      }

      // Check if we have hits
      if (!data.hits || !Array.isArray(data.hits)) {
        console.warn(`[MoviesDrive] No hits found for ${imdbId}`);
        return null;
      }

      // Step 2: Find the matching document
      for (const hit of data.hits) {
        const doc = hit.document;
        if (doc.imdb_id === imdbId) {
          console.debug(`[MoviesDrive] Found matching document for ${imdbId}`);
          
          // Step 3: Get the actual content page using the permalink
          const contentUrl = this.apiUrl + doc.permalink;
          console.debug(`[MoviesDrive] Fetching content page: ${contentUrl}`);
          
          const contentResponse = await this.http.get(contentUrl);
          const textResponse = typeof contentResponse.text === 'string' 
            ? contentResponse.text 
            : JSON.stringify(contentResponse.text);
          
          // Parse HTML and return cheerio document
          const result = { document: load(textResponse), doc };
          
          // Cache the result
          this.cache.set(cacheKey, result);
          
          return result;
        }
      }

      console.warn(`[MoviesDrive] No matching document found for ${imdbId}`);
      return null;
    } catch (error) {
      console.error(`[MoviesDrive] Error in searchAndGetDocument for ${imdbId}:`, error.message);
      return null;
    }
  }

  /**
   * Parse download header text to extract metadata
   * @param {string} text - The header text
   * @returns {Object} Parsed metadata
   */
  parseDownloadHeader(text) {
    const metadata = {
      quality: '',
      codec: '',
      language: '',
      size: '',
      type: 'WEB-DL', // default
    };

    const textLower = text.toLowerCase();

    // Extract quality
    if (textLower.includes('4k') || textLower.includes('2160p')) {
      metadata.quality = '4K';
    } else if (textLower.includes('1080p')) {
      metadata.quality = '1080p';
    } else if (textLower.includes('720p')) {
      metadata.quality = '720p';
    } else if (textLower.includes('480p')) {
      metadata.quality = '480p';
    }

    // Extract codec
    if (textLower.includes('x265') || textLower.includes('hevc') || textLower.includes('h.265')) {
      metadata.codec = 'x265 HEVC';
    } else if (textLower.includes('x264') || textLower.includes('h.264')) {
      metadata.codec = 'x264';
    } else if (textLower.includes('10bit')) {
      metadata.codec = metadata.codec ? `${metadata.codec} 10BIT` : '10BIT';
    }

    // Extract language
    const langMatches = text.match(/\[(.*?)\]/g);
    if (langMatches) {
      for (const match of langMatches) {
        const lang = match.replace(/[\[\]]/g, '').trim();
        if (lang && !lang.match(/^\d/)) { // Skip if starts with number (likely size)
          metadata.language = lang;
          break;
        }
      }
    }

    // Extract file size
    const sizeMatch = text.match(/(\d+\.?\d*\s*(GB|MB|gb|mb))/i);
    if (sizeMatch) {
      metadata.size = sizeMatch[1].toUpperCase();
    }

    // Extract type (WEB-DL, BluRay, etc.)
    if (textLower.includes('web-dl') || textLower.includes('webdl')) {
      metadata.type = 'WEB-DL';
    } else if (textLower.includes('bluray') || textLower.includes('blu-ray')) {
      metadata.type = 'BluRay';
    } else if (textLower.includes('webrip')) {
      metadata.type = 'WEBRip';
    } else if (textLower.includes('hdrip')) {
      metadata.type = 'HDRip';
    }

    return metadata;
  }

  /**
   * Extract movie streams
   * Gets wrapper links and uses extractors to get actual streaming URLs
   */
  async extractMovieStreams(imdbId, title = '') {
    const result = await this.searchAndGetDocument(imdbId);
    if (!result) return [];

    const { document: $, doc } = result;
    const allStreams = [];

    // Get movie title from document or extract from HTML
    let movieTitle = doc.title || doc.name || title || 'Unknown Title';
    let movieYear = doc.year || '';
    
    // Try to extract title from HTML if not in document
    if (movieTitle === 'Unknown Title' || movieTitle === title) {
      // Try h1 tag
      const h1Text = $('h1').first().text().trim();
      if (h1Text) {
        // Clean up title - remove quality info and other metadata
        movieTitle = h1Text.replace(/\d{3,4}p.*$/i, '').replace(/\(.*?\)/g, '').trim();
      } else {
        // Try title tag
        const titleText = $('title').text().trim();
        if (titleText) {
          movieTitle = titleText.replace(/MoviesDrive/i, '').replace(/Download/i, '').trim();
        }
      }
    }

    try {
      const downloadHeaders = $('h5');
      console.log(`[MoviesDrive] Found ${downloadHeaders.length} download headers for ${imdbId}`);

      if (downloadHeaders.length === 0) {
        console.warn(`[MoviesDrive] No h5 headers found for ${imdbId}`);
        return [];
      }

      for (const headerElem of downloadHeaders) {
        const $header = $(headerElem);
        const headerText = $header.text().trim();
        const $link = $header.find('a').first();
        const href = $link.attr('href');

        if (!href) continue;

        // Parse metadata from header text
        const metadata = this.parseDownloadHeader(headerText);
        console.log(`[MoviesDrive] Processing: ${headerText.substring(0, 80)}...`);
        console.log(`[MoviesDrive] Metadata:`, metadata);

        try {
          // Extract wrapper links
          const wrapperLinks = await this.extractMdrive(href);
          console.log(`[MoviesDrive] Found ${wrapperLinks.length} wrapper link(s)`);

          // Extract from each wrapper link using actual extractors
          for (const wrapperUrl of wrapperLinks) {
            try {
              console.log(`[MoviesDrive] Extracting from wrapper: ${wrapperUrl.substring(0, 60)}...`);
              const extractedStreams = await this.extractors.extractFromUrl(wrapperUrl);

              if (extractedStreams.length > 0) {
                console.log(`[MoviesDrive] ✓ Got ${extractedStreams.length} stream(s) from extractor:`);
                
                // Add metadata to each stream
                extractedStreams.forEach((s, i) => {
                  console.log(`  [${i + 1}] ${s.source} (${s.quality}p): ${s.url.substring(0, 70)}`);
                  
                  // Enhance stream with metadata
                  s.metadata = {
                    title: movieTitle,
                    year: movieYear,
                    quality: metadata.quality || s.quality + 'p',
                    codec: metadata.codec,
                    language: metadata.language,
                    size: metadata.size,
                    type: metadata.type,
                    server: s.source,
                  };
                });
                
                allStreams.push(...extractedStreams);
              } else {
                console.warn(`[MoviesDrive] ✗ No streams from extractor, adding wrapper as fallback`);
                allStreams.push({
                  url: wrapperUrl,
                  quality: metadata.quality ? parseInt(metadata.quality) : 720,
                  source: 'MoviesDrive-Wrapper',
                  metadata: {
                    title: movieTitle,
                    year: movieYear,
                    quality: metadata.quality || '720p',
                    codec: metadata.codec,
                    language: metadata.language,
                    size: metadata.size,
                    type: metadata.type,
                    server: 'Wrapper',
                  },
                });
              }
            } catch (err) {
              console.error(`[MoviesDrive] Extractor error:`, err.message);
              // Add wrapper as fallback
              allStreams.push({
                url: wrapperUrl,
                quality: metadata.quality ? parseInt(metadata.quality) : 720,
                source: 'MoviesDrive-Wrapper',
                metadata: {
                  title: movieTitle,
                  year: movieYear,
                  quality: metadata.quality || '720p',
                  codec: metadata.codec,
                  language: metadata.language,
                  size: metadata.size,
                  type: metadata.type,
                  server: 'Wrapper',
                },
              });
            }
          }
        } catch (err) {
          console.error(`[MoviesDrive] Error processing download link:`, err.message);
        }
      }
    } catch (error) {
      console.error(`[MoviesDrive] Error extracting movies:`, error.message);
    }

    // Deduplicate and sort
    const uniqueStreams = [];
    const seenUrls = new Set();

    for (const stream of allStreams) {
      if (!seenUrls.has(stream.url)) {
        seenUrls.add(stream.url);
        uniqueStreams.push(stream);
      }
    }

    // Sort by quality (highest first)
    uniqueStreams.sort((a, b) => {
      const qualityA = a.metadata?.quality ? parseInt(a.metadata.quality) : a.quality;
      const qualityB = b.metadata?.quality ? parseInt(b.metadata.quality) : b.quality;
      return qualityB - qualityA;
    });

    console.log(`[MoviesDrive] Total streams: ${uniqueStreams.length}`);
    return uniqueStreams;
  }

  /**
   * Extract TV series streams - Complete 11-step process
   * Follows the SeriesDrive extraction guide for proper series URL resolution
   */
  async extractSeriesStreams(seriesId, seasonNum, episodeNum) {
    // Step 1: Parse ID - Extract imdbId, season, episode from seriesId (format: tt14186672:1:1)
    let imdbId, targetSeason, targetEpisode;
    
    if (seriesId.includes(':')) {
      // Format: tt14186672:1:1
      const parts = seriesId.split(':');
      imdbId = parts[0];
      targetSeason = parseInt(parts[1]) || seasonNum;
      targetEpisode = parseInt(parts[2]) || episodeNum;
    } else {
      // Format: separate parameters
      imdbId = seriesId;
      targetSeason = parseInt(seasonNum) || 1;
      targetEpisode = parseInt(episodeNum) || 1;
    }
    
    console.log(`[MoviesDrive] Step 1: Parsed ID - imdbId=${imdbId}, season=${targetSeason}, episode=${targetEpisode}`);

    // Step 2: Search API with ONLY IMDb ID (not the full series ID with season:episode)
    const searchResults = await this.searchSeriesAPI(imdbId);
    if (!searchResults || searchResults.length === 0) {
      console.warn(`[MoviesDrive] No search results found for ${imdbId}`);
      return [];
    }
    console.log(`[MoviesDrive] Step 2: Found ${searchResults.length} season(s) for ${imdbId}`);

    // Step 3: Match correct season from search results
    const seasonDoc = this.findMatchingSeason(searchResults, targetSeason);
    if (!seasonDoc) {
      console.warn(`[MoviesDrive] Step 3: Season ${targetSeason} not found in search results`);
      console.log(`[MoviesDrive] Available seasons:`, searchResults.map(r => r.post_title));
      return [];
    }
    console.log(`[MoviesDrive] Step 3: ✓ Found matching season: ${seasonDoc.post_title}`);
    console.log(`[MoviesDrive] Permalink: ${seasonDoc.permalink}`);

    // Get series title
    let seriesTitle = seasonDoc.post_title || 'Unknown Series';
    let seriesYear = seasonDoc.year || '';
    // Clean up title - remove quality info
    seriesTitle = seriesTitle.replace(/\d{3,4}p.*$/i, '').replace(/\(.*?\)/g, '').trim();

    // Step 4: Fetch season content page
    const seasonPageUrl = this.apiUrl + seasonDoc.permalink;
    console.log(`[MoviesDrive] Step 4: Fetching season page: ${seasonPageUrl}`);
    
    let $;
    try {
      const response = await this.http.get(seasonPageUrl);
      const textResponse = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
      $ = load(textResponse);
    } catch (error) {
      console.error(`[MoviesDrive] Error fetching season page:`, error.message);
      return [];
    }

    // Step 4: Extract quality-specific "Single Episode" links
    const qualityLinks = this.extractQualityLinks($);
    console.log(`[MoviesDrive] Step 4: Found ${qualityLinks.length} quality option(s): ${qualityLinks.map(q => q.quality).join(', ')}`);
    
    if (qualityLinks.length === 0) {
      console.warn(`[MoviesDrive] No quality links found on season page`);
      return [];
    }

    const allStreams = [];

    // Step 5-7: Process each quality
    for (const qualityLink of qualityLinks) {
      console.log(`[MoviesDrive] Step 5: Processing ${qualityLink.quality} quality...`);
      console.log(`[MoviesDrive] Fetching episode list: ${qualityLink.url.substring(0, 80)}`);

      let episodePage$;
      try {
        const epResponse = await this.http.get(qualityLink.url);
        const epText = typeof epResponse.text === 'string' ? epResponse.text : JSON.stringify(epResponse.text);
        episodePage$ = load(epText);
      } catch (error) {
        console.error(`[MoviesDrive] Error fetching episode list for ${qualityLink.quality}:`, error.message);
        continue;
      }

      // Step 6: Parse episodes and filter by episode number
      const episodeWrappers = this.extractEpisodeLinks(episodePage$, targetEpisode);
      console.log(`[MoviesDrive] Step 6: Found ${episodeWrappers.length} wrapper(s) for Episode ${targetEpisode} in ${qualityLink.quality}`);

      if (episodeWrappers.length === 0) {
        console.warn(`[MoviesDrive] Episode ${targetEpisode} not found in ${qualityLink.quality} quality`);
        continue;
      }

      // Step 7: Resolve wrapper URLs to get exact stream URLs
      for (const wrapper of episodeWrappers) {
        try {
          console.log(`[MoviesDrive] Step 7: Resolving ${wrapper.source} wrapper: ${wrapper.url.substring(0, 60)}...`);
          const extractedStreams = await this.extractors.extractFromUrl(wrapper.url);

          if (extractedStreams.length > 0) {
            console.log(`[MoviesDrive] ✓ Got ${extractedStreams.length} stream(s) from ${wrapper.source}:`);
            
            extractedStreams.forEach((s, i) => {
              console.log(`  [${i + 1}] ${s.source} (${s.quality}p): ${s.url.substring(0, 70)}`);
              
              // Enhance stream with metadata
              s.metadata = {
                title: `${seriesTitle} S${targetSeason}E${targetEpisode}`,
                year: seriesYear,
                quality: qualityLink.quality || s.quality + 'p',
                server: s.source,
                episode: targetEpisode,
                season: targetSeason,
              };
            });
            
            allStreams.push(...extractedStreams);
          } else {
            console.warn(`[MoviesDrive] ✗ No streams extracted from ${wrapper.source}, adding wrapper as fallback`);
            allStreams.push({
              url: wrapper.url,
              quality: this.qualityToPixels(qualityLink.quality),
              source: 'MoviesDrive-Wrapper',
              metadata: {
                title: `${seriesTitle} S${targetSeason}E${targetEpisode}`,
                year: seriesYear,
                quality: qualityLink.quality || '720p',
                server: wrapper.source,
                episode: targetEpisode,
                season: targetSeason,
              },
            });
          }
        } catch (err) {
          console.error(`[MoviesDrive] Error resolving ${wrapper.source} wrapper:`, err.message);
          // Add wrapper as fallback
          allStreams.push({
            url: wrapper.url,
            quality: this.qualityToPixels(qualityLink.quality),
            source: 'MoviesDrive-Wrapper',
            metadata: {
              title: `${seriesTitle} S${targetSeason}E${targetEpisode}`,
              year: seriesYear,
              quality: qualityLink.quality || '720p',
              server: wrapper.source,
              episode: targetEpisode,
              season: targetSeason,
            },
          });
        }
      }
    }

    // Step 9: Deduplicate and sort
    const uniqueStreams = this.deduplicateAndSortStreams(allStreams);
    console.log(`[MoviesDrive] Step 9: Total unique streams for S${targetSeason}E${targetEpisode}: ${uniqueStreams.length}`);
    
    return uniqueStreams;
  }

  /**
   * Search series API - returns multiple seasons for the series
   * Step 2 of series extraction
   */
  async searchSeriesAPI(imdbId) {
    if (!imdbId || !imdbId.startsWith('tt')) {
      console.warn(`[MoviesDrive] Invalid IMDb ID: ${imdbId}`);
      return null;
    }

    const cacheKey = `series-search-${imdbId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.debug(`[MoviesDrive] Using cached search results for ${imdbId}`);
      return cached;
    }

    try {
      // Search with ONLY imdbId, no season:episode
      const searchUrl = `${this.apiUrl}/searchapi.php?q=${imdbId}`;
      console.log(`[MoviesDrive] Searching: ${searchUrl}`);
      
      const response = await this.http.get(searchUrl);
      
      let data;
      try {
        const textData = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
        data = JSON.parse(textData);
      } catch (parseError) {
        console.error(`[MoviesDrive] Error parsing search response:`, parseError.message);
        return null;
      }

      if (!data.hits || !Array.isArray(data.hits) || data.hits.length === 0) {
        console.warn(`[MoviesDrive] No hits found for ${imdbId}`);
        return null;
      }

      // Extract documents from hits
      const results = data.hits.map(hit => hit.document).filter(doc => doc.imdb_id === imdbId);
      
      console.log(`[MoviesDrive] Found ${results.length} result(s) for ${imdbId}`);
      
      // Cache results
      this.cache.set(cacheKey, results);
      
      return results;
    } catch (error) {
      console.error(`[MoviesDrive] Error searching series API:`, error.message);
      return null;
    }
  }

  /**
   * Find matching season from search results
   * Step 3 of series extraction
   */
  findMatchingSeason(results, targetSeason) {
    const target = parseInt(targetSeason);
    
    for (const doc of results) {
      const title = doc.post_title || '';
      
      // Match patterns: "Season 1", "Season 2", "S01", "S1", "S2", "(S01)", "[S1]"
      const seasonPatterns = [
        /season\s*(\d+)/i,      // Season 1, Season 2, SEASON 01
        /s0?(\d+)/i,            // S01, S1, s01, s1
        /\(s0?(\d+)\)/i,         // (S01), (S1)
        /\[s0?(\d+)\]/i,         // [S01], [S1]
        /season\s*(\d+)\s*\(/i    // Season 1 (2025)
      ];
      
      for (const pattern of seasonPatterns) {
        const match = title.match(pattern);
        if (match && parseInt(match[1]) === target) {
          return doc;
        }
      }
    }
    
    return null;
  }

  /**
   * Extract quality-specific "Single Episode" links from season page
   * Step 4 of series extraction
   */
  extractQualityLinks($) {
    const qualityLinks = [];
    
    // Find all h5 headers that contain quality info
    $('h5').each((_, elem) => {
      const text = $(elem).text();
      const $elem = $(elem);
      
      // Extract quality from text
      let quality = '';
      if (text.match(/1080p/i)) quality = '1080p';
      else if (text.match(/720p/i)) quality = '720p';
      else if (text.match(/480p/i)) quality = '480p';
      else if (text.match(/2160p|4k/i)) quality = '4K';
      
      if (!quality) return; // Skip if no quality found
      
      // Look for "Single Episode" link after this h5
      // The link could be directly inside h5 or in a sibling/next element
      let singleEpisodeLink = null;
      
      // Check direct children
      const directLink = $elem.find('a').filter((_, a) => {
        const linkText = $(a).text().toLowerCase();
        return linkText.includes('single') || linkText.includes('episode');
      }).first();
      
      if (directLink.length > 0) {
        singleEpisodeLink = directLink.attr('href');
      }
      
      // Check next siblings if not found
      if (!singleEpisodeLink) {
        let nextElem = $elem.next();
        let checkCount = 0;
        
        while (nextElem.length > 0 && checkCount < 5) {
          const link = nextElem.find('a').filter((_, a) => {
            const linkText = $(a).text().toLowerCase();
            return linkText.includes('single') || linkText.includes('episode');
          }).first();
          
          if (link.length > 0) {
            singleEpisodeLink = link.attr('href');
            break;
          }
          
          // Also check if the element itself is a link
          if (nextElem.is('a')) {
            const linkText = nextElem.text().toLowerCase();
            if (linkText.includes('single') || linkText.includes('episode')) {
              singleEpisodeLink = nextElem.attr('href');
              break;
            }
          }
          
          nextElem = nextElem.next();
          checkCount++;
        }
      }
      
      // Skip "Zip" links - only use "Single Episode" links
      if (singleEpisodeLink && !singleEpisodeLink.toLowerCase().includes('zip')) {
        qualityLinks.push({
          quality: quality,
          url: singleEpisodeLink,
          source: 'Single Episode'
        });
      }
    });
    
    return qualityLinks;
  }

  /**
   * Extract episode links for a specific episode number
   * Step 6 of series extraction
   */
  extractEpisodeLinks($, targetEpisodeNum) {
    const wrappers = [];
    const target = parseInt(targetEpisodeNum);
    
    // Episode patterns to match different naming conventions
    const episodePatterns = [
      /ep0?(\d+)/i,              // Ep01, Ep1, EP01, ep1
      /episode\s*0?(\d+)/i,      // Episode 01, Episode 1, EPISODE 01
      /e0?(\d+)/i,               // E01, E1, e01
      /\s*0?(\d+)\s*[-–]/,       // 01 -, 1 -, 01 –
      /^\s*0?(\d+)\s*$/          // Just "01" or "1" in the element
    ];
    
    // Hosting provider patterns
    const hostingProviders = [
      'hubcloud',
      'gdflix',
      'gdlink',
      'gdfilm',
      'filezone',
      'droplinks',
      'verystream',
      'uptobox',
      'mixdrop',
      'streamtape',
      'pixeldrain',
      'gofile'
    ];
    
    $('h5').each((_, elem) => {
      const $elem = $(elem);
      const text = $elem.text();
      
      // Try to extract episode number using various patterns
      let episodeNum = null;
      
      for (const pattern of episodePatterns) {
        const match = text.match(pattern);
        if (match) {
          episodeNum = parseInt(match[1]);
          break;
        }
      }
      
      // Filter: Only process if this is the requested episode
      if (episodeNum === target) {
        console.log(`[MoviesDrive] Found Ep${target}: ${text.substring(0, 100)}`);
        
        // Look for wrapper links in a broader context
        // Check: 1) inside h5, 2) next siblings, 3) parent container, 4) all links after h5
        
        // Get the parent container (could be div, p, or other)
        const $parent = $elem.parent();
        
        // Collect all potential wrapper URLs
        const foundUrls = new Set();
        
        // Helper to extract provider links from an element
        const extractFromElement = ($context) => {
          hostingProviders.forEach(provider => {
            $context.find(`a[href*="${provider}"]`).each((_, a) => {
              const href = $(a).attr('href');
              if (href && !foundUrls.has(href)) {
                foundUrls.add(href);
                wrappers.push({ url: href, source: provider.charAt(0).toUpperCase() + provider.slice(1) });
                console.log(`[MoviesDrive]   → ${provider}: ${href.substring(0, 60)}`);
              }
            });
          });
        };
        
        // 1. Check inside the h5 itself
        extractFromElement($elem);
        
        // 2. Check next siblings (up to 3 elements)
        let nextElem = $elem.next();
        let siblingCount = 0;
        while (nextElem.length > 0 && siblingCount < 3) {
          extractFromElement(nextElem);
          nextElem = nextElem.next();
          siblingCount++;
        }
        
        // 3. Check parent container
        if (foundUrls.size === 0) {
          extractFromElement($parent);
        }
        
        // 4. If still not found, look at all links in the document after this h5
        if (foundUrls.size === 0) {
          // Find the index of this h5 among all h5s
          const allH5 = $('h5');
          const currentIndex = allH5.index($elem);
          
          // Look at the next h5 to find the boundary
          const nextH5 = allH5.eq(currentIndex + 1);
          
          // Get all links between this h5 and the next h5 (or end of document)
          let $current = $elem;
          while ($current.length > 0 && (!$current.is(nextH5))) {
            if ($current.is('a')) {
              const href = $current.attr('href');
              if (href) {
                hostingProviders.forEach(provider => {
                  if (href.toLowerCase().includes(provider) && !foundUrls.has(href)) {
                    foundUrls.add(href);
                    wrappers.push({ url: href, source: provider.charAt(0).toUpperCase() + provider.slice(1) });
                    console.log(`[MoviesDrive]   → ${provider}: ${href.substring(0, 60)}`);
                  }
                });
              }
            }
            
            // Check all links within this element
            $current.find('a').each((_, a) => {
              const href = $(a).attr('href');
              if (href) {
                hostingProviders.forEach(provider => {
                  if (href.toLowerCase().includes(provider) && !foundUrls.has(href)) {
                    foundUrls.add(href);
                    wrappers.push({ url: href, source: provider.charAt(0).toUpperCase() + provider.slice(1) });
                    console.log(`[MoviesDrive]   → ${provider}: ${href.substring(0, 60)}`);
                  }
                });
              }
            });
            
            $current = $current.next();
            if ($current.length === 0) break;
          }
        }
      }
    });
    
    return wrappers;
  }

  /**
   * Convert quality string to pixel value
   */
  qualityToPixels(quality) {
    const qualityMap = {
      '4K': 2160,
      '2160p': 2160,
      '1080p': 1080,
      '720p': 720,
      '480p': 480,
      '360p': 360,
    };
    return qualityMap[quality] || 720;
  }

  /**
   * Deduplicate and sort streams
   * Step 9 of series extraction
   */
  deduplicateAndSortStreams(streams) {
    const uniqueStreams = [];
    const seenUrls = new Set();

    for (const stream of streams) {
      if (!seenUrls.has(stream.url)) {
        seenUrls.add(stream.url);
        uniqueStreams.push(stream);
      }
    }

    // Sort by quality (highest first)
    uniqueStreams.sort((a, b) => {
      const qualityA = a.metadata?.quality ? parseInt(a.metadata.quality.replace(/p/i, '')) : a.quality;
      const qualityB = b.metadata?.quality ? parseInt(b.metadata.quality.replace(/p/i, '')) : b.quality;
      return qualityB - qualityA;
    });

    return uniqueStreams;
  }

  /**
   * Get all streams for a title
   * @param {Object} item - Meta item with id and type
   * @param {number} season - Season number (for series)
   * @param {number} episode - Episode number (for series)
   * @returns {Promise<Array<Object>>} Array of streams
   */
  async getStreams(item, season = 1, episode = 1) {
    if (!item.id || !item.id.startsWith('tt')) {
      console.warn(`[MoviesDrive] Invalid item ID: ${item.id}`);
      return [];
    }

    console.log(`[MoviesDrive] Getting streams for ${item.type} ${item.id} S${season}E${episode}`);

    if (item.type === 'movie') {
      return await this.extractMovieStreams(item.id, item.name);
    } else if (item.type === 'series') {
      return await this.extractSeriesStreams(item.id, season, episode);
    }

    return [];
  }

  /**
   * Get subtitles for a title
   * @param {string} imdbId - IMDB ID
   * @returns {Promise<Array<Object>>} Array of subtitle objects
   */
  async getSubtitles(imdbId) {
    if (!imdbId || !imdbId.startsWith('tt')) {
      return [];
    }

    try {
      const result = await this.searchAndGetDocument(imdbId);
      if (!result) return [];

      const { document } = result;
      const htmlContent = document.html() || '';

      return await this.subtitles.getSubtitles(imdbId, htmlContent);
    } catch (error) {
      console.error(`[MoviesDrive] Error getting subtitles:`, error.message);
      return [];
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clearAll();
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    return this.cache.stats();
  }
}

export default MoviesDriveScraper;
