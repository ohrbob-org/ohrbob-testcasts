import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';

import { createApp } from '../src/app.js';
import { Store } from '../src/store.js';

const CONFIG = [
  {
    slug: 'my-show',
    name: 'My Show',
    coverUrl: 'https://example.com/show.jpg',
    description: 'A show for testing',
    episodes: [
      { title: 'Episode One', description: 'First', coverUrl: 'https://example.com/ep1.jpg', mp3Slug: 'ep-1' },
      { title: 'Episode Two', description: 'Second', coverUrl: '', mp3Slug: 'ep-2' },
    ],
  },
];

function startServer(t: TestContext) {
  const store = new Store();
  const app = createApp(store, { baseUrl: 'http://test.local' });
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;

  t.after(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );

  return { base: `http://127.0.0.1:${port}`, store };
}

function postConfig(base: string, body: unknown) {
  return fetch(`${base}/config`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('reports health with no configuration', async (t) => {
  const { base } = startServer(t);
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok', podcasts: 0, episodes: 0 });
});

test('accepts a config and serves the feed and audio', async (t) => {
  const { base } = startServer(t);

  const posted = await postConfig(base, CONFIG);
  assert.equal(posted.status, 200);
  assert.deepEqual(await posted.json(), { ok: true, podcasts: 1, episodes: 2 });

  const feedRes = await fetch(`${base}/my-show.rss`);
  assert.equal(feedRes.status, 200);
  assert.match(feedRes.headers.get('content-type') ?? '', /application\/rss\+xml/);
  const xml = await feedRes.text();
  assert.match(xml, /<title>My Show<\/title>/);
  assert.match(xml, /url="http:\/\/test\.local\/ep-1"/);

  const audioRes = await fetch(`${base}/ep-1`);
  assert.equal(audioRes.status, 200);
  assert.equal(audioRes.headers.get('content-type'), 'audio/mpeg');
  assert.equal(audioRes.headers.get('accept-ranges'), 'bytes');
  const audio = Buffer.from(await audioRes.arrayBuffer());
  assert.equal(Number(audioRes.headers.get('content-length')), audio.length);
  assert.deepEqual([...audio.subarray(0, 4)], [0xff, 0xfb, 0x90, 0x00]);

  const health = await (await fetch(`${base}/health`)).json();
  assert.deepEqual(health, { status: 'ok', podcasts: 1, episodes: 2 });
});

test('supports HEAD and byte-range requests on audio', async (t) => {
  const { base } = startServer(t);
  await postConfig(base, CONFIG);

  const head = await fetch(`${base}/ep-1`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.ok(Number(head.headers.get('content-length')) > 1_000_000);

  const ranged = await fetch(`${base}/ep-1`, { headers: { range: 'bytes=0-99' } });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get('content-range'), 'bytes 0-99/1915698');
  assert.equal(ranged.headers.get('content-length'), '100');
  assert.equal((await ranged.arrayBuffer()).byteLength, 100);

  const suffix = await fetch(`${base}/ep-1`, { headers: { range: 'bytes=-10' } });
  assert.equal(suffix.status, 206);
  assert.equal((await suffix.arrayBuffer()).byteLength, 10);

  const bad = await fetch(`${base}/ep-1`, { headers: { range: 'bytes=99999999-' } });
  assert.equal(bad.status, 416);
});

test('serves each episode at its configured length', async (t) => {
  const { base } = startServer(t);
  await postConfig(base, [
    {
      slug: 'sized',
      name: 'Sized',
      episodes: [
        { title: 'Short', mp3Slug: 'short', durationSeconds: 30 },
        { title: 'Default', mp3Slug: 'default' },
      ],
    },
  ]);

  const short = await fetch(`${base}/short`);
  assert.equal(short.headers.get('content-length'), '478716');

  const shortHead = await fetch(`${base}/short`, { method: 'HEAD' });
  assert.equal(shortHead.headers.get('content-length'), '478716');

  const fallback = await fetch(`${base}/default`);
  assert.equal(fallback.headers.get('content-length'), '1915698');

  const xml = await (await fetch(`${base}/sized.rss`)).text();
  assert.match(xml, /url="http:\/\/test\.local\/short" length="478716"/);
  assert.match(xml, /url="http:\/\/test\.local\/default" length="1915698"/);
  assert.match(xml, /<itunes:duration>30<\/itunes:duration>/);
  assert.match(xml, /<itunes:duration>120<\/itunes:duration>/);
});

test('honours a configured pubDate', async (t) => {
  const { base } = startServer(t);
  await postConfig(base, [
    {
      slug: 'dated',
      name: 'Dated Show',
      pubDate: '2023-05-10T12:00:00Z',
      episodes: [
        { title: 'New', mp3Slug: 'new' },
        { title: 'Old', mp3Slug: 'old' },
      ],
    },
  ]);

  const xml = await (await fetch(`${base}/dated.rss`)).text();
  assert.match(xml, /<pubDate>Wed, 10 May 2023 12:00:00 GMT<\/pubDate>/);
  assert.match(xml, /<pubDate>Tue, 09 May 2023 12:00:00 GMT<\/pubDate>/);
});

test('a later config replaces the previous one', async (t) => {
  const { base } = startServer(t);
  await postConfig(base, CONFIG);
  await postConfig(base, [
    { slug: 'other', name: 'Other', coverUrl: '', description: '', episodes: [{ title: 'Solo', description: '', coverUrl: '', mp3Slug: 'only' }] },
  ]);

  assert.equal((await fetch(`${base}/my-show.rss`)).status, 404);
  assert.equal((await fetch(`${base}/ep-1`)).status, 404);
  assert.equal((await fetch(`${base}/other.rss`)).status, 200);
  assert.equal((await fetch(`${base}/only`)).status, 200);
});

test('rejects invalid configurations with details', async (t) => {
  const { base } = startServer(t);

  const missingFields = await postConfig(base, [{ name: 'No slug', episodes: [{ description: 'no title' }] }]);
  assert.equal(missingFields.status, 400);
  const body = (await missingFields.json()) as { error: string; details: string[] };
  assert.equal(body.error, 'Invalid configuration');
  assert.ok(body.details.some((d) => d.includes('slug')));
  assert.ok(body.details.some((d) => d.includes('mp3Slug')));

  const duplicates = await postConfig(base, [
    { slug: 'a', name: 'A', episodes: [{ title: 'One', mp3Slug: 'dup' }] },
    { slug: 'b', name: 'B', episodes: [{ title: 'Two', mp3Slug: 'dup' }] },
  ]);
  assert.equal(duplicates.status, 400);
  assert.match(JSON.stringify(await duplicates.json()), /Duplicate episode mp3Slug/);

  const duplicatePodcasts = await postConfig(base, [
    { slug: 'same', name: 'One', episodes: [] },
    { slug: 'same', name: 'Two', episodes: [] },
  ]);
  assert.equal(duplicatePodcasts.status, 400);

  // Nothing was stored by the failed posts.
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal(((await (await fetch(`${base}/health`)).json()) as { podcasts: number }).podcasts, 0);
});

test('rejects malformed JSON', async (t) => {
  const { base } = startServer(t);
  const res = await postConfig(base, '{ not json');
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Invalid JSON body' });
});

test('returns 404 for unknown slugs and paths', async (t) => {
  const { base } = startServer(t);
  await postConfig(base, CONFIG);

  assert.equal((await fetch(`${base}/nope.rss`)).status, 404);
  assert.equal((await fetch(`${base}/nope`)).status, 404);
  assert.equal((await fetch(`${base}/some/deep/path`)).status, 404);
});

test('serves a text index at the root', async (t) => {
  const { base } = startServer(t);
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /POST \/config/);
});
