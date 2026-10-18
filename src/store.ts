import type { Episode, Podcast } from './types.js';

export interface EpisodeRef {
  podcast: Podcast;
  episode: Episode;
}

/** In-memory configuration store. Replaced wholesale on every POST /config. */
export class Store {
  private podcasts = new Map<string, Podcast>();
  private episodes = new Map<string, EpisodeRef>();
  private updated = new Date(0);

  setConfig(podcasts: Podcast[]): void {
    this.podcasts.clear();
    this.episodes.clear();

    for (const podcast of podcasts) {
      this.podcasts.set(podcast.slug, podcast);
      for (const episode of podcast.episodes) {
        // Episode slugs are validated as globally unique, so no clobbering here.
        this.episodes.set(episode.mp3Slug, { podcast, episode });
      }
    }

    this.updated = new Date();
  }

  getPodcast(slug: string): Podcast | undefined {
    return this.podcasts.get(slug);
  }

  getEpisode(slug: string): EpisodeRef | undefined {
    return this.episodes.get(slug);
  }

  podcastCount(): number {
    return this.podcasts.size;
  }

  episodeCount(): number {
    return this.episodes.size;
  }

  /** Timestamp of the most recent config, used as the base for episode pubDates. */
  updatedAt(): Date {
    return this.updated;
  }
}
