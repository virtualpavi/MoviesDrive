/**
 * Subtitles Extractor Module
 * Handles subtitle extraction and language detection
 */

import { load } from 'cheerio';

class SubtitlesExtractor {
  constructor() {
    this.languageMap = {
      'english': 'eng',
      'hindi': 'hin',
      'spanish': 'spa',
      'french': 'fre',
      'german': 'ger',
      'italian': 'ita',
      'portuguese': 'por',
      'russian': 'rus',
      'chinese': 'chi',
      'japanese': 'jpn',
      'korean': 'kor',
      'arabic': 'ara',
      'turkish': 'tur',
      'polish': 'pol',
      'dutch': 'dut',
      'swedish': 'swe',
      'norwegian': 'nor',
      'danish': 'dan',
      'finnish': 'fin',
      'czech': 'cze',
      'hungarian': 'hun',
      'greek': 'gre',
      'hebrew': 'heb',
      'thai': 'tha',
      'vietnamese': 'vie',
      'indonesian': 'ind',
      'malay': 'may',
      'romanian': 'rum',
      'ukrainian': 'ukr',
      'bulgarian': 'bul',
      'croatian': 'hrv',
      'serbian': 'srp',
      'slovenian': 'slv',
      'estonian': 'est',
      'latvian': 'lav',
      'lithuanian': 'lit',
    };
  }

  /**
   * Extract subtitles from HTML content
   * @param {string} imdbId - IMDB ID
   * @param {string} htmlContent - HTML content to parse
   * @returns {Promise<Array<Object>>} Array of subtitle objects
   */
  async getSubtitles(imdbId, htmlContent) {
    try {
      const $ = load(htmlContent);
      const subtitles = [];

      // Look for subtitle links
      $('a[href*=".srt"], a[href*=".vtt"], a[href*=".ass"], a[href*="subtitle"]').each((_, elem) => {
        const $elem = $(elem);
        const href = $elem.attr('href');
        const text = $elem.text() || '';

        if (href) {
          const language = this.detectLanguage(text);
          
          subtitles.push({
            id: `${imdbId}-sub-${subtitles.length}`,
            url: href.startsWith('http') ? href : `https://new1.moviesdrive.surf${href}`,
            lang: language,
            language: this.getLanguageName(language),
          });
        }
      });

      return subtitles;
    } catch (error) {
      console.error(`[Subtitles] Error extracting subtitles:`, error.message);
      return [];
    }
  }

  /**
   * Detect language from text
   * @param {string} text - Text to analyze
   * @returns {string} Language code
   */
  detectLanguage(text) {
    const textLower = text.toLowerCase();

    for (const [name, code] of Object.entries(this.languageMap)) {
      if (textLower.includes(name)) {
        return code;
      }
    }

    // Default to English
    return 'eng';
  }

  /**
   * Get full language name from code
   * @param {string} code - Language code
   * @returns {string} Language name
   */
  getLanguageName(code) {
    const reverseMap = Object.fromEntries(
      Object.entries(this.languageMap).map(([k, v]) => [v, k])
    );
    
    return reverseMap[code] || 'English';
  }
}

export default SubtitlesExtractor;
