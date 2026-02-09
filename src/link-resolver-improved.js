/**
 * Link Resolver Module - IMPROVED VERSION
 * Handles URL redirect chains and final stream URL extraction
 * Based on the MoviesDrive streaming flow:
 * wrapper URL -> redirect chain -> intermediate page -> extract final URLs
 * 
 * IMPROVEMENTS:
 * - Extracts links at each step of redirect chain
 * - Stops following redirects once streaming links are found
 * - Better handling of JS redirects with variables
 */

import HttpClient from './http-client.js';
import { load } from 'cheerio';

class LinkResolver {
  constructor() {
    this.http = new HttpClient();
  }

  /**
   * Resolve a wrapper URL through redirect chain to get final streaming URL
   * IMPROVED: Extracts links at each step, stops when links found
   */
  async resolveWrapperUrl(wrapperUrl) {
    try {
      console.log(`[LinkResolver] Resolving wrapper: ${wrapperUrl.substring(0, 60)}...`);
      
      // Start with initial URL
      let currentUrl = wrapperUrl;
      let currentPage = null;
      let redirectCount = 0;
      const maxRedirects = 10;
      
      while (redirectCount < maxRedirects) {
        console.log(`[LinkResolver] Step ${redirectCount + 1}: Fetching ${currentUrl.substring(0, 80)}...`);
        
        // Fetch current URL
        const response = await this.http.get(currentUrl, { timeout: 20000 });
        currentPage = response.text;
        const fetchedUrl = response.url || response.finalUrl || currentUrl;
        
        console.log(`[LinkResolver] Fetched: ${fetchedUrl.substring(0, 80)} (Status: ${response.status})`);
        
        // === STEP 1: Try to extract streaming links from CURRENT page ===
        console.log(`[LinkResolver] Checking for streaming links on current page...`);
        const streams = await this.extractStreamsFromPage(currentPage, fetchedUrl);
        
        if (streams.length > 0) {
          console.log(`[LinkResolver] ✓ Found ${streams.length} stream(s) at step ${redirectCount + 1}, stopping redirect chain`);
          return streams;
        }
        
        // === STEP 2: Check for redirects if no links found ===
        let redirectUrl = null;
        let redirectType = null;
        
        // Check for HTTP redirect (3xx status)
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers?.location || response.headers?.Location;
          if (location) {
            redirectUrl = location.startsWith('http') ? location : new URL(location, fetchedUrl).href;
            redirectType = `HTTP ${response.status}`;
          }
        }
        
        // Check for meta refresh redirect
        if (!redirectUrl) {
          const metaRefreshMatch = currentPage.match(/<meta[^>]*?http-equiv=["']refresh["'][^>]*?content=["']([^"']*)['"]/i);
          if (metaRefreshMatch) {
            const redirectContent = metaRefreshMatch[1];
            const urlMatch = redirectContent.match(/url=([^\s;]+)/i);
            if (urlMatch) {
              redirectUrl = urlMatch[1].replace(/['"]/g, '');
              if (!redirectUrl.startsWith('http')) {
                redirectUrl = new URL(redirectUrl, fetchedUrl).href;
              }
              redirectType = 'meta refresh';
            }
          }
        }
        
        // Check for JavaScript window.location redirect
        if (!redirectUrl) {
          const jsRedirectMatch = currentPage.match(/window\.location\s*=\s*['"]([^'"]+)['"]/i);
          if (jsRedirectMatch) {
            redirectUrl = jsRedirectMatch[1];
            if (!redirectUrl.startsWith('http')) {
              redirectUrl = new URL(redirectUrl, fetchedUrl).href;
            }
            redirectType = 'JS window.location';
          }
        }
        
        // Check for JavaScript window.location.href with variable
        if (!redirectUrl) {
          const jsHrefVarMatch = currentPage.match(/window\.location\.href\s*=\s*url\s*;/i);
          if (jsHrefVarMatch) {
            const urlVarMatch = currentPage.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/i) || 
                               currentPage.match(/let\s+url\s*=\s*['"]([^'"]+)['"]/i) ||
                               currentPage.match(/const\s+url\s*=\s*['"]([^'"]+)['"]/i) ||
                               currentPage.match(/url\s*=\s*['"]([^'"]+)['"]/i);
            if (urlVarMatch) {
              redirectUrl = urlVarMatch[1];
              if (!redirectUrl.startsWith('http')) {
                redirectUrl = new URL(redirectUrl, fetchedUrl).href;
              }
              redirectType = 'JS window.location.href (var)';
            }
          }
        }
        
        // Check for JavaScript window.location.href direct
        if (!redirectUrl) {
          const jsHrefMatch = currentPage.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/i);
          if (jsHrefMatch) {
            redirectUrl = jsHrefMatch[1];
            if (!redirectUrl.startsWith('http')) {
              redirectUrl = new URL(redirectUrl, fetchedUrl).href;
            }
            redirectType = 'JS window.location.href';
          }
        }
        
        // Check for JavaScript window.location.replace
        if (!redirectUrl) {
          const jsReplaceMatch = currentPage.match(/window\.location\.replace\s*\(\s*['"]([^'"]+)['"]\s*\)/i);
          if (jsReplaceMatch) {
            redirectUrl = jsReplaceMatch[1];
            if (!redirectUrl.startsWith('http')) {
              redirectUrl = new URL(redirectUrl, fetchedUrl).href;
            }
            redirectType = 'JS window.location.replace';
          }
        }
        
        // No redirect found, we're at the final page
        if (!redirectUrl) {
          console.log(`[LinkResolver] No more redirects found at step ${redirectCount + 1}`);
          break;
        }
        
        // Check if redirect URL is the same as current (loop detection)
        if (redirectUrl === currentUrl) {
          console.log(`[LinkResolver] Redirect loop detected, stopping`);
          break;
        }
        
        console.log(`[LinkResolver] Found ${redirectType} redirect to: ${redirectUrl.substring(0, 80)}`);
        currentUrl = redirectUrl;
        redirectCount++;
      }
      
      // === FINAL STEP: Try to extract from final page ===
      console.log(`[LinkResolver] Reached final URL after ${redirectCount} step(s): ${currentUrl.substring(0, 80)}`);
      
      const finalStreams = await this.extractStreamsFromPage(currentPage, currentUrl);
      
      if (finalStreams.length > 0) {
        console.log(`[LinkResolver] ✓ Found ${finalStreams.length} stream(s) from final page`);
        return finalStreams;
      }
      
      // === FALLBACK: Return wrapper URL ===
      console.warn(`[LinkResolver] ✗ No streaming links found after ${redirectCount} step(s), using wrapper as fallback`);
      return [{
        url: wrapperUrl,
        quality: 1080,
        source: 'MoviesDrive-Wrapper',
        type: 'direct',
      }];
      
    } catch (error) {
      console.error(`[LinkResolver] Error resolving ${wrapperUrl}:`, error.message);
      return [{
        url: wrapperUrl,
        quality: 1080,
        source: 'Wrapper-Fallback',
        type: 'direct',
      }];
    }
  }

