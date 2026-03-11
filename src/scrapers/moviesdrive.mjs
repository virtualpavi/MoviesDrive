/**
 * MoviesDrive Scraper Module
 * Handles searching and extracting streaming links from MoviesDrive API
 * Uses extractors to get actual streaming URLs from hosting providers
 */

import HttpClient from '../http-client.mjs';
import SourceExtractors from '../utils.mjs';
import SubtitlesExtractor from '../subtitles.mjs';
import { load } from 'cheerio';

class MoviesDriveScraper {
  constructor() {
    this.http = new HttpClient();
    this.extractors = new SourceExtractors();
    this.subtitles = new SubtitlesExtractor();
    this.apiUrl = process.env.MOVIESDRIVE_API || 'https://new1.moviesdrive.surf';
    this.configUrl = process.env.API_CONFIG_URL;
    this.apiUrlFetched = false;
    
    console.log('[MoviesDrive] Constructor - API URL:', this.apiUrl);
    console.log('[MoviesDrive] Constructor - Config URL:', this.configUrl);
    
    // Fetch dynamic URL if config is provided
    if (this.configUrl) {
      this.fetchApiUrl().catch(err => {
        console.warn('[MoviesDrive] Failed to fetch config URL, using fallback:', err.message);
      });
    }
  }

  /**
   * Fetch MoviesDrive API URL from remote config
   * @returns {Promise<void>}
   */
  async fetchApiUrl() {
    if (this.apiUrlFetched) return;
    
    try {
      console.log('[MoviesDrive] Fetching API URL from:', this.configUrl);
      const response = await this.http.get(this.configUrl, { timeout: 5000 });
      const config = JSON.parse(response.text);
      
      if (config.moviesdrive) {
        this.apiUrl = config.moviesdrive;
        this.apiUrlFetched = true;
        console.log('[MoviesDrive] Updated API URL to:', this.apiUrl);
      }
    } catch (error) {
      console.error('[MoviesDrive] Error fetching config URL:', error.message);
      throw error;
    }
  }

