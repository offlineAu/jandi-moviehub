import {
  Controller,
  Injectable,
  Get,
  Header,
  Headers,
  Param,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { providerEpisode } from '@jandi/shared';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Public, RateLimit } from '../common/auth-context';
import { AppError, Errors } from '../common/errors';
import { providerFailure } from './provider-error';
import { ValidQuery } from '../common/zod';

// Explicit provider mapping from the owner's captured original-language title response.
const original = { subjectId: '222030967182086936', detailPath: 'money-heist-8UcoFG3Uog' };
const querySchema = z.object({
  tvId: z.literal('71446'),
  season: z.coerce.number().int().min(1).max(100),
  episode: z.coerce.number().int().min(1).max(1000),
  sourcePart: z.coerce.number().int().min(1).max(2).optional(),
  sourceEpisode: z.coerce.number().int().min(1).max(13).optional(),
});
const policy = z.object({
  requiredVipLevel: z.number().nonnegative(),
  freeEpisodeCount: z.number().int().nonnegative(),
  previewSeconds: z.number().nonnegative(),
});
const detailSchema = z.object({
  code: z.literal(0),
  data: z.object({
    isForbid: z.boolean(),
    accessStrategy: policy.nullable(),
    subject: z.object({
      subjectId: z.literal(original.subjectId),
      dubs: z.array(
        z.object({ subjectId: z.string(), original: z.boolean(), lanCode: z.string() }),
      ),
    }),
  }),
});
const streamSchema = z.object({
  code: z.literal(0),
  data: z.object({
    limited: z.boolean(),
    playConfig: z.object({ maxResolution: z.number().positive() }),
    streams: z.array(
      z.object({
        id: z.string(),
        format: z.string(),
        url: z.string(),
        resolutions: z.string(),
        duration: z.number().positive(),
        codecName: z.string(),
        vipLocked: z.boolean(),
        signCookie: z.string(),
        signHeaderKey: z.string(),
      }),
    ),
  }),
});
const captionsSchema = z.object({
  code: z.literal(0),
  data: z.object({
    captions: z.array(z.object({ lan: z.string(), url: z.string(), delay: z.number() })).max(100),
  }),
});

