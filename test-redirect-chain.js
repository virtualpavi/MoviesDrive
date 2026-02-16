#!/usr/bin/env node

/**
 * Test script to verify redirect chain handling
 * Usage: node test-redirect-chain.js [WRAPPER_URL]
 */

import 'dotenv/config';
import LinkResolver from './src/link-resolver.js';
import HttpClient from './src/http-client.js';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node test-redirect-chain.js [WRAPPER_URL]');
  console.error('');
  console.error('Example:');
  console.error('  node test-redirect-chain.js "https://gamerxyt.com/hubcloud.php?host=hubcloud&id=czdbiwo5e5arkdd&token=NzJQbUc3enI5aWxYdmw2a2hLbnBHbE40UFhTZDVRMzNCQWVaWnMxVStqMD0="');
  process.exit(1);
}

const testUrl = args[0];

console.log('='.repeat(80));
console.log('🔍 Testing Redirect Chain Resolution');
console.log('='.repeat(80));
console.log(`URL: ${testUrl}`);
console.log('');

async function testRedirectChain() {
  const http = new HttpClient();
  const linkResolver = new LinkResolver();

  try {
    // Step 1: Check if URL is recognized as wrapper
    console.log('📋 Step 1: Check if URL is a wrapper');
    const isWrapper = linkResolver.isWrapperUrl?.(testUrl) || 
                     (await import('./src/security.js')).isWrapperUrl(testUrl);
    console.log(`  Result: ${isWrapper ? '✓ Wrapper URL' : '✗ Not a wrapper URL'}`);
    console.log('');

    // Step 2: Test HTTP redirect following
    console.log('📋 Step 2: Test HTTP redirect following');
    try {
      const response = await http.get(testUrl, { timeout: 20000 });
      console.log(`  Status: ${response.status}`);
      console.log(`  Final URL after HTTP redirects: ${response.url || response.finalUrl || testUrl}`);
      console.log(`  Response size: ${response.text.length} bytes`);
      
      // Check if we landed on a different domain
      const originalDomain = new URL(testUrl).hostname;
      const finalDomain = new URL(response.url || testUrl).hostname;
      if (originalDomain !== finalDomain) {
        console.log(`  ✓ Redirected: ${originalDomain} → ${finalDomain}`);
      }
    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
    }
    console.log('');

    // Step 3: Test full resolution with LinkResolver
    console.log('📋 Step 3: Test full LinkResolver resolution');
    console.log('  Following redirect chain and extracting streams...');
    console.log('');
    
    const streams = await linkResolver.resolveWrapperUrl(testUrl);
    
    if (streams.length > 0) {
      console.log(`  ✓ SUCCESS! Found ${streams.length} stream(s):`);
      console.log('');
      streams.forEach((s, i) => {
        const qualityLabel = s.quality >= 2160 ? '4K' : 
                            s.quality >= 1080 ? '1080p' : 
                            s.quality >= 720 ? '720p' : 
                            s.quality >= 480 ? '480p' : 'SD';
        console.log(`  [${i + 1}] ${qualityLabel} • ${s.source}`);
        console.log(`      URL: ${s.url}`);
        console.log('');
      });
    } else {
      console.log('  ✗ No streams found');
      console.log('');
      console.log('  Possible reasons:');
      console.log('  - Page structure has changed');
      console.log('  - New redirect domains not in wrapper list');
      console.log('  - FSL/PixelDrain selectors need updating');
    }

  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.error(error.stack);
  }

  console.log('='.repeat(80));
  console.log('🏁 Test complete');
  console.log('='.repeat(80));
}

testRedirectChain().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
