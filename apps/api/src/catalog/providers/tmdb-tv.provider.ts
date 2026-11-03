import { z } from 'zod';
import { upstreamUnavailable, type TmdbClient } from './tmdb.client';
import { slugify } from './tmdb.mapper';

const imagePath = z
  .string()
  .regex(/^\/[a-zA-Z0-9_-]+\.(jpg|png)$/)
  .nullable()
  .optional();
const basic = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  original_name: z.string().nullable().optional(),
  overview: z
    .string()
    .nullish()
    .transform((value) => value ?? ''),
  poster_path: imagePath,
  backdrop_path: imagePath,
  first_air_date: z.string().nullable().optional(),
  adult: z.boolean().optional(),
});
const season = z.object({
  season_number: z.number().int().nonnegative(),
  name: z.string(),
  episode_count: z.number().int().nonnegative(),
  overview: z
    .string()
    .nullish()
    .transform((value) => value ?? ''),
  poster_path: imagePath,
});
const detail = basic.extend({
  seasons: z.array(season),
  genres: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
  vote_average: z.number().nullable().optional(),
  vote_count: z.number().nullable().optional(),
  original_language: z.string().nullable().optional(),
  production_companies: z.array(z.object({ name: z.string() })).optional(),
  credits: z
    .object({ cast: z.array(z.object({ name: z.string(), character: z.string().optional() })) })
    .optional(),
});
const episode = z.object({
  id: z.number().int(),
  episode_number: z.number().int(),
  season_number: z.number().int(),
  name: z.string(),
  overview: z
    .string()
    .nullish()
    .transform((value) => value ?? ''),
  still_path: imagePath,
  air_date: z.string().nullable().optional(),
  runtime: z.number().nullable().optional(),
});
const picture = (path: string | null | undefined, size: 'w500' | 'w1280') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
const mapBasic = (item: z.infer<typeof basic>) => ({
  id: item.id,
  title: item.name,
  originalTitle: item.original_name ?? null,
  overview: item.overview,
  posterUrl: picture(item.poster_path, 'w500'),
  backdropUrl: picture(item.backdrop_path, 'w1280'),
  firstAirDate: item.first_air_date || null,
});
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw upstreamUnavailable('The movie database returned an unexpected response.');
  return parsed.data;
}

/** Metadata only: external IDs never grant permission or create playable assets. */
export class TmdbTvProvider {
  constructor(private readonly client: TmdbClient) {}
  async genres() {
    const data = parse(
      z.object({
        genres: z.array(z.object({ id: z.number().int().positive(), name: z.string() })),
      }),
      await this.client.get<unknown>('/genre/tv/list', { language: 'en-US' }),
    );
    return data.genres.map((genre) => ({ ...genre, slug: slugify(genre.name) }));
  }
  async byGenre(slug: string, page: number) {
    const genre = (await this.genres()).find((item) => item.slug === slug);
    if (!genre) return { items: [], page, totalPages: 0 };
    const data = parse(
      z.object({ results: z.array(basic), page: z.number(), total_pages: z.number() }),
      await this.client.get<unknown>('/discover/tv', {
        with_genres: genre.id,
        language: 'en-US',
        include_adult: 'false',
        page,
        sort_by: 'popularity.desc',
      }),
    );
    return {
      items: data.results.filter((item) => !item.adult).map(mapBasic),
      page: data.page,
      totalPages: Math.min(data.total_pages, 500),
    };
  }
  async popular(page: number) {
    const result = parse(
      z.object({ results: z.array(basic), page: z.number(), total_pages: z.number() }),
      await this.client.get<unknown>('/tv/popular', { page, language: 'en-US' }),
    );
    return {
      items: result.results.filter((item) => !item.adult).map(mapBasic),
      page: result.page,
      totalPages: Math.min(result.total_pages, 500),
    };
  }
  async search(q: string, page: number) {
    const result = parse(
      z.object({ results: z.array(basic), page: z.number(), total_pages: z.number() }),
      await this.client.get<unknown>('/search/tv', {
        query: q,
        page,
        language: 'en-US',
        include_adult: 'false',
      }),
    );
    return {
      items: result.results.filter((item) => !item.adult).map(mapBasic),
      page: result.page,
      totalPages: Math.min(result.total_pages, 500),
    };
  }
  async detail(id: number) {
    const result = parse(
      detail,
      await this.client.get<unknown>(`/tv/${id}`, {
        language: 'en-US',
        append_to_response: 'credits',
      }),
    );
    if (result.adult) throw upstreamUnavailable('This title is not available.');
    return {
      ...mapBasic(result),
      seasons: result.seasons.map((s) => ({ ...s, posterUrl: picture(s.poster_path, 'w500') })),
      cast: result.credits?.cast.slice(0, 15) ?? [],
      genres: result.genres?.map((g) => g.name) ?? [],
      rating: result.vote_average ?? null,
      voteCount: result.vote_count ?? null,
      originalLanguage: result.original_language ?? null,
      productionCompanies: result.production_companies?.map((company) => company.name) ?? [],
      playback: 'UNAVAILABLE' as const,
    };
  }
  async season(id: number, number: number) {
    const result = parse(
      z.object({
        name: z.string(),
        overview: z
          .string()
          .nullish()
          .transform((value) => value ?? ''),
        episodes: z.array(episode),
      }),
      await this.client.get<unknown>(`/tv/${id}/season/${number}`, { language: 'en-US' }),
    );
    return {
      name: result.name,
      overview: result.overview,
      episodes: result.episodes
        .map((item) => ({
          id: item.id,
          number: item.episode_number,
          seasonNumber: item.season_number,
          title: item.name,
          overview: item.overview,
          airDate: item.air_date || null,
          runtimeMin: item.runtime ?? null,
          stillUrl: picture(item.still_path, 'w500'),
          playable: false,
        }))
        .sort((a, b) => a.number - b.number),
    };
  }
}
