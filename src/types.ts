export interface Episode {
  /** Title shown in the podcast client. */
  title: string;
  /** Episode description / show notes. */
  description: string;
  /** Cover image URL for this episode. Falls back to the podcast cover when empty. */
  coverUrl: string;
  /** Globally unique slug. Served at GET /{mp3Slug} as a silent MP3. */
  mp3Slug: string;
  /** Length of the served silent MP3 in seconds. Defaults to 120. */
  durationSeconds: number;
  /** Optional base publishing date for this episode. */
  pubDate?: string;
}

export interface Podcast {
  /** Unique slug. The feed is served at GET /{slug}.rss */
  slug: string;
  /** Podcast name. */
  name: string;
  /** Cover image URL for the podcast. */
  coverUrl: string;
  /** Podcast description / summary. */
  description: string;
  /** Optional base publishing date for episodes. If missing, defaults to the time the config was loaded. */
  pubDate?: string;
  episodes: Episode[];
}