  /**
   * Ensure API URL is fetched before making requests
   * @returns {Promise<void>}
   */
  async ensureApiUrl() {
    if (this.configUrl && !this.apiUrlFetched) {
      await this.fetchApiUrl();
    }
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
   * Extract quality from plain text (e.g. 480p/720p/1080p/4K)
   * @param {string} text
   * @returns {number}
   */
  extractQualityFromText(text) {
    const qualityMap = {
      '4k': 2160,
      '2160p': 2160,
      '1080p': 1080,
      '1080': 1080,
      '720p': 720,
      '720': 720,
      '480p': 480,
      '480': 480,
      '360p': 360,
      '360': 360,
    };

    const textLower = String(text || '').toLowerCase();
    for (const [key, value] of Object.entries(qualityMap)) {
      if (textLower.includes(key)) {
        return value;
      }
    }

    const match = textLower.match(/(\d{3,4})p/);
    return match ? parseInt(match[1], 10) : 720;
  }

  /**
   * Parse movie resolution blocks from paired h5 tags:
   * <h5>Title...</h5>
   * <h5><a href="...">...</a></h5>
   * @param {Function} $ - Cheerio instance
   * @param {string} cacheKey - Cache key for this parse
   * @returns {Array<{titleFromH5: string, mdrivePageUrl: string, parsedQuality: number}>}
   */
  parseMovieDownloadBlocks($, cacheKey) {
    const blocks = [];
    const seen = new Set();

    $('h5').each((_, elem) => {
      const $h5 = $(elem);
      const $link = $h5.find('a[href]').first();

      if (!$link.length) {
        return;
      }

      const previousH5 = $h5.prevAll('h5').first();
      if (!previousH5.length || previousH5.find('a[href]').length > 0) {
        return;
      }

      const titleFromH5 = previousH5.text().replace(/\s+/g, ' ').trim();
      if (!titleFromH5) {
        return;
      }

      let href = $link.attr('href');
      if (!href) {
        return;
      }

      try {
        if (!href.startsWith('http')) {
          href = new URL(href, this.apiUrl).href;
        }
      } catch {
        return;
      }

      const parsedQuality = this.extractQualityFromText(`${titleFromH5} ${$link.text()}`);
      const key = `${titleFromH5}|${href}`;
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      blocks.push({
        titleFromH5,
        mdrivePageUrl: href,
        parsedQuality,
      });
    });

    return blocks;
  }

  /**
   * Extract a strict HubCloud wrapper URL from an mdrive archive page.
   * Priority:
   * 1) h4 a[href*="hubcloud"]
   * 2) a[href*="hubcloud"][href*="/drive/"]
   * @param {string} mdrivePageUrl
   * @returns {Promise<string|null>}
   */
  async extractHubCloudWrapperFromMdrive(mdrivePageUrl) {
    try {
      console.log(`[MoviesDrive] Fetching HubCloud wrapper from ${mdrivePageUrl}`);
      const response = await this.http.get(mdrivePageUrl, { timeout: 20000 });
      const textResponse = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
      const $ = load(textResponse);

      const selectors = [
        'h4 a[href*="hubcloud"]',
        'a[href*="hubcloud"][href*="/drive/"]',
      ];

      for (const selector of selectors) {
        const candidates = $(selector).toArray();
        for (const candidate of candidates) {
          let href = $(candidate).attr('href');
          if (!href) {
            continue;
          }

          try {
            if (!href.startsWith('http')) {
              href = new URL(href, mdrivePageUrl).href;
            }
          } catch {
            continue;
          }

          const hrefLower = href.toLowerCase();
          if (hrefLower.includes('hubcloud') && hrefLower.includes('/drive/')) {
            console.log(`[MoviesDrive] Found HubCloud wrapper: ${href}`);
            return href;
          }
        }
      }

      console.log(`[MoviesDrive] No HubCloud wrapper found in ${mdrivePageUrl}`);
      return null;
    } catch (error) {
      console.error(`[MoviesDrive] Error getting hubcloud wrapper from ${mdrivePageUrl}:`, error.message);
      return null;
    }
  }

  /**
   * Normalize stream source names for movie output.
   * @param {Object} stream
   * @returns {'FSL'|'Pixel'|null}
   */
  normalizeMovieSource(stream) {
    const urlLower = String(stream?.url || '').toLowerCase();
    const sourceLower = String(stream?.source || '').toLowerCase();

    if (urlLower.includes('pixeldrain') || sourceLower.includes('pixel')) {
      return 'Pixel';
    }

    if (
      urlLower.includes('fsl') ||
      urlLower.includes('hub.fsl') ||
      sourceLower.includes('fsl')
    ) {
      return 'FSL';
    }

    return null;
  }

  /**
   * Normalize stream source names for series output.
   * @param {Object} stream
   * @returns {'FSL'|'Pixel'|null}
   */
  normalizeSeriesSource(stream) {
    const urlLower = String(stream?.url || '').toLowerCase();
    const sourceLower = String(stream?.source || '').toLowerCase();

    if (urlLower.includes('pixeldrain') || sourceLower.includes('pixel')) {
      return 'Pixel';
    }

    if (sourceLower.includes('fsl') || urlLower.includes('fsl')) {
      return 'FSL';
    }

    return null;
  }

  normalizeWhitespace(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  extractFileSizeFromText(text) {
    const normalized = this.normalizeWhitespace(text);
    const match = normalized.match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB)/i);
    if (!match) {
      return null;
    }
    return `${match[1]} ${match[2].toUpperCase()}`;
  }

