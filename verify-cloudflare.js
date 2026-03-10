#!/usr/bin/env node

/**
 * Pre-deployment verification script
 * Checks if the app is ready for Cloudflare Workers deployment
 */

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const checks = [];
let allPassed = true;

function check(name, passed, message) {
  checks.push({ name, passed, message });
  if (!passed) allPassed = false;
  console.log(`${passed ? '✅' : '❌'} ${name}${message ? `: ${message}` : ''}`);
}

async function verifyPackageJson() {
  try {
    const content = await readFile(join(__dirname, 'package.json'), 'utf-8');
    const pkg = JSON.parse(content);
    
    check('Wrangler installed', !!pkg.devDependencies?.wrangler, 'Found in devDependencies');
    check('Axios removed', !pkg.dependencies?.axios, 'Using fetch API instead');
    check('JSDOM removed', !pkg.dependencies?.jsdom, 'Using cheerio only');
    check('Cheerio present', !!pkg.dependencies?.cheerio, 'Required for HTML parsing');
    
    const hasScripts = pkg.scripts?.['cf:dev'] && pkg.scripts?.['cf:deploy'];
    check('Cloudflare scripts', hasScripts, 'cf:dev and cf:deploy present');
    
    return true;
  } catch (error) {
    check('package.json', false, error.message);
    return false;
  }
}

async function verifyWranglerConfig() {
  try {
    const content = await readFile(join(__dirname, 'wrangler.toml'), 'utf-8');
    
    check('wrangler.toml exists', true);
    check('nodejs_compat flag', content.includes('nodejs_compat'), 'Required for compatibility');
    check('Main entry point', content.includes('worker/index.js'), 'Points to worker file');
    
    const hasAccountId = content.includes('account_id') && !content.includes('# account_id');
    check('Account ID configured', hasAccountId, hasAccountId ? 'Ready to deploy' : 'Need to add your account_id');
    
    return true;
  } catch (error) {
    check('wrangler.toml', false, error.message);
    return false;
  }
}

async function verifyWorkerFile() {
  try {
    const content = await readFile(join(__dirname, 'worker/index.js'), 'utf-8');
    
    check('worker/index.js exists', true);
    check('No axios imports', !content.includes("from 'axios'"), 'Using fetch API');
    check('No Node.js built-ins', !content.includes("from 'url'") && !content.includes("from 'timers/promises'"), 'Using Web APIs');
    check('Process polyfill', content.includes('globalThis.process'), 'Added for compatibility');
    check('Fetch handler', content.includes('export default') && content.includes('async fetch'), 'Proper Worker export');
    
    return true;
  } catch (error) {
    check('worker/index.js', false, error.message);
    return false;
  }
}

async function verifyHttpClient() {
  try {
    const content = await readFile(join(__dirname, 'src/http-client.js'), 'utf-8');
    
    check('No axios in http-client', !content.includes("import axios"), 'Converted to fetch');
    check('No timers/promises', !content.includes("from 'timers/promises'"), 'Using setTimeout directly');
    check('Uses fetch API', content.includes('fetch('), 'Native Web API');
    check('AbortController timeout', content.includes('AbortController'), 'For request timeout');
    
    return true;
  } catch (error) {
    check('src/http-client.js', false, error.message);
    return false;
  }
}

async function verifySecurity() {
  try {
    const content = await readFile(join(__dirname, 'src/security.js'), 'utf-8');
    
    check('No url module import', !content.includes("from 'url'"), 'Using global URL');
    check('SSRF protection intact', content.includes('isValidUrl'), 'Security maintained');
    
    return true;
  } catch (error) {
    check('src/security.js', false, error.message);
    return false;
  }
}

console.log('🔍 Cloudflare Workers Compatibility Check\n');

await verifyPackageJson();
console.log('');
await verifyWranglerConfig();
console.log('');
await verifyWorkerFile();
console.log('');
await verifyHttpClient();
console.log('');
await verifySecurity();

console.log('\n' + '='.repeat(60));
if (allPassed) {
  console.log('✅ All checks passed! Your app is ready for Cloudflare Workers.');
  console.log('\nNext steps:');
  console.log('1. npm install');
  console.log('2. npx wrangler login');
  console.log('3. Add your account_id to wrangler.toml');
  console.log('4. npm run cf:deploy:prod');
} else {
  console.log('❌ Some checks failed. Please review the issues above.');
  process.exit(1);
}
console.log('='.repeat(60) + '\n');
