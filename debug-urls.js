#!/usr/bin/env node

/**
 * Debug script to test URL resolution and extraction
 * Usage: node debug-urls.js [WRAPPER_URL]
 */

import 'dotenv/config';
import LinkResolver from './src/link-resolver.js';
import SourceExtractors from './src/utils.js';
import HttpClient from './src/http-client.js';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node debug-urls.js [WRAPPER_URL]');
  console.error('');
  console.error('Example:');
  console.error('  node debug-urls.js "https://gamerxyt.com/hubcloud.php?host=hubcloud&id=czdbiwo5e5arkdd&token=NzJQbUc3enI5aWxYdmw2a2hLbnBHbE40UFhTZDVRMzNCQWVaWnMxVStqMD0="');
  console.error('');
  console.error('Test wrapper URLs:');
  console.error('  - https://gamerxyt.com/hubcloud.php?host=hubcloud&id=czdbiwo5e5arkdd&token=...');
  console.error('  - https://hubcloud.foo/drive/i2xyn5f3te2zxnf');
  console.error('  - https://gdflix.dev/file/ZbyVRCVQAkOmGOW');
  console.error('  - https://pixeldrain.dev/u/K6HkSWDx');
  process.exit(1);
}

const testUrl = args[0];

console.log('='.repeat(80));
console.log(`🔍 Debug URL Resolution: ${testUrl}`);
console.log('='.repeat(80));
console.log('');

async function debugUrlResolution() {
  const http = new HttpClient();
  const linkResolver = new LinkResolver();
  const extractors = new SourceExtractors();

  try {
    // Step 1: Check if URL is a wrapper
    console.log('📋 Step 1: Check if URL is a wrapper');
    const isWrapper = linkResolver.isWrapperUrl(testUrl);
    console.log(`  Result: ${isWrapper ? '✓ Wrapper URL' : '✗ Not a wrapper URL'}`);
    console.log('');

    // Step 2: Fetch the URL and check response
    console.log('📋 Step 2: Fetch URL and follow redirects');
    try {
      const response = await http.get(testUrl, { timeout: 20000 });
      console.log(`  Status: ${response.status}`);
      console.log(`  Final URL: ${response.url || response.finalUrl || testUrl}`);
      console.log(`  Response size: ${response.text.length} bytes`);
      console.log('');

      // Step 3: Look for redirects in the HTML
      console.log('📋 Step 3: Check for redirects in HTML');
      
      // Check meta refresh
      const metaMatch = response.text.match(/<meta[^>]*?http-equiv=["']refresh["'][^>]*?content=["']([^"']*)['"]/i);
      if (metaMatch) {
        console.log(`  ✓ Found meta refresh: ${metaMatch[1].substring(0, 100)}`);
      } else {
        console.log('  ✗ No meta refresh found');
      }

      // Check JavaScript redirect
      const jsMatch = response.text.match(/window\.location\s*=\s*['"]([^'"]+)['"]/i);
      if (jsMatch) {
        console.log(`  ✓ Found JS redirect: ${jsMatch[1].substring(0, 100)}`);
      } else {
        console.log('  ✗ No JavaScript redirect found');
      }
      console.log('');

      // Step 4: Extract links from the page
      console.log('📋 Step 4: Extract streaming links from page');
      const streams = await linkResolver.extractStreamsFromPage(response.text, response.url || testUrl);
      
      if (streams.length > 0) {
        console.log(`  ✓ Found ${streams.length} streaming link(s):`);
        streams.forEach((s, i) => {
          console.log(`    [${i + 1}] ${s.source} (${s.quality}p)`);
          console.log(`        URL: ${s.url}`);
        });
      } else {
        console.log('  ✗ No streaming links found on page');
      }
      console.log('');

      // Step 5: Try full resolution
      console.log('📋 Step 5: Full URL resolution (with redirect chain following)');
      const resolved = await linkResolver.resolveWrapperUrl(testUrl);
      console.log(`  Found ${resolved.length} stream(s):`);
      resolved.forEach((s, i) => {
        console.log(`    [${i + 1}] ${s.source} (${s.quality}p)`);
        console.log(`        URL: ${s.url}`);
      });
      console.log('');

      // Step 6: Extract using SourceExtractors
      console.log('📋 Step 6: Extract using SourceExtractors');
      const extracted = await extractors.extractFromUrl(testUrl);
      console.log(`  Found ${extracted.length} stream(s):`);
      extracted.forEach((s, i) => {
        console.log(`    [${i + 1}] ${s.source} (${s.quality}p)`);
        console.log(`        URL: ${s.url}`);
      });

    } catch (error) {
      console.error(`  ✗ Error fetching URL: ${error.message}`);
      console.error(error.stack);
    }

  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.error(error.stack);
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('🏁 Debug complete');
  console.log('='.repeat(80));
}

debugUrlResolution().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
