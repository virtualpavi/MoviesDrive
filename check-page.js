import HttpClient from './src/http-client.js';
import { load } from 'cheerio';

async function checkPage() {
  const http = new HttpClient();
  const response = await http.get('https://new1.moviesdrive.surf/landman-season-2-2025/');
  const $ = load(response.text);
  
  console.log('=== Page Structure ===');
  $('h2, h3, h4, h5').each((i, elem) => {
    const text = $(elem).text().trim();
    if (text) {
      console.log(`[${elem.tagName}] ${text.substring(0, 100)}`);
    }
  });
  
  console.log('\n=== Looking for Episodes ===');
  $('*').each((i, elem) => {
    const text = $(elem).text().trim();
    if (text.match(/Ep\s*\d+|Episode\s+\d+/i)) {
      console.log(`[${elem.tagName}] ${text.substring(0, 100)}`);
    }
  });
}

checkPage().catch(console.error);
