/**
 * Stremio Addon Handler Functions
 * Implements the Stremio addon protocol handlers
 */

import MoviesDriveScraper from '../scrapers/moviesdrive.js';

const scraper = new MoviesDriveScraper();

/**
 * Format stream title with metadata
 * @param {Object} stream - Stream object with metadata
 * @returns {string} Formatted title string
 */
function formatStreamTitle(stream) {
  const metadata = stream.metadata || {};
  
  // Build title parts
  const parts = [];
  
  // Add movie title and year
  if (metadata.title) {
    let titlePart = metadata.title;
    if (metadata.year) {
      titlePart += ` (${metadata.year})`;
    }
    parts.push(titlePart);
  }
  
  // Add type (WEB-DL, BluRay, etc.)
  if (metadata.type) {
    parts.push(metadata.type);
  }
  
  // Add language in brackets
  if (metadata.language) {
    parts.push(`[${metadata.language}]`);
  }
  
  // Add quality
  if (metadata.quality) {
    parts.push(metadata.quality);
  }
  
  // Add codec if available
  if (metadata.codec) {
    parts.push(metadata.codec);
  }
  
  // Add file size in brackets
  if (metadata.size) {
    parts.push(`[${metadata.size}]`);
  }
  
  // Add server name in brackets
  const serverName = metadata.server || stream.source || 'Unknown';
  parts.push(`[${serverName.toUpperCase()}]`);
  
  // Join all parts with spaces
  return parts.join(' ');
}

/**
 * Handler for stream requests
 * Returns available streams for a given item
 */
async function streamHandler(args) {
  const { type, id, extra = {} } = args;

  try {
    // Parse season and episode from id if it's a series
    let season = 1;
    let episode = 1;

    if (extra.season !== undefined) {
      season = parseInt(extra.season);
    }
    if (extra.episode !== undefined) {
      episode = parseInt(extra.episode);
    }

    const item = {
      type,
      id,
      name: extra.name || 'Unknown',
    };

    const streams = await scraper.getStreams(item, season, episode);

    if (streams.length === 0) {
      return {
        streams: [],
      };
    }

    // Convert scraper streams to Stremio format
    // Sort by quality (highest first) - already sorted by scraper
    const formattedStreams = streams.map((stream, index) => {
      const title = formatStreamTitle(stream);
      console.log(`[Stream ${index + 1}] ${title}`);
      console.log(`  URL: ${stream.url}`);
      
      // Determine quality for Stremio
      const qualityValue = stream.metadata?.quality 
        ? parseInt(stream.metadata.quality) 
        : stream.quality;
      
      return {
        url: stream.url,
        title: title,
        quality: `${qualityValue}p`,
        sources: ['MoviesDrive'],
        externalUrl: stream.url,
        subtitles: [],
        behaviorHints: {
          bingeGroup: 'moviesdrive',
          notWebReady: false,
        },
      };
    });

    return {
      streams: formattedStreams,
    };
  } catch (error) {
    console.error('Error in streamHandler:', error);
    return {
      streams: [],
      error: error.message,
    };
  }
}

/**
 * Handler for catalog requests (meta search)
 */
async function metaHandler(args) {
  const { type, id } = args;

  // This would typically fetch from a metadata provider
  // For now, returning basic structure
  return {
    meta: {
      id,
      type,
      name: 'Unknown Title',
      poster: '',
      description: 'Metadata not available',
    },
  };
}

/**
 * Handler for catalog searches
 */
async function catalogHandler(args) {
  const { type, id, extra = {} } = args;

  try {
    const { search } = extra;

    // If no search query, return empty
    if (!search) {
      return {
        metas: [],
      };
    }

    // TODO: Implement search with TMDB or similar
    // For now, returning empty catalog
    console.log(`[Catalog] Search requested: ${search} (type: ${type})`);

    return {
      metas: [],
    };
  } catch (error) {
    console.error('Error in catalogHandler:', error);
    return {
      metas: [],
    };
  }
}

/**
 * Handler for subtitles requests
 */
async function subtitlesHandler(args) {
  const { type, id, extra = {} } = args;

  try {
    // Only support subtitles for movies and series with IMDB IDs
    if (!id || !id.startsWith('tt')) {
      return {
        subtitles: [],
      };
    }

    const subtitles = await scraper.getSubtitles(id);

    return {
      subtitles: subtitles.map(sub => ({
        id: sub.id || `${id}-sub`,
        lang: sub.lang || 'English',
        url: sub.url,
        format: sub.format || 'vtt',
      })),
    };
  } catch (error) {
    console.error('Error in subtitlesHandler:', error);
    return {
      subtitles: [],
    };
  }
}

/**
 * Handler for manifest requests
 */
function manifestHandler() {
  return {
    id: 'com.moviesdrive.stremio',
    version: '1.0.0',
    name: 'MoviesDrive',
    description:
      'Stream movies and TV shows from MoviesDrive provider with multiple quality options',
    types: ['movie', 'series'],
    catalogs: [
      {
        type: 'movie',
        id: 'moviesdrive.movies',
        name: 'MoviesDrive Movies',
        extra: [
          {
            name: 'search',
            isRequired: false,
          },
        ],
      },
      {
        type: 'series',
        id: 'moviesdrive.series',
        name: 'MoviesDrive Series',
        extra: [
          {
            name: 'search',
            isRequired: false,
          },
        ],
      },
    ],
    resources: [
      {
        name: 'stream',
        types: ['movie', 'series'],
        idPrefixes: ['tt'],
      },
      {
        name: 'meta',
        types: ['movie', 'series'],
        idPrefixes: ['tt'],
      },
      {
        name: 'catalog',
        types: ['movie', 'series'],
        idPrefixes: ['moviesdrive'],
      },
      {
        name: 'subtitles',
        types: ['movie', 'series'],
        idPrefixes: ['tt'],
      },
    ],
    icon:
      'https://raw.githubusercontent.com/SaurabhKaperwan/Utils/main/moviesdrive-icon.png',
    contactEmail: 'support@moviesdrive.addon',
  };
}

export { streamHandler, metaHandler, catalogHandler, subtitlesHandler, manifestHandler, formatStreamTitle };
