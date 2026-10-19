import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRss } from '../src/rss.js';
import type { Podcast } from '../src/types.js';

const podcast: Podcast = {
  slug: 'my-show',
  name: 'My Show',
  coverUrl: 'https://example.com/show.jpg',
  description: 'A show for testing',
  episodes: [
    { title: 'Episode One', description: 'First', coverUrl: 'https://example.com/ep1.jpg', mp3Slug: 'ep-1', durationSeconds: 120 },
    { title: 'Episode Two', description: 'Second', coverUrl: '', mp3Slug: 'ep-2', durationSeconds: 30 },
  ],
};

const options = {
  baseUrl: 'http://localhost:3000',
  pubDateBase: new Date('2024-01-02T12:00:00Z'),
};

test('builds a valid RSS 2.0 feed with iTunes extensions', () => {
  const xml = buildRss(podcast, options);

  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<rss version="2\.0" xmlns:itunes="http:\/\/www\.itunes\.com\/dtds\/podcast-1\.0\.dtd"/);
  assert.match(xml, /<title>My Show<\/title>/);
  assert.match(xml, /<description>A show for testing<\/description>/);
  assert.match(xml, /<itunes:image href="https:\/\/example\.com\/show\.jpg" \/>/);
  assert.match(xml, /<atom:link href="http:\/\/localhost:3000\/my-show\.rss" rel="self"/);
});

test('emits one item per episode with a self-hosted enclosure', () => {
  const xml = buildRss(podcast, options);

  assert.equal((xml.match(/<item>/g) ?? []).length, 2);
  assert.match(xml, /<enclosure url="http:\/\/localhost:3000\/ep-1" length="1915698" type="audio\/mpeg" \/>/);
  assert.match(xml, /<enclosure url="http:\/\/localhost:3000\/ep-2" length="478716" type="audio\/mpeg" \/>/);
  assert.match(xml, /<itunes:duration>120<\/itunes:duration>/);
  assert.match(xml, /<itunes:duration>30<\/itunes:duration>/);
  assert.match(xml, /<guid isPermaLink="false">http:\/\/localhost:3000\/ep-1<\/guid>/);
});

test('falls back to the podcast cover when an episode has none', () => {
  const xml = buildRss(podcast, options);
  assert.match(xml, /<itunes:image href="https:\/\/example\.com\/show\.jpg" \/>\s*<itunes:duration>30<\/itunes:duration>/);
});

test('orders episodes newest first by one day', () => {
  const xml = buildRss(podcast, options);
  assert.match(xml, /<pubDate>Tue, 02 Jan 2024 12:00:00 GMT<\/pubDate>/);
  assert.match(xml, /<pubDate>Mon, 01 Jan 2024 12:00:00 GMT<\/pubDate>/);
});

test('escapes XML special characters', () => {
  const nasty: Podcast = {
    ...podcast,
    name: 'Tom & Jerry <Show>',
    description: 'Quotes "here" and \'there\'',
    episodes: [{ title: 'A & B', description: '<b>bold</b>', coverUrl: '', mp3Slug: 'x', durationSeconds: 120 }],
  };
  const xml = buildRss(nasty, options);

  assert.match(xml, /<title>Tom &amp; Jerry &lt;Show&gt;<\/title>/);
  assert.match(xml, /Quotes &quot;here&quot; and &apos;there&apos;/);
  assert.match(xml, /<title>A &amp; B<\/title>/);
  assert.match(xml, /<description>&lt;b&gt;bold&lt;\/b&gt;<\/description>/);
});
