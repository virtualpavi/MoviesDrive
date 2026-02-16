import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSeriesRouteId, parseSeasonEpisode } from '../src/serializer.js';

test('parseSeriesRouteId parses imdb-only id', () => {
  const parsed = parseSeriesRouteId('tt14186672');
  assert.deepEqual(parsed, {
    imdbId: 'tt14186672',
    season: null,
    episode: null,
  });
});

test('parseSeriesRouteId parses imdb:season:episode tuple', () => {
  const parsed = parseSeriesRouteId('tt14186672:1:2');
  assert.deepEqual(parsed, {
    imdbId: 'tt14186672',
    season: 1,
    episode: 2,
  });
});

test('parseSeasonEpisode prefers route tuple defaults over query params', () => {
  const parsed = parseSeasonEpisode(
    { season: '9', episode: '10' },
    { season: 1, episode: 2 },
  );

  assert.deepEqual(parsed, { season: 1, episode: 2 });
});

test('parseSeasonEpisode falls back to query and then 1', () => {
  assert.deepEqual(parseSeasonEpisode({ season: '3', episode: '4' }), {
    season: 3,
    episode: 4,
  });

  assert.deepEqual(parseSeasonEpisode({}), {
    season: 1,
    episode: 1,
  });
});
