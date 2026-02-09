/**
 * Cache Module
 * Implements a simple in-memory caching layer with TTL support
 * Based on the MOVIESDRIVE_STREMIO_ADDON.md caching strategy
 */

class CacheManager {
  constructor(options = {}) {
    this.cache = new Map();
    this.ttl = options.ttl || 7200000; // 2 hours default (7200 seconds)
    this.maxSize = options.maxSize || 1000; // Max entries
    this.cleanupInterval = options.cleanupInterval || 600000; // 10 minutes

    
    // Periodic cleanup of expired entries
    this.cleanup();
  }

  /**
   * Get cached value
   * @param {string} key - Cache key
   * @returns {*} Cached value or null if expired/missing
   */
  get(key) {
    if (!this.cache.has(key)) {
      return null;
    }

    const entry = this.cache.get(key);
    
    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Set cache value
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttl - Optional TTL override in milliseconds
   */
  set(key, value, ttl = null) {
    // Evict old entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.ttl,
    });
  }

  /**
   * Check if key exists and is not expired
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and is valid
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Clear specific cache entry
   * @param {string} key - Cache key
   */
  clear(key) {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clearAll() {
    this.cache.clear();
  }

  /**
   * Get cache size
   * @returns {number} Number of cached entries
   */
  size() {
    return this.cache.size;
  }

  /**
   * Periodic cleanup of expired entries
   */
  cleanup() {
    setInterval(() => {
      let cleaned = 0;
      for (const [key, entry] of this.cache.entries()) {
        if (Date.now() - entry.timestamp > entry.ttl) {
          this.cache.delete(key);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        console.debug(`[Cache] Cleaned up ${cleaned} expired entries`);
      }
    }, this.cleanupInterval);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  stats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      utilization: `${((this.cache.size / this.maxSize) * 100).toFixed(2)}%`,
    };
  }
}

export default CacheManager;
