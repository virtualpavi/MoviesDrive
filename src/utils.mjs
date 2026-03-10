/**
 * Source Extractors Module
 * Implements extractors for various hosting providers to get actual streaming URLs
 * Based on CineStream's loadExtractor approach
 */

import HttpClient from './http-client.js';
import LinkResolver from './link-resolver.js';
import { isWrapperUrl } from './security.js';
import { load } from 'cheerio';

class SourceExtractors {
  constructor() {
    this.http = new HttpClient();
    this.linkResolver = new LinkResolver();
  }

  /**
   * Extract from various hosting providers
   * @param {string} url - Hosting provider URL
   * @param {string} title - Optional title for the stream
   * @param {string} fileSize - Optional file size
   * @returns {Promise<Array<Object>>} Array of extracted stream objects
   */
  async extractFromUrl(url, title = '', fileSize = '') {
    if (!url) return [];

    const urlLower = url.toLowerCase();
    console.log(`[Extractor] Extracting from: ${urlLower.substring(0, 50)}...`);
    if (title) {
      console.log(`[Extractor] Title: ${title}`);
    }

    try {
      // Check if this is a wrapper URL that needs resolution through redirect chain
      if (isWrapperUrl(url)) {
        console.log(`[Extractor] Detected wrapper URL, resolving through redirect chain`);
        const streams = await this.linkResolver.resolveWrapperUrl(url);
        // Add title and fileSize to each stream
        return streams.map(s => ({
          ...s,
          title: s.title || title,
          fileSize: s.fileSize || fileSize
        }));
      }

      // Route to appropriate extractor
      if (urlLower.includes('hubcloud') || urlLower.includes('gdrive')) {
        return await this.extractGDrive(url, title, fileSize);
      } else if (urlLower.includes('streamtape') || urlLower.includes('streamta.pe')) {
        return await this.extractStreamTape(url, title, fileSize);
      } else if (urlLower.includes('mixdrop')) {
        return await this.extractMixDrop(url, title, fileSize);
      } else if (urlLower.includes('pixeldrain')) {
        return await this.extractPixelDrain(url, title, fileSize);
      } else if (urlLower.includes('gofile')) {
        return await this.extractGoFile(url, title, fileSize);
      } else if (urlLower.includes('gdflix')) {
        return await this.extractGDFlix(url, title, fileSize);
      } else if (urlLower.includes('gdlink')) {
        return await this.extractGDLink(url, title, fileSize);
      } else if (urlLower.includes('fsl')) {
        return await this.extractFSL(url, title, fileSize);
      } else {
        // Try generic extraction
        return await this.extractGeneric(url, title, fileSize);
      }
    } catch (error) {
      console.error(`[Extractor] Error extracting from ${url}:`, error.message);
      return [];
    }
  }

  /**
   * Extract from GDrive/HubCloud
   */
  async extractGDrive(url, title = '', fileSize = '') {
    try {
      const response = await this.http.get(url, { timeout: 20000 });
      const text = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
      const $ = load(text);

      const streams = [];

      // Look for Google Drive download links
      $('a[href*="drive.google.com"], a[href*="/uc?"], a[href*="export=download"]').each((_, elem) => {
        const $elem = $(elem);
        let href = $elem.attr('href');

        if (href) {
          // Ensure it's a full URL
          if (!href.startsWith('http')) {
            href = new URL(href, url).href;
          }

          // Extract quality from button text
          const buttonText = $elem.text() || '';
          const quality = this.extractQualityFromText(buttonText);

          streams.push({
            url: href,
            quality: quality,
            source: 'GDrive',
            title: title,
            fileSize: fileSize,
          });
        }
      });

      // Also check for JavaScript redirects to Google Drive
      const scriptText = $('script').text();
      const driveMatch = scriptText.match(/window\.location\s*=\s*['"](https:\/\/drive\.google\.com\/[^'"]+)['"]/i);
      if (driveMatch) {
        streams.push({
          url: driveMatch[1],
          quality: 1080,
          source: 'GDrive',
          title: title,
          fileSize: fileSize,
        });
      }

      console.debug(`[GDrive] Found ${streams.length} stream(s)`);
      return streams.map(s => ({
        ...s,
        title: s.title || title,
        fileSize: s.fileSize || fileSize,
      }));
    } catch (error) {
      console.error(`[GDrive] Error:`, error.message);
      return [];
    }
  }

