/**
 * Security Module
 * Provides SSRF protection, URL validation, and security utilities
 * Compatible with Cloudflare Workers
 */

// Private IP ranges that should be blocked
const PRIVATE_IP_PATTERNS = [
  /^127\./, // Loopback
  /^10\./, // Private Class A
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
  /^192\.168\./, // Private Class C
  /^169\.254\./, // Link-local
  /^0\./, // Current network
  /^::1$/, // IPv6 loopback
  /^fc00:/i, // IPv6 private
  /^fe80:/i, // IPv6 link-local
];

// Suspicious URL patterns
const SUSPICIOUS_PATTERNS = [
  /localhost/i,
  /127\.0\.0\.1/i,
  /0\.0\.0\.0/i,
  /\[::\]/i,
  /file:\/\//i,
  /ftp:\/\//i,
  /dict:\/\//i,
  /gopher:\/\//i,
  /ldap:\/\//i,
  /smtp:\/\//i,
  /imap:\/\//i,
  /pop3:\/\//i,
  /ssh:\/\//i,
  /telnet:\/\//i,
  /data:\/\//i,
  /javascript:/i,
  /vbscript:/i,
];

/**
 * Check if IP is private
 * @param {string} ip - IP address
 * @returns {boolean} True if private
 */
function isPrivateIP(ip) {
  return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(ip));
}

/**
 * Validate URL for SSRF protection
 * @param {string} urlString - URL to validate
 * @returns {boolean} True if valid and safe
 */
export function isValidUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return false;
  }

  try {
    const url = new URL(urlString);

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      console.warn(`[Security] Blocked non-HTTP protocol: ${url.protocol}`);
      return false;
    }

    // Check for suspicious patterns in hostname
    const hostname = url.hostname.toLowerCase();
    
    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.test(hostname)) {
        console.warn(`[Security] Blocked suspicious hostname: ${hostname}`);
        return false;
      }
    }

    // Check if hostname is an IP address
    const ipMatch = hostname.match(/^(\d{1,3}\.){3}\d{1,3}$/);
    if (ipMatch) {
      if (isPrivateIP(hostname)) {
        console.warn(`[Security] Blocked private IP: ${hostname}`);
        return false;
      }
    }

    // Check for DNS rebinding attacks (IP in URL)
    if (urlString.match(/@\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/)) {
      console.warn(`[Security] Blocked potential DNS rebinding attack`);
      return false;
    }

    return true;
  } catch (error) {
    console.warn(`[Security] Invalid URL: ${urlString}`);
    return false;
  }
}

/**
 * Sanitize string input (prevent injection attacks)
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
export function sanitizeString(str) {
  if (!str || typeof str !== 'string') {
    return '';
  }

  // Remove control characters and potentially dangerous characters
  return str
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
    .replace(/[<>\"']/g, '') // Remove HTML/script injection characters
    .trim();
}

/**
 * Sanitize URL for logging (prevent log injection)
 * @param {string} url - URL to sanitize
 * @returns {string} Sanitized URL
 */
export function sanitizeForLogging(url) {

  if (!url || typeof url !== 'string') {
    return '[invalid]';
  }

  // Limit length
  const maxLength = 100;
  let sanitized = url.substring(0, maxLength);
  
  if (url.length > maxLength) {
    sanitized += '...';
  }

  // Remove newlines and control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

  return sanitized;
}

/**
 * Check if URL is a wrapper that needs resolution
 * @param {string} url - URL to check
 * @returns {boolean} True if wrapper URL
 */
export function isWrapperUrl(url) {
  if (!url) return false;
  
  const wrapperDomains = [
    'hubcloud',
    'gamerxyt',
    'carnewz',
    'cryptoinsights',
    'hubcloud.php',
    'hubcloud.icu',
    'hubcloud.lol',
    'hubcloud.art',
    'hubcloud.dad',
    'hubcloud.foo',
    'hubcloud.bar',
    'bonuscaf',
    'iriverwave',
    'tinyurl',
    'carnewz.site',
    'bonuscaf.com',
    'iriverwave.com',
    'kxnr',
  ];



  const urlLower = url.toLowerCase();
  return wrapperDomains.some(domain => urlLower.includes(domain));
}


/**
 * Validate IMDB ID format
 * @param {string} id - ID to validate
 * @returns {boolean} True if valid IMDB ID
 */
export function isValidImdbId(id) {
  if (!id || typeof id !== 'string') {
    return false;
  }

  // IMDB IDs start with 'tt' followed by 7-9 digits
  return /^tt\d{7,9}$/.test(id);
}

/**
 * Validate episode/season number
 * @param {number} num - Number to validate
 * @returns {boolean} True if valid
 */
export function isValidEpisodeNumber(num) {
  const n = parseInt(num);
  return !isNaN(n) && n >= 1 && n <= 999;
}

/**
 * Security headers middleware
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export function securityHeaders(req, res, next) {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  
  // Remove server identification
  res.removeHeader('X-Powered-By');
  
  next();
}

/**
 * Rate limiting store
 */
class RateLimitStore {
  constructor() {
    this.requests = new Map();
    this.windowMs = 60000; // 1 minute window
    this.maxRequests = 30; // 30 requests per minute
  }

  /**
   * Check if request is allowed
   * @param {string} key - Client identifier (IP)
   * @returns {Object} Rate limit info
   */
  isAllowed(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get or create request history
    let history = this.requests.get(key) || [];
    
    // Remove old requests outside window
    history = history.filter(time => time > windowStart);
    
    // Check if under limit
    const allowed = history.length < this.maxRequests;
    
    if (allowed) {
      history.push(now);
    }
    
    this.requests.set(key, history);
    
    // Cleanup old entries periodically
    if (Math.random() < 0.01) {
      this.cleanup();
    }

    return {
      allowed,
      remaining: Math.max(0, this.maxRequests - history.length),
      resetTime: windowStart + this.windowMs,
    };
  }

  /**
   * Cleanup old entries
   */
  cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [key, history] of this.requests.entries()) {
      const filtered = history.filter(time => time > windowStart);
      if (filtered.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, filtered);
      }
    }
  }
}

const rateLimitStore = new RateLimitStore();

/**
 * Rate limiting middleware
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export function rateLimit(req, res, next) {
  // Get client IP
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                   req.socket.remoteAddress || 
                   'unknown';

  const result = rateLimitStore.isAllowed(clientIp);

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', rateLimitStore.maxRequests);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', result.resetTime);

  if (!result.allowed) {
    console.warn(`[Security] Rate limit exceeded for ${clientIp}`);
    return res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
    });
  }

  next();
}

export default {
  isValidUrl,
  sanitizeForLogging,
  isWrapperUrl,
  isValidImdbId,
  isValidEpisodeNumber,
  securityHeaders,
  rateLimit,
};
