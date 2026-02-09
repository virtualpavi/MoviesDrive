/**
 * Source Extractors Module
 * Implements extractors for various hosting providers to get actual streaming URLs
 * Based on CineStream's loadExtractor approach
 */

import HttpClient from './http-client.js';
import LinkResolver from './link-resolver.js';
import { load } from 'cheerio';

class SourceExtractors {
  constructor() {
    this.http = new HttpClient();
    this.linkResolver = new LinkResolver();
  }

  /**
   * Extract from various hosting providers
   * @param {string} url - Hosting provider URL
   * @returns {Promise<Array<Object>>} Array of extracted stream objects
   */
  async extractFromUrl(url) {
    if (!url) return [];

    const urlLower = url.toLowerCase();
    console.log(`[Extractor] Extracting from: ${urlLower.substring(0, 50)}...`);

    try {
      // Check if this is a wrapper URL that needs resolution through redirect chain
      if (this.linkResolver.isWrapperUrl(url)) {
        console.log(`[Extractor] Detected wrapper URL, resolving through redirect chain`);
        return await this.linkResolver.resolveWrapperUrl(url);
      }

      // Route to appropriate extractor
      if (urlLower.includes('hubcloud') || urlLower.includes('gdrive')) {
        return await this.extractGDrive(url);
      } else if (urlLower.includes('streamtape') || urlLower.includes('streamta.pe')) {
        return await this.extractStreamTape(url);
      } else if (urlLower.includes('mixdrop')) {
        return await this.extractMixDrop(url);
      } else if (urlLower.includes('pixeldrain')) {
        return await this.extractPixelDrain(url);
      } else if (urlLower.includes('gofile')) {
        return await this.extractGoFile(url);
      } else if (urlLower.includes('gdflix')) {
        return await this.extractGDFlix(url);
      } else if (urlLower.includes('gdlink')) {
        return await this.extractGDLink(url);
      } else if (urlLower.includes('fsl')) {
        return await this.extractFSL(url);
      } else {
        // Try generic extraction
        return await this.extractGeneric(url);
      }
    } catch (error) {
      console.error(`[Extractor] Error extracting from ${url}:`, error.message);
      return [];
    }
  }

