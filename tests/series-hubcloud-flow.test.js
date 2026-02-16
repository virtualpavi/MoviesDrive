import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import MoviesDriveScraper from '../src/scrapers/moviesdrive.js';

test('parseSeriesSingleEpisodeBlocks extracts only Single Episode links per quality', () => {
  const scraper = new MoviesDriveScraper();
  const html = `
    <main>
      <h5>Season 1 [Hindi - English] 480p x264 [220MB/E]</h5>
      <h5><a href="https://mdrive.lol/archives/65381">480p Single Episode</a></h5>
      <h5><a href="https://mdrive.lol/archives/65387">Zip [2.1GB]</a></h5>
      <h5>Season 1 [Hindi - English] 720p x264 [530MB/E]</h5>
      <h5><a href="https://mdrive.lol/archives/65383">720p Single Episode</a></h5>
      <h5><a href="https://mdrive.lol/archives/65389">Zip [5.2GB]</a></h5>
      <h5>Season 1 [Hindi - English] 1080p x264 [1.1GB/E]</h5>
      <h5><a href="https://mdrive.lol/archives/65385">1080p Single Episode</a></h5>
      <h5><a href="https://mdrive.lol/archives/65391">Zip [11.2GB]</a></h5>
    </main>
  `;

  const blocks = scraper.parseSeriesSingleEpisodeBlocks(load(html), 1);

  assert.equal(blocks.length, 3);
  assert.deepEqual(
    blocks.map(block => block.quality),
    [480, 720, 1080],
  );
  assert.deepEqual(
    blocks.map(block => block.mdriveArchiveUrl),
    [
      'https://mdrive.lol/archives/65381',
      'https://mdrive.lol/archives/65383',
      'https://mdrive.lol/archives/65385',
    ],
  );
  assert.deepEqual(
    blocks.map(block => block.perEpisodeSizeIfPresent),
    ['220 MB', '530 MB', '1.1 GB'],
  );
});

test('extractEpisodeHubCloudFromArchive finds exact episode HubCloud only', async () => {
  const scraper = new MoviesDriveScraper();
  const archiveHtml = `
    <div class="entry-content">
      <h5>Ep01 - 480p [216.69 MB]</h5>
      <h5><a href="https://hubcloud.foo/drive/ep01token">HubCloud [Instant DL]</a></h5>
      <h5><a href="https://gdflix.dev/file/ep01gdflix">GDFlix</a></h5>
      <h5>Ep02 - 480p [212.37 MB]</h5>
      <h5><a href="https://hubcloud.foo/drive/ep02token">HubCloud [Instant DL]</a></h5>
      <h5><a href="https://gdflix.dev/file/ep02gdflix">GDFlix</a></h5>
    </div>
  `;

  scraper.http.get = async () => ({
    text: archiveHtml,
    status: 200,
  });

  const episodeOne = await scraper.extractEpisodeHubCloudFromArchive('https://mdrive.lol/archives/65381', 1);
  const episodeTwo = await scraper.extractEpisodeHubCloudFromArchive('https://mdrive.lol/archives/65381', 2);

  assert.ok(episodeOne);
  assert.equal(episodeOne.hubcloudWrapperUrl, 'https://hubcloud.foo/drive/ep01token');
  assert.equal(episodeOne.episodeFileSize, '216.69 MB');

  assert.ok(episodeTwo);
  assert.equal(episodeTwo.hubcloudWrapperUrl, 'https://hubcloud.foo/drive/ep02token');
  assert.equal(episodeTwo.episodeFileSize, '212.37 MB');
});

test('extractHubCloudDriveMetadata parses filename and file size from wrapper page', async () => {
  const scraper = new MoviesDriveScraper();

  scraper.http.get = async () => ({
    text: `
      <html>
        <head>
          <title>Landman.S01E01.480p.BluRay.Hindi-English.ESub.x264-[Moviesdrives.cv].mkv</title>
        </head>
        <body>
          <div class="card h6">
            <div class="card-header text-white bg-primary mb-3">
              Landman.S01E01.480p.BluRay.Hindi-English.ESub.x264-[Moviesdrives.cv].mkv
            </div>
            <div class="card-body">
              <ul class="list-group">
                <li class="list-group-item">File Size<i id="size">216.69 MB</i></li>
              </ul>
            </div>
          </div>
        </body>
      </html>
    `,
    status: 200,
  });

  const metadata = await scraper.extractHubCloudDriveMetadata('https://hubcloud.foo/drive/k22pgiag12ztvwq');

  assert.ok(metadata);
  assert.equal(
    metadata.rawFilename,
    'Landman.S01E01.480p.BluRay.Hindi-English.ESub.x264-[Moviesdrives.cv].mkv',
  );
  assert.equal(
    metadata.cleanBaseTitle,
    'Landman.S01E01.480p.BluRay.Hindi-English.ESub.x264',
  );
  assert.equal(metadata.fileSize, '216.69 MB');
});

