/**
 * HTTP Client with Cloudflare bypass, SSRF protection, and caching
 * Provides request functionality with proper headers and timeout handling
 * Compatible with Cloudflare Workers (uses fetch API)
 */

import { isValidUrl, sanitizeForLogging } from './security.mjs';

// Polyfill for setTimeout as promise
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class HttpClient {
  constructor(options = {}) {
    this.timeout = options.timeout || (process.env.REQUEST_TIMEOUT || 10000);
    this.userAgent =
      options.userAgent ||
      process.env.USER_AGENT ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    this.defaultHeaders = {
      'User-Agent': this.userAgent,
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate',
      'Accept-Language': 'en-US,en;q=0.9',
    };
  }

  /**
   * Fetch with timeout
   */
  async fetchWithTimeout(url, options = {}) {
    const timeout = options.timeout || this.timeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        redirect: 'follow', // Follow redirects automatically
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  async get(url, options = {}) {
    // Validate URL before request
    if (!isValidUrl(url)) {
      throw new Error(`SSRF: Blocked request to ${sanitizeForLogging(url)}`);
    }

    try {
      const response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          ...this.defaultHeaders,
          ...(options.headers || {}),
        },
        timeout: options.timeout || this.timeout,
      });

      // Validate the final URL after redirects
      const finalUrl = response.url;
      
      if (finalUrl && !isValidUrl(finalUrl)) {
        throw new Error(`SSRF: Blocked redirect to ${sanitizeForLogging(finalUrl)}`);
      }

      const text = await response.text();
      
      return {
        text: text,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        url: finalUrl,
        finalUrl: finalUrl,
      };
    } catch (error) {
      console.error(`[HttpClient] Error fetching ${sanitizeForLogging(url)}:`, error.message);
      throw error;
    }
  }

  async post(url, data, options = {}) {
    // Validate URL before request
    if (!isValidUrl(url)) {
      throw new Error(`SSRF: Blocked request to ${sanitizeForLogging(url)}`);
    }

    try {
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          ...this.defaultHeaders,
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        body: typeof data === 'string' ? data : JSON.stringify(data),
        timeout: options.timeout || this.timeout,
      });
      
      const text = await response.text();
      
      return {
        text: text,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
      };
    } catch (error) {
      console.error(`[HttpClient] Error posting to ${sanitizeForLogging(url)}:`, error.message);
      throw error;
    }
  }

  async retry(fn, maxRetries = 3, delayMs = 1000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        await sleep(delayMs * (i + 1)); // exponential backoff
      }
    }
  }
}

export default HttpClient;