function unavailable() {
  return Errors.unavailable(
    'MOVIEBOX_UNAVAILABLE',
    'MovieBox could not provide this episode. Try again later or select another source.',
  );
}
export function safeMovieboxUrl(value: string, host: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === host &&
      !url.port &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
async function read(url: string, maxBytes = 2_000_000, referer?: string) {
  try {
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
      headers: { Accept: '*/*', ...(referer ? { Referer: referer } : {}) },
    });
    if (!response.ok) throw providerFailure('MovieBox', null, response.status);
    if (!response.body) throw unavailable();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        length += result.value.length;
        if (length > maxBytes) throw new Error('Too large');
        chunks.push(result.value);
      }
    } finally {
      await reader.cancel();
    }
    return Buffer.concat(chunks).toString('utf8');
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw providerFailure('MovieBox', error);
  }
}
async function json(url: string, referer?: string): Promise<unknown> {
  try {
    return JSON.parse(await read(url, 2_000_000, referer));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw unavailable();
  }
}
export function srtToVtt(text: string) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const cues = normalized.split(/\n\s*\n/).flatMap((block) => {
    const lines = block.trim().split('\n');
    const index = lines.findIndex((line) =>
      /^\d{2,}:\d{2}:\d{2}[,.]\d{3} --> \d{2,}:\d{2}:\d{2}[,.]\d{3}$/.test(line.trim()),
    );
    if (index < 0) return [];
    // Plain text only, preventing markup from becoming active cue content.
    const body = lines
      .slice(index + 1)
      .join('\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return body ? [`${lines[index]!.replace(/,/g, '.')}\n${body}`] : [];
  });
  if (!cues.length) throw unavailable();
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

@Injectable()
export class MovieboxService {
  // Only URLs selected by playback() can enter this bounded, short-lived registry.
  private readonly media = new Map<
    string,
    { url: string; referer: string; expires: number; englishVtt: string | null }
  >();

  private mediaUrl(url: string, referer: string, englishVtt: string | null) {
    for (const [key, value] of this.media) if (value.expires <= Date.now()) this.media.delete(key);
    while (this.media.size >= 512) this.media.delete(this.media.keys().next().value!);
    const token = randomBytes(24).toString('hex');
    this.media.set(token, { url, referer, englishVtt, expires: Date.now() + 2 * 60 * 60 * 1000 });
    return `/api/v1/moviebox/media/${token}`;
  }

  captions(token: string) {
    const source = this.media.get(token);
    if (!source || source.expires <= Date.now() || !source.englishVtt)
      throw Errors.notFound('Captions');
    return source.englishVtt;
  }

  async stream(token: string, range: string | undefined, request: Request, response: Response) {
    const source = /^[a-f0-9]{48}$/.test(token) ? this.media.get(token) : undefined;
    if (!source || source.expires <= Date.now()) {
      this.media.delete(token);
      throw Errors.notFound('Playback link');
    }
    if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range))
      throw Errors.badRequest('INVALID_RANGE', 'Only a single byte range is supported.');
    const abort = new AbortController();
    const cancel = () => abort.abort();
    response.once('close', cancel);
    const timeout = setTimeout(cancel, 12000);
    try {
      const upstream = await fetch(source.url, {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        redirect: 'error',
        signal: abort.signal,
        headers: { Referer: source.referer, ...(range ? { Range: range } : {}) },
      });
      clearTimeout(timeout);
      if (upstream.status === 416) {
        response.status(416);
        const contentRange = upstream.headers.get('content-range');
        if (contentRange) response.setHeader('Content-Range', contentRange);
        await upstream.body?.cancel();
        return;
      }
      if (!upstream.ok) {
        await upstream.body?.cancel();
        throw providerFailure('MovieBox', null, upstream.status);
      }
      if (!/^video\/mp4(?:;|$)/i.test(upstream.headers.get('content-type') ?? '')) {
        await upstream.body?.cancel();
        throw unavailable();
      }
      response.status(upstream.status);
      response.setHeader('Cache-Control', 'private, no-store');
      for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const value = upstream.headers.get(header);
        if (value) response.setHeader(header, value);
      }
      if (request.method === 'HEAD') return;
      if (!upstream.body) throw unavailable();
      // Stream with backpressure; never buffer an episode in memory.
      return new StreamableFile(Readable.fromWeb(upstream.body));
    } catch (error) {
      abort.abort();
      if (error instanceof AppError) throw error;
      throw providerFailure('MovieBox', error);
    } finally {
      clearTimeout(timeout);
    }
  }

  async playback(query: z.infer<typeof querySchema>) {
    const explicitSource = query.sourcePart !== undefined || query.sourceEpisode !== undefined;
    if (
      explicitSource &&
      (query.season !== 1 ||
        !query.sourcePart ||
        !query.sourceEpisode ||
        query.sourceEpisode > (query.sourcePart === 1 ? 13 : 9))
    )
      throw Errors.badRequest('MOVIEBOX_INVALID_SOURCE', 'Choose a valid source part and episode.');
    if (query.season === 1 && query.episode > 13 && !explicitSource)
      throw Errors.badRequest(
        'MOVIEBOX_SOURCE_SELECTION_REQUIRED',
        'Season 1 uses a different episode cut. Choose a source part and episode to watch.',
      );
    const metadata = detailSchema.safeParse(
      await json(
        `https://h5-api.aoneroom.com/wefeed-h5api-bff/detail?${new URLSearchParams({ detailPath: original.detailPath })}`,
      ),
    );
    if (!metadata.success) throw unavailable();
    const data = metadata.data.data;
    const originalAudio = data.subject.dubs.find(
      (dub) => dub.subjectId === original.subjectId && dub.original && dub.lanCode === 'es',
    );
    if (!originalAudio) throw unavailable();
    // Title-level freeEpisodeCount does not describe season/episode availability.
    // Ask the public episode endpoint and enforce its limited/locked stream flags below.
    // A null accessStrategy is returned for unrestricted titles too; it is not a denial.
    if (data.isForbid)
      throw Errors.forbidden(
        'MovieBox has marked this title as unavailable for playback.',
        'MOVIEBOX_ACCESS_REQUIRED',
      );
    const sourceEpisode = explicitSource
      ? { season: query.sourcePart!, episode: query.sourceEpisode! }
      : providerEpisode(query.tvId, query.season, query.episode);
    // The public player sends its full page URL. Without this context the provider
    // returns hasResource:false, even for anonymously playable episodes.
    const referer = `https://movie-box.co/spa/videoPlayPage/movies/${original.detailPath}?${new URLSearchParams(
      {
        id: original.subjectId,
        detailSe: String(sourceEpisode.season),
        detailEp: String(sourceEpisode.episode),
      },
    )}`;
    const params = new URLSearchParams({
      ...original,
      se: String(sourceEpisode.season),
      ep: String(sourceEpisode.episode),
      streamSignType: '1',
      'supportCodecs[h264]': '1',
    });
    const playback = streamSchema.safeParse(
      await json(`https://movie-box.co/wefeed-h5api-bff/subject/play?${params}`, referer),
    );
    if (!playback.success) throw unavailable();
    if (playback.data.data.limited)
      throw Errors.forbidden(
        'The provider has limited playback access.',
        'MOVIEBOX_ACCESS_REQUIRED',
      );
    if (!playback.data.data.streams.length)
      throw Errors.unavailable(
        'MOVIEBOX_NO_STREAMS',
        'MovieBox returned no video for this episode. Try KissKH or retry later.',
      );
    const streams = playback.data.data.streams
      .filter(
        (s) =>
          !s.vipLocked &&
          s.format === 'MP4' &&
          s.codecName === 'h264' &&
          !s.signCookie &&
          !s.signHeaderKey &&
          Number(s.resolutions) > 0 &&
          Number(s.resolutions) <= Math.min(480, playback.data.data.playConfig.maxResolution) &&
          safeMovieboxUrl(s.url, 'bcdnxw.hakunaymatata.com'),
      )
      .sort((a, b) => Number(b.resolutions) - Number(a.resolutions));
    const selected = streams[0];
    if (!selected) throw unavailable();
    let englishVtt: string | null = null;
    try {
      const captionParams = new URLSearchParams({ ...original, format: 'MP4', id: selected.id });
      const captions = captionsSchema.safeParse(
        await json(
          `https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/caption?${captionParams}`,
          referer,
        ),
      );
      const english = captions.success
        ? captions.data.data.captions.find(
            (c) =>
              c.lan === 'en' && c.delay === 0 && safeMovieboxUrl(c.url, 'cacdn.hakunaymatata.com'),
          )
        : undefined;
      if (english) englishVtt = srtToVtt(await read(english.url, 1_000_000));
    } catch {
      /* Playable video and failed captions are reported separately. */
    }
    return {
      durationSec: selected.duration,
      audioLanguage: 'es',
      sources: streams.map((s) => ({
        id: s.id,
        url: this.mediaUrl(s.url, referer, englishVtt),
        resolution: Number(s.resolutions),
      })),
      englishVtt,
      subtitleStatus: englishVtt ? 'AVAILABLE' : 'UNAVAILABLE',
    };
  }
}

@Controller('moviebox')
export class MovieboxController {
  @Public()
  @Header('Content-Type', 'text/vtt; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Get('captions/:token')
  captions(@Param('token') token: string) {
    return this.service.captions(token);
  }

  constructor(private readonly service: MovieboxService = new MovieboxService()) {}
  @Public()
  @RateLimit({ name: 'moviebox-playback', limit: 12, windowSec: 60 })
  @Header('Cache-Control', 'no-store')
  @Get('playback')
  playback(@ValidQuery(querySchema) query: z.infer<typeof querySchema>) {
    return this.service.playback(query);
  }
  @Public()
  @RateLimit({ name: 'moviebox-media', limit: 120, windowSec: 60 })
  @Get('media/:token')
  stream(
    @Param('token') token: string,
    @Headers('range') range: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.service.stream(token, range, request, response);
  }
}
