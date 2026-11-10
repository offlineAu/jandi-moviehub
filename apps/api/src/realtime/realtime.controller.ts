import { KisskhStreamService } from '../catalog/kisskh-stream.service';
import { VidsrcService } from '../catalog/vidsrc.service';
import { ExternalSeriesService } from '../catalog/external-series.controller';
import { MovieboxService } from '../catalog/moviebox.controller';
import { TvMetadataService } from '../catalog/tv.service';
import { providerCatalogEpisode, roomTvTitle, selectionTitle } from '@jandi/shared';
import { Controller, Get, Header, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AllowGuest, type AuthUser, CurrentUser } from '../common/auth-context';
import { CatalogService } from '../catalog/catalog.service';
import { RoomsService } from '../rooms/rooms.service';
import { PlaybackService } from './playback.service';

@ApiTags('rooms')
@Controller('rooms/:roomId')
export class RealtimeController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly playback: PlaybackService,
    private readonly catalog: CatalogService,
    private readonly moviebox: MovieboxService,
    private readonly tv: TvMetadataService,
    private readonly kisskh: ExternalSeriesService,
    private readonly vidsrc: VidsrcService,
    private readonly kisskhStream: KisskhStreamService,
  ) {}

  /** Current authoritative playback state (REST fallback for the socket snapshot). */
  @AllowGuest()
  @Get('playback-state')
  async state(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string) {
    await this.rooms.requireMember(roomId, user.id);
    return { state: await this.playback.getState(roomId), serverTime: Date.now() };
  }

  /**
   * Signed sources for the room's current movie. The asset that defines the room timeline is
   * listed first; other renditions (e.g. HLS for Safari) share the same duration.
   */
  @AllowGuest()
  @Get('playback-sources')
  @Header('Cache-Control', 'private, no-store')
  async sources(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string) {
    await this.rooms.requireMember(roomId, user.id);
    const state = await this.playback.getState(roomId);
    if (state.externalMedia) {
      const media = state.externalMedia;
      if (media.provider === 'kisskh-direct') {
        const [movie, source] = await Promise.all([
          this.catalog.getSummary(media.movieId),
          this.kisskhStream.resolveMovie(media.tmdbId),
        ]);
        return {
          movieId: media.movieId,
          movie,
          externalMedia: media,
          sources: [
            {
              assetId: selectionTitle(media),
              label: 'KissKH',
              format: source.format,
              mimeType: source.mimeType,
              durationSec: 0,
              url: source.url,
            },
          ],
        };
      }
      this.vidsrc.assertEnabled();
      const movie =
        media.type === 'movie'
          ? await this.catalog.getSummary(media.movieId)
          : await (async () => {
              const [{ series }, { episode }] = await Promise.all([
                this.tv.detail(media.tvId),
                this.tv.episode(media.tvId, media.season, media.episode),
              ]);
              return {
                id: `vidsrc:tv:${media.tvId}:${media.season}:${media.episode}`,
                title: `${series.title} · S${media.season} E${media.episode} · ${episode?.title ?? 'Episode'}`,
                posterUrl: series.posterUrl,
                backdropUrl: episode?.stillUrl ?? series.backdropUrl,
                overview: episode?.overview ?? series.overview,
                year: null,
                runtimeMin: episode?.runtimeMin ?? null,
                genres: series.genres,
                playable: false,
                isDemo: false,
                source: 'TMDB',
              };
            })();
      return {
        movieId: state.movieId,
        movie,
        sources: [],
        externalMedia: media,
        detailHref: `/watch/embed?media=${encodeURIComponent(JSON.stringify(media))}`,
        embed: {
          provider: 'vidsrc',
          url: this.vidsrc.embedUrl(media),
          playbackMode: 'synced',
          media,
          capabilities: { play: true, pause: true, seek: true, rate: false },
        },
      };
    }
    if (state.tvEpisode) {
      const episode = state.tvEpisode;
      if (episode.provider === 'kisskh' || episode.provider === 'kisskh-direct') {
        const source = await this.kisskh.resolveRoomEpisode(episode);
        const metadata = await this.tv.detail(Number(episode.tvId)).catch(() => null);
        const series = metadata?.series;
        const title = `${source.series.title} · Episode ${episode.episode}`;
        const direct =
          episode.provider === 'kisskh-direct' ? await this.kisskhStream.resolve(episode) : null;
        return {
          movieId: null,
          tvEpisode: episode,
          detailHref: `/watch/tv/${episode.tvId}/season/${episode.season}/episode/${episode.episode}?provider=kisskh&numbering=provider`,
          movie: {
            id: roomTvTitle(episode),
            title,
            posterUrl: series?.posterUrl ?? null,
            backdropUrl: series?.backdropUrl ?? null,
            overview: series?.overview ?? null,
            year: null,
            runtimeMin: null,
            genres: series?.genres ?? [],
            playable: true,
            isDemo: false,
            source: 'TMDB',
          },
          sources: direct
            ? [
                {
                  assetId: roomTvTitle(episode),
                  label: 'KissKH',
                  format: direct.format,
                  mimeType: direct.mimeType,
                  durationSec: 0,
                  url: direct.url,
                  captions: [],
                  license: null,
                },
              ]
            : [],
          ...(direct
            ? {}
            : {
                embed: {
                  provider: 'kisskh' as const,
                  url: `https://kisskh.megaplay.su/kisskh/${source.episode.id}`,
                  playbackMode: 'individual' as const,
                },
              }),
        };
      }
      const coordinate =
        episode.numbering === 'provider'
          ? providerCatalogEpisode(episode.season, episode.episode)
          : { season: episode.season, episode: episode.episode };
      const [session, { series }, detail] = await Promise.all([
        this.moviebox.playback(episode),
        this.tv.detail(Number(episode.tvId)),
        coordinate
          ? this.tv.episode(Number(episode.tvId), coordinate.season, coordinate.episode)
          : Promise.resolve(null),
      ]);
      const title = `${series.title} · ${episode.numbering === 'provider' ? 'Part' : 'S'}${episode.season} E${episode.episode}${detail?.episode?.title ? ` · ${detail.episode?.title ?? 'Episode'}` : ''}`;
      return {
        movieId: null,
        tvEpisode: episode,
        detailHref: `/watch/tv/${episode.tvId}/season/${episode.season}/episode/${episode.episode}${episode.numbering === 'provider' ? '?provider=moviebox&numbering=provider' : ''}`,
        movie: {
          id: roomTvTitle(episode),
          title,
          posterUrl: series.posterUrl,
          backdropUrl: series.backdropUrl,
          overview: detail?.episode?.overview ?? series.overview,
          year: detail?.episode?.airDate ? Number(detail.episode.airDate.slice(0, 4)) : null,
          runtimeMin: Math.round(session.durationSec / 60),
          genres: series.genres,
          playable: true,
          isDemo: false,
          source: 'TMDB',
        },
        sources: session.sources.map((source) => ({
          assetId: `${roomTvTitle(episode)}:${source.id}`,
          label: `${source.resolution}p`,
          format: 'MP4',
          mimeType: 'video/mp4',
          durationSec: session.durationSec,
          url: source.url,
          captions: session.englishVtt
            ? [{ lang: 'en', label: 'English', url: source.url.replace('/media/', '/captions/') }]
            : [],
          license: null,
        })),
      };
    }
    if (!state.movieId) return { movieId: null, sources: [] };
    const sources = await this.catalog.getPlaybackSources(state.movieId);
    sources.sort(
      (a, b) => Number(b.assetId === state.mediaAssetId) - Number(a.assetId === state.mediaAssetId),
    );
    return { movieId: state.movieId, movie: await this.catalog.getSummary(state.movieId), sources };
  }
}
