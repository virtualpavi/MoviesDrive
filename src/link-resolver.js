/**
 * Link Resolver Module
 * Handles URL redirect chains and final stream URL extraction
 * Based on the MoviesDrive streaming flow:
 * wrapper URL -> redirect chain -> intermediate page -> extract final URLs
 */

import HttpClient from './http-client.js';
import { load } from 'cheerio';
import { isValidUrl, sanitizeForLogging, isWrapperUrl } from './security.js';


class LinkResolver {
  constructor() {
    this.http = new HttpClient();
  }

  /**
   * Check whether URL points to a final playable stream target we want to return.
   * @param {string} url
   * @returns {boolean}
   */
  isFinalStreamUrl(url) {
    const lower = String(url || '').toLowerCase();
    const isFinalHubHost =
      /^https?:\/\/hub\.[^/]+\//i.test(lower) &&
      !lower.includes('hubcloud') &&
      lower.includes('token=');

    return (
      lower.includes('fsl') ||
      lower.includes('hub.fsl') ||
      lower.includes('fsl-lover') ||
      lower.includes('pixeldrain.dev/api/file/') ||
      lower.includes('pixeldrain.com/api/file/') ||
      isFinalHubHost
    );
  }

  normalizeResolvedSource(stream) {
    const sourceLower = String(stream?.source || '').toLowerCase();
    const urlLower = String(stream?.url || '').toLowerCase();

    if (sourceLower.includes('pixel') || urlLower.includes('pixeldrain')) {
      return 'Pixel';
    }

    if (sourceLower.includes('fsl') || urlLower.includes('fsl')) {
      return 'FSL';
    }

    return null;
  }

  isFinalResolvedStream(stream) {
    const url = String(stream?.url || '').trim();
    const urlLower = url.toLowerCase();

    if (!url.startsWith('http') || !isValidUrl(url)) {
      return false;
    }

    if (urlLower.includes('/games/')) {
      return false;
    }

    const normalizedSource = this.normalizeResolvedSource(stream);
    if (normalizedSource) {
      return true;
    }

    return this.isFinalStreamUrl(urlLower);
  }

  /**
   * Check whether URL belongs to the expected wrapper chain or final hosts.
   * @param {string} url
   * @returns {boolean}
   */
  isChainRelevantUrl(url) {
    const lower = String(url || '').toLowerCase();

    if (this.isFinalStreamUrl(lower)) {
      return true;
    }

    return (
      lower.includes('hubcloud') ||
      lower.includes('hubcloud.php') ||
      lower.includes('gamerxyt') ||
      lower.includes('carnewz') ||
      lower.includes('cryptoinsights') ||
      lower.includes('/games/')
    );
  }

  /**
   * Known ad/hijack domains to avoid following in chain traversal.
   * @param {string} url
   * @returns {boolean}
   */
  isRejectedRedirectUrl(url) {
    const lower = String(url || '').toLowerCase();
    const rejectedDomains = [
      'bonuscaf',
      'macan-native',
      'blehcourt',
      'gryphline',
      'endfield',
    ];

    return rejectedDomains.some(domain => lower.includes(domain));
  }

  /**
   * Build absolute URL from candidate and filter invalid/ad URLs.
   * @param {string} candidateUrl
   * @param {string} pageUrl
   * @returns {string|null}
   */
  normalizeCandidateUrl(candidateUrl, pageUrl) {
    if (!candidateUrl) {
      return null;
    }

    let normalized = String(candidateUrl).trim();

    try {
      if (!normalized.startsWith('http')) {
        normalized = new URL(normalized, pageUrl).href;
      }
    } catch {
      return null;
    }

    if (!isValidUrl(normalized) || this.isRejectedRedirectUrl(normalized)) {
      return null;
    }

    return normalized;
  }

