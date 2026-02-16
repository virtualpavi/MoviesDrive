const https = require('https');
const zlib = require('zlib');


// Follow redirects manually with full browser simulation
function fetchWithRedirects(url, maxRedirects = 5, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      port: 443,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0',
      },
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (maxRedirects > 0) {
          const redirectUrl = new URL(res.headers.location, url).href;
          console.log(`[${redirectCount + 1}] Redirect (${res.statusCode}) -> ${redirectUrl.substring(0, 80)}...`);
          
          // Check for cookies
          const cookies = res.headers['set-cookie'];
          if (cookies) {
            console.log(`    Cookies received: ${cookies.length}`);
          }
          
          fetchWithRedirects(redirectUrl, maxRedirects - 1, redirectCount + 1).then(resolve).catch(reject);
          return;
        }
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const encoding = res.headers['content-encoding'];
        
        let data;
        if (encoding === 'gzip') {
          try {
            data = zlib.gunzipSync(buffer).toString('utf-8');
          } catch (e) {
            console.log('    Failed to decompress gzip, using raw data');
            data = buffer.toString('utf-8');
          }
        } else if (encoding === 'deflate') {
          try {
            data = zlib.inflateSync(buffer).toString('utf-8');
          } catch (e) {
            data = buffer.toString('utf-8');
          }
        } else if (encoding === 'br') {
          try {
            data = zlib.brotliDecompressSync(buffer).toString('utf-8');
          } catch (e) {
            data = buffer.toString('utf-8');
          }
        } else {
          data = buffer.toString('utf-8');
        }
        
        resolve({ 
          data, 
          url: res.responseUrl || url, 
          statusCode: res.statusCode, 
          headers: res.headers,
          redirectCount 
        });
      });

    });

    req.on('error', (err) => {
      console.error(`Request error: ${err.message}`);
      reject(err);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.end();
  });
}


// Follow all redirects including JavaScript redirects
async function followAllRedirects(startUrl, maxSteps = 10) {
  let currentUrl = startUrl;
  let step = 0;
  const history = [];
  
  while (step < maxSteps) {
    console.log(`\n[Step ${step + 1}] Fetching: ${currentUrl.substring(0, 80)}...`);
    
    const result = await fetchWithRedirects(currentUrl, 5, 0);
    history.push({ url: currentUrl, status: result.statusCode });
    
    // Check for JavaScript redirects
    const jsRedirectMatch = result.data.match(/window\.location\s*=\s*["']([^"']+)["']/);
    const jsRedirectMatch2 = result.data.match(/window\.location\.href\s*=\s*["']([^"']+)["']/);
    const jsRedirectMatch3 = result.data.match(/location\.replace\s*\(\s*["']([^"']+)["']\s*\)/);
    
    let jsRedirect = null;
    if (jsRedirectMatch) jsRedirect = jsRedirectMatch[1];
    else if (jsRedirectMatch2) jsRedirect = jsRedirectMatch2[1];
    else if (jsRedirectMatch3) jsRedirect = jsRedirectMatch3[1];
    
    if (jsRedirect) {
      console.log(`  Found JS redirect to: ${jsRedirect}`);
      currentUrl = new URL(jsRedirect, result.url).href;
      step++;
      continue;
    }
    
    // Check for meta refresh
    const metaRefreshMatch = result.data.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["']([^"']*)["']/i);
    if (metaRefreshMatch) {
      const urlMatch = metaRefreshMatch[1].match(/url=([^\s;]+)/i);
      if (urlMatch) {
        console.log(`  Found meta refresh to: ${urlMatch[1]}`);
        currentUrl = new URL(urlMatch[1], result.url).href;
        step++;
        continue;
      }
    }
    
    // No more redirects found
    console.log(`  No more redirects found. Final page reached.`);
    return { result, history, steps: step + 1 };
  }
  
  return { result: null, history, steps: step, error: 'Max steps reached' };
}