test('getSeasonFromPermalink parses season tokens safely', () => {
  const scraper = new MoviesDriveScraper();

  assert.equal(scraper.getSeasonFromPermalink('/landman-season-1/'), 1);
  assert.equal(scraper.getSeasonFromPermalink('/show-s01/'), 1);
  assert.equal(scraper.getSeasonFromPermalink('/show-season_2/'), 2);
  assert.notEqual(scraper.getSeasonFromPermalink('/landman-season-2-2025/'), 1);
});

test('searchAndGetDocument prefers exact imdb hits before season fallback for series', async () => {
  const scraper = new MoviesDriveScraper();
  const requested = [];

  scraper.http.get = async (url) => {
    requested.push(url);

    if (url.includes('/searchapi.php')) {
      return {
        text: JSON.stringify({
          hits: [
            { document: { imdb_id: 'tt0000000', permalink: '/landman-season-1-fake/' } },
            { document: { imdb_id: 'tt14186672', permalink: '/landman-season-2/' } },
            { document: { imdb_id: 'tt14186672', permalink: '/landman-season-1/' } },
          ],
        }),
        status: 200,
      };
    }

    if (url.endsWith('/landman-season-1/')) {
      return {
        text: '<html><body><h1>Landman Season 1</h1></body></html>',
        status: 200,
      };
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await scraper.searchAndGetDocument('tt14186672', 1);
  assert.ok(result);
  assert.equal(result.document.permalink, '/landman-season-1/');
  assert.ok(!requested.some(url => url.endsWith('/landman-season-2/')));
});

test('searchAndGetDocument season title fallback uses document.post_title', async () => {
  const scraper = new MoviesDriveScraper();

  scraper.http.get = async (url) => {
    if (url.includes('/searchapi.php')) {
      return {
        text: JSON.stringify({
          hits: [
            {
              document: {
                imdb_id: 'tt14186672',
                permalink: '/landman-missing-season-slug/',
                post_title: 'Landman (Season 1) Dual Audio',
              },
            },
            {
              document: {
                imdb_id: 'tt14186672',
                permalink: '/landman-other/',
                post_title: 'Landman (Season 2)',
              },
            },
          ],
        }),
        status: 200,
      };
    }

    if (url.endsWith('/landman-missing-season-slug/')) {
      return {
        text: '<html><body><h1>Landman Season 1</h1></body></html>',
        status: 200,
      };
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await scraper.searchAndGetDocument('tt14186672', 1);
  assert.ok(result);
  assert.equal(result.document.permalink, '/landman-missing-season-slug/');
});

test('extractSeriesStreams returns strict final FSL/Pixel links sorted high-to-low quality', async () => {
  const scraper = new MoviesDriveScraper();

  const seasonPageHtml = `
    <main>
      <h5>Season 1 [Hindi - English] 480p x264 [220MB/E]</h5>
      <h5><a href="https://mdrive.lol/archives/65381">480p Single Episode</a></h5>
      <h5><a href="https://mdrive.lol/archives/65387">Zip [2.1GB]</a></h5>
      <h5>Season 1 [Hindi - English] 720p x264 [530MB/E]</h5>
      <h5><a href="https://mdrive.lol/archives/65383">720p Single Episode</a></h5>
      <h5><a href="https://mdrive.lol/archives/65389">Zip [5.2GB]</a></h5>
      <h5>Season 1 [Hindi - English] 1080p x264 [1.1GB/E]</h5>
      <h5><a href="https://mdrive.lol/archives/65385">1080p Single Episode</a></h5>
      <h5><a href="https://mdrive.lol/archives/65391">Zip [11.2GB]</a></h5>
    </main>
  `;

  scraper.searchAndGetDocument = async () => ({
    $: load(seasonPageHtml),
    html: seasonPageHtml,
    document: {
      title: 'Landman (2025) Season 1',
      imdb_id: 'tt14186672',
      permalink: '/landman-season-1/',
    },
  });

  const wrappers = new Map([
    ['https://mdrive.lol/archives/65381', { hubcloudWrapperUrl: 'https://hubcloud.foo/drive/w480', episodeLabel: 'Ep01', episodeFileSize: '216.69 MB' }],
    ['https://mdrive.lol/archives/65383', { hubcloudWrapperUrl: 'https://hubcloud.foo/drive/w720', episodeLabel: 'Ep01', episodeFileSize: '530 MB' }],
    ['https://mdrive.lol/archives/65385', { hubcloudWrapperUrl: 'https://hubcloud.foo/drive/w1080', episodeLabel: 'Ep01', episodeFileSize: '1.1 GB' }],
  ]);

  scraper.extractEpisodeHubCloudFromArchive = async (archiveUrl) => wrappers.get(archiveUrl) || null;

  const hubMeta = new Map([
    [
      'https://hubcloud.foo/drive/w480',
      {
        rawFilename: 'Landman.S01E01.480p.BluRay.Hindi-English.ESub.x264-[Moviesdrives.cv].mkv',
        cleanBaseTitle: 'Landman.S01E01.480p.BluRay.Hindi-English.ESub.x264',
        fileSize: '216.69 MB',
      },
    ],
    [
      'https://hubcloud.foo/drive/w720',
      {
        rawFilename: 'Landman.S01E01.720p.BluRay.Hindi-English.ESub.x264-[Moviesdrives.cv].mkv',
        cleanBaseTitle: 'Landman.S01E01.720p.BluRay.Hindi-English.ESub.x264',
        fileSize: '530 MB',
      },
    ],
    [
      'https://hubcloud.foo/drive/w1080',
      {
        rawFilename: 'Landman.S01E01.1080p.BluRay.Hindi-English.ESub.x264-[Moviesdrives.cv].mkv',
        cleanBaseTitle: 'Landman.S01E01.1080p.BluRay.Hindi-English.ESub.x264',
        fileSize: '1.1 GB',
      },
    ],
  ]);

  scraper.extractHubCloudDriveMetadata = async (wrapperUrl) => hubMeta.get(wrapperUrl) || null;

  scraper.extractors.extractFromUrl = async (wrapperUrl) => {
    const suffix = wrapperUrl.endsWith('w1080') ? '1080' : wrapperUrl.endsWith('w720') ? '720' : '480';
    return [
      {
        url: `https://hub.cooldown.buzz/final${suffix}?token=1`,
        source: 'FSL Server',
        title: '',
      },
      {
        url: `https://pixeldrain.dev/api/file/PIX${suffix}?download`,
        source: 'PixelDrain',
        title: '',
      },
    ];
  };

  const streams = await scraper.extractSeriesStreams('tt14186672', 1, 1);

  assert.equal(streams.length, 6);
  assert.deepEqual(
    streams.map(stream => stream.quality),
    [1080, 1080, 720, 720, 480, 480],
  );
  assert.ok(streams.every(stream => !stream.url.includes('mdrive.lol')));
  assert.ok(streams.every(stream => !stream.url.includes('hubcloud.foo')));

  const titles = streams.map(stream => stream.title);
  assert.ok(
    titles.includes('Landman.S01E01.1080p.BluRay.Hindi-English.ESub.x264 [1.1 GB] [FSL]'),
  );
  assert.ok(
    titles.includes('Landman.S01E01.1080p.BluRay.Hindi-English.ESub.x264 [1.1 GB] [Pixel]'),
  );
  assert.ok(titles.some(title => title.endsWith('[FSL]')));
  assert.ok(titles.some(title => title.endsWith('[Pixel]')));
  assert.ok(titles.some(title => title.includes('[1.1 GB]')));
});

test('extractSeriesStreams omits resolution when HubCloud wrapper is missing', async () => {
  const scraper = new MoviesDriveScraper();

  const seasonPageHtml = `
    <main>
      <h5>Season 1 720p [530MB/E]</h5>
      <h5><a href="https://mdrive.lol/archives/65383">720p Single Episode</a></h5>
      <h5>Season 1 1080p [1.1GB/E]</h5>
      <h5><a href="https://mdrive.lol/archives/65385">1080p Single Episode</a></h5>
    </main>
  `;

  scraper.searchAndGetDocument = async () => ({
    $: load(seasonPageHtml),
    html: seasonPageHtml,
    document: { title: 'Landman Season 1' },
  });

  scraper.extractEpisodeHubCloudFromArchive = async (archiveUrl) => {
    if (archiveUrl.endsWith('65383')) {
      return {
        hubcloudWrapperUrl: 'https://hubcloud.foo/drive/w720',
        episodeLabel: 'Ep01',
        episodeFileSize: '530 MB',
      };
    }
    return null;
  };

  scraper.extractHubCloudDriveMetadata = async () => null;

  scraper.extractors.extractFromUrl = async () => ([
    {
      url: 'https://hub.cooldown.buzz/final720?token=1',
      source: 'FSL Server',
      title: 'Landman.S01E01.720p.WEB-DL.mkv',
    },
  ]);

  const streams = await scraper.extractSeriesStreams('tt14186672', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, 720);
  assert.ok(streams[0].title.includes('[FSL]'));
});
