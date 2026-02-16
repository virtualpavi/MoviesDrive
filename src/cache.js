/**
 * Cache Manager Module
 * Provides in-memory caching with TTL and LRU cleanup
 */

class CacheManager {
  constructor(options = {}) {
    this.ttl = options.ttl || 3600000; // Default 1 hour in ms
    this.maxSize = options.maxSize || 500;
    this.cache = new Map();
  }

  /**
   * Get item from cache
   * @param {string} key - Cache key
   * @returns {any|null} Cached value or null if expired/not found
   */
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    // Check if expired
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * Set item in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} customTtl - Optional custom TTL in ms
   */
  set(key, value, customTtl) {
    // Enforce max size with LRU eviction
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      // Delete oldest entry (first in Map)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    const ttl = customTtl || this.ttl;
    
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl,
    });
  }

  /**
   * Delete item from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clearAll() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  stats() {
    let expired = 0;
    const now = Date.now();

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        expired++;
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      expired,
      ttl: this.ttl,
    };
  }

  /**
   * Clean up expired entries
   * @returns {number} Number of entries removed
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }
}

export default CacheManager;
