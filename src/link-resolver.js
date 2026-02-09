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
   * SIMPLIFIED: Axios now follows redirects automatically, just extract from final page
   */
  async resolveWrapperUrl(wrapperUrl) {
    try {
      console.log(`[LinkResolver] Resolving wrapper: ${wrapperUrl.substring(0, 60)}...`);
      
      // Fetch URL - axios will follow all redirects automatically
      const response = await this.http.get(wrapperUrl, { timeout: 20000 });
      const finalPage = response.text;
      const finalUrl = response.url || response.finalUrl || wrapperUrl;
      
      console.log(`[LinkResolver] Final URL after redirects: ${finalUrl.substring(0, 80)}`);
      
      // Extract streaming links from final page
      const streams = await this.extractStreamsFromPage(finalPage, finalUrl);
      
      if (streams.length > 0) {
        console.log(`[LinkResolver] ✓ Found ${streams.length} stream(s) from final page`);
        return streams;
      }
      
      // === FALLBACK: Return wrapper URL ===
      console.warn(`[LinkResolver] ✗ No streaming links found, using wrapper as fallback`);
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
