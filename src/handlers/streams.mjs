/**
 * Stream Handler Module
 * Handles Stremio stream requests
 */

import MoviesDriveScraper from '../scrapers/moviesdrive.mjs';
import {
  serializeStreams,
  parseSeasonEpisode,
  normalizeImdbId,
  parseSeriesRouteId,
} from '../serializer.mjs';
import { isValidEpisodeNumber } from '../security.mjs';

class StreamHandler {
  constructor() {
    this.scraper = new MoviesDriveScraper();
  }

  /**
   * Handle stream request
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handle(req, res) {
    try {
      const { type, id } = req.params;

      const seriesRouteData = type === 'series' ? parseSeriesRouteId(id) : null;
      const imdbId = seriesRouteData?.imdbId || normalizeImdbId(id);

      // Validate IMDB ID
      if (!imdbId) {
        console.warn(`[StreamHandler] Invalid IMDB ID: ${id}`);
        return res.status(400).json({ 
          error: 'Invalid IMDB ID',
          streams: [] 
        });
      }

      // Validate type
      if (!['movie', 'series'].includes(type)) {
        return res.status(400).json({ 
          error: 'Invalid type',
          streams: [] 
        });
      }

      console.log(`[StreamHandler] Request: ${type} ${imdbId}`);

      let streams = [];

      if (type === 'movie') {
        // Pass the title if available from meta
        const title = req.query?.title || null;
        streams = await this.scraper.extractMovieStreams(imdbId, title);
      } else if (type === 'series') {
        const { season, episode } = parseSeasonEpisode(req.query, {
          season: seriesRouteData?.season,
          episode: seriesRouteData?.episode,
        });
        
        if (!isValidEpisodeNumber(season) || !isValidEpisodeNumber(episode)) {
          return res.status(400).json({ 
            error: 'Invalid season or episode',
            streams: [] 
          });
        }

        console.log(`[StreamHandler] Series: S${season}E${episode}`);
        
        streams = await this.scraper.extractSeriesStreams(imdbId, season, episode);
      }

      // Log final streams
      if (streams.length > 0) {
        console.log(`[StreamHandler] ✓ Found ${streams.length} stream(s):`);
        streams.forEach((stream, i) => {
          const qualityLabel = stream.quality >= 1080 ? 'Full HD' : 
                              stream.quality >= 720 ? 'HD' : 'SD';
          console.log(`  [${i + 1}] ${stream.source} • ${qualityLabel} • ${stream.quality}p`);
          console.log(`      URL: ${stream.url.substring(0, 80)}...`);
        });
      } else {
        console.log(`[StreamHandler] ✗ No streams found`);
      }

      // Serialize and return
      const response = serializeStreams(streams, imdbId);
      
      // Set cache headers
      res.setHeader('Cache-Control', 'public, max-age=300');
      
      res.json(response);
    } catch (error) {
      console.error('[StreamHandler] Error:', error.message);
      res.status(500).json({ 
        error: 'Internal server error',
        streams: [] 
      });
    }
  }
}

export default StreamHandler;
