import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import MoviesDriveScraper from '../src/scrapers/moviesdrive.js';

test('parseMovieDownloadBlocks pairs sequential h5 title/link blocks', () => {
  const scraper = new MoviesDriveScraper();

  const html = `
    <main>
      <h5 style="text-align:center;">Movie One 480p [500 MB]</h5>
      <h5 style="text-align:center;"><a href="https://mdrive.lol/archives/1">480p [500 MB]</a></h5>
      <hr>
      <h5 style="text-align:center;">Movie One 720p [1.4 GB]</h5>
      <h5 style="text-align:center;"><a href="https://mdrive.lol/archives/2">720p [1.4 GB]</a></h5>
      <hr>
      <h5 style="text-align:center;">Movie One 1080p [3.3 GB]</h5>
      <h5 style="text-align:center;"><a href="https://mdrive.lol/archives/3">1080p [3.3 GB]</a></h5>
      <h5><a href="https://example.com/skip">Unpaired anchor</a></h5>
    </main>
  `;

  const blocks = scraper.parseMovieDownloadBlocks(load(html));

  assert.equal(blocks.length, 3);
  assert.deepEqual(
    blocks.map(block => block.parsedQuality),
    [480, 720, 1080],
  );
  assert.deepEqual(
    blocks.map(block => block.mdrivePageUrl),
    [
      'https://mdrive.lol/archives/1',
      'https://mdrive.lol/archives/2',
      'https://mdrive.lol/archives/3',
    ],
  );
});

test('extractHubCloudWrapperFromMdrive selects HubCloud over other links', async () => {
  const scraper = new MoviesDriveScraper();

  scraper.http.get = async () => ({
    text: `
      <main>
        <h4><a href="https://hubcloud.foo/drive/abc123">HubCloud</a></h4>
        <p><a href="https://gdflix.dev/file/xyz789">GDFlix</a></p>
      </main>
    `,
    status: 200,
  });

  const wrapper = await scraper.extractHubCloudWrapperFromMdrive('https://mdrive.lol/archives/111');
  assert.equal(wrapper, 'https://hubcloud.foo/drive/abc123');
});

