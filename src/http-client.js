/**
 * HTTP Client with Cloudflare bypass, SSRF protection, and caching
 * Provides request functionality with proper headers and timeout handling
 */

import axios from 'axios';
import { setTimeout } from 'timers/promises';
import { isValidUrl, sanitizeForLogging } from './security.js';

class HttpClient {
  constructor(options = {}) {
    this.timeout = options.timeout || (process.env.REQUEST_TIMEOUT || 10000);
    this.userAgent =
      options.userAgent ||
      process.env.USER_AGENT ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    this.client = axios.create({
      timeout: this.timeout,
      headers: {
        'User-Agent': this.userAgent,
        Accept: '*/*',
        'Accept-Encoding': 'gzip, deflate',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      maxRedirects: 10, // Allow following redirects
      validateStatus: () => true, // Don't throw on any status
    });

    // Add request interceptor for SSRF protection
    this.client.interceptors.request.use(
      (config) => {
        // Validate URL before making request
        if (!isValidUrl(config.url)) {
          throw new Error(`SSRF: Blocked request to ${sanitizeForLogging(config.url)}`);
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling and SSRF protection
    this.client.interceptors.response.use(
      (response) => {
        // Validate the final URL after redirects
        const finalUrl = response.request?.res?.responseUrl || 
                        response.config?.url || 
                        response.request?.path;
        
        if (finalUrl && !isValidUrl(finalUrl)) {
          throw new Error(`SSRF: Blocked redirect to ${sanitizeForLogging(finalUrl)}`);
        }
        
        return response;
      },
      (error) => {
        if (error.response?.status === 403) {
          console.error('[HttpClient] Cloudflare protection detected');
        }
        return Promise.reject(error);
      }
    );
  }

  async get(url, options = {}) {
    // Validate URL before request
    if (!isValidUrl(url)) {
      throw new Error(`SSRF: Blocked request to ${sanitizeForLogging(url)}`);
    }

    try {
      const response = await this.client.get(url, {
        ...options,
        timeout: options.timeout || this.timeout,
      });
      
      // Get the final URL after all redirects - try multiple methods
      let finalUrl = url;
      
      // Method 1: From response.request.res.responseUrl (most reliable for redirects)
      if (response.request?.res?.responseUrl) {
        finalUrl = response.request.res.responseUrl;
      }
      // Method 2: From response.config.url
      else if (response.config?.url) {
        finalUrl = response.config.url;
      }
      // Method 3: From response.request.path
      else if (response.request?.path) {
        finalUrl = response.request.path;
      }
      // Method 4: From response.headers.location (for redirect responses)
      else if (response.headers?.location) {
        finalUrl = response.headers.location;
      }

      // Validate final URL
      if (!isValidUrl(finalUrl)) {
        throw new Error(`SSRF: Blocked redirect to ${sanitizeForLogging(finalUrl)}`);
      }
      
      // Convert response.data to string if it's an object
      const text = typeof response.data === 'string' 
        ? response.data 
        : JSON.stringify(response.data);
      
      return {
        text: text,
        status: response.status,
        headers: response.headers,
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
      const response = await this.client.post(url, data, {
        ...options,
        timeout: options.timeout || this.timeout,
      });
      
      // Convert response.data to string if it's an object
      const text = typeof response.data === 'string' 
        ? response.data 
        : JSON.stringify(response.data);
      
      return {
        text: text,
        status: response.status,
        headers: response.headers,
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
        await setTimeout(delayMs * (i + 1)); // exponential backoff
      }
    }
  }
}

export default HttpClient;
