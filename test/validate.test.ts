import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeConfig } from '../src/validate.js';

test('accepts a bare array and fills optional fields', () => {
  const { podcasts, errors } = normalizeConfig([{ slug: 's', name: 'n', episodes: [{ title: 't', mp3Slug: 'e' }] }]);

  assert.deepEqual(errors, []);
  assert.equal(podcasts.length, 1);
  assert.equal(podcasts[0]?.description, '');
  assert.equal(podcasts[0]?.coverUrl, '');
  assert.equal(podcasts[0]?.episodes[0]?.description, '');
  assert.equal(podcasts[0]?.episodes[0]?.coverUrl, '');
});

test('accepts an object wrapper and snake_case keys', () => {
  const { podcasts, errors } = normalizeConfig({
    podcasts: [
      {
        slug: 's',
        name: 'n',
        cover_url: 'https://c/cover.jpg',
        episodes: [{ title: 't', cover_url: 'https://c/ep.jpg', mp3_slug: 'e' }],
      },
    ],
  });

  assert.deepEqual(errors, []);
  assert.equal(podcasts[0]?.coverUrl, 'https://c/cover.jpg');
  assert.equal(podcasts[0]?.episodes[0]?.coverUrl, 'https://c/ep.jpg');
  assert.equal(podcasts[0]?.episodes[0]?.mp3Slug, 'e');
});

test('allows a podcast without episodes', () => {
  const { podcasts, errors } = normalizeConfig([{ slug: 's', name: 'n' }]);
  assert.deepEqual(errors, []);
  assert.deepEqual(podcasts[0]?.episodes, []);
});

test('collects every problem at once', () => {
  const { errors } = normalizeConfig([{ episodes: [{}, { title: 'ok' }] }]);
  assert.ok(errors.length >= 4, `expected several errors, got ${JSON.stringify(errors)}`);
  assert.ok(errors.some((e) => e.startsWith('podcasts[0].slug')));
  assert.ok(errors.some((e) => e.startsWith('podcasts[0].name')));
  assert.ok(errors.some((e) => e.includes('episodes[0].title')));
  assert.ok(errors.some((e) => e.includes('episodes[0].mp3Slug')));
  assert.ok(errors.some((e) => e.includes('episodes[1].mp3Slug')));
});

test('rejects non-array input', () => {
  assert.ok(normalizeConfig('nope').errors.length > 0);
  assert.ok(normalizeConfig({}).errors.length > 0);
  assert.ok(normalizeConfig(null).errors.length > 0);
});
