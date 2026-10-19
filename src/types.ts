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
  episodes: Episode[];
}
