import { MovieboxService } from '../catalog/moviebox.controller';
import { TvMetadataService } from '../catalog/tv.service';
import { providerCatalogEpisode, roomTvTitle } from '@jandi/shared';
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
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
  async sources(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string) {
    await this.rooms.requireMember(roomId, user.id);
    const state = await this.playback.getState(roomId);
    if (state.tvEpisode) {
      const episode = state.tvEpisode;
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
      const title = `${series.title} · ${episode.numbering === 'provider' ? 'Part' : 'S'}${episode.season} E${episode.episode}${detail?.episode?.title ? ` · ${detail.episode.title}` : ''}`;
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
