import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Errors } from '../common/errors';
import type { TmdbTvProvider } from './providers/tmdb-tv.provider';

export const TV_PROVIDER = Symbol('TV_PROVIDER');
@Injectable()
export class TvMetadataService {
  constructor(@Inject(TV_PROVIDER) private readonly provider: TmdbTvProvider | null) {}
  private requireProvider() {
    if (!this.provider)
      throw Errors.unavailable(
        'TV_METADATA_NOT_CONFIGURED',
        'TV discovery needs TMDB credentials.',
      );
    return this.provider;
  }
  search(q: string, page: number) {
    return this.requireProvider().search(q, page);
  }
  popular(page: number) {
    return this.requireProvider().popular(page);
  }
  async genres() {
    return { items: await this.requireProvider().genres() };
  }
  byGenre(slug: string, page: number) {
    return this.requireProvider().byGenre(slug, page);
  }
  async detail(id: number) {
    return { series: await this.requireProvider().detail(id) };
  }
  async season(id: number, number: number) {
    return { season: await this.requireProvider().season(id, number) };
  }
  async episode(id: number, seasonNumber: number, episodeNumber: number) {
    const provider = this.requireProvider();
    const season = await provider.season(id, seasonNumber);
    const index = season.episodes.findIndex((item) => item.number === episodeNumber);
    if (index < 0) throw Errors.notFound('Episode');
    let previous = season.episodes[index - 1] ?? null;
    let next = season.episodes[index + 1] ?? null;
    // Specials (season 0) form their own sequence; never insert them between regular seasons.
    if (seasonNumber !== 0 && (!previous || !next)) {
      const detail = await provider.detail(id);
      const numbers = detail.seasons
        .filter((s) => s.season_number > 0 && s.episode_count > 0)
        .map((s) => s.season_number)
        .sort((a, b) => a - b);
      const findAdjacent = async (candidates: number[], last: boolean) => {
        for (const number of candidates) {
          try {
            const adjacent = await provider.season(id, number);
            const item = last ? adjacent.episodes.at(-1) : adjacent.episodes[0];
            if (item) return item;
          } catch (error) {
            if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND)
              continue;
            throw error;
          }
        }
        return null;
      };
      [previous, next] = await Promise.all([
        previous ?? findAdjacent(numbers.filter((n) => n < seasonNumber).reverse(), true),
        next ??
          findAdjacent(
            numbers.filter((n) => n > seasonNumber),
            false,
          ),
      ]);
    }
    return {
      episode: season.episodes[index],
      previous,
      next,
    };
  }
}
