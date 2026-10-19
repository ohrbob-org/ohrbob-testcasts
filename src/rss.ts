import { silenceByteLength } from './silence.js';
import type { Podcast } from './types.js';

export interface RssOptions {
  /** Absolute base URL of this service, without a trailing slash. */
  baseUrl: string;
  /** Newest episode's publication date; earlier episodes step back one day each. */
  pubDateBase: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      default:
        return '&quot;';
    }
  });
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Synthesize an RSS 2.0 feed with the iTunes podcast extensions for one
 * podcast. Enclosure URLs point back at this service, so the feed is
 * self-contained regardless of where the cover images live.
 */
export function buildRss(podcast: Podcast, options: RssOptions): string {
  const base = stripTrailingSlash(options.baseUrl);
  const podcastSlug = encodeURIComponent(podcast.slug);
  const feedUrl = `${base}/${podcastSlug}.rss`;
  const websiteUrl = `${base}/${podcastSlug}`;
  const image = podcast.coverUrl;

  const items = podcast.episodes.map((episode, index) => {
    const enclosureUrl = `${base}/${encodeURIComponent(episode.mp3Slug)}`;
    const pubDate = new Date(options.pubDateBase.getTime() - index * DAY_MS).toUTCString();
    const episodeImage = episode.coverUrl || image;
    const enclosureLength = silenceByteLength(episode.durationSeconds);
    const lines = [
      '    <item>',
      `      <title>${escapeXml(episode.title)}</title>`,
      `      <description>${escapeXml(episode.description)}</description>`,
      `      <link>${escapeXml(enclosureUrl)}</link>`,
      `      <guid isPermaLink="false">${escapeXml(enclosureUrl)}</guid>`,
      `      <pubDate>${pubDate}</pubDate>`,
      `      <enclosure url="${escapeXml(enclosureUrl)}" length="${enclosureLength}" type="audio/mpeg" />`,
      episodeImage ? `      <itunes:image href="${escapeXml(episodeImage)}" />` : undefined,
      `      <itunes:duration>${episode.durationSeconds}</itunes:duration>`,
      '      <itunes:explicit>false</itunes:explicit>',
      '    </item>',
    ].filter((line): line is string => line !== undefined);
    return lines.join('\n');
  });

  const channel = [
    '  <channel>',
    `    <title>${escapeXml(podcast.name)}</title>`,
    `    <link>${escapeXml(websiteUrl)}</link>`,
    `    <description>${escapeXml(podcast.description)}</description>`,
    '    <language>en</language>',
    '    <generator>podcast-testcasts</generator>',
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    `    <itunes:summary>${escapeXml(podcast.description)}</itunes:summary>`,
    `    <itunes:author>${escapeXml(podcast.name)}</itunes:author>`,
    '    <itunes:explicit>false</itunes:explicit>',
    image ? `    <itunes:image href="${escapeXml(image)}" />` : undefined,
    image
      ? `    <image>\n      <url>${escapeXml(image)}</url>\n      <title>${escapeXml(podcast.name)}</title>\n      <link>${escapeXml(websiteUrl)}</link>\n    </image>`
      : undefined,
    '    <itunes:category text="Technology" />',
    ...items,
    '  </channel>',
  ].filter((line): line is string => line !== undefined);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">',
    ...channel,
    '</rss>',
    '',
  ].join('\n');
}