async function main() {
  // Test URL from the user's example
  const startUrl = 'https://gamerxyt.com/hubcloud.php?host=hubcloud&id=i2xyn5f3te2zxnf&token=RnhWZ0NhYWF4dC9Xb3F3cm9tSlZOWlNENVFFZ3FVaUlRMVpuQlVGaXV5WT0=';
  
  console.log('========================================');
  console.log('Complete Redirect Chain Test');
  console.log('========================================');
  console.log('Start URL:', startUrl);
  console.log('');

  try {
    const { result, history, steps } = await followAllRedirects(startUrl, 10);
    
    console.log('\n========================================');
    console.log('REDIRECT CHAIN SUMMARY');
    console.log('========================================');
    history.forEach((h, i) => {
      console.log(`[${i + 1}] ${h.url.substring(0, 90)}... (Status: ${h.status})`);
    });
    
    if (!result) {
      console.log('\n✗ Failed to reach final page');
      return;
    }
    
    console.log('\n========================================');
    console.log('FINAL PAGE ANALYSIS');
    console.log('========================================');
    console.log('Final URL:', result.url);
    console.log('Total steps:', steps);
    console.log('Content length:', result.data.length);
    console.log('');

    // Show preview of final page
    console.log('=== Final Page Preview (first 1500 chars) ===');
    console.log(result.data.substring(0, 1500));
    console.log('...\n');

    // Look for data-digest
    console.log('=== Checking for data-digest ===');
    const digestMatch = result.data.match(/data-digest=["']([A-Za-z0-9+/=]+)["']/);
    if (digestMatch) {
      console.log('✓ Found data-digest, decoding...');
      const decoded = Buffer.from(digestMatch[1], 'base64').toString('utf-8');
      console.log('Decoded length:', decoded.length);
      console.log('\n=== First 2000 chars of decoded ===');
      console.log(decoded.substring(0, 2000));
      
      // Look for URLs in decoded content
      const urls = decoded.match(/https?:\/\/[^\s"'<>]+/g) || [];
      console.log('\n=== URLs found in decoded content:', urls.length, '===');
      urls.slice(0, 20).forEach(u => {
        const type = u.includes('fsl') ? '[FSL]' : 
                     u.includes('pixeldrain') ? '[PIXEL]' : 
                     u.includes('hubcloud') ? '[HUB]' : '[OTHER]';
        console.log(` ${type} ${u.substring(0, 90)}`);
      });
    } else {
      console.log('✗ No data-digest found');
    }

    // Look for any base64 content
    console.log('\n=== Checking for Base64 encoded content ===');
    const base64Pattern = /["']([A-Za-z0-9+/=]{200,})["']/g;
    const base64Matches = [];
    let match;
    while ((match = base64Pattern.exec(result.data)) !== null) {
      base64Matches.push(match[1]);
    }
    
    console.log(`Found ${base64Matches.length} potential base64 strings`);
    
    let decodedCount = 0;
    for (let i = 0; i < Math.min(base64Matches.length, 10); i++) {
      try {
        const decoded = Buffer.from(base64Matches[i], 'base64').toString('utf-8');
        if (decoded.length > 100 && (decoded.includes('http') || decoded.includes('href'))) {
          console.log(`\n[${decodedCount}] Decoded string ${i} (${decoded.length} bytes):`);
          console.log(decoded.substring(0, 500));
          decodedCount++;
          if (decodedCount >= 3) break;
        }
      } catch (e) {
        // Invalid base64, skip
      }
    }

    // Look for direct links
    console.log('\n=== Direct links in HTML ===');
    const hrefPattern = /href=["'](https?:\/\/[^"']+)["']/g;
    const hrefMatches = [];
    while ((match = hrefPattern.exec(result.data)) !== null) {
      hrefMatches.push(match[1]);
    }
    console.log(`Found ${hrefMatches.length} href links`);
    hrefMatches.slice(0, 15).forEach(link => {
      console.log(' -', link.substring(0, 80));
    });

    // Look for FSL/PixelDrain specific patterns
    console.log('\n=== Looking for FSL/PixelDrain links ===');
    const fslPattern = /https?:\/\/[^"'\s]*fsl[^"'\s]*/gi;
    const pixelPattern = /https?:\/\/[^"'\s]*pixeldrain[^"'\s]*/gi;
    const hubPattern = /https?:\/\/[^"'\s]*hub[^"'\s]*/gi;
    
    const fslMatches = result.data.match(fslPattern) || [];
    const pixelMatches = result.data.match(pixelPattern) || [];
    const hubMatches = result.data.match(hubPattern) || [];
    
    console.log(`FSL links found: ${fslMatches.length}`);
    fslMatches.slice(0, 5).forEach(u => console.log(' -', u));
    
    console.log(`\nPixelDrain links found: ${pixelMatches.length}`);
    pixelMatches.slice(0, 5).forEach(u => console.log(' -', u));
    
    console.log(`\nHub links found: ${hubMatches.length}`);
    hubMatches.slice(0, 5).forEach(u => console.log(' -', u));

  } catch (error) {
    console.error('\nError:', error.message);
    console.error(error.stack);
  }
}

main();