  /**
   * Extract from GDrive/HubCloud
   */
  async extractGDrive(url) {
    try {
      const response = await this.http.get(url, { timeout: 20000 });
      const text = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
      const $ = load(text);

      const streams = [];

      // Look for download button
      const downloadBtn = $('a:contains("Download"), a.btn-primary, button:contains("Download")').first();
      if (downloadBtn.length) {
        const href = downloadBtn.attr('href') || downloadBtn.attr('onclick') || '';
        if (href) {
          streams.push({
            url: href.replace(/onclick=['"].*?window.location=['"](.+?)['"].*?['"]/, '$1') || href,
            quality: 1080,
            source: 'GDrive',
          });
        }
      }

      // Look for direct download links
      $('a[href*="/uc?"], a[href*="export?gid"]').each((_, elem) => {
        const href = $(elem).attr('href');
        if (href && href.includes('drive.google')) {
          streams.push({
            url: href,
            quality: 1080,
            source: 'GDrive',
          });
        }
      });

      // Extract from script tags
      $('script').each((_, elem) => {
        const text = $(elem).text();
        const match = text.match(/window.location\s*=\s*['"]([^'"]+)['"]/);
        if (match) {
          streams.push({
            url: match[1],
            quality: 1080,
            source: 'GDrive',
          });
        }
      });

      console.debug(`[GDrive] Found ${streams.length} stream(s)`);
      return streams;
    } catch (error) {
      console.error(`[GDrive] Error:`, error.message);
      return [];
    }
  }

  /**
   * Extract from StreamTape
   */
  async extractStreamTape(url) {
    try {
      const response = await this.http.get(url, { timeout: 20000 });
      const text = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
      const $ = load(text);

      const streams = [];
      const scriptText = $('script').text();
      
      const patterns = [
        /sources:\s*\[\s*{\s*src:\s*["']([^"']+)["']/,
        /src=['"]([^'"]*?\.m3u8[^'"]*?)['"] /,
        /https:.*?\/media\/\d+\/[^"'\s]+/,
      ];

      for (const pattern of patterns) {
        const match = scriptText.match(pattern);
        if (match && match[1]) {
          streams.push({
            url: match[1],
            quality: 720,
            source: 'StreamTape',
          });
          break;
        }
      }

      const downloadBtn = $('a:contains("Download"), a.btn-download').first();
      if (downloadBtn.length && streams.length === 0) {
        const href = downloadBtn.attr('href');
        if (href) {
          streams.push({
            url: href,
            quality: 720,
            source: 'StreamTape',
          });
        }
      }

      console.debug(`[StreamTape] Found ${streams.length} stream(s)`);
      return streams;
    } catch (error) {
      console.error(`[StreamTape] Error:`, error.message);
      return [];
    }
  }

  /**
   * Extract from MixDrop
   */
  async extractMixDrop(url) {
    try {
      const response = await this.http.get(url, { timeout: 20000 });
      const text = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
      const $ = load(text);

      const streams = [];

      const videoSource = $('source').attr('src');
      if (videoSource) {
        streams.push({
          url: videoSource,
          quality: 720,
          source: 'MixDrop',
        });
      }

      const scriptText = $('script').text();
      const match = scriptText.match(/["'](https:.*?\.m3u8.*?)["']/);
      if (match && match[1]) {
        streams.push({
          url: match[1],
          quality: 720,
          source: 'MixDrop',
        });
      }

      console.debug(`[MixDrop] Found ${streams.length} stream(s)`);
      return streams;
    } catch (error) {
      console.error(`[MixDrop] Error:`, error.message);
      return [];
    }
  }

  /**
   * Extract from PixelDrain
   */
  async extractPixelDrain(url) {
    try {
      // Check if this is a page URL or API URL
      if (url.includes('/u/')) {
        // Convert page URL to API download URL
        const fileId = url.match(/\/u\/([a-zA-Z0-9]+)/)?.[1];
        if (fileId) {
          const apiUrl = `https://pixeldrain.dev/api/file/${fileId}?download`;
          return [{
            url: apiUrl,
            quality: 1080,
            source: 'PixelDrain',
          }];
        }
      } else if (url.includes('/api/file/')) {
        // Already an API URL
        return [{
          url: url,
          quality: 1080,
          source: 'PixelDrain',
        }];
      }

      return [];
    } catch (error) {
      console.error(`[PixelDrain] Error:`, error.message);
      return [];
    }
  }

  /**
   * Extract from GoFile
   */
  async extractGoFile(url) {
    try {
      const response = await this.http.get(url, { timeout: 20000 });
      const text = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
      const $ = load(text);

      const streams = [];

      $('a.btn-primary, a[href*="download"]').each((_, elem) => {
        const href = $(elem).attr('href');
        if (href && href.startsWith('http')) {
          streams.push({
            url: href,
            quality: 720,
            source: 'GoFile',
          });
        }
      });

      console.debug(`[GoFile] Found ${streams.length} stream(s)`);
      return streams;
    } catch (error) {
      console.error(`[GoFile] Error:`, error.message);
      return [];
    }
  }

  /**
   * Extract from GDFlix
   */
  async extractGDFlix(url) {
    try {
      const response = await this.http.get(url, { timeout: 20000 });
      const text = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
      const $ = load(text);

      const streams = [];

      $('a[href*="download"], button.download, a.btn-success').each((_, elem) => {
        const $elem = $(elem);
        let href = $elem.attr('href');

        if (!href) {
          const onclick = $elem.attr('onclick') || '';
          const match = onclick.match(/['"]([^'"]*drive[^'"]*)['"]/i);
          if (match) href = match[1];
        }

        if (href && (href.includes('drive') || href.startsWith('http'))) {
          const text = $elem.text().trim();
          const quality = text.includes('1080') ? 1080 : 720;
          
          streams.push({
            url: href,
            quality: quality,
            source: 'GDFlix',
          });
        }
      });

      console.debug(`[GDFlix] Found ${streams.length} stream(s)`);
      return streams;
    } catch (error) {
      console.error(`[GDFlix] Error:`, error.message);
      return [];
    }
  }

  /**
   * Extract from GDLink
   */
  async extractGDLink(url) {
    try {
      const response = await this.http.get(url, { timeout: 20000 });
      const text = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
      const $ = load(text);

      const streams = [];

      $('a[href*="drive"], a.btn-primary, button[data-url]').each((_, elem) => {
        const $elem = $(elem);
        let href = $elem.attr('href') || $elem.attr('data-url');

        if (href && href.includes('drive')) {
          streams.push({
            url: href,
            quality: 720,
            source: 'GDLink',
          });
        }
      });

      console.debug(`[GDLink] Found ${streams.length} stream(s)`);
      return streams;
    } catch (error) {
      console.error(`[GDLink] Error:`, error.message);
      return [];
    }
  }

  /**
   * Extract from FSL Server
   */
  async extractFSL(url) {
    try {
      if (url.includes('fsl')) {
        return [{
          url: url,
          quality: 1080,
          source: 'FSL Server',
        }];
      }

      return [];
    } catch (error) {
      console.error(`[FSL] Error:`, error.message);
      return [];
    }
  }

  /**
   * Generic extractor for unknown hosts
   */
  async extractGeneric(url) {
    try {
      const response = await this.http.get(url, { timeout: 20000 });
      const text = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
      const $ = load(text);

      const streams = [];

      const selectors = [
        'a[href*="download"]',
        'a.download',
        'a.btn-primary',
        'button[data-url]',
        'source',
      ];

      for (const selector of selectors) {
        $(selector).each((_, elem) => {
          const $elem = $(elem);
          const href = $elem.attr('href') || $elem.attr('src') || $elem.attr('data-url');

          if (href && (href.startsWith('http') || href.startsWith('blob'))) {
            if (!streams.find(s => s.url === href)) {
              streams.push({
                url: href,
                quality: 720,
                source: 'Direct',
              });
            }
          }
        });

        if (streams.length > 0) break;
      }

      console.debug(`[Generic] Found ${streams.length} stream(s)`);
      return streams;
    } catch (error) {
      console.error(`[Generic] Error:`, error.message);
      return [];
    }
  }
}

export default SourceExtractors;
