/**
 * Subtitles Module
 * Handles subtitle extraction and processing
 * Based on MOVIESDRIVE_STREMIO_ADDON.md subtitle support
 */

import HttpClient from './http-client.js';
import { load } from 'cheerio';

class SubtitlesExtractor {
  constructor() {
    this.http = new HttpClient();
  }

  /**
   * Extract subtitles from MoviesDrive content page
   * @param {string} documentHtml - The HTML document from MoviesDrive
   * @param {string} imdbId - IMDB ID for reference
   * @returns {Promise<Array<Object>>} Array of subtitle objects
   */
  async extractFromDocument(documentHtml, imdbId = '') {
    try {
      const $ = load(documentHtml);
      const subtitles = [];

      // Look for subtitle links in common patterns
      const subtitlePatterns = [
        'a[href*=".srt"]',
        'a[href*=".vtt"]',
        'a[href*=".ass"]',
        'a[href*=".ssa"]',
        'a[href*="subtitle"]',
        'a[href*="subs"]',
      ];

      for (const pattern of subtitlePatterns) {
        $(pattern).each((_, elem) => {
          const $elem = $(elem);
          const href = $elem.attr('href');
          const text = $elem.text().trim();

          if (href && href.startsWith('http')) {
            const format = this.detectSubtitleFormat(href);
            const lang = this.detectLanguage(text);

            if (!subtitles.find(s => s.url === href)) {
              subtitles.push({
                url: href,
                lang: lang,
                format: format,
                title: text || `${lang} Subtitles`,
              });
            }
          }
        });
      }

      // Also check for subtitle mentions in text
      const pageText = $('body').text();
      if (pageText.toLowerCase().includes('english') || pageText.toLowerCase().includes('en')) {
        if (!subtitles.find(s => s.lang === 'en')) {
          subtitles.push({
            url: null,
            lang: 'en',
            format: 'unknown',
            title: 'English (referenced)',
            referenced: true,
          });
        }
      }

      console.debug(`[Subtitles] Found ${subtitles.length} subtitle(s) for ${imdbId}`);
      return subtitles;
    } catch (error) {
      console.error(`[Subtitles] Error extracting subtitles:`, error.message);
      return [];
    }
  }

  /**
   * Detect subtitle format from URL
   * @param {string} url - Subtitle URL
   * @returns {string} Format (srt, vtt, ass, etc.)
   */
  detectSubtitleFormat(url) {
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('.srt')) return 'srt';
    if (urlLower.includes('.vtt')) return 'vtt';
    if (urlLower.includes('.ass') || urlLower.includes('.ssa')) return 'ass';
    if (urlLower.includes('.sub')) return 'sub';
    
    return 'unknown';
  }

  /**
   * Detect language from text
   * @param {string} text - Text containing language info
   * @returns {string} Language code (en, hi, es, etc.)
   */
  detectLanguage(text) {
    const textLower = text.toLowerCase();
    
    const languageMap = {
      'english': 'en',
      'hindi': 'hi',
      'spanish': 'es',
      'french': 'fr',
      'german': 'de',
      'portuguese': 'pt',
      'italian': 'it',
      'russian': 'ru',
      'japanese': 'ja',
      'korean': 'ko',
      'chinese': 'zh',
      'tamil': 'ta',
      'telugu': 'te',
      'kannada': 'kn',
      'marathi': 'mr',
      'bengali': 'bn',
      'punjabi': 'pa',
    };

    for (const [lang, code] of Object.entries(languageMap)) {
      if (textLower.includes(lang)) {
        return code;
      }
    }

    return 'en'; // Default to English
  }

  /**
   * Download and convert subtitle if needed
   * @param {string} url - Subtitle URL
   * @returns {Promise<string>} Subtitle content
   */
  async downloadSubtitle(url) {
    try {
      const response = await this.http.get(url, { timeout: 15000 });
      return response.text;
    } catch (error) {
      console.error(`[Subtitles] Error downloading ${url}:`, error.message);
      return null;
    }
  }

  /**
   * Convert subtitle format (if needed)
   * For now, returns the content as-is
   * @param {string} content - Subtitle content
   * @param {string} fromFormat - Original format
   * @param {string} toFormat - Target format
   * @returns {string} Converted content
   */
  convertFormat(content, fromFormat, toFormat) {
    if (fromFormat === toFormat) {
      return content;
    }

    // TODO: Implement actual format conversion
    // For now, just return as-is
    console.warn(`[Subtitles] Format conversion from ${fromFormat} to ${toFormat} not implemented`);
    return content;
  }

  /**
   * Get subtitles for a specific title
   * Returns formatted subtitle objects suitable for Stremio
   * @param {string} imdbId - IMDB ID
   * @param {string} documentHtml - HTML content
   * @returns {Promise<Array<Object>>} Stremio-compatible subtitle objects
   */
  async getSubtitles(imdbId, documentHtml) {
    const subtitles = await this.extractFromDocument(documentHtml, imdbId);
    
    return subtitles.map((sub, index) => ({
      id: `${imdbId}-sub-${index}`,
      url: sub.url,
      lang: this.languageCodeToName(sub.lang),
      format: sub.format,
    }));
  }

  /**
   * Convert language code to full name
   * @param {string} code - Language code
   * @returns {string} Language name
   */
  languageCodeToName(code) {
    const nameMap = {
      'en': 'English',
      'hi': 'Hindi',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'pt': 'Portuguese',
      'it': 'Italian',
      'ru': 'Russian',
      'ja': 'Japanese',
      'ko': 'Korean',
      'zh': 'Chinese',
      'ta': 'Tamil',
      'te': 'Telugu',
      'kn': 'Kannada',
      'mr': 'Marathi',
      'bn': 'Bengali',
      'pa': 'Punjabi',
    };

    return nameMap[code] || 'Unknown';
  }
}

export default SubtitlesExtractor;
