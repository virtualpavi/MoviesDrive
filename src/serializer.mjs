/**
 * Data Serializer Module
 * Transforms internal data to Stremio protocol format
 */

/**
 * Serialize streams to Stremio format
 * @param {Array<Object>} streams - Internal stream objects
 * @param {string} imdbId - IMDB ID
 * @returns {Object} Stremio stream response
 */
export function serializeStreams(streams, imdbId) {
  if (!streams || streams.length === 0) {
    return { streams: [] };
  }

  const serializedStreams = streams.map((stream, index) => {
    // Build title with quality, source, and file size
    // Format: "1080p x264 [2.5 GB] [FSL-SERVER]"
    let title = stream.title || '';
    
    // Extract quality from title if present, otherwise use stream.quality
    const titleQualityMatch = title.match(/(\d{3,4})p/);
    const quality = titleQualityMatch ? parseInt(titleQualityMatch[1]) : (stream.quality || 720);
    
    // If title is empty or just quality info, build a proper title
    if (!title || title.trim() === '') {
      title = `${quality}p`;
    }
    
    // Add file size if available and not already in title
    if (stream.fileSize && !title.includes(stream.fileSize)) {
      title = `${title} [${stream.fileSize}]`;
    }
    
    // Add source if available and not already in title
    if (stream.source && !title.includes(stream.source)) {
      title = `${title} [${stream.source}]`;
    }

    return {
      url: stream.url,
      title: title,
      name: stream.name || title, // AIOStreams uses 'name' field for parsing
      quality: `${quality}p`,
      fileSize: stream.fileSize || null, // AIOStreams needs this
      source: stream.source || null, // AIOStreams needs this
      sources: ['MoviesDrive'],
      externalUrl: stream.url,
      subtitles: [],
      behaviorHints: {
        bingeGroup: 'moviesdrive',
        notWebReady: true, // These are direct file downloads, not web-ready streams
      },
    };
  });

  return {
    streams: serializedStreams,
  };
}

/**
 * Parse season and episode from query parameters
 * @param {Object} query - Query parameters
 * @param {Object} [defaults] - Optional defaults (route tuple takes precedence)
 * @returns {Object} Season and episode numbers
 */
export function parseSeasonEpisode(query, defaults = {}) {
  const parsePositiveInt = (value) => {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) || parsed < 1 ? null : parsed;
  };

  const season =
    parsePositiveInt(defaults?.season) ??
    parsePositiveInt(query?.season) ??
    1;
  const episode =
    parsePositiveInt(defaults?.episode) ??
    parsePositiveInt(query?.episode) ??
    1;

  return {
    season,
    episode,
  };
}

/**
 * Parse series route ID in these forms:
 * - tt1234567
 * - tt1234567:1
 * - tt1234567:1:2
 * @param {string} id - Raw route ID
 * @returns {{imdbId: string|null, season: number|null, episode: number|null}}
 */
export function parseSeriesRouteId(id) {
  if (!id) {
    return { imdbId: null, season: null, episode: null };
  }

  const raw = String(id).trim();
  const match = raw.match(/^(tt\d+)(?::(\d+))?(?::(\d+))?$/i);

  if (!match) {
    return {
      imdbId: normalizeImdbId(raw),
      season: null,
      episode: null,
    };
  }

  const imdbId = `tt${match[1].slice(2)}`;
  const season = match[2] ? Math.max(1, parseInt(match[2], 10)) : null;
  const episode = match[3] ? Math.max(1, parseInt(match[3], 10)) : null;

  return { imdbId, season, episode };
}

/**
 * Normalize IMDB ID
 * @param {string} id - Raw ID
 * @returns {string|null} Normalized IMDB ID or null
 */
export function normalizeImdbId(id) {
  if (!id) return null;

  // Remove any prefix and extract tt followed by digits
  const match = id.match(/tt(\d+)/);
  if (match) {
    return `tt${match[1]}`;
  }

  return null;
}

/**
 * Serialize catalog response
 * @param {Array<Object>} items - Catalog items
 * @returns {Object} Stremio catalog response
 */
export function serializeCatalog(items) {
  return {
    metas: items.map(item => ({
      id: item.imdb_id,
      type: item.type,
      name: item.title,
      poster: item.poster,
      background: item.background,
      logo: item.logo,
      description: item.description,
      releaseInfo: item.year,
      runtime: item.runtime,
      language: item.language,
      country: item.country,
      genres: item.genres,
    })),
  };
}

/**
 * Serialize meta response
 * @param {Object} item - Meta item
 * @returns {Object} Stremio meta response
 */
export function serializeMeta(item) {
  return {
    meta: {
      id: item.imdb_id,
      type: item.type,
      name: item.title,
      poster: item.poster,
      background: item.background,
      logo: item.logo,
      description: item.description,
      releaseInfo: item.year,
      runtime: item.runtime,
      language: item.language,
      country: item.country,
      genres: item.genres,
      videos: item.videos || [],
    },
  };
}
