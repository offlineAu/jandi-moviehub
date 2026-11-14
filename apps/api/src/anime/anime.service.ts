import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/app-config';
import { InjectRedis } from '../redis/redis.module';
import { Errors } from '../common/errors';
import { adapterConfigSchema, resolveStreams, type SourceCandidate } from './source-adapter';

@Injectable()
export class AnimeService {
  private readonly jobs = new Map<
    string,
    {
      state: 'pending' | 'ready' | 'missing' | 'unavailable';
      sources: SourceCandidate[];
      expires: number;
    }
  >();
  private active = 0;
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    @InjectRedis() private readonly redis: Redis,
  ) {}
  get enabled() {
    return this.config.env.ENABLE_ANIME;
  }
  private assertEnabled() {
    if (!this.enabled) throw Errors.unavailable('ANIME_DISABLED', 'Anime is not enabled yet.');
  }
  private adapters() {
    return z
      .array(adapterConfigSchema)
      .max(10)
      .parse(JSON.parse(this.config.env.ANIME_ADAPTERS_JSON));
  }
  async search(q: string, page: number) {
    this.assertEnabled();
    const items = await this.prisma.animeTitle.findMany({
      where: q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { aliases: { has: q.toLowerCase() } },
            ],
          }
        : {},
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * 24,
      take: 25,
      select: { id: true, title: true, format: true, posterUrl: true },
    });
    return { items: items.slice(0, 24), hasMore: items.length > 24, page };
  }
  async episodes(id: string) {
    this.assertEnabled();
    const title = await this.prisma.animeTitle.findUnique({
      where: { id },
      select: { id: true, title: true, posterUrl: true, provenance: true },
    });
    if (!title) throw Errors.notFound('Anime');
    const adapters = new Set(
      this.adapters()
        .filter((a) => a.enabled)
        .map((a) => a.id),
    );
    const episodes = await this.prisma.animeEpisode.findMany({
      where: { animeId: id },
      orderBy: [{ ordinal: 'asc' }, { key: 'asc' }],
      select: {
        id: true,
        key: true,
        label: true,
        ordinal: true,
        kind: true,
        stillUrl: true,
        sources: {
          where: { verified: true, enabled: true },
          select: {
            id: true,
            adapterId: true,
            edition: true,
            audioLanguage: true,
            subtitleLanguage: true,
          },
        },
      },
    });
    return {
      title,
      episodes: episodes.map((e) => ({
        ...e,
        sources: e.sources.filter((s) => adapters.has(s.adapterId)),
        playbackConfirmed: false as const,
      })),
    };
  }
  async binding(sourceId: string) {
    this.assertEnabled();
    const source = await this.prisma.animeSource.findUnique({
      where: { id: sourceId },
      include: { episode: { include: { title: true } } },
    });
    if (!source?.enabled || !source.verified) throw Errors.notFound('Verified anime source');
    const adapter = this.adapters().find((a) => a.id === source.adapterId && a.enabled);
    if (!adapter || !['series', 'movie'].includes(source.providerType))
      throw Errors.notFound('Enabled anime source');
    return { source, adapter };
  }
  async navigation(sourceId: string) {
    const { source } = await this.binding(sourceId);
    const catalog = await this.episodes(source.episode.animeId);
    const index = catalog.episodes.findIndex((e) => e.id === source.episodeId);
    const target = (offset: number) => {
      const episode = catalog.episodes[index + offset];
      if (!episode) return null;
      const candidate = episode.sources.find(
        (s) => s.adapterId === source.adapterId && s.audioLanguage === source.audioLanguage,
      );
      return candidate ? { sourceId: candidate.id, label: episode.label } : null;
    };
    return {
      animeId: source.episode.animeId,
      episodeId: source.episodeId,
      previous: target(-1),
      next: target(1),
    };
  }
  async selection(sourceId: string) {
    const { source } = await this.binding(sourceId);
    return {
      provider: 'anime' as const,
      type: 'anime' as const,
      sourceId,
      episodeId: source.episodeId,
      edition: source.edition,
    };
  }
  async playback(sourceId: string) {
    const { source, adapter } = await this.binding(sourceId);
    // Include the mapping revision in the cache identity, so corrections take effect immediately.
    const key = JSON.stringify([
      source.id,
      source.providerId,
      source.edition,
      source.streamName,
      adapter,
    ]);
    const now = Date.now();
    for (const [id, job] of this.jobs) if (job.expires < now) this.jobs.delete(id);
    let job = this.jobs.get(key);
    if (!job) {
      if (this.active >= 8 || this.jobs.size >= 500) throw Errors.tooMany(5);
      job = { state: 'pending', sources: [], expires: now + 90000 };
      this.jobs.set(key, job);
      this.active++;
      const current = job;
      void resolveStreams(
        adapter,
        source.providerType as 'series' | 'movie',
        source.providerId,
        AbortSignal.timeout(85000),
      )
        .then((sources) => {
          current.sources = sources.filter((s) => s.label === source.streamName).slice(0, 1);
          current.state = current.sources.length ? 'ready' : 'missing';
        })
        .catch(() => {
          current.state = 'unavailable';
        })
        .finally(() => {
          this.active--;
          // Signed media URLs are kept briefly, in memory only, never in the room record.
          current.expires = Date.now() + 60000;
        });
    }
    const title = source.episode.title;
    return {
      status: job.state,
      retryAfterMs: job.state === 'pending' ? 3000 : undefined,
      externalMedia: await this.selection(sourceId),
      movieId: null,
      movie: {
        id: title.id,
        title: `${title.title} · ${source.episode.label}`,
        posterUrl: title.posterUrl,
        backdropUrl: source.episode.stillUrl,
        overview: '',
        year: null,
        runtimeMin: null,
        genres: [],
        playable: job.state === 'ready',
        isDemo: false,
        source: 'LOCAL',
      },
      detailHref: `/anime/${title.id}?episode=${source.episodeId}`,
      sources: job.sources.map((s) => ({
        ...s,
        assetId: `anime:${sourceId}`,
        durationSec: 0,
        license: null,
      })),
    };
  }
  async record(sourceId: string, event: 'started' | 'failed', device: string, userId: string) {
    const { adapter } = await this.binding(sourceId);
    const day = new Date().toISOString().slice(0, 10);
    // One contribution per viewer/source/event/day; no URLs, raw user agents, or IPs in counters.
    const fresh = await this.redis.set(
      `anime:evidence:${day}:${userId}:${sourceId}:${event}`,
      '1',
      'EX',
      86400,
      'NX',
    );
    if (!fresh) return;
    const key = `anime:health:${day}:${adapter.id}:${device}`;
    await this.redis.hincrby(key, event, 1);
    await this.redis.expire(key, 7 * 86400);
  }
}