  /**
   * Extract redirect candidates from DOM, headers and script patterns.
   * @param {string} pageHtml
   * @param {string} pageUrl
   * @param {Object} response
   * @returns {Array<{url:string,type:string,priority:number}>}
   */
  extractRedirectCandidates(pageHtml, pageUrl, response) {
    const candidates = [];
    const $ = load(pageHtml);

    const addCandidate = (rawUrl, type, priority) => {
      const normalized = this.normalizeCandidateUrl(rawUrl, pageUrl);
      if (!normalized) {
        return;
      }

      candidates.push({
        url: normalized,
        type,
        priority,
      });
    };

    // Priority candidates based on MoviesDrive/HubCloud chain structure.
    $('a#download[href]').each((_, elem) => {
      addCandidate($(elem).attr('href'), 'a#download[href]', 10);
    });

    $('.downloads-btns-div a[href]').each((_, elem) => {
      addCandidate($(elem).attr('href'), '.downloads-btns-div a[href]', 20);
    });

    $('a[href*="hubcloud.php"]').each((_, elem) => {
      addCandidate($(elem).attr('href'), 'a[href*="hubcloud.php"]', 30);
    });

    $('a[href*="/games/"]').each((_, elem) => {
      addCandidate($(elem).attr('href'), 'a[href*="/games/"]', 40);
    });

    // HTTP redirect (Location header)
    if (response?.status >= 300 && response?.status < 400 && response?.headers?.location) {
      addCandidate(response.headers.location, 'http-location-header', 15);
    }

    // Meta refresh
    const metaRefreshMatch = pageHtml.match(/<meta[^>]*?http-equiv=["']refresh["'][^>]*?content=["']([^"']*)['"]/i);
    if (metaRefreshMatch) {
      const redirectContent = metaRefreshMatch[1];
      const urlMatch = redirectContent.match(/url=([^\s;]+)/i);
      if (urlMatch) {
        addCandidate(urlMatch[1].replace(/['"]/g, ''), 'meta-refresh', 50);
      }
    }

    // JavaScript redirect patterns
    const jsRedirectPatterns = [
      { regex: /var\s+url\s*=\s*['"]([^'"]+)['"]/i, type: 'js-var-url', priority: 35 },
      { regex: /window\.location\.replace\s*\(\s*['"]([^'"]+)['"]/i, type: 'js-window.location.replace', priority: 60 },
      { regex: /window\.location\.href\s*=\s*['"]([^'"]+)['"]/i, type: 'js-window.location.href', priority: 65 },
      { regex: /window\.location\s*=\s*['"]([^'"]+)['"]/i, type: 'js-window.location', priority: 70 },
      { regex: /location\.href\s*=\s*['"]([^'"]+)['"]/i, type: 'js-location.href', priority: 75 },
      { regex: /document\.location\s*=\s*['"]([^'"]+)['"]/i, type: 'js-document.location', priority: 80 },
      { regex: /window\.open\s*\(\s*['"]([^'"]+)['"]/i, type: 'js-window.open', priority: 85 },
      { regex: /onclick\s*=\s*["'][^"']*window\.location\s*=\s*['"]([^'"]+)['"]/i, type: 'js-onclick', priority: 90 },
    ];

    for (const pattern of jsRedirectPatterns) {
      const match = pageHtml.match(pattern.regex);
      if (match?.[1]) {
        addCandidate(match[1], pattern.type, pattern.priority);
      }
    }

    // Deduplicate candidates keeping the best (lowest) priority entry.
    const deduped = new Map();
    for (const candidate of candidates) {
      const existing = deduped.get(candidate.url);
      if (!existing || candidate.priority < existing.priority) {
        deduped.set(candidate.url, candidate);
      }
    }

    return Array.from(deduped.values()).sort((a, b) => a.priority - b.priority);
  }

  /**
   * Convert a final URL candidate directly into a stream entry.
   * @param {string} url
   * @returns {Object|null}
   */
  createStreamFromFinalUrl(url) {
    const lower = String(url || '').toLowerCase();
    const isFinalHubHost =
      /^https?:\/\/hub\.[^/]+\//i.test(lower) &&
      !lower.includes('hubcloud') &&
      lower.includes('token=');

    if (lower.includes('pixeldrain')) {
      const fileId = this.extractPixelDrainId(url);
      if (fileId) {
        return {
          url: `https://pixeldrain.dev/api/file/${fileId}?download`,
          quality: 1080,
          source: 'PixelDrain',
        };
      }
      return null;
    }

    if (lower.includes('fsl') || isFinalHubHost) {
      return {
        url,
        quality: 1080,
        source: 'FSL Server',
      };
    }

    return null;
  }

  /**
   * Resolve a wrapper URL through redirect chain to get final streaming URL
   * Handles: hubcloud.php -> intermediate page -> FSL/PixelDrain URLs
   * Also handles meta refresh and JavaScript redirects
   * Extracts links from intermediate pages as well as final page
   * 
   * Example flow:
   * gamerxyt.com/hubcloud.php?... -> carnewz.site/hubcloud.php?... -> cryptoinsights.site/games/ -> extract FSL/PixelDrain
   */
  async resolveWrapperUrl(wrapperUrl) {
    try {
      console.log(`[LinkResolver] Resolving wrapper: ${sanitizeForLogging(wrapperUrl)}`);
      
      // Collect all streams from all pages in the redirect chain
      const allStreams = [];
      
      // Track visited URLs to avoid loops
      const visitedUrls = new Set();
      
      // Current URL to process
      let currentUrl = wrapperUrl;
      let redirectCount = 0;
      const maxRedirects = 15; // Increased for multi-domain chains
      
      while (currentUrl && redirectCount < maxRedirects) {
        // Skip if already visited
        if (visitedUrls.has(currentUrl)) {
          console.log(`[LinkResolver] Already visited ${sanitizeForLogging(currentUrl)}, stopping`);
          break;
        }
        visitedUrls.add(currentUrl);
        
        console.log(`[LinkResolver] [Step ${redirectCount + 1}] Fetching: ${sanitizeForLogging(currentUrl)}`);
        
        try {
          // Fetch the current URL
          const response = await this.http.get(currentUrl, { 
            timeout: 20000,
            maxRedirects: 0 // Handle redirects manually to track the chain
          });
          
          const pageHtml = response.text;
          const responseUrl = response.url || response.finalUrl || currentUrl;
          
          console.log(`[LinkResolver] Response URL: ${sanitizeForLogging(responseUrl)}`);
          
          // Extract streams from this page
          const pageStreams = await this.extractStreamsFromPage(pageHtml, responseUrl);
          if (pageStreams.length > 0) {
            console.log(`[LinkResolver] ✓ Found ${pageStreams.length} stream(s) on this page`);
            allStreams.push(...pageStreams);
          }
          
          // Find the safest next-step candidate URL in the chain.
          const redirectCandidates = this.extractRedirectCandidates(pageHtml, responseUrl, response);
          if (!redirectCandidates.length) {
            console.log(`[LinkResolver] No redirect candidates found, reached final page`);
            break;
          }

          const nextCandidate = redirectCandidates.find(candidate => {
            return !visitedUrls.has(candidate.url) && this.isChainRelevantUrl(candidate.url);
          });

          if (!nextCandidate) {
            console.log(`[LinkResolver] No chain-relevant redirect candidates found, stopping traversal`);
            break;
          }

          // If the candidate is already a final target, emit stream and stop.
          if (this.isFinalStreamUrl(nextCandidate.url)) {
            const directStream = this.createStreamFromFinalUrl(nextCandidate.url);
            if (directStream && !allStreams.find(stream => stream.url === directStream.url)) {
              allStreams.push(directStream);
              console.log(`[LinkResolver] ✓ Final stream discovered directly from redirect candidate: ${sanitizeForLogging(directStream.url)}`);
            }
            break;
          }

          const nextUrl = nextCandidate.url;
          console.log(`[LinkResolver] Following ${nextCandidate.type} to: ${sanitizeForLogging(nextUrl)}`);
          
          // Move to next URL
          currentUrl = nextUrl;
          redirectCount++;
          
        } catch (error) {
          console.error(`[LinkResolver] Error fetching ${sanitizeForLogging(currentUrl)}: ${error.message}`);
          break;
        }
      }
      
      console.log(`[LinkResolver] Redirect chain complete. Total steps: ${redirectCount}`);

      // Deduplicate streams by URL
      const uniqueStreams = [];
      const seenUrls = new Set();
      
      for (const stream of allStreams) {
        if (!seenUrls.has(stream.url)) {
          seenUrls.add(stream.url);
          uniqueStreams.push(stream);
        }
      }

      const finalStreams = uniqueStreams.filter(stream => this.isFinalResolvedStream(stream));

      if (finalStreams.length > 0) {
        console.log(`[LinkResolver] ✓ Total unique final streams: ${finalStreams.length}`);
        finalStreams.forEach((s, i) => {
          console.log(`  [${i + 1}] ${s.source} (${s.quality}p): ${sanitizeForLogging(s.url)}`);
        });
      } else {
        console.log(`[LinkResolver] ✗ No final streaming links found in redirect chain`);
      }

      return finalStreams;
    } catch (error) {
      console.error(`[LinkResolver] Error resolving ${sanitizeForLogging(wrapperUrl)}:`, error.message);
      return [];
    }
  }




  /**
   * Decode obfuscated JavaScript content (data-digest pattern)
   * Some pages use base64-encoded JavaScript to hide actual links
   */
  decodeObfuscatedContent(html) {
    try {
      // Look for data-digest attribute which contains base64-encoded JS
      const digestMatch = html.match(/data-digest=["']([A-Za-z0-9+/=]+)["']/);
      if (digestMatch) {
        const base64Content = digestMatch[1];
        // Try to decode and extract URLs from the obfuscated content
        try {
          const decoded = Buffer.from(base64Content, 'base64').toString('utf-8');
          console.log(`[LinkResolver] Decoded obfuscated content (${decoded.length} bytes)`);
          
          // Debug: Show first 500 chars of decoded content
          console.log(`[LinkResolver] Decoded preview: ${decoded.substring(0, 500)}...`);
          
          // Look for URLs in the decoded content - be more aggressive
          const urlMatches = decoded.match(/https?:\/\/[^"'\s<>()]+/g) || [];
          console.log(`[LinkResolver] Found ${urlMatches.length} raw URLs in decoded content`);
          
          // Filter for streaming-related URLs
          const filteredUrls = urlMatches.filter(url => {
            const urlLower = url.toLowerCase();
            return urlLower.includes('fsl') || 
                   urlLower.includes('pixeldrain') ||
                   urlLower.includes('hubcloud') ||
                   urlLower.includes('gdflix') ||
                   urlLower.includes('hub.fsl') ||
                   urlLower.includes('fsl-lover');
          });
          
          if (filteredUrls.length > 0) {
            console.log(`[LinkResolver] Filtered to ${filteredUrls.length} streaming URLs`);
            return filteredUrls;
          }
          
          // If no URLs found directly, look for hex-encoded strings that might be URLs
          // Pattern: 0x68,0x74,0x74,0x70 (which is "http" in hex)
          const hexStrings = decoded.match(/0x[0-9a-f]{2}/gi) || [];
          if (hexStrings.length > 0) {
            console.log(`[LinkResolver] Found ${hexStrings.length} hex-encoded values, attempting to decode...`);
            
            // Try to find sequences that might be URL parts
            // Look for patterns like String.fromCharCode or similar
            const charCodeMatches = decoded.match(/String\.fromCharCode\(([^)]+)\)/g) || [];
            for (const match of charCodeMatches) {
              const numbers = match.match(/\d+/g);
              if (numbers) {
                try {
                  const str = String.fromCharCode(...numbers.map(n => parseInt(n)));
                  if (str.includes('http') && (str.includes('fsl') || str.includes('pixeldrain'))) {
                    console.log(`[LinkResolver] Found URL in fromCharCode: ${str.substring(0, 100)}`);
                    return [str];
                  }
                } catch (e) {
                  // Ignore
                }
              }
            }
          }
          
        } catch (e) {
          console.debug(`[LinkResolver] Failed to decode base64: ${e.message}`);
        }
      }
      
      // Also look for other obfuscation patterns
      // Pattern: var _0x... = ['https://...', 'https://...']
      const hexArrayMatch = html.match(/var _0x[a-f0-9]+\s*=\s*\[([^\]]+)\]/);
      if (hexArrayMatch) {
        const arrayContent = hexArrayMatch[1];
        const urlMatches = arrayContent.match(/https?:\/\/[^"'\s,]+/g) || [];
        return urlMatches;
      }
      
      // Look for URLs directly in the HTML that might be obfuscated
      const allUrls = html.match(/https?:\/\/[^"'\s<>]+/g) || [];
      const streamingUrls = allUrls.filter(url => {
        const urlLower = url.toLowerCase();
        return urlLower.includes('fsl') || 
               urlLower.includes('pixeldrain') ||
               urlLower.includes('hub.fsl');
      });
      
      if (streamingUrls.length > 0) {
        console.log(`[LinkResolver] Found ${streamingUrls.length} streaming URLs in raw HTML`);
        return streamingUrls;
      }
      
      return [];
    } catch (error) {
      console.debug(`[LinkResolver] Error decoding obfuscated content: ${error.message}`);
      return [];
    }
  }



  /**
   * Extract streaming links from page HTML
   * Looks for FSL Server, PixelDrain, and other hosting links
   * Based on the Kotlin extractor patterns from VCloud and HubCloud
   */
  async extractStreamsFromPage(html, pageUrl) {
    const streams = [];
    const $ = load(html);
    
    // Try to decode obfuscated content first (for pages like iriverwave.com)
    const obfuscatedUrls = this.decodeObfuscatedContent(html);
    if (obfuscatedUrls.length > 0) {
      console.log(`[LinkResolver] Found ${obfuscatedUrls.length} URL(s) in obfuscated content`);
      obfuscatedUrls.forEach(url => {
        if (url.includes('fsl') && !streams.find(s => s.url === url)) {
          streams.push({
            url: url,
            quality: 1080,
            source: 'FSL Server',
          });
          console.log(`[LinkResolver] ✓ FSL (decoded): ${sanitizeForLogging(url)}`);
        } else if (url.includes('pixeldrain') && !streams.find(s => s.url === url)) {
          const fileId = this.extractPixelDrainId(url);
          if (fileId) {
            const apiUrl = `https://pixeldrain.dev/api/file/${fileId}?download`;
            streams.push({
              url: apiUrl,
              quality: 1080,
              source: 'PixelDrain',
            });
            console.log(`[LinkResolver] ✓ PixelDrain (decoded): ${sanitizeForLogging(apiUrl)}`);
          }
        }
      });
    }

    // Extract file info from page if available (like Kotlin extractors do)
    const headerText = $('div.card-header').text() || '';
    const pageQuality = this.extractQualityFromText(headerText);
    
    if (headerText) {
      console.log(`[LinkResolver] Page header: ${headerText.substring(0, 100)}`);
    }
    
    // Also check for quality in any heading or title
    const pageTitle = $('title').text() || '';
    const anyHeading = $('h1, h2, h3, h4, h5').first().text() || '';
    const extractedQuality = pageQuality || this.extractQualityFromText(pageTitle) || this.extractQualityFromText(anyHeading);
    
    if (extractedQuality && extractedQuality !== 720) {
      console.log(`[LinkResolver] Extracted quality from page: ${extractedQuality}p`);
    }


    // 1. Look for FSL Server links (primary source for 1080p)
    // Based on Kotlin pattern: div.card-body h2 a.btn with text containing "FSL Server"
    const fslSelectors = [
      'a[id="fsl"]',
      'a[href*="hub.fsl-lover"]',
      'a[href*="fsl-lover"]',
      'a[href*="fsl"]',
      'a:contains("FSL")',
      'a:contains("Download [FSL")',
      'a:contains("FSL Server")',
      'a.btn-success[href*="fsl"]',
      'a.btn[href*="fsl"]',
      'a[rel="noreferrer nofollow noopener"][href*="fsl"]',
      'a[target="_blank"][href*="fsl"]',
      'a[download][href*="fsl"]',
      'div.card-body h2 a.btn', // Common container pattern
      'div.center_it a', // Howblogs pattern
    ];

    for (const selector of fslSelectors) {
      $(selector).each((_, elem) => {
        const $elem = $(elem);
        let href = $elem.attr('href');
        const text = $elem.text() || '';

        // For container selectors, check if text mentions FSL
        if (selector.includes('div.card-body') || selector.includes('div.center_it')) {
          if (!text.toLowerCase().includes('fsl')) {
            return; // Skip if not FSL-related
          }
        }

        if (href) {
          // Ensure absolute URL
          if (!href.startsWith('http')) {
            href = new URL(href, pageUrl).href;
          }

          // Validate URL
          if (!isValidUrl(href)) {
            console.warn(`[LinkResolver] Skipping invalid FSL URL: ${sanitizeForLogging(href)}`);
            return;
          }

          // Extract quality from text or attributes
          const ariaLabel = $elem.attr('aria-label') || '';
          const titleAttr = $elem.attr('title') || '';
          const downloadAttr = $elem.attr('download') || '';
          const combinedText = `${text} ${ariaLabel} ${titleAttr} ${downloadAttr} ${headerText}`;

          const quality = this.extractQualityFromText(combinedText) || pageQuality || 1080;
          const fileSize = this.extractFileSizeFromText(combinedText);
          const streamTitle = downloadAttr || titleAttr || text;

          if (!streams.find(s => s.url === href)) {
            streams.push({
              url: href,
              quality: quality,
              source: 'FSL Server',
              title: streamTitle || '',
              fileSize: fileSize || undefined,
            });
            console.log(`[LinkResolver] ✓ FSL: ${sanitizeForLogging(href)} (${quality}p)`);
          }
        }
      });
    }

    // 2. Look for PixelDrain links
    // Based on Kotlin pattern: convert pixeldrain.dev/u/FILEID to pixeldrain.dev/api/file/FILEID?download
    const pixelDrainSelectors = [
      'a[href*="pixeldrain.dev/u/"]',
      'a[href*="pixeldrain.com/u/"]',
      'a[href*="pixeldrain"]',
      'a:contains("PixelDrain")',
      'a:contains("PixelServer")',
      'a:contains("Pixel Server")',
      'a:contains("Server : 2")', // Common PixelServer label
      'a[download*="pixeldrain"]',
      'a[href*="pixeldrain"][download]',
      'a[target="_blank"][href*="pixeldrain"]',
      'a[rel*="noreferrer"][href*="pixeldrain"]',
      'div.card-body h2 a.btn', // Check in same container as FSL
    ];

    for (const selector of pixelDrainSelectors) {
      $(selector).each((_, elem) => {
        const $elem = $(elem);
        let href = $elem.attr('href');
        const text = $elem.text() || '';

        // For container selectors, check if text mentions PixelDrain/Server
        if (selector.includes('div.card-body')) {
          const textLower = text.toLowerCase();
          if (!textLower.includes('pixel') && !textLower.includes('server : 2') && !textLower.includes('server: 2')) {
            return; // Skip if not PixelDrain-related
          }
        }

        if (href) {
          // Convert to API URL if it's a page URL (/u/ -> /api/file/)
          // This matches the Kotlin pattern exactly
          const fileId = this.extractPixelDrainId(href);
          if (fileId) {
            // Check if already in API format
            if (!href.includes('/api/file/')) {
              href = `https://pixeldrain.dev/api/file/${fileId}?download`;
            }
          }

          // Ensure absolute URL
          if (!href.startsWith('http')) {
            href = new URL(href, pageUrl).href;
          }

          // Validate URL
          if (!isValidUrl(href)) {
            console.warn(`[LinkResolver] Skipping invalid PixelDrain URL: ${sanitizeForLogging(href)}`);
            return;
          }

          // Extract quality from text or attributes
          const ariaLabel = $elem.attr('aria-label') || '';
          const titleAttr = $elem.attr('title') || '';
          const downloadAttr = $elem.attr('download') || '';
          const combinedText = `${text} ${ariaLabel} ${titleAttr} ${downloadAttr} ${headerText}`;

          const quality = this.extractQualityFromText(combinedText) || pageQuality || 1080;
          const fileSize = this.extractFileSizeFromText(combinedText);
          const streamTitle = downloadAttr || titleAttr || text;

          if (!streams.find(s => s.url === href)) {
            streams.push({
              url: href,
              quality: quality,
              source: 'PixelDrain',
              title: streamTitle || '',
              fileSize: fileSize || undefined,
            });
            console.log(`[LinkResolver] ✓ PixelDrain: ${sanitizeForLogging(href)} (${quality}p)`);
          }
        }
      });
    }


    // 3. Look for GDFlix links
    const gdFlixSelectors = [
      'a[href*="gdflix.dev/file/"]',
      'a[href*="gdflix.lol/file/"]',
      'a:contains("GDFlix")',
      'a.btn-primary[href*="gdflix"]',
    ];

    for (const selector of gdFlixSelectors) {
      $(selector).each((_, elem) => {
        const $elem = $(elem);
        let href = $elem.attr('href');

        if (href) {
          // Ensure absolute URL
          if (!href.startsWith('http')) {
            href = new URL(href, pageUrl).href;
          }

          // Validate URL
          if (!isValidUrl(href)) {
            console.warn(`[LinkResolver] Skipping invalid GDFlix URL: ${sanitizeForLogging(href)}`);
            return;
          }

          const quality = this.extractQualityFromText($elem.text());

          if (!streams.find(s => s.url === href)) {
            streams.push({
              url: href,
              quality: quality,
              source: 'GDFlix',
            });
            console.log(`[LinkResolver] ✓ GDFlix: ${sanitizeForLogging(href)} (${quality}p)`);
          }
        }
      });
    }

    // 4. Look for GoFile links
    const goFileSelectors = [
      'a[href*="gofile.io/d/"]',
      'a:contains("GoFile")',
      'a[href*="gofile"]',
    ];

    for (const selector of goFileSelectors) {
      $(selector).each((_, elem) => {
        const $elem = $(elem);
        let href = $elem.attr('href');

        if (href) {
          if (!href.startsWith('http')) {
            href = new URL(href, pageUrl).href;
          }

          if (!isValidUrl(href)) {
            console.warn(`[LinkResolver] Skipping invalid GoFile URL: ${sanitizeForLogging(href)}`);
            return;
          }

          const quality = this.extractQualityFromText($elem.text());

          if (!streams.find(s => s.url === href)) {
            streams.push({
              url: href,
              quality: quality,
              source: 'GoFile',
            });
            console.log(`[LinkResolver] ✓ GoFile: ${sanitizeForLogging(href)} (${quality}p)`);
          }
        }
      });
    }

    // 5. Look for StreamTape links
    const streamTapeSelectors = [
      'a[href*="streamtape.com"]',
      'a[href*="streamta.pe"]',
      'a:contains("StreamTape")',
    ];

    for (const selector of streamTapeSelectors) {
      $(selector).each((_, elem) => {
        const $elem = $(elem);
        let href = $elem.attr('href');

        if (href) {
          if (!href.startsWith('http')) {
            href = new URL(href, pageUrl).href;
          }

          if (!isValidUrl(href)) {
            console.warn(`[LinkResolver] Skipping invalid StreamTape URL: ${sanitizeForLogging(href)}`);
            return;
          }

          const quality = this.extractQualityFromText($elem.text());

          if (!streams.find(s => s.url === href)) {
            streams.push({
              url: href,
              quality: quality,
              source: 'StreamTape',
            });
            console.log(`[LinkResolver] ✓ StreamTape: ${sanitizeForLogging(href)} (${quality}p)`);
          }
        }
      });
    }

    // 6. Look for MixDrop links
    const mixDropSelectors = [
      'a[href*="mixdrop.co"]',
      'a[href*="mixdrop.to"]',
      'a:contains("MixDrop")',
    ];

    for (const selector of mixDropSelectors) {
      $(selector).each((_, elem) => {
        const $elem = $(elem);
        let href = $elem.attr('href');

        if (href) {
          if (!href.startsWith('http')) {
            href = new URL(href, pageUrl).href;
          }

          if (!isValidUrl(href)) {
            console.warn(`[LinkResolver] Skipping invalid MixDrop URL: ${sanitizeForLogging(href)}`);
            return;
          }

          const quality = this.extractQualityFromText($elem.text());

          if (!streams.find(s => s.url === href)) {
            streams.push({
              url: href,
              quality: quality,
              source: 'MixDrop',
            });
            console.log(`[LinkResolver] ✓ MixDrop: ${sanitizeForLogging(href)} (${quality}p)`);
          }
        }
      });
    }

    // 7. Look for any hub.fsl-lover.buzz links (direct FSL links)
    $('a[href*="hub.fsl-lover"]').each((_, elem) => {
      const $elem = $(elem);
      let href = $elem.attr('href');

      if (href && !streams.find(s => s.url === href)) {
        if (!href.startsWith('http')) {
          href = new URL(href, pageUrl).href;
        }

        if (isValidUrl(href)) {
          const text = $elem.text();
          const downloadAttr = $elem.attr('download') || '';
          const titleAttr = $elem.attr('title') || '';
          const combinedText = `${text} ${downloadAttr} ${titleAttr}`;
          const quality = this.extractQualityFromText(combinedText);
          const fileSize = this.extractFileSizeFromText(combinedText);
          streams.push({
            url: href,
            quality: quality,
            source: 'FSL Server',
            title: downloadAttr || titleAttr || text || '',
            fileSize: fileSize || undefined,
          });
          console.log(`[LinkResolver] ✓ FSL (direct): ${sanitizeForLogging(href)} (${quality}p)`);
        }
      }
    });

    // 8. Fallback: Look for any download links that might be streaming URLs
    if (streams.length === 0) {
      console.log(`[LinkResolver] No specific links found, trying fallback extraction...`);
      
      $('a[href^="http"], a[href^="https"]').each((_, elem) => {
        const $elem = $(elem);
        let href = $elem.attr('href');
        const text = $elem.text().toLowerCase();

        // Look for download-related text or button classes
        if (text.includes('download') || 
            text.includes('stream') || 
            text.includes('watch') ||
            $elem.hasClass('btn-success') ||
            $elem.hasClass('btn-primary') ||
            $elem.hasClass('btn-download')) {
          if (href) {
            if (!href.startsWith('http')) {
              href = new URL(href, pageUrl).href;
            }

            if (!isValidUrl(href)) {
              return;
            }

            // Skip if already added
            if (streams.find(s => s.url === href)) {
              return;
            }

            // Skip wrapper URLs
            if (isWrapperUrl(href)) {
              return;
            }

            // /games pages are chain intermediates, not final streams.
            if (href.toLowerCase().includes('/games/')) {
              return;
            }

            const quality = this.extractQualityFromText(text);

            streams.push({
              url: href,
              quality: quality,
              source: 'Direct',
            });
            console.log(`[LinkResolver] ✓ Fallback: ${sanitizeForLogging(href)} (${quality}p)`);
          }
        }
      });
    }

    return streams;

  }

  /**
   * Extract PixelDrain file ID from URL
   * Converts pixeldrain.dev/u/FILEID -> FILEID
   * Also handles pixeldrain.dev/api/file/FILEID format
   */
  extractPixelDrainId(url) {
    // Match /u/FILEID format (page URL)
    const uMatch = url.match(/pixeldrain\.(?:dev|com)\/u\/([a-zA-Z0-9]+)/);
    if (uMatch) return uMatch[1];
    
    // Match /api/file/FILEID format (API URL)
    const apiMatch = url.match(/pixeldrain\.(?:dev|com)\/api\/file\/([a-zA-Z0-9]+)/);
    if (apiMatch) return apiMatch[1];
    
    return null;
  }


  /**
   * Extract quality from text
   */
  extractQualityFromText(text) {
    const qualityMap = {
      '4k': 2160,
      '2160p': 2160,
      '1080p': 1080,
      '1080': 1080,
      'fullhd': 1080,
      'fhd': 1080,
      '720p': 720,
      '720': 720,
      'hd': 720,
      '480p': 480,
      'sd': 480,
      '360p': 360,
    };

    const textLower = String(text).toLowerCase();

    for (const [key, value] of Object.entries(qualityMap)) {
      if (textLower.includes(key)) {
        return value;
      }
    }

    // Try regex pattern
    const match = textLower.match(/(\d{3,4})p?/);
    if (match) {
      return parseInt(match[1]);
    }

    return 720; // Default
  }

  /**
   * Extract first file size token from text.
   * @param {string} text
   * @returns {string|null}
   */
  extractFileSizeFromText(text) {
    const match = String(text || '').match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB)/i);
    if (!match) {
      return null;
    }

    return `${match[1]} ${match[2].toUpperCase()}`;
  }

  /**
   * Validate if a URL is actually reachable
   */
  async validateUrl(url, timeout = 5000) {
    try {
      const response = await this.http.get(url, { timeout });
      return response.status >= 200 && response.status < 400;
    } catch (error) {
      console.debug(`[LinkResolver] URL validation failed for ${sanitizeForLogging(url)}: ${error.message}`);
      return false;
    }
  }

  /**
   * Resolve and validate multiple URLs
   */
  async resolveAndValidate(urls, validateOnce = false) {
    const validatedStreams = [];

    for (const streamObj of urls) {
      try {
        let finalUrl = streamObj.url;

        // For wrapper URLs, resolve them through the redirect chain
        if (isWrapperUrl(finalUrl)) {

          const resolved = await this.resolveWrapperUrl(finalUrl);
          validatedStreams.push(...resolved);
        } else {
          // For direct URLs, validate or add directly
          if (!validateOnce || await this.validateUrl(finalUrl)) {
            validatedStreams.push(streamObj);
          }
        }
      } catch (error) {
        console.warn(`[LinkResolver] Failed to process ${sanitizeForLogging(streamObj.url)}: ${error.message}`);
      }
    }

    return validatedStreams;
  }

}

export default LinkResolver;
