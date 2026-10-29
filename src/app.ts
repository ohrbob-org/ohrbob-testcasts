import express, { type NextFunction, type Request, type Response } from 'express';

import { buildRss } from './rss.js';
import { silenceMp3 } from './silence.js';
import { Store } from './store.js';
import { normalizeConfig } from './validate.js';

export interface AppOptions {
  /** Fixed base URL for enclosure links. Defaults to PUBLIC_BASE_URL, else the request host. */
  baseUrl?: string;
}

/** Serve a buffer with byte-range support so podcast clients can seek/resume. */
function sendAudio(req: Request, res: Response, audio: Buffer): void {
  const total = audio.length;
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', 'audio/mpeg');

  const range = req.headers.range;
  const match = typeof range === 'string' ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;

  if (match) {
    const rawStart = match[1] ?? '';
    const rawEnd = match[2] ?? '';
    let start = rawStart === '' ? undefined : Number.parseInt(rawStart, 10);
    let end = rawEnd === '' ? undefined : Number.parseInt(rawEnd, 10);

    if (start === undefined && end !== undefined) {
      // Suffix range: last N bytes.
      start = Math.max(0, total - end);
      end = total - 1;
    } else {
      start = start ?? 0;
      end = end === undefined || end >= total ? total - 1 : end;
    }

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
      res.status(416);
      res.setHeader('Content-Range', `bytes */${total}`);
      res.end();
      return;
    }

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', String(end - start + 1));
    res.end(audio.subarray(start, end + 1));
    return;
  }

  res.setHeader('Content-Length', String(total));
  res.end(audio);
}

export function createApp(store: Store, options: AppOptions = {}): express.Express {
  const app = express();
  app.set('trust proxy', true);
  app.set('x-powered-by', false);
  app.use(express.json({ limit: '10mb' }));

  function resolveBaseUrl(req: Request): string {
    const configured = options.baseUrl ?? process.env.PUBLIC_BASE_URL;
    if (configured) {
      return configured.replace(/\/+$/, '');
    }
    return `${req.protocol}://${req.get('host')}`;
  }

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', podcasts: store.podcastCount(), episodes: store.episodeCount() });
  });

  app.post('/config', (req: Request, res: Response) => {
    const { podcasts, errors } = normalizeConfig(req.body);
    if (errors.length > 0) {
      res.status(400).json({ error: 'Invalid configuration', details: errors });
      return;
    }
    console.log(`Loaded ${podcasts.length} podcasts with ${podcasts.reduce((count, p) => count + p.episodes.length, 0)} episodes`);
    store.setConfig(podcasts);
    res.json({
      ok: true,
      podcasts: podcasts.length,
      episodes: podcasts.reduce((count, podcast) => count + podcast.episodes.length, 0),
    });
  });

  app.get(/^\/(.+)\.rss$/, (req: Request, res: Response) => {
    const slug = decodeURIComponent(String(req.params[0]));
    const podcast = store.getPodcast(slug);
    if (!podcast) {
      res.status(404).json({ error: `No podcast configured with slug "${slug}"` });
      return;
    }

    const xml = buildRss(podcast, {
      baseUrl: resolveBaseUrl(req),
      pubDateBase: podcast.pubDate ? new Date(podcast.pubDate) : store.updatedAt(),
    });

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(xml);
  });

  app.get('/:slug', (req: Request, res: Response) => {
    const slug = decodeURIComponent(req.params.slug ?? '');
    const ref = store.getEpisode(slug);
    if (!ref) {
      res.status(404).json({ error: `No episode configured with mp3Slug "${slug}"` });
      return;
    }
    sendAudio(req, res, silenceMp3(ref.episode.durationSeconds));
  });

  app.get('/', (_req: Request, res: Response) => {
    res.type('text/plain').send(
      [
        'podcast-testcasts',
        '',
        'POST /config                     set the podcast configuration (JSON)',
        'GET  /{podcast-slug}.rss         synthesized RSS feed',
        'GET  /{episode-mp3-slug}         silent MP3, per-episode length (128 kbit/s stereo)',
        'GET  /health                     status',
        '',
        `Configured podcasts: ${store.podcastCount()} (episodes: ${store.episodeCount()})`,
      ].join('\n'),
    );
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const isBadJson =
      err instanceof SyntaxError || (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed');
    if (isBadJson) {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
