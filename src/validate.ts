import { MAX_DURATION_SECONDS, SILENCE_DURATION_SECONDS } from './silence.js';
import type { Episode, Podcast } from './types.js';

export interface NormalizeResult {
  podcasts: Podcast[];
  errors: string[];
}

type Dict = Record<string, unknown>;

function isDict(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

/** First non-empty value among the given keys. Accepts camelCase and snake_case spellings. */
function pick(source: Dict, keys: string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

/** Parse a number of seconds from a number or a numeric string. */
function asDuration(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

const SLUG_KEYS = ['slug', 'id', 'key'];
const NAME_KEYS = ['name', 'title'];
const DESCRIPTION_KEYS = ['description', 'desc', 'summary', 'subtitle'];
const COVER_KEYS = ['coverUrl', 'cover_url', 'cover', 'imageUrl', 'image_url', 'image', 'artworkUrl', 'artwork_url', 'artwork'];
const EPISODE_SLUG_KEYS = ['mp3Slug', 'mp3_slug', 'audioSlug', 'audio_slug', 'episodeMp3Slug', 'episode_mp3_slug', 'mp3', 'audio', 'file'];
const EPISODE_KEYS = ['episodes', 'items', 'episode'];
const DURATION_KEYS = ['durationSeconds', 'duration_seconds', 'lengthSeconds', 'length_seconds', 'duration', 'length'];

function normalizeEpisode(value: unknown, path: string, errors: string[]): Episode | undefined {
  if (!isDict(value)) {
    errors.push(`${path} must be an object`);
    return undefined;
  }

  const title = asString(pick(value, NAME_KEYS));
  if (!title) {
    errors.push(`${path}.title is required and must be a non-empty string`);
  }

  const mp3Slug = asString(pick(value, EPISODE_SLUG_KEYS));
  if (!mp3Slug) {
    errors.push(`${path}.mp3Slug is required and must be a non-empty string`);
  }

  let durationSeconds = SILENCE_DURATION_SECONDS;
  let durationValid = true;
  const rawDuration = pick(value, DURATION_KEYS);
  if (rawDuration !== undefined) {
    const parsed = asDuration(rawDuration);
    if (parsed === undefined || parsed <= 0 || parsed > MAX_DURATION_SECONDS) {
      errors.push(`${path}.durationSeconds must be a positive number of seconds no greater than ${MAX_DURATION_SECONDS}`);
      durationValid = false;
    } else {
      durationSeconds = parsed;
    }
  }

  if (!title || !mp3Slug || !durationValid) {
    return undefined;
  }

  return {
    title,
    mp3Slug,
    durationSeconds,
    description: asString(pick(value, DESCRIPTION_KEYS)) ?? '',
    coverUrl: asString(pick(value, COVER_KEYS)) ?? '',
  };
}

function normalizePodcast(value: unknown, index: number, errors: string[]): Podcast | undefined {
  const path = `podcasts[${index}]`;
  if (!isDict(value)) {
    errors.push(`${path} must be an object`);
    return undefined;
  }

  const slug = asString(pick(value, SLUG_KEYS));
  if (!slug) {
    errors.push(`${path}.slug is required and must be a non-empty string`);
  }

  const name = asString(pick(value, NAME_KEYS));
  if (!name) {
    errors.push(`${path}.name is required and must be a non-empty string`);
  }

  const rawEpisodes = pick(value, EPISODE_KEYS);
  const episodes: Episode[] = [];
  if (rawEpisodes === undefined) {
    // No episodes is allowed; the feed will simply be empty.
  } else if (Array.isArray(rawEpisodes)) {
    rawEpisodes.forEach((episode, i) => {
      const normalized = normalizeEpisode(episode, `${path}.episodes[${i}]`, errors);
      if (normalized) {
        episodes.push(normalized);
      }
    });
  } else {
    errors.push(`${path}.episodes must be an array`);
  }

  if (!slug || !name) {
    return undefined;
  }

  return {
    slug,
    name,
    episodes,
    description: asString(pick(value, DESCRIPTION_KEYS)) ?? '',
    coverUrl: asString(pick(value, COVER_KEYS)) ?? '',
  };
}

/**
 * Normalize and validate a posted configuration.
 *
 * Accepts either a bare array of podcasts or an object with a `podcasts`
 * property. Unknown fields are ignored; missing optional fields default to ''.
 * Every problem found is collected so a caller can fix them all at once.
 */
export function normalizeConfig(body: unknown): NormalizeResult {
  const errors: string[] = [];

  let rawPodcasts: unknown;
  if (Array.isArray(body)) {
    rawPodcasts = body;
  } else if (isDict(body)) {
    rawPodcasts = pick(body, ['podcasts', 'shows', 'feeds']);
  } else {
    errors.push('Request body must be a JSON array of podcasts or an object with a "podcasts" array');
    return { podcasts: [], errors };
  }

  if (rawPodcasts === undefined) {
    errors.push('No podcasts found. Send a JSON array of podcasts (or {"podcasts": [...]})');
    return { podcasts: [], errors };
  }

  if (!Array.isArray(rawPodcasts)) {
    errors.push('"podcasts" must be an array');
    return { podcasts: [], errors };
  }

  const podcasts: Podcast[] = [];
  rawPodcasts.forEach((podcast, index) => {
    const normalized = normalizePodcast(podcast, index, errors);
    if (normalized) {
      podcasts.push(normalized);
    }
  });

  const seenPodcastSlugs = new Set<string>();
  for (const podcast of podcasts) {
    if (seenPodcastSlugs.has(podcast.slug)) {
      errors.push(`Duplicate podcast slug "${podcast.slug}"`);
    }
    seenPodcastSlugs.add(podcast.slug);
  }

  const seenEpisodeSlugs = new Set<string>();
  for (const podcast of podcasts) {
    for (const episode of podcast.episodes) {
      if (seenEpisodeSlugs.has(episode.mp3Slug)) {
        errors.push(`Duplicate episode mp3Slug "${episode.mp3Slug}" (episode slugs must be unique across all podcasts)`);
      }
      seenEpisodeSlugs.add(episode.mp3Slug);
    }
  }

  return { podcasts, errors };
}