  cleanSeriesHubCloudFilename(rawFilename) {
    const normalized = this.normalizeWhitespace(rawFilename);
    if (!normalized) {
      return null;
    }

    let cleaned = normalized
      .replace(/\.(mkv|mp4|avi|mov|m4v|webm)\b.*$/i, '')
      .replace(/\s*[-–—]?\s*\[[^\]]*moviesdrives?[^\]]*\]\s*$/i, '')
      .replace(/\s*[-–—]?\s*moviesdrives?\.[a-z]{2,}\s*$/i, '')
      .replace(/\s*[-–—]?\s*\[[^\]]*\.cv[^\]]*\]\s*$/i, '')
      .replace(/[-_.\s]+$/g, '')
      .trim();

    if (!cleaned) {
      return null;
    }

    // Preserve original dot/dash-separated style from filename.
    cleaned = cleaned.replace(/\s+/g, ' ');
    return cleaned || null;
  }

  /**
   * Extract filename and size metadata from a HubCloud drive wrapper page.
   * @param {string} wrapperUrl
   * @returns {Promise<{rawFilename:string|null,cleanBaseTitle:string|null,fileSize:string|null}|null>}
   */
  async extractHubCloudDriveMetadata(wrapperUrl) {
    try {
      const response = await this.http.get(wrapperUrl, { timeout: 20000 });
      const textResponse = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
      const $ = load(textResponse);

      const rawFilename =
        this.normalizeWhitespace($('div.card-header').first().text()) ||
        this.normalizeWhitespace($('title').first().text()) ||
        null;

      const cleanBaseTitle = this.cleanSeriesHubCloudFilename(rawFilename);

      let fileSize = null;
      const sizeCandidates = [];

      $('li').each((_, elem) => {
        const rowText = this.normalizeWhitespace($(elem).text());
        if (!/file\s*size/i.test(rowText)) {
          return;
        }

        sizeCandidates.push(this.normalizeWhitespace($(elem).find('i').first().text()));
        sizeCandidates.push(rowText);
      });

      sizeCandidates.push(this.normalizeWhitespace($('li:contains("File Size") i').first().text()));
      sizeCandidates.push(this.normalizeWhitespace($('li:contains("File Size")').first().text()));

      $('i#size').each((_, elem) => {
        sizeCandidates.push(this.normalizeWhitespace($(elem).text()));
      });

      for (const candidate of sizeCandidates) {
        const parsed = this.extractFileSizeFromText(candidate);
        if (parsed) {
          fileSize = parsed;
          break;
        }
      }

      if (!fileSize) {
        const pageText = this.normalizeWhitespace($.root().text());
        const fallbackSizeMatch = pageText.match(/file\s*size[^0-9]*(\d+(?:\.\d+)?)\s*(TB|GB|MB)/i);
        if (fallbackSizeMatch) {
          fileSize = `${fallbackSizeMatch[1]} ${fallbackSizeMatch[2].toUpperCase()}`;
        }
      }

      const metadata = {
        rawFilename,
        cleanBaseTitle,
        fileSize: fileSize || null,
      };

      if (!metadata.rawFilename && !metadata.cleanBaseTitle && !metadata.fileSize) {
        return null;
      }

      return metadata;
    } catch (error) {
      console.error(`[MoviesDrive] Error extracting HubCloud metadata from ${wrapperUrl}:`, error.message);
      return null;
    }
  }

  /**
   * Parse season number from permalink slug.
   * Examples:
   * - /landman-season-1/ => 1
   * - /show-season_2/ => 2
   * - /show-s01/ => 1
   * @param {string} permalink
   * @returns {number|null}
   */
  getSeasonFromPermalink(permalink) {
    const normalized = String(permalink || '').toLowerCase();
    if (!normalized) {
      return null;
    }

    const patterns = [
      /(?:^|[\/_-])season(?:[\s/_-]|%20)*0*(\d+)(?=$|[\/_-])/i,
      /(?:^|[\/_-])s0*(\d{1,2})(?=$|[\/_-])/i,
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (!match?.[1]) {
        continue;
      }

      const value = parseInt(match[1], 10);
      if (!Number.isNaN(value) && value > 0) {
        return value;
      }
    }

    return null;
  }

  parseFileSizeToMB(fileSize) {
    const match = String(fileSize || '').match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB)/i);
    if (!match) {
      return 0;
    }

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    if (unit === 'TB') return value * 1024 * 1024;
    if (unit === 'GB') return value * 1024;
    return value;
  }

  formatEpisodeNumber(episode) {
    return String(Math.max(1, parseInt(episode, 10) || 1)).padStart(2, '0');
  }

  buildSeriesFallbackBaseTitle(documentTitle, season, episode) {
    const episodeTag = `S${String(season).padStart(2, '0')}E${this.formatEpisodeNumber(episode)}`;
    const normalizedTitle = this.normalizeWhitespace(documentTitle);

    if (!normalizedTitle) {
      return `Series.${episodeTag}`;
    }

    const strippedSeason = normalizedTitle
      .replace(/\bseason\s*\d+\b.*$/i, '')
      .replace(/\(\d{4}\)/g, '')
      .trim();
    const compact = strippedSeason.replace(/[^a-zA-Z0-9]+/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/g, '');

    return compact ? `${compact}.${episodeTag}` : `Series.${episodeTag}`;
  }

  extractPreferredSeriesBaseTitle(streamTitle) {
    const normalized = this.normalizeWhitespace(streamTitle);
    if (!normalized) {
      return null;
    }

    const hasEpisodeToken = /s\d+\s*e\d+|ep(?:isode)?\s*0*\d+/i.test(normalized);
    const hasVideoExt = /\.(mkv|mp4|avi|mov|m4v|webm)$/i.test(normalized);

    if (!hasEpisodeToken && !hasVideoExt) {
      return null;
    }

    const withoutExtension = normalized.replace(/\.(mkv|mp4|avi|mov|m4v|webm)$/i, '');
    return withoutExtension.trim();
  }

  /**
   * Parse series resolution blocks from sequential h5 nodes:
   * - h5 text: "Season X ... 480p ..."
   * - next h5 link: "... Single Episode"
   * @param {Function} $ - Cheerio instance
   * @param {number} season - Requested season number
   * @returns {Array<{seasonHeadingTitle:string,quality:number,mdriveArchiveUrl:string,perEpisodeSizeIfPresent:string|null}>}
   */
  parseSeriesSingleEpisodeBlocks($, season) {
    const blocks = [];
    const seen = new Set();
    const h5Nodes = $('h5').toArray();
    const seasonRegex = new RegExp(`\\bseason\\s*0*${season}\\b|\\bs0*${season}\\b`, 'i');

    for (let i = 0; i < h5Nodes.length; i++) {
      const current = $(h5Nodes[i]);
      if (current.find('a[href]').length > 0) {
        continue;
      }

      const headingText = this.normalizeWhitespace(current.text());
      if (!headingText || !seasonRegex.test(headingText)) {
        continue;
      }

      if (!/(?:\b\d{3,4}p\b|\b4k\b)/i.test(headingText)) {
        continue;
      }

      const quality = this.extractQualityFromText(headingText);
      if (!quality) {
        continue;
      }

      const nextNode = h5Nodes[i + 1] ? $(h5Nodes[i + 1]) : null;
      if (!nextNode || nextNode.find('a[href]').length === 0) {
        continue;
      }

      const anchor = nextNode.find('a[href]').first();
      const anchorText = this.normalizeWhitespace(anchor.text());
      const anchorTextLower = anchorText.toLowerCase();

      if (!anchorTextLower.includes('single episode') || anchorTextLower.includes('zip')) {
        continue;
      }

      let href = anchor.attr('href');
      if (!href) {
        continue;
      }

      try {
        if (!href.startsWith('http')) {
          href = new URL(href, this.apiUrl).href;
        }
      } catch {
        continue;
      }

      const key = `${quality}|${href}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      blocks.push({
        seasonHeadingTitle: headingText,
        quality,
        mdriveArchiveUrl: href,
        perEpisodeSizeIfPresent: this.extractFileSizeFromText(headingText),
      });
    }

    return blocks;
  }

  /**
   * Extract exact episode HubCloud wrapper from mdrive archive page.
   * @param {string} archiveUrl - mdrive archive URL containing all episodes
   * @param {number} episode - requested episode number
   * @returns {Promise<{hubcloudWrapperUrl:string,episodeLabel:string,episodeFileSize:string|null}|null>}
   */
  async extractEpisodeHubCloudFromArchive(archiveUrl, episode) {
    try {
      const response = await this.http.get(archiveUrl, { timeout: 20000 });
      const textResponse = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
      const $ = load(textResponse);
      const h5Nodes = $('h5').toArray();
      const episodeInt = Math.max(1, parseInt(episode, 10) || 1);
      const targetEpisodeRegex = new RegExp(
        `\\b(?:ep(?:isode)?\\s*0*${episodeInt}|e\\s*0*${episodeInt}|s\\d+e\\s*0*${episodeInt})\\b`,
        'i',
      );
      const anyEpisodeRegex = /\b(?:ep(?:isode)?\s*\d+|e\s*\d+|s\d+e\d+)\b/i;

      for (let i = 0; i < h5Nodes.length; i++) {
        const headingNode = $(h5Nodes[i]);
        if (headingNode.find('a[href]').length > 0) {
          continue;
        }

        const headingText = this.normalizeWhitespace(headingNode.text());
        if (!targetEpisodeRegex.test(headingText)) {
          continue;
        }

        const episodeFileSize = this.extractFileSizeFromText(headingText);

        for (let j = i + 1; j < h5Nodes.length; j++) {
          const sectionNode = $(h5Nodes[j]);
          const sectionText = this.normalizeWhitespace(sectionNode.text());

          if (sectionNode.find('a[href]').length === 0) {
            if (anyEpisodeRegex.test(sectionText)) {
              break;
            }
            continue;
          }

          const anchors = sectionNode.find('a[href]').toArray();
          for (const anchorElem of anchors) {
            let href = $(anchorElem).attr('href');
            if (!href) {
              continue;
            }

            try {
              if (!href.startsWith('http')) {
                href = new URL(href, archiveUrl).href;
              }
            } catch {
              continue;
            }

            const hrefLower = href.toLowerCase();
            if (hrefLower.includes('hubcloud') && hrefLower.includes('/drive/')) {
              return {
                hubcloudWrapperUrl: href,
                episodeLabel: headingText,
                episodeFileSize,
              };
            }
          }
        }

        // We found the requested episode heading but no HubCloud link nearby.
        return null;
      }

      return null;
    } catch (error) {
      console.error(`[MoviesDrive] Error getting episode wrapper from ${archiveUrl}:`, error.message);
      return null;
    }
  }

  /**
   * Search for content by IMDB ID and get document
   * @param {string} imdbId - IMDB ID (e.g., tt1234567)
   * @param {number} [season] - Season number (for series)
   * @returns {Promise<Object|null>} Search result with document
   */
  async searchAndGetDocument(imdbId, season) {
    try {
      await this.ensureApiUrl();

      // Search API
      const searchUrl = `${this.apiUrl}/searchapi.php?q=${imdbId}`;
      console.log(`[MoviesDrive] Searching at: ${searchUrl}`);
      
      const response = await this.http.get(searchUrl);
      const textResponse = typeof response.text === 'string' ? response.text : JSON.stringify(response.text);
      const searchData = JSON.parse(textResponse);

      if (!searchData.hits || searchData.hits.length === 0) {
        console.log(`[MoviesDrive] No results found for ${imdbId}`);
        return null;
      }

      // Find the best matching document.
      let document = null;
      const hits = Array.isArray(searchData.hits) ? searchData.hits : [];
      const exactImdbHits = hits.filter(hit => hit?.document?.imdb_id === imdbId);
      const candidateHits = exactImdbHits.length > 0 ? exactImdbHits : hits;

      if (season) {
        const requestedSeason = Math.max(1, parseInt(season, 10) || 1);
        console.log(`[MoviesDrive] Looking for season ${requestedSeason} in ${candidateHits.length} candidate result(s)`);

        candidateHits.forEach((hit, index) => {
          const permalink = hit?.document?.permalink || '';
          const parsedSeason = this.getSeasonFromPermalink(permalink);
          console.log(
            `[MoviesDrive] Candidate ${index + 1}/${candidateHits.length}: permalink=${permalink || '[none]'} parsedSeason=${
              parsedSeason ?? 'n/a'
            }`,
          );
        });

        const titlePattern = new RegExp(`\\bSeason\\s*0*${requestedSeason}\\b|\\bS\\s*0*${requestedSeason}\\b`, 'i');

        const seasonPermalinkHit = candidateHits.find(hit => {
          const permalink = hit?.document?.permalink || '';
          const parsedSeason = this.getSeasonFromPermalink(permalink);
          return parsedSeason === requestedSeason;
        });

        if (seasonPermalinkHit?.document) {
          document = seasonPermalinkHit.document;
          console.log(`[MoviesDrive] Selected tier=permalink-season-match: ${document.permalink}`);
        } else {
          const seasonTitleHit = candidateHits.find(hit => {
            const title = hit?.document?.post_title || hit?.document?.title || '';
            return titlePattern.test(title);
          });

          if (seasonTitleHit?.document) {
            document = seasonTitleHit.document;
            console.log(`[MoviesDrive] Selected tier=title-season-match: ${document.permalink}`);
          } else if (candidateHits[0]?.document) {
            document = candidateHits[0].document;
            console.log(`[MoviesDrive] Selected tier=first-exact-imdb-hit: ${document.permalink}`);
          } else if (hits[0]?.document) {
            document = hits[0].document;
            console.log(`[MoviesDrive] Selected tier=first-overall-hit: ${document.permalink}`);
          }
        }
      } else {
        // For movies, prefer exact IMDB match before fallback.
        if (candidateHits[0]?.document && exactImdbHits.length > 0) {
          document = candidateHits[0].document;
          console.log(`[MoviesDrive] Found exact movie match for ${imdbId}`);
        } else if (hits[0]?.document) {
          document = hits[0].document;
          console.log(`[MoviesDrive] No exact movie match for ${imdbId}, using first result`);
        }
      }

      if (!document?.permalink) {
        console.log(`[MoviesDrive] No document/permalink selected for ${imdbId}`);
        return null;
      }

      // Fetch the content page
      const contentUrl = `${this.apiUrl}${document.permalink}`;
      console.log(`[MoviesDrive] Fetching content page: ${contentUrl}`);
      
      const contentResponse = await this.http.get(contentUrl);
      const contentText = typeof contentResponse.text === 'string' ? contentResponse.text : JSON.stringify(contentResponse.text);
      const $ = load(contentText);

      const result = {
        document,
        html: contentText,
        $: $,
      };
      
      return result;
    } catch (error) {
      console.error(`[MoviesDrive] Error searching for ${imdbId}:`, error.message);
      return null;
    }
  }

  /**
   * Extract movie streams
   * @param {string} imdbId - IMDB ID
   * @param {string} _title - Movie title (unused for movie-page h5 title mode)
   * @returns {Promise<Array<Object>>} Array of streams
   */
  async extractMovieStreams(imdbId, _title) {
    console.log(`[MoviesDrive] Getting streams for movie ${imdbId}`);
    
    const result = await this.searchAndGetDocument(imdbId);
    if (!result) return [];

    const { $ } = result;
    const allStreams = [];

    const resolutionBlocks = this.parseMovieDownloadBlocks($, imdbId);
    console.log(`[MoviesDrive] Found ${resolutionBlocks.length} movie resolution block(s) for ${imdbId}`);

    // Process all quality blocks in parallel for speed
    const blockPromises = resolutionBlocks.map(async (block) => {
      try {
        console.log(`[MoviesDrive] Processing ${block.parsedQuality}p block: ${block.titleFromH5}`);
        console.log(`[MoviesDrive] Archive page: ${block.mdrivePageUrl}`);

        const hubcloudWrapper = await this.extractHubCloudWrapperFromMdrive(block.mdrivePageUrl);
        if (!hubcloudWrapper) {
          console.log(`[MoviesDrive] No HubCloud wrapper found for ${block.mdrivePageUrl}, skipping (strict mode)`);
          return [];
        }

        console.log(`[MoviesDrive] HubCloud wrapper: ${hubcloudWrapper}`);
        const extractedStreams = await this.extractors.extractFromUrl(hubcloudWrapper, block.titleFromH5);

        if (!extractedStreams.length) {
          console.log(`[MoviesDrive] No final streams resolved from wrapper ${hubcloudWrapper}`);
          return [];
        }

        const blockStreams = [];
        for (const stream of extractedStreams) {
          const normalizedSource = this.normalizeMovieSource(stream);
          if (!normalizedSource) {
            continue;
          }

          const finalUrl = stream?.url;
          if (!finalUrl || !String(finalUrl).startsWith('http')) {
            continue;
          }

          const fileSize =
            stream?.fileSize ||
            this.extractFileSizeFromText(stream?.title) ||
            this.extractFileSizeFromText(block.titleFromH5) ||
            null;

          // Format resolution for AIOStreams (480p, 720p, 1080p, 2160p)
          const resolutionTag = block.parsedQuality === 2160 ? '2160p' :
                                block.parsedQuality === 1080 ? '1080p' :
                                block.parsedQuality === 720 ? '720p' :
                                block.parsedQuality === 480 ? '480p' : `${block.parsedQuality}p`;

          // Extract quality info from title (WEB-DL, BluRay, etc.)
          const titleLower = block.titleFromH5.toLowerCase();
          let qualityTag = 'WEB-DL'; // Default
          if (titleLower.includes('bluray') || titleLower.includes('blu-ray')) {
            qualityTag = titleLower.includes('remux') ? 'BluRay REMUX' : 'BluRay';
          } else if (titleLower.includes('webrip')) {
            qualityTag = 'WEBRip';
          } else if (titleLower.includes('hdtv')) {
            qualityTag = 'HDTV';
          } else if (titleLower.includes('hdrip')) {
            qualityTag = 'HDRip';
          }

          // Extract codec/encode info
          let encodeTag = '';
          if (titleLower.includes('hevc') || titleLower.includes('x265') || titleLower.includes('h265')) {
            encodeTag = 'HEVC';
          } else if (titleLower.includes('x264') || titleLower.includes('h264') || titleLower.includes('avc')) {
            encodeTag = 'AVC';
          } else if (titleLower.includes('av1')) {
            encodeTag = 'AV1';
          }

          // Extract visual tags
          let visualTag = '';
          if (titleLower.includes('hdr10+')) {
            visualTag = 'HDR10+';
          } else if (titleLower.includes('hdr10')) {
            visualTag = 'HDR10';
          } else if (titleLower.includes('dolby vision') || titleLower.includes('dv')) {
            visualTag = 'DV';
          } else if (titleLower.includes('hdr')) {
            visualTag = 'HDR';
          }

          // Build AIOStreams-compatible title
          // Format: [Quality] [Resolution] [Encode] [Visual] Release Name [Source]
          const titleParts = [];
          if (qualityTag) titleParts.push(qualityTag);
          if (resolutionTag) titleParts.push(resolutionTag);
          if (encodeTag) titleParts.push(encodeTag);
          if (visualTag) titleParts.push(visualTag);
          titleParts.push(block.titleFromH5);
          if (normalizedSource) titleParts.push(`[${normalizedSource}]`);
          if (fileSize) titleParts.push(`[${fileSize}]`);

          const aioTitle = titleParts.join(' ');

          blockStreams.push({
            ...stream,
            url: finalUrl,
            quality: block.parsedQuality,
            source: normalizedSource,
            title: aioTitle,
            name: aioTitle, // AIOStreams uses 'name' field
            fileSize,
            _sizeMb: this.parseFileSizeToMB(fileSize),
          });
        }
        return blockStreams;
      } catch (error) {
        console.error(`[MoviesDrive] Error processing movie block ${block.mdrivePageUrl}:`, error.message);
        return [];
      }
    });

    // Wait for all quality blocks to complete (in parallel)
    const allBlockResults = await Promise.all(blockPromises);
    
    // Flatten results from all blocks
    for (const blockStreams of allBlockResults) {
      allStreams.push(...blockStreams);
    }

    // Sort by quality desc, then file size desc, then source preference, then URL.
    const sourcePriority = { FSL: 2, Pixel: 1 };
    allStreams.sort((a, b) => {
      if (b.quality !== a.quality) {
        return b.quality - a.quality;
      }

      const sizeDiff = (b._sizeMb || 0) - (a._sizeMb || 0);
      if (sizeDiff !== 0) {
        return sizeDiff;
      }

      const sourceDiff = (sourcePriority[b.source] || 0) - (sourcePriority[a.source] || 0);
      if (sourceDiff !== 0) {
        return sourceDiff;
      }

      return String(a.url || '').localeCompare(String(b.url || ''));
    });

    const uniqueStreams = [];
    const seenUrls = new Set();

    for (const stream of allStreams) {
      if (!seenUrls.has(stream.url)) {
        seenUrls.add(stream.url);
        const { _sizeMb, ...cleanStream } = stream;
        uniqueStreams.push(cleanStream);
      }
    }

    console.log(`[MoviesDrive] Total streams: ${uniqueStreams.length}`);
    return uniqueStreams;
  }

  /**
   * Extract series streams
   * @param {string} imdbId - IMDB ID
   * @param {number} season - Season number
   * @param {number} episode - Episode number
   * @returns {Promise<Array<Object>>} Array of streams
   */
  async extractSeriesStreams(imdbId, season, episode) {
    console.log(`[MoviesDrive] Getting streams for series ${imdbId} S${season}E${episode}`);
    const result = await this.searchAndGetDocument(imdbId, season);
    if (!result) return [];

    const { $, document } = result;
    const allStreams = [];

    const seriesBlocks = this.parseSeriesSingleEpisodeBlocks($, season);
    console.log(`[MoviesDrive] Found ${seriesBlocks.length} series resolution block(s) for S${season}`);

    for (const block of seriesBlocks) {
        console.log(`[MoviesDrive] Processing ${block.quality}p archive: ${block.mdriveArchiveUrl}`);
        const episodeData = await this.extractEpisodeHubCloudFromArchive(block.mdriveArchiveUrl, episode);

        if (!episodeData?.hubcloudWrapperUrl) {
          console.log(`[MoviesDrive] No HubCloud episode wrapper found for ${block.mdriveArchiveUrl}, skipping (strict mode)`);
          continue;
        }

        const wrapperMeta = await this.extractHubCloudDriveMetadata(episodeData.hubcloudWrapperUrl);
        const fallbackBaseTitle = this.buildSeriesFallbackBaseTitle(
          document?.post_title || document?.title,
          season,
          episode,
        );
        const inheritedFileSize = episodeData.episodeFileSize || block.perEpisodeSizeIfPresent || null;
        const extractedStreams = await this.extractors.extractFromUrl(
          episodeData.hubcloudWrapperUrl,
          fallbackBaseTitle,
          inheritedFileSize,
        );

        if (!extractedStreams.length) {
          console.log(`[MoviesDrive] No final streams resolved from wrapper ${episodeData.hubcloudWrapperUrl}`);
          continue;
        }

        for (const stream of extractedStreams) {
          const normalizedSource = this.normalizeSeriesSource(stream);
          if (!normalizedSource) {
            continue;
          }

          const finalUrl = String(stream?.url || '').trim();
          if (!finalUrl.startsWith('http')) {
            continue;
          }

          // Strict series mode: only final stream targets, never wrappers/intermediate hosts.
          const finalLower = finalUrl.toLowerCase();
          if (
            finalLower.includes('mdrive.lol') ||
            finalLower.includes('hubcloud') ||
            finalLower.includes('gamerxyt') ||
            finalLower.includes('carnewz') ||
            finalLower.includes('cryptoinsights')
          ) {
            continue;
          }

          const streamDerivedBaseTitle = this.cleanSeriesHubCloudFilename(
            this.extractPreferredSeriesBaseTitle(stream?.title),
          );
          const preferredBaseTitle =
            wrapperMeta?.cleanBaseTitle ||
            streamDerivedBaseTitle ||
            fallbackBaseTitle;
          const fileSize =
            wrapperMeta?.fileSize ||
            stream?.fileSize ||
            this.extractFileSizeFromText(stream?.title) ||
            inheritedFileSize;

          // Format resolution for AIOStreams
          const qualityInt = parseInt(block.quality, 10) || 1080;
          const resolutionTag = qualityInt === 2160 ? '2160p' :
                                qualityInt === 1080 ? '1080p' :
                                qualityInt === 720 ? '720p' :
                                qualityInt === 480 ? '480p' : `${qualityInt}p`;

          // Extract quality info from title
          const titleLower = preferredBaseTitle.toLowerCase();
          let qualityTag = 'WEB-DL';
          if (titleLower.includes('bluray') || titleLower.includes('blu-ray')) {
            qualityTag = titleLower.includes('remux') ? 'BluRay REMUX' : 'BluRay';
          } else if (titleLower.includes('webrip')) {
            qualityTag = 'WEBRip';
          } else if (titleLower.includes('hdtv')) {
            qualityTag = 'HDTV';
          } else if (titleLower.includes('hdrip')) {
            qualityTag = 'HDRip';
          }

          // Extract codec
          let encodeTag = '';
          if (titleLower.includes('hevc') || titleLower.includes('x265') || titleLower.includes('h265')) {
            encodeTag = 'HEVC';
          } else if (titleLower.includes('x264') || titleLower.includes('h264') || titleLower.includes('avc')) {
            encodeTag = 'AVC';
          } else if (titleLower.includes('av1')) {
            encodeTag = 'AV1';
          }

          // Extract visual tags
          let visualTag = '';
          if (titleLower.includes('hdr10+')) {
            visualTag = 'HDR10+';
          } else if (titleLower.includes('hdr10')) {
            visualTag = 'HDR10';
          } else if (titleLower.includes('dolby vision') || titleLower.includes('dv')) {
            visualTag = 'DV';
          } else if (titleLower.includes('hdr')) {
            visualTag = 'HDR';
          }

          // Build AIOStreams-compatible title
          const titleParts = [];
          if (qualityTag) titleParts.push(qualityTag);
          if (resolutionTag) titleParts.push(resolutionTag);
          if (encodeTag) titleParts.push(encodeTag);
          if (visualTag) titleParts.push(visualTag);
          titleParts.push(preferredBaseTitle);
          if (normalizedSource) titleParts.push(`[${normalizedSource}]`);
          if (fileSize) titleParts.push(`[${fileSize}]`);

          const aioTitle = titleParts.join(' ');

          allStreams.push({
            ...stream,
            url: finalUrl,
            quality: block.quality,
            source: normalizedSource,
            fileSize: fileSize || null,
            title: aioTitle,
            name: aioTitle, // AIOStreams uses 'name' field
            _sizeMb: this.parseFileSizeToMB(fileSize),
          });
        }
      }

    // Highest resolution first, then larger file size, then FSL before Pixel.
    const serverPriority = { FSL: 2, Pixel: 1 };
    allStreams.sort((a, b) => {
      if (b.quality !== a.quality) {
        return b.quality - a.quality;
      }

      const sizeDiff = (b._sizeMb || 0) - (a._sizeMb || 0);
      if (sizeDiff !== 0) {
        return sizeDiff;
      }

      return (serverPriority[b.source] || 0) - (serverPriority[a.source] || 0);
    });

    const uniqueStreams = [];
    const seenUrls = new Set();

    for (const stream of allStreams) {
      if (seenUrls.has(stream.url)) {
        continue;
      }

      seenUrls.add(stream.url);
      const { _sizeMb, ...cleanStream } = stream;
      uniqueStreams.push(cleanStream);
    }

    console.log(`[MoviesDrive] Total streams: ${uniqueStreams.length}`);
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
}

export default MoviesDriveScraper;