  /**
   * Extract streaming URLs from page HTML
   * Looks for FSL Server, PixelDrain, and other streaming links
   */
  async extractStreamsFromPage(pageHtml, pageUrl) {
    const streams = [];
    const $ = load(pageHtml);

    try {
      console.log(`[LinkResolver] Parsing page for streaming links...`);

      // === FSL Server Links ===
      const fslSelectors = [
        'a[id="fsl"]',
        'a[href*="hub.fsl"]',
        'a[href*="fsl-lover"]',
        'a[href*="fsl"]',
        'a:contains("FSL")',
        'a:contains("Download")',
        'a.btn-success',
        'a.btn-lg',
      ];

      for (const selector of fslSelectors) {
        $(selector).each((_, elem) => {
          const $elem = $(elem);
          const href = $elem.attr('href');
          const text = $elem.text().trim();
          const title = $elem.attr('title') || '';
          const downloadAttr = $elem.attr('download') || '';

          if (href && href.startsWith('http') && 
              (href.includes('fsl') || href.includes('hub.fsl') || 
               text.includes('FSL') || title.includes('FSL') || downloadAttr.includes('FSL'))) {
            
            if (!streams.find(s => s.url === href)) {
              streams.push({
                url: href,
                quality: 1080,
                source: 'FSL Server',
                type: 'direct',
                title: text || 'FSL Server 1080p',
              });
              console.log(`[LinkResolver] ✓ FSL Server: ${href.substring(0, 70)}`);
            }
          }
        });
      }

      // === PixelDrain Links ===
      const pixelSelectors = [
        'a[href*="pixeldrain.dev/u/"]',
        'a[href*="pixeldrain.com/u/"]',
        'a:contains("PixelDrain")',
        'a:contains("PixelServer")',
        'a[download*="pixeldrain"]',
      ];

      for (const selector of pixelSelectors) {
        $(selector).each((_, elem) => {
          const $elem = $(elem);
          let href = $elem.attr('href');
          const text = $elem.text().trim();
          const downloadAttr = $elem.attr('download') || '';

          if (!href) return;

          // Extract file ID and convert to API URL
          let fileId = null;
          
          const uMatch = href.match(/pixeldrain\.(?:dev|com)\/u\/([a-zA-Z0-9]+)/i);
          if (uMatch) fileId = uMatch[1];
          
          const apiMatch = href.match(/pixeldrain\.(?:dev|com)\/api\/file\/([a-zA-Z0-9]+)/i);
          if (apiMatch) fileId = apiMatch[1];

          if (fileId) {
            const apiUrl = `https://pixeldrain.dev/api/file/${fileId}?download`;
            
            if (!streams.find(s => s.url === apiUrl)) {
              streams.push({
                url: apiUrl,
                quality: 1080,
                source: 'PixelDrain',
                type: 'direct',
                title: text || downloadAttr || 'PixelDrain 1080p',
              });
              console.log(`[LinkResolver] ✓ PixelDrain API: ${apiUrl.substring(0, 70)}`);
            }
          }
        });
      }

      // === GDFlix Links ===
      const gdfixSelectors = [
        'a[href*="gdflix"]',
        'a[href*="gd-link"]',
        'a:contains("GDFlix")',
      ];

      for (const selector of gdfixSelectors) {
        $(selector).each((_, elem) => {
          const $elem = $(elem);
          const href = $elem.attr('href');
          const text = $elem.text().trim();

          if (href && href.startsWith('http') && !streams.find(s => s.url === href)) {
            streams.push({
              url: href,
              quality: 1080,
              source: 'GDFlix',
              type: 'direct',
              title: text || 'GDFlix 1080p',
            });
            console.log(`[LinkResolver] ✓ GDFlix: ${href.substring(0, 70)}`);
          }
        });
      }

      // === GoFile Links ===
      const gofileSelectors = [
        'a[href*="gofile"]',
        'a:contains("GoFile")',
      ];

      for (const selector of gofileSelectors) {
        $(selector).each((_, elem) => {
          const $elem = $(elem);
          const href = $elem.attr('href');
          const text = $elem.text().trim();

          if (href && href.startsWith('http') && !streams.find(s => s.url === href)) {
            streams.push({
              url: href,
              quality: 1080,
              source: 'GoFile',
              type: 'direct',
              title: text || 'GoFile 1080p',
            });
            console.log(`[LinkResolver] ✓ GoFile: ${href.substring(0, 70)}`);
          }
        });
      }

      // === StreamTape Links ===
      const streamtapeLinks = $('a[href*="streamtape"]');
      streamtapeLinks.each((_, elem) => {
        const $elem = $(elem);
        const href = $elem.attr('href');
        const text = $elem.text().trim();

        if (href && href.startsWith('http') && !streams.find(s => s.url === href)) {
          streams.push({
            url: href,
            quality: 1080,
            source: 'StreamTape',
            type: 'direct',
            title: text || 'StreamTape 1080p',
          });
          console.log(`[LinkResolver] ✓ StreamTape: ${href.substring(0, 70)}`);
        }
      });

      if (streams.length > 0) {
        console.log(`[LinkResolver] ✓ Total: ${streams.length} streaming URL(s) extracted`);
      }

    } catch (error) {
      console.error(`[LinkResolver] Error parsing page:`, error.message);
    }

    return streams;
  }

  /**
   * Check if URL is a wrapper that needs resolution
   */
  isWrapperUrl(url) {
    if (!url) return false;
    
    const wrapperDomains = [
      'hubcloud',
      'gamerxyt',
      'carnewz',
      'cryptoinsights',
      'hubcloud.php',
      'moviesdrive',
      'mdrive',
    ];

    const urlLower = url.toLowerCase();
    return wrapperDomains.some(domain => urlLower.includes(domain));
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

    const match = textLower.match(/(\d{3,4})p?/);
    if (match) {
      return parseInt(match[1]);
    }

    return 720;
  }
}

export default LinkResolver;
