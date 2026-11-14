import { Injectable, Logger } from '@nestjs/common';
import { AppError, Errors } from '../common/errors';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from './catalog.service';
import { KisskhStreamService } from './kisskh-stream.service';
import { VidsrcService } from './vidsrc.service';
import { TvMetadataService } from './tv.service';

type State = 'listed' | 'missing' | 'unavailable' | 'disabled';
type Provider = 'local' | 'kisskh-direct' | 'vidsrc';
type Candidate = {
  provider: Provider;
  type: 'native' | 'embed';
  state: State;
  playbackConfirmed: false;
  roomControls: 'native' | 'experimental' | 'none';
};

/** Catalog checks do not confirm that a browser can play a returned source. */
@Injectable()
export class PlaybackPipelineService {
  private readonly logger = new Logger(PlaybackPipelineService.name);
  private readonly pending = new Map<string, Promise<{ candidates: Candidate[] }>>();
  private readonly health = new Map<Provider, { failures: number; retryAt: number }>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly kisskh: KisskhStreamService,
    private readonly vidsrc: VidsrcService,
    private readonly config: AppConfig,
    private readonly tv: TvMetadataService,
  ) {}

  get animeEnabled() { return this.config.env.ENABLE_ANIME; }

  get enabled() {
    return this.config.env.ENABLE_PLAYBACK_PIPELINE;
  }

  record(
    provider: 'local' | 'kisskh-direct' | 'vidsrc',
    event: 'started' | 'failed' | 'buffering',
    device: 'ios' | 'android' | 'desktop' | 'other',
    durationMs?: number,
  ) {
    if (!this.enabled) return;
    this.logger.log(
      `Playback event provider=${provider} event=${event} device=${device}${durationMs === undefined ? '' : ` durationMs=${durationMs}`}`,
    );
  }

  async movie(id: string) {
    if (!this.enabled)
      throw Errors.unavailable('PLAYBACK_PIPELINE_DISABLED', 'Playback pipeline is not enabled.');
    const key = `movie:${id}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const work = this.resolveMovie(id).finally(() => this.pending.delete(key));
    this.pending.set(key, work);
    return work;
  }

  async episode(tvId: number, season: number, episode: number) {
    if (!this.enabled)
      throw Errors.unavailable('PLAYBACK_PIPELINE_DISABLED', 'Playback pipeline is not enabled.');
    const key = `tv:${tvId}:${season}:${episode}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const work = this.resolveEpisode(tvId, season, episode).finally(() => this.pending.delete(key));
    this.pending.set(key, work);
    return work;
  }

  private async resolveEpisode(tvId: number, season: number, episode: number) {
    const metadata = await this.tv.episode(tvId, season, episode);
    if (!metadata.episode) throw Errors.notFound('Episode');
    const local: Candidate = {
      provider: 'local',
      type: 'native',
      state: 'unavailable',
      playbackConfirmed: false,
      roomControls: 'native',
    };
    const vidsrc: Candidate = {
      provider: 'vidsrc',
      type: 'embed',
      state: 'unavailable',
      playbackConfirmed: false,
      roomControls: this.vidsrc.enabled ? 'experimental' : 'none',
    };
    await Promise.all([
      this.check(local, async () => {
        const link = await this.prisma.tvEpisodeMedia.findUnique({
          where: { tmdbId_season_episode: { tmdbId: tvId, season, episode } },
          select: { movieId: true },
        });
        return !!link && (await this.catalog.getPlaybackSources(link.movieId)).length > 0;
      }),
      this.check(vidsrc, () =>
        this.vidsrc.listed({ provider: 'vidsrc', type: 'tv', tvId, tmdbId: tvId, season, episode }),
      ),
    ]);
    return { candidates: [local, vidsrc] };
  }

  private async resolveMovie(id: string) {
    const movie = await this.prisma.movie.findUnique({ where: { id }, select: { tmdbId: true } });
    if (!movie) throw Errors.notFound('Movie');
    const local: Candidate = {
      provider: 'local',
      type: 'native',
      state: 'unavailable',
      playbackConfirmed: false,
      roomControls: 'native',
    };
    const kisskh: Candidate = {
      provider: 'kisskh-direct',
      type: 'native',
      state: this.kisskh.enabled && movie.tmdbId ? 'unavailable' : 'disabled',
      playbackConfirmed: false,
      roomControls: 'native',
    };
    const vidsrc: Candidate = {
      provider: 'vidsrc',
      type: 'embed',
      state: movie.tmdbId ? 'unavailable' : 'disabled',
      playbackConfirmed: false,
      roomControls: this.vidsrc.enabled ? 'experimental' : 'none',
    };
    const tasks: Array<Promise<void>> = [
      this.check(local, async () => (await this.catalog.getPlaybackSources(id)).length > 0),
    ];
    if (movie.tmdbId) {
      const tmdbId = movie.tmdbId;
      if (this.kisskh.enabled)
        tasks.push(
          this.check(kisskh, async () => {
            await this.kisskh.resolveMovie(tmdbId);
            return true;
          }),
        );
      tasks.push(
        this.check(vidsrc, () =>
          this.vidsrc.listed({ provider: 'vidsrc', type: 'movie', movieId: id, tmdbId }),
        ),
      );
    }
    await Promise.all(tasks);
    return { candidates: [local, kisskh, vidsrc] };
  }

  private async check(candidate: Candidate, operation: () => Promise<boolean>) {
    const health = this.health.get(candidate.provider);
    if (health && health.retryAt > Date.now()) {
      candidate.state = 'unavailable';
      return;
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const found = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('timeout')), 12000);
        }),
      ]);
      candidate.state = found ? 'listed' : 'missing';
      this.health.delete(candidate.provider);
    } catch (error) {
      candidate.state =
        error instanceof AppError &&
        (error.getStatus() === 404 || error.code === 'KISSKH_DIRECT_NO_STREAM')
          ? 'missing'
          : 'unavailable';
      if (candidate.state === 'unavailable') {
        const failures = (health?.failures ?? 0) + 1;
        this.health.set(candidate.provider, {
          failures,
          retryAt: failures >= 3 ? Date.now() + 30000 : 0,
        });
      } else this.health.delete(candidate.provider);
      this.logger.warn(`Playback candidate ${candidate.provider}: ${candidate.state}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}