test('searchAndGetDocument prefers exact movie imdb_id match', async () => {
  const scraper = new MoviesDriveScraper();
  const requested = [];

  scraper.http.get = async (url) => {
    requested.push(url);

    if (url.includes('/searchapi.php')) {
      return {
        text: JSON.stringify({
          hits: [
            { document: { imdb_id: 'tt0000001', permalink: '/wrong-hit/' } },
            { document: { imdb_id: 'tt9999999', permalink: '/exact-hit/' } },
          ],
        }),
        status: 200,
      };
    }

    if (url.endsWith('/exact-hit/')) {
      return {
        text: '<html><body><h1>Exact Hit</h1></body></html>',
        status: 200,
      };
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await scraper.searchAndGetDocument('tt9999999');
  assert.ok(result);
  assert.equal(result.document.imdb_id, 'tt9999999');
  assert.ok(requested.some(url => url.endsWith('/exact-hit/')));
  assert.ok(!requested.some(url => url.endsWith('/wrong-hit/')));
});

test('extractMovieStreams returns highest-first FSL+Pixel streams with exact h5 titles', async () => {
  const scraper = new MoviesDriveScraper();

  const movieHtml = `
    <main>
      <h5>Demo Movie (2026) 480p [550 MB]</h5>
      <h5><a href="https://mdrive.lol/archives/480">480p [550 MB]</a></h5>
      <h5>Demo Movie (2026) 720p [1.5 GB]</h5>
      <h5><a href="https://mdrive.lol/archives/720">720p [1.5 GB]</a></h5>
      <h5>Demo Movie (2026) 1080p [3.2 GB]</h5>
      <h5><a href="https://mdrive.lol/archives/1080">1080p [3.2 GB]</a></h5>
    </main>
  `;

  scraper.searchAndGetDocument = async () => ({
    $: load(movieHtml),
    html: movieHtml,
    document: {},
  });

  const wrapperByArchive = new Map([
    ['https://mdrive.lol/archives/480', 'https://hubcloud.foo/drive/w480'],
    ['https://mdrive.lol/archives/720', 'https://hubcloud.foo/drive/w720'],
    ['https://mdrive.lol/archives/1080', 'https://hubcloud.foo/drive/w1080'],
  ]);

  scraper.extractHubCloudWrapperFromMdrive = async (archiveUrl) => {
    return wrapperByArchive.get(archiveUrl) || null;
  };

  scraper.extractors.extractFromUrl = async (wrapperUrl) => {
    const suffix = wrapperUrl.endsWith('w1080') ? '1080' : wrapperUrl.endsWith('w720') ? '720' : '480';
    return [
      {
        url: `https://hub.fsl-lover.buzz/file-${suffix}?token=1`,
        source: 'FSL Server',
        quality: 1080,
      },
      {
        url: `https://pixeldrain.dev/api/file/PD${suffix}?download`,
        source: 'PixelDrain',
        quality: 1080,
      },
    ];
  };

  const streams = await scraper.extractMovieStreams('tt1234567', 'ignored');

  assert.equal(streams.length, 6);
  assert.deepEqual(
    streams.map(stream => stream.quality),
    [1080, 1080, 720, 720, 480, 480],
  );

  const titles = streams.map(stream => stream.title);
  assert.ok(titles.includes('Demo Movie (2026) 1080p [3.2 GB] [FSL]'));
  assert.ok(titles.includes('Demo Movie (2026) 1080p [3.2 GB] [Pixel]'));
  assert.ok(titles.includes('Demo Movie (2026) 720p [1.5 GB] [FSL]'));
  assert.ok(titles.includes('Demo Movie (2026) 720p [1.5 GB] [Pixel]'));
  assert.ok(titles.includes('Demo Movie (2026) 480p [550 MB] [FSL]'));
  assert.ok(titles.includes('Demo Movie (2026) 480p [550 MB] [Pixel]'));
});

test('extractMovieStreams skips resolution when HubCloud wrapper is missing (strict mode)', async () => {
  const scraper = new MoviesDriveScraper();

  const movieHtml = `
    <main>
      <h5>Strict Demo 480p</h5>
      <h5><a href="https://mdrive.lol/archives/a">480p</a></h5>
      <h5>Strict Demo 720p</h5>
      <h5><a href="https://mdrive.lol/archives/b">720p</a></h5>
    </main>
  `;

  scraper.searchAndGetDocument = async () => ({
    $: load(movieHtml),
    html: movieHtml,
    document: {},
  });

  scraper.extractHubCloudWrapperFromMdrive = async (archiveUrl) => {
    if (archiveUrl.endsWith('/b')) {
      return 'https://hubcloud.foo/drive/only720';
    }
    return null;
  };

  scraper.extractors.extractFromUrl = async () => ([
    {
      url: 'https://hub.fsl-lover.buzz/only-720?token=1',
      source: 'FSL Server',
      quality: 1080,
    },
  ]);

  const streams = await scraper.extractMovieStreams('tt7654321', 'ignored');

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, 720);
  assert.equal(streams[0].title, 'Strict Demo 720p [FSL]');
  assert.equal(streams[0].source, 'FSL');
});

test('extractMovieStreams sorts same-quality movie streams by larger file size first', async () => {
  const scraper = new MoviesDriveScraper();

  const movieHtml = `
    <main>
      <h5>Size Sort Demo 1080p [1.8 GB]</h5>
      <h5><a href="https://mdrive.lol/archives/1080-small">1080p [1.8 GB]</a></h5>
      <h5>Size Sort Demo 1080p [3.4 GB]</h5>
      <h5><a href="https://mdrive.lol/archives/1080-large">1080p [3.4 GB]</a></h5>
      <h5>Size Sort Demo 720p [900 MB]</h5>
      <h5><a href="https://mdrive.lol/archives/720">720p [900 MB]</a></h5>
    </main>
  `;

  scraper.searchAndGetDocument = async () => ({
    $: load(movieHtml),
    html: movieHtml,
    document: {},
  });

  scraper.extractHubCloudWrapperFromMdrive = async (archiveUrl) => {
    if (archiveUrl.endsWith('1080-small')) return 'https://hubcloud.foo/drive/wsmall';
    if (archiveUrl.endsWith('1080-large')) return 'https://hubcloud.foo/drive/wlarge';
    if (archiveUrl.endsWith('720')) return 'https://hubcloud.foo/drive/w720';
    return null;
  };

  scraper.extractors.extractFromUrl = async (wrapperUrl) => {
    if (wrapperUrl.endsWith('wsmall')) {
      return [{ url: 'https://hub.fsl-lover.buzz/small?token=1', source: 'FSL Server' }];
    }
    if (wrapperUrl.endsWith('wlarge')) {
      return [{ url: 'https://hub.fsl-lover.buzz/large?token=1', source: 'FSL Server' }];
    }
    return [{ url: 'https://hub.fsl-lover.buzz/hd?token=1', source: 'FSL Server' }];
  };

  const streams = await scraper.extractMovieStreams('tt1111111', 'ignored');
  assert.deepEqual(
    streams.map(stream => stream.url),
    [
      'https://hub.fsl-lover.buzz/large?token=1',
      'https://hub.fsl-lover.buzz/small?token=1',
      'https://hub.fsl-lover.buzz/hd?token=1',
    ],
  );
});

test('extractMovieStreams falls back to size parsed from stream title when fileSize is missing', async () => {
  const scraper = new MoviesDriveScraper();

  const movieHtml = `
    <main>
      <h5>Fallback Demo 720p</h5>
      <h5><a href="https://mdrive.lol/archives/one">720p One</a></h5>
      <h5>Fallback Demo 720p</h5>
      <h5><a href="https://mdrive.lol/archives/two">720p Two</a></h5>
    </main>
  `;

  scraper.searchAndGetDocument = async () => ({
    $: load(movieHtml),
    html: movieHtml,
    document: {},
  });

  scraper.extractHubCloudWrapperFromMdrive = async (archiveUrl) => {
    if (archiveUrl.endsWith('/one')) return 'https://hubcloud.foo/drive/wone';
    if (archiveUrl.endsWith('/two')) return 'https://hubcloud.foo/drive/wtwo';
    return null;
  };

  scraper.extractors.extractFromUrl = async (wrapperUrl) => {
    if (wrapperUrl.endsWith('wone')) {
      return [{
        url: 'https://hub.fsl-lover.buzz/fallback-small?token=1',
        source: 'FSL Server',
        title: 'Fallback.Demo.720p [700 MB]',
      }];
    }
    return [{
      url: 'https://hub.fsl-lover.buzz/fallback-large?token=1',
      source: 'FSL Server',
      title: 'Fallback.Demo.720p [2.4 GB]',
    }];
  };

  const streams = await scraper.extractMovieStreams('tt2222222', 'ignored');
  assert.deepEqual(
    streams.map(stream => stream.url),
    [
      'https://hub.fsl-lover.buzz/fallback-large?token=1',
      'https://hub.fsl-lover.buzz/fallback-small?token=1',
    ],
  );
});

test('extractMovieStreams applies deterministic tie-breaks: FSL before Pixel, then URL', async () => {
  const scraper = new MoviesDriveScraper();

  const movieHtml = `
    <main>
      <h5>Tie Break Demo 1080p [3 GB]</h5>
      <h5><a href="https://mdrive.lol/archives/tie">1080p [3 GB]</a></h5>
    </main>
  `;

  scraper.searchAndGetDocument = async () => ({
    $: load(movieHtml),
    html: movieHtml,
    document: {},
  });

  scraper.extractHubCloudWrapperFromMdrive = async () => 'https://hubcloud.foo/drive/wtie';

  scraper.extractors.extractFromUrl = async () => ([
    { url: 'https://hub.fsl-lover.buzz/z-end?token=1', source: 'FSL Server' },
    { url: 'https://pixeldrain.dev/api/file/TIE?download', source: 'PixelDrain' },
    { url: 'https://hub.fsl-lover.buzz/a-start?token=1', source: 'FSL Server' },
  ]);

  const streams = await scraper.extractMovieStreams('tt3333333', 'ignored');
  assert.deepEqual(
    streams.map(stream => stream.url),
    [
      'https://hub.fsl-lover.buzz/a-start?token=1',
      'https://hub.fsl-lover.buzz/z-end?token=1',
      'https://pixeldrain.dev/api/file/TIE?download',
    ],
  );
});
