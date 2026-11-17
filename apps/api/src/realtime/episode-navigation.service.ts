import { Injectable } from '@nestjs/common';
import {
  playbackAssetKey,
  roomTvTitle,
  selectionTitle,
  type PlaybackState,
  type RoomTvEpisode,
} from '@jandi/shared';
import { Errors } from '../common/errors';
import { ExternalSeriesService } from '../catalog/external-series.controller';
import { MovieboxService } from '../catalog/moviebox.controller';
import { TvMetadataService } from '../catalog/tv.service';

type Part = { number: number; id?: number; episodes: Array<{ number: number; id?: number }> };
type Destination = { id: string; label: string; availability: 'listed' };
export type EpisodeNavigation = {
  assetId: string | null;
  previous: Destination | null;
  next: Destination | null;
};

/** Provider identities stay in their own ordering; no cross-provider episode mapping. */
@Injectable()
export class EpisodeNavigationService {
  private cache: { expires: number; parts: Part[] } | null = null;
  private pending: Promise<Part[]> | null = null;
  constructor(
    private readonly external: ExternalSeriesService,
    private readonly moviebox: MovieboxService,
    private readonly tv: TvMetadataService,
  ) {}

  private async kisskhParts(): Promise<Part[]> {
    if (this.cache && this.cache.expires > Date.now()) return this.cache.parts;
    if (!this.pending)
      this.pending = (async () => {
        const result = await this.external.search({ q: 'Money Heist' });
        const matches = result.items.flatMap((item) => {
          const match = item.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim()
            .match(/^money heist(?: (?:season|part) (\d+))?$/);
          return match ? [{ ...item, number: Number(match[1] ?? 1) }] : [];
        });
        if (!matches.length || new Set(matches.map((part) => part.number)).size !== matches.length)
          throw Errors.unavailable(
            'EPISODE_CATALOG_UNAVAILABLE',
            'Episode ordering could not be verified.',
          );
        const parts = await Promise.all(
          matches.map(async (item) => ({
            number: item.number,
            id: item.id,
            episodes: (await this.external.show(String(item.id))).series.episodes.filter(
              (episode) => episode.number > 0,
            ),
          })),
        );
        this.cache = { expires: Date.now() + 120000, parts };
        return parts;
      })().finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  async navigation(state: PlaybackState): Promise<EpisodeNavigation> {
    const assetId = playbackAssetKey(state);
    const current = state.tvEpisode;
    if (current && current.numbering === 'provider') {
      const parts =
        current.provider === 'kisskh' || current.provider === 'kisskh-direct'
          ? await this.kisskhParts()
          : (await this.moviebox.episodes()).seasons;
      return {
        assetId,
        previous: this.adjacent(parts, current, -1),
        next: this.adjacent(parts, current, 1),
      };
    }
    const media = state.externalMedia;
    if (media?.provider === 'vidsrc' && media.type === 'tv') {
      const result = await this.tv.episode(media.tvId, media.season, media.episode);
      const target = (episode: typeof result.next): Destination | null =>
        episode
          ? {
              id: selectionTitle({
                provider: 'vidsrc',
                type: 'tv',
                tvId: media.tvId,
                season: episode.seasonNumber,
                episode: episode.number,
              }),
              label: `S${episode.seasonNumber} E${episode.number}`,
              availability: 'listed',
            }
          : null;
      return { assetId, previous: target(result.previous), next: target(result.next) };
    }
    return { assetId, previous: null, next: null };
  }

  private adjacent(
    parts: Part[],
    current: Extract<RoomTvEpisode, { numbering: 'provider' }>,
    direction: -1 | 1,
  ): Destination | null {
    const sorted = [...parts].sort((a, b) => a.number - b.number);
    const i = sorted.findIndex(
      (part) =>
        part.number === current.season &&
        ((current.provider !== 'kisskh' && current.provider !== 'kisskh-direct') ||
          part.id === current.seriesId),
    );
    if (i < 0)
      throw Errors.unavailable(
        'EPISODE_CATALOG_UNAVAILABLE',
        'Current episode could not be matched to the provider.',
      );
    const part = sorted[i]!;
    const episodes = [...part.episodes].sort((a, b) => a.number - b.number);
    const index = episodes.findIndex(
      (ep) =>
        ep.number === current.episode &&
        ((current.provider !== 'kisskh' && current.provider !== 'kisskh-direct') ||
          ep.id === current.episodeId),
    );
    if (index < 0)
      throw Errors.unavailable(
        'EPISODE_CATALOG_UNAVAILABLE',
        'Current episode could not be matched to the provider.',
      );
    const adjacentPart = episodes[index + direction] ? part : sorted[i + direction];
    if (!adjacentPart) return null;
    if (adjacentPart !== part && adjacentPart.number !== part.number + direction)
      throw Errors.unavailable(
        'EPISODE_CATALOG_UNAVAILABLE',
        'A provider part is missing from the episode list.',
      );
    const list = [...adjacentPart.episodes].sort((a, b) => a.number - b.number);
    const item =
      adjacentPart === part ? episodes[index + direction] : direction === 1 ? list[0] : list.at(-1);
    if (!item)
      throw Errors.unavailable(
        'EPISODE_CATALOG_UNAVAILABLE',
        'The adjacent part has no episode list.',
      );
    let target: RoomTvEpisode;
    if (current.provider === 'kisskh' || current.provider === 'kisskh-direct') {
      if (!adjacentPart.id || !item.id)
        throw Errors.unavailable(
          'EPISODE_CATALOG_UNAVAILABLE',
          'The provider episode identity is missing.',
        );
      target = {
        ...current,
        season: adjacentPart.number,
        episode: item.number,
        seriesId: adjacentPart.id,
        episodeId: item.id,
      };
    } else target = { ...current, season: adjacentPart.number, episode: item.number };
    return {
      id: roomTvTitle(target),
      label: `Part ${target.season}, Episode ${target.episode}`,
      availability: 'listed',
    };
  }
}
