import test from 'node:test';
import assert from 'node:assert/strict';
import LinkResolver from '../src/link-resolver.js';

test('extractStreamsFromPage extracts FSL and converts PixelDrain to API download URL', async () => {
  const resolver = new LinkResolver();
  const html = `
    <main>
      <a href="https://hub.fsl-lover.buzz/final123?token=abc" id="fsl">Download [FSL Server]</a>
      <a href="https://pixeldrain.dev/u/SrVH25vE" class="btn">Download [PixelServer : 2]</a>
    </main>
  `;

  const streams = await resolver.extractStreamsFromPage(html, 'http://carnewz.site/games/');
  const urls = streams.map(stream => stream.url);

  assert.ok(urls.includes('https://hub.fsl-lover.buzz/final123?token=abc'));
  assert.ok(urls.includes('https://pixeldrain.dev/api/file/SrVH25vE?download'));
});

test('extractStreamsFromPage does not emit /games links as final streams', async () => {
  const resolver = new LinkResolver();
  const html = `
    <main>
      <a href="http://carnewz.site/games/" class="btn btn-primary">Download</a>
    </main>
  `;

  const streams = await resolver.extractStreamsFromPage(html, 'https://carnewz.site/hubcloud.php?host=hubcloud&id=abc');
  assert.equal(streams.length, 0);
});

test('resolveWrapperUrl follows chain-relevant candidates and ignores ad redirect domains', async () => {
  const resolver = new LinkResolver();
  const requestedUrls = [];

  const wrapperUrl = 'https://hubcloud.foo/drive/qefq1hn9hvv1qj0';
  const gamerxytUrl = 'https://gamerxyt.com/hubcloud.php?host=hubcloud&id=qefq1hn9hvv1qj0&token=abc';
  const carnewzHubUrl = 'https://carnewz.site/hubcloud.php?host=hubcloud&id=qefq1hn9hvv1qj0&token=abc';
  const gamesUrl = 'http://carnewz.site/games/';

  const responses = {
    [wrapperUrl]: {
      text: `<a id="download" href="${gamerxytUrl}">Generate Direct Download Link</a>`,
      status: 200,
      headers: {},
      url: wrapperUrl,
      finalUrl: wrapperUrl,
    },
    [gamerxytUrl]: {
      text: '',
      status: 301,
      headers: { location: carnewzHubUrl },
      url: gamerxytUrl,
      finalUrl: gamerxytUrl,
    },
    [carnewzHubUrl]: {
      text: `
        <script>window.location='https://bonuscaf.com/go/1272663';</script>
        <div class="downloads-btns-div">
          <a href="${gamesUrl}">Continue</a>
        </div>
      `,
      status: 200,
      headers: {},
      url: carnewzHubUrl,
      finalUrl: carnewzHubUrl,
    },
    [gamesUrl]: {
      text: `
        <a href="https://hub.fsl-lover.buzz/f099b2554bf43beaec7d459cbbad06a2?token=1771022774151" id="fsl">Download [FSL Server]</a>
        <a href="https://pixeldrain.dev/u/SrVH25vE" class="btn btn-success">Download [PixelServer : 2]</a>
      `,
      status: 200,
      headers: {},
      url: gamesUrl,
      finalUrl: gamesUrl,
    },
  };

  resolver.http = {
    get: async (url) => {
      requestedUrls.push(url);
      const response = responses[url];
      if (!response) {
        throw new Error(`Unexpected URL requested in test: ${url}`);
      }
      return response;
    },
  };

  const streams = await resolver.resolveWrapperUrl(wrapperUrl);
  const urls = streams.map(stream => stream.url);

  assert.equal(streams.length, 2);
  assert.ok(urls.includes('https://hub.fsl-lover.buzz/f099b2554bf43beaec7d459cbbad06a2?token=1771022774151'));
  assert.ok(urls.includes('https://pixeldrain.dev/api/file/SrVH25vE?download'));
  assert.ok(!requestedUrls.some(url => url.includes('bonuscaf.com')));
});

test('resolveWrapperUrl keeps FSL links even when final host does not contain "fsl" in URL', async () => {
  const resolver = new LinkResolver();

  const wrapperUrl = 'https://hubcloud.foo/drive/k22pgiag12ztvwq';
  const gamesUrl = 'https://cryptoinsights.site/games/';

  const responses = {
    [wrapperUrl]: {
      text: `<a href="${gamesUrl}" class="btn">Continue</a>`,
      status: 200,
      headers: {},
      url: wrapperUrl,
      finalUrl: wrapperUrl,
    },
    [gamesUrl]: {
      text: `
        <a href="https://hub.cooldown.buzz/4af836a524ba1e6455458835d4ae7754?token=1771223413146" id="fsl">Download [FSL Server]</a>
        <a href="https://pixeldrain.dev/u/MWpYPxrH" class="btn">Download [PixelServer : 2]</a>
      `,
      status: 200,
      headers: {},
      url: gamesUrl,
      finalUrl: gamesUrl,
    },
  };

  resolver.http = {
    get: async (url) => {
      const response = responses[url];
      if (!response) {
        throw new Error(`Unexpected URL requested in test: ${url}`);
      }
      return response;
    },
  };

  const streams = await resolver.resolveWrapperUrl(wrapperUrl);
  const urls = streams.map(stream => stream.url);

  assert.equal(streams.length, 2);
  assert.ok(urls.includes('https://hub.cooldown.buzz/4af836a524ba1e6455458835d4ae7754?token=1771223413146'));
  assert.ok(urls.includes('https://pixeldrain.dev/api/file/MWpYPxrH?download'));
});
