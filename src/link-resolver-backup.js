/**
 * Link Resolver Module
 * Handles URL redirect chains and final stream URL extraction
 * Based on the MoviesDrive streaming flow:
 * wrapper URL -> redirect chain -> intermediate page -> extract final URLs
 */

import HttpClient from './http-client.js';
import { load } from 'cheerio';

class LinkResolver {
  constructor() {
    this.http = new HttpClient();
  }

  /**
   * Resolve a wrapper URL through redirect chain to get final streaming URL
   * Handles: hubcloud.php -> intermediate page -> FSL/PixelDrain URLs
   * Also handles meta refresh and JavaScript redirects
   * Follows complete redirect chains through multiple domains
   */
  async resolveWrapperUrl(wrapperUrl) {
    try {
      console.log(`[LinkResolver] Resolving wrapper: ${wrapperUrl.substring(0, 60)}...`);
      
      // Follow redirects to get to intermediate page
      let response = await this.http.get(wrapperUrl, { timeout: 20000 });
      let finalPage = response.text;
      let finalUrl = response.url || response.finalUrl || wrapperUrl;
      
      // Handle HTTP redirect responses (3xx status codes)
      // Since maxRedirects is 0, we need to follow them manually
      let redirectCount = 0;
      const maxHttpRedirects = 5;
      
      while ((response.status >= 300 && response.status < 400) && redirectCount < maxHttpRedirects) {
        const location = response.headers?.location || response.headers?.Location;
        if (location) {
          // Resolve relative URLs
          const redirectUrl = location.startsWith('http') ? location : new URL(location, finalUrl).href;
          console.log(`[LinkResolver] HTTP ${response.status} redirect [${redirectCount + 1}]: ${redirectUrl.substring(0, 80)}`);
          
          try {
            response = await this.http.get(redirectUrl, { timeout: 20000 });
            finalPage = response.text;
            finalUrl = response.url || response.finalUrl || redirectUrl;
            redirectCount++;
          } catch (error) {
            console.warn(`[LinkResolver] Error following HTTP redirect: ${error.message}`);
            break;
          }
        } else {
          console.warn(`[LinkResolver] HTTP ${response.status} but no Location header`);
          break;
        }
      }
      
      console.log(`[LinkResolver] Initial fetch: ${finalUrl.substring(0, 80)}`);


      // Follow redirect chain - keep checking for redirects until we reach final page
      let metaRedirectCount = 0;
      const maxMetaRedirects = 5;
      
      while (metaRedirectCount < maxMetaRedirects) {

        let redirectFound = false;
        let redirectUrl = null;

        // Check for meta refresh redirect
        const metaRefreshMatch = finalPage.match(/<meta[^>]*?http-equiv=["']refresh["'][^>]*?content=["']([^"']*)['"]/i);
        if (metaRefreshMatch) {
          const redirectContent = metaRefreshMatch[1];
          const urlMatch = redirectContent.match(/url=([^\s;]+)/i);
          if (urlMatch) {
            redirectUrl = urlMatch[1].replace(/['"]/g, '');
            if (!redirectUrl.startsWith('http')) {
              redirectUrl = new URL(redirectUrl, finalUrl).href;
            }
            console.log(`[LinkResolver] Meta refresh redirect [${metaRedirectCount + 1}]: ${redirectUrl.substring(0, 80)}`);
            redirectFound = true;
          }
        }

        // Check for JavaScript window.location redirect
        if (!redirectFound) {
          const jsRedirectMatch = finalPage.match(/window\.location\s*=\s*['"]([^'"]+)['"]/i);
          if (jsRedirectMatch) {
            redirectUrl = jsRedirectMatch[1];
            if (!redirectUrl.startsWith('http')) {
              redirectUrl = new URL(redirectUrl, finalUrl).href;
            }
            console.log(`[LinkResolver] JS redirect [${metaRedirectCount + 1}]: ${redirectUrl.substring(0, 80)}`);
            redirectFound = true;
          }
        }

        // Check for JavaScript window.location.href redirect with variable
        if (!redirectFound) {
          // Pattern: window.location.href = url; where url is a variable
          const jsHrefVarMatch = finalPage.match(/window\.location\.href\s*=\s*url\s*;/i);
          if (jsHrefVarMatch) {
            // Find the url variable definition
            const urlVarMatch = finalPage.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/i) || 
                               finalPage.match(/let\s+url\s*=\s*['"]([^'"]+)['"]/i) ||
                               finalPage.match(/const\s+url\s*=\s*['"]([^'"]+)['"]/i) ||
                               finalPage.match(/url\s*=\s*['"]([^'"]+)['"]/i);
            if (urlVarMatch) {
              redirectUrl = urlVarMatch[1];
              if (!redirectUrl.startsWith('http')) {
                redirectUrl = new URL(redirectUrl, finalUrl).href;
              }
              console.log(`[LinkResolver] JS href redirect (var) [${metaRedirectCount + 1}]: ${redirectUrl.substring(0, 80)}`);
              redirectFound = true;
            }
          }
        }

        // Check for JavaScript window.location.href redirect with direct URL
        if (!redirectFound) {
          const jsHrefMatch = finalPage.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/i);
          if (jsHrefMatch) {
            redirectUrl = jsHrefMatch[1];
            if (!redirectUrl.startsWith('http')) {
              redirectUrl = new URL(redirectUrl, finalUrl).href;
            }
            console.log(`[LinkResolver] JS href redirect [${metaRedirectCount + 1}]: ${redirectUrl.substring(0, 80)}`);
            redirectFound = true;
          }
        }


        // Check for JavaScript window.location.replace redirect
        if (!redirectFound) {
          const jsReplaceMatch = finalPage.match(/window\.location\.replace\s*\(\s*['"]([^'"]+)['"]\s*\)/i);
          if (jsReplaceMatch) {
            redirectUrl = jsReplaceMatch[1];
            if (!redirectUrl.startsWith('http')) {
              redirectUrl = new URL(redirectUrl, finalUrl).href;
            }
            console.log(`[LinkResolver] JS replace redirect [${metaRedirectCount + 1}]: ${redirectUrl.substring(0, 80)}`);
            redirectFound = true;
          }
        }

        if (!redirectFound) {
          // No more redirects found
          break;
        }

        // Follow the redirect
        try {
          const redirectResponse = await this.http.get(redirectUrl, { timeout: 20000 });
          finalPage = redirectResponse.text;
          finalUrl = redirectResponse.url || redirectResponse.finalUrl || redirectUrl;
          console.log(`[LinkResolver] Followed to: ${finalUrl.substring(0, 80)}`);
          metaRedirectCount++;
        } catch (error) {
          console.warn(`[LinkResolver] Error following redirect: ${error.message}`);
          break;
        }
      }

      console.log(`[LinkResolver] Reached final URL after ${metaRedirectCount} redirect(s): ${finalUrl.substring(0, 80)}`);


      // Parse the final page to extract streaming URLs
      const streams = await this.extractStreamsFromPage(finalPage, finalUrl);

      if (streams.length > 0) {
        console.log(`[LinkResolver] ✓ Found ${streams.length} stream(s) from final page`);
        streams.forEach((s, i) => {
          console.log(`  [${i + 1}] ${s.source} (${s.quality}p): ${s.url.substring(0, 80)}`);
        });
        return streams;
      }

      // If no streams found, try fallback extraction
      console.warn(`[LinkResolver] No streams extracted from final page, trying fallback`);
      const $ = load(finalPage);
      
      // Look for any links that might be streaming URLs
      const allLinks = $('a[href^="http"]').map((_, el) => $(el).attr('href')).get();
      
      if (allLinks.length > 0) {
        console.log(`[LinkResolver] Checking ${allLinks.length} links for streaming URLs`);
        for (const link of allLinks) {
          if (this.looksLikeStreamingUrl(link)) {
            console.log(`[LinkResolver] ✓ Found streaming URL: ${link.substring(0, 80)}`);
            return [{
              url: link,
              quality: 1080,
              source: 'Extracted-Link',
              type: 'direct',
            }];
          }
        }
      }

      // Fallback: return wrapper URL as-is
      console.warn(`[LinkResolver] No streams found, using wrapper as fallback`);
      return [{
        url: wrapperUrl,
        quality: 1080,
        source: 'Wrapper-Direct',
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
   * Check if a URL looks like it could be a streaming URL
   */
  looksLikeStreamingUrl(url) {
    const streamingPatterns = [
      'hub.fsl', 'fsl-lover', 'pixeldrain.dev', 'gdflix',
      'gofile', 'streamtape', 'mixdrop', 'gdrive',
      'gamerxyt', 'carnewz', 'cryptoinsights',
    ];
    return streamingPatterns.some(pattern => url.toLowerCase().includes(pattern));
  }

  /**
   * Extract streaming URLs from the final landing page
   * Looks for FSL Server, PixelDrain, and other streaming links
   */
  async extractStreamsFromPage(pageHtml, pageUrl) {
    const streams = [];
    const $ = load(pageHtml);

    try {
      console.log(`[LinkResolver] Parsing page for streaming links...`);

      // === FSL Server Links ===
      // Look for FSL Server download buttons - these are the primary 1080p sources
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

          // Check if this is an FSL link
          if (href && href.startsWith('http') && 
              (href.includes('fsl') || href.includes('hub.fsl') || 
               text.includes('FSL') || title.includes('FSL') || downloadAttr.includes('FSL'))) {
            
            // Avoid duplicates
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
      // Look for PixelDrain links and convert to API format
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

          // Extract file ID from various PixelDrain URL formats
          let fileId = null;
          
          // Format: pixeldrain.dev/u/FILEID
          const uMatch = href.match(/pixeldrain\.(?:dev|com)\/u\/([a-zA-Z0-9]+)/i);
          if (uMatch) {
            fileId = uMatch[1];
          }
          
          // Format: pixeldrain.dev/api/file/FILEID
          const apiMatch = href.match(/pixeldrain\.(?:dev|com)\/api\/file\/([a-zA-Z0-9]+)/i);
          if (apiMatch) {
            fileId = apiMatch[1];
          }

          if (fileId) {
            // Convert to API download URL
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


      // Try multiple selectors for GDFlix links
      const gdfixSelectors = [
        'a[href*="gdflix"]',
        'a[href*="gd-link"]',
        'a:contains("GDFlix")',
      ];

      for (const selector of gdfixSelectors) {
        const gdfixLinks = $(selector);
        gdfixLinks.each((_, elem) => {
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

      // Try multiple selectors for GoFile links
      const gofileSelectors = [
        'a[href*="gofile"]',
        'a:contains("GoFile")',
      ];

      for (const selector of gofileSelectors) {
        const gofileLinks = $(selector);
        gofileLinks.each((_, elem) => {
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

      // Extract StreamTape links
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

      // Generic extraction for any remaining download links
      const genericLinks = $('a[href*="download"], a[href*="stream"], button[onclick*="http"]');
      genericLinks.each((_, elem) => {
        const $elem = $(elem);
        let href = $elem.attr('href');
        
        if (!href) {
          const onclick = $elem.attr('onclick') || '';
          const match = onclick.match(/['"](https?:\/\/[^'"]+)['"]/);
          if (match) href = match[1];
        }

        const text = $elem.text().trim();

        if (href && href.startsWith('http') && !streams.find(s => s.url === href)) {
          // Avoid duplicates
          const quality = this.extractQualityFromText(text);
          streams.push({
            url: href,
            quality: quality,
            source: 'Direct Link',
            type: 'direct',
            title: text || `Direct ${quality}p`,
          });
          console.log(`[LinkResolver] ✓ Direct: ${href.substring(0, 70)}`);
        }
      });

      if (streams.length > 0) {
        console.log(`[LinkResolver] ✓ Extracted ${streams.length} streaming URL(s)`);
        streams.forEach((s, i) => {
          console.log(`  [${i + 1}] ${s.source} (${s.quality}p): ${s.url.substring(0, 70)}`);
        });
      } else {
        console.warn(`[LinkResolver] ✗ No streaming links found on page`);
      }

    } catch (error) {
      console.error(`[LinkResolver] Error parsing page:`, error.message);
    }

    return streams;
  }

  /**
   * Extract PixelDrain file ID from URL
   * Supports multiple URL formats:
   * - https://pixeldrain.dev/u/FILEID
   * - https://pixeldrain.com/u/FILEID
   * - https://pixeldrain.dev/api/file/FILEID
   * Returns: FILEID or null
   */
  extractPixelDrainId(url) {
    if (!url) return null;
    
    // Try various PixelDrain URL patterns
    const patterns = [
      /pixeldrain\.(?:dev|com)\/u\/([a-zA-Z0-9]+)/i,
      /pixeldrain\.(?:dev|com)\/api\/file\/([a-zA-Z0-9]+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
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
   * Validate if a URL is actually reachable
   */
  async validateUrl(url, timeout = 5000) {
    try {
      const response = await this.http.get(url, { timeout });
      return response.status >= 200 && response.status < 400;
    } catch (error) {
      console.debug(`[LinkResolver] URL validation failed for ${url}: ${error.message}`);
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
        if (this.isWrapperUrl(finalUrl)) {
          const resolved = await this.resolveWrapperUrl(finalUrl);
          validatedStreams.push(...resolved);
        } else {
          // For direct URLs, validate or add directly
          if (!validateOnce || await this.validateUrl(finalUrl)) {
            validatedStreams.push(streamObj);
          }
        }
      } catch (error) {
        console.warn(`[LinkResolver] Failed to process ${streamObj.url}: ${error.message}`);
      }
    }

    return validatedStreams;
  }

  /**
   * Check if URL is a wrapper that needs resolution
   * These URLs require following redirect chains to get final streaming URLs
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

}

export default LinkResolver;
