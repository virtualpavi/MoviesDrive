/**
 * HTTP Client with Cloudflare bypass and caching
 * Provides request functionality with proper headers and timeout handling
 */

import axios from 'axios';
import { setTimeout } from 'timers/promises';

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
      maxRedirects: 10, // Follow redirects automatically
      validateStatus: () => true, // Don't throw on any status
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.response?.status === 403) {
          console.error('Cloudflare protection detected');
        }
        return Promise.reject(error);
      }
    );
  }

  async get(url, options = {}) {
    try {
      const response = await this.client.get(url, {
        ...options,
        timeout: this.timeout,
        maxRedirects: 10, // Follow redirects automatically
      });
      
      // Get the final URL after all redirects
      let finalUrl = url;
      
      // Try multiple ways to get the final URL
      // response.request.res.responseUrl is the most reliable for axios
      if (response.request && response.request.res && response.request.res.responseUrl) {
        finalUrl = response.request.res.responseUrl;
      } else if (response.request && response.request.path && response.request.path.startsWith('http')) {
        finalUrl = response.request.path;
      } else if (response.config && response.config.url) {
        finalUrl = response.config.url;
      } else if (response.url) {
        finalUrl = response.url;
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
      console.error(`[HttpClient] Error fetching ${url}:`, error.message);
      throw error;
    }
  }

  async post(url, data, options = {}) {
    try {
      const response = await this.client.post(url, data, {
        ...options,
        timeout: this.timeout,
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
      console.error(`Error posting to ${url}:`, error.message);
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