  /**
   * Extract from StreamTape
   */
  async extractStreamTape(url, title = '', fileSize = '') {
    try {
      const response = await this.http.get(url, { timeout: 20000 });
      const text = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
      const $ = load(text);

      const streams = [];

      // Look for video source in script tags
      const scriptText = $('script').text();
      const videoMatch = scriptText.match(/sources:\s*\[\s*\{[^}]*src:\s*['"]([^'"]+)['"]/);
      
      if (videoMatch) {
        streams.push({
          url: videoMatch[1],
          quality: 720,
          source: 'StreamTape',
          title: title,
          fileSize: fileSize,
        });
      }

      // Also check for download button
      $('a[href*="download"], button[data-url]').each((_, elem) => {
        const $elem = $(elem);
        const href = $elem.attr('href') || $elem.attr('data-url');
        
        if (href && href.includes('stream')) {
          streams.push({
            url: href,
            quality: 720,
            source: 'StreamTape',
            title: title,
            fileSize: fileSize,
          });
        }
      });

      console.debug(`[StreamTape] Found ${streams.length} stream(s)`);
      return streams.map(s => ({
        ...s,
        title: s.title || title,
        fileSize: s.fileSize || fileSize,
      }));
    } catch (error) {
      console.error(`[StreamTape] Error:`, error.message);
      return [];
    }
  }

  /**
   * Extract from MixDrop
   */
  async extractMixDrop(url, title = '', fileSize = '') {
    try {
      const response = await this.http.get(url, { timeout: 20000 });
      const text = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
      const $ = load(text);

      const streams = [];

      // Look for HTML5 video sources
      $('video source, video').each((_, elem) => {
        const $elem = $(elem);
        const src = $elem.attr('src') || $elem.find('source').attr('src');
        
        if (src) {
          streams.push({
            url: src,
            quality: 720,
            source: 'MixDrop',
            title: title,
            fileSize: fileSize,
          });
        }
      });

      // Also check for script-embedded sources
      const scriptText = $('script').text();
      const wurlMatch = scriptText.match(/wurl\s*=\s*["']([^"']+)["']/);
      if (wurlMatch) {
        const videoUrl = 'https://' + wurlMatch[1];
        streams.push({
          url: videoUrl,
          quality: 720,
          source: 'MixDrop',
          title: title,
          fileSize: fileSize,
        });
      }

      console.debug(`[MixDrop] Found ${streams.length} stream(s)`);
      return streams.map(s => ({
        ...s,
        title: s.title || title,
        fileSize: s.fileSize || fileSize,
      }));
    } catch (error) {
      console.error(`[MixDrop] Error:`, error.message);
      return [];
    }
  }

  /**
   * Extract from PixelDrain
   */
  async extractPixelDrain(url, title = '', fileSize = '') {
    try {
      // Check if this is a zip file
      if (url.includes('zip') || url.includes('archive')) {
        console.log(`[PixelDrain] Processing zip file: ${url}`);
        return await this.extractZipFile(url, title, fileSize);
      }
      
      // PixelDrain URLs are already direct links, just need to convert format
      const fileId = this.extractPixelDrainId(url);
      
      if (fileId) {
        // Convert to API download URL
        const apiUrl = `https://pixeldrain.dev/api/file/${fileId}?download`;
        console.log(`[PixelDrain] Converted ${url} to API URL: ${apiUrl}`);
        
        return [{
          url: apiUrl,
          quality: 1080,
          source: 'PixelDrain',
          title: title,
          fileSize: fileSize,
        }];
      }

      return [];
    } catch (error) {
      console.error(`[PixelDrain] Error:`, error.message);
      return [];
    }
  }

  /**
   * Extract PixelDrain file ID from URL
   * Supports both /u/FILEID and /api/file/FILEID patterns
   */
  extractPixelDrainId(url) {
    // Match /u/FILEID pattern
    const uMatch = url.match(/pixeldrain\.dev\/u\/([a-zA-Z0-9]+)/);
    if (uMatch) return uMatch[1];
    
    // Match /api/file/FILEID pattern
    const apiMatch = url.match(/pixeldrain\.dev\/api\/file\/([a-zA-Z0-9]+)/);
    if (apiMatch) return apiMatch[1];
    
    return null;
  }

  /**
   * Extract from GoFile
   */
  async extractGoFile(url, title = '', fileSize = '') {
    try {
      const response = await this.http.get(url, { timeout: 20000 });
      const text = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
      const $ = load(text);

      const streams = [];

      // Look for download buttons
      $('a[href*="download"], button[data-url], a.btn-primary').each((_, elem) => {
        const $elem = $(elem);
        const href = $elem.attr('href') || $elem.attr('data-url');
        
        if (href) {
          streams.push({
            url: href,
            quality: 720,
            source: 'GoFile',
            title: title,
            fileSize: fileSize,
          });
        }
      });

      console.debug(`[GoFile] Found ${streams.length} stream(s)`);
      return streams.map(s => ({
        ...s,
        title: s.title || title,
        fileSize: s.fileSize || fileSize,
      }));
    } catch (error) {
      console.error(`[GoFile] Error:`, error.message);
      return [];
    }
  }

  /**
   * Extract from GDFlix
   */
  async extractGDFlix(url, title = '', fileSize = '') {
    try {
      const response = await this.http.get(url, { timeout: 20000 });
      const text = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
      const $ = load(text);

      const streams = [];

      // Look for Google Drive links or download buttons
      $('a[href*="drive"], a.btn-primary, button[data-url], a[href*="download"]').each((_, elem) => {
        const $elem = $(elem);
        let href = $elem.attr('href') || $elem.attr('data-url');

        if (href) {
          // Ensure it's a full URL
          if (!href.startsWith('http')) {
            href = new URL(href, url).href;
          }

          // Extract quality from button text
          const buttonText = $elem.text() || '';
          const quality = this.extractQualityFromText(buttonText);

          if (href.includes('drive') || href.includes('download')) {
            streams.push({
              url: href,
              quality: quality,
              source: 'GDFlix',
              title: title,
              fileSize: fileSize,
            });
          }
        }
      });

      console.debug(`[GDFlix] Found ${streams.length} stream(s)`);
      return streams.map(s => ({
        ...s,
        title: s.title || title,
        fileSize: s.fileSize || fileSize,
      }));
    } catch (error) {
      console.error(`[GDFlix] Error:`, error.message);
      return [];
    }
  }

  /**
   * Extract from GDLink
   */
  async extractGDLink(url, title = '', fileSize = '') {
    try {
      const response = await this.http.get(url, { timeout: 20000 });
      const text = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
      const $ = load(text);

      const streams = [];

      // Similar to GDFlix
      $('a[href*="drive"], a.btn-primary, button[data-url]').each((_, elem) => {
        const $elem = $(elem);
        let href = $elem.attr('href') || $elem.attr('data-url');

        if (href && href.includes('drive')) {
          streams.push({
            url: href,
            quality: 720,
            source: 'GDLink',
            title: title,
            fileSize: fileSize,
          });
        }
      });

      console.debug(`[GDLink] Found ${streams.length} stream(s)`);
      return streams.map(s => ({
        ...s,
        title: s.title || title,
        fileSize: s.fileSize || fileSize,
      }));
    } catch (error) {
      console.error(`[GDLink] Error:`, error.message);
      return [];
    }
  }

  /**
   * Extract from FSL Server
   */
  async extractFSL(url, title = '', fileSize = '') {
    try {
      // FSL URLs are usually direct streaming URLs
      if (url.includes('fsl')) {
        return [{
          url: url,
          quality: 1080,
          source: 'FSL Server',
          title: title,
          fileSize: fileSize,
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
  async extractGeneric(url, title = '', fileSize = '') {
    try {
      const response = await this.http.get(url, { timeout: 20000 });
      const text = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
      const $ = load(text);

      const streams = [];

      // Look for common patterns
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
                title: title,
                fileSize: fileSize,
              });
            }
          }
        });

        if (streams.length > 0) break;
      }

      console.debug(`[Generic] Found ${streams.length} stream(s)`);
      return streams.map(s => ({
        ...s,
        title: s.title || title,
        fileSize: s.fileSize || fileSize,
      }));
    } catch (error) {
      console.error(`[Generic] Error:`, error.message);
      return [];
    }
  }

  /**
   * Extract from zip files
   */
  async extractZipFile(url, title = '', fileSize = '') {
    try {
      console.log(`[ZipExtractor] Extracting from zip file: ${url}`);
      
      // For zip files, we need to extract the file list and find video files
      // This is a simplified approach - in a real implementation, you'd need
      // to download and parse the zip file contents
      
      const response = await this.http.get(url, { timeout: 30000 });
      const text = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
      const $ = load(text);

      const streams = [];

      // Look for file links in the zip file listing
      $('a[href]').each((_, elem) => {
        const $elem = $(elem);
        const href = $elem.attr('href');
        const linkText = $elem.text();
        
        if (href && (href.includes('.mkv') || href.includes('.mp4') || href.includes('.avi'))) {
          // Extract quality and other metadata from filename
          const filename = href.split('/').pop() || linkText;
          const metadata = this.extractMetadataFromFilename(filename);
          
          streams.push({
            url: href.startsWith('http') ? href : new URL(href, url).href,
            quality: metadata.quality,
            source: 'Zip Archive',
            title: metadata.title,
            fileSize: metadata.fileSize,
          });
        }
      });

      console.debug(`[ZipExtractor] Found ${streams.length} stream(s) in zip file`);
      return streams.map(s => ({
        ...s,
        title: s.title || title,
        fileSize: s.fileSize || fileSize,
      }));
    } catch (error) {
      console.error(`[ZipExtractor] Error:`, error.message);
      return [];
    }
  }

  /**
   * Extract metadata from filename
   * Format: Landman.S01E01.1080p.BluRay.Hindi.2.0-English.5.1.ESub.x264 [FSL / PIXEL SERVER] [resolution] [file size]
   */
  extractMetadataFromFilename(filename) {
    const filenameLower = filename.toLowerCase();
    
    // Extract episode info
    const episodeMatch = filenameLower.match(/s(\d+)e(\d+)/);
    const season = episodeMatch ? parseInt(episodeMatch[1]) : 1;
    const episode = episodeMatch ? parseInt(episodeMatch[2]) : 1;
    
    // Extract quality
    const quality = this.extractQualityFromText(filename);
    
    // Extract file size
    const sizeMatch = filenameLower.match(/(\d+\.?\d*)\s*(gb|mb)/i);
    const fileSize = sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}` : '';
    
    // Extract source/server info
    const sourceMatch = filenameLower.match(/\[(.*?)\]/);
    const source = sourceMatch ? sourceMatch[1] : 'Unknown';
    
    // Create title in the requested format
    const title = `${filename.split('.')[0]} [${source}] [${quality}p] [${fileSize}]`;

    return {
      quality,
      fileSize,
      title,
      source
    };
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
}

export default SourceExtractors;
