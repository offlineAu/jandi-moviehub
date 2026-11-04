import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Request, Response as HttpResponse } from 'express';
import { MovieboxController, safeMovieboxUrl, srtToVtt } from './moviebox.controller';

const query = { tvId: '71446' as const, season: 1, episode: 1 };
const subjectId = '222030967182086936';
function fixtures() {
  return {
    detail: {
      code: 0,
      data: {
        isForbid: false,
        accessStrategy: { requiredVipLevel: 1, freeEpisodeCount: 2, previewSeconds: 300 },
        subject: { subjectId, dubs: [{ subjectId, original: true, lanCode: 'es' }] },
      },
    },
    play: {
      code: 0,
      data: {
        limited: false,
        vipLocked: true,
        playConfig: { maxResolution: 480 },
        streams: [
          {
            id: '480',
            format: 'MP4',
            url: 'https://bcdnxw.hakunaymatata.com/example.mp4',
            resolutions: '480',
            duration: 2848,
            codecName: 'h264',
            vipLocked: false,
            signCookie: '',
            signHeaderKey: '',
          },
          {
            id: '1080',
            format: 'MP4',
            url: 'https://bcdnxw.hakunaymatata.com/locked.mp4',
            resolutions: '1080',
            duration: 2848,
            codecName: 'h264',
            vipLocked: true,
            signCookie: '',
            signHeaderKey: '',
          },
        ],
      },
    },
    captions: {
      code: 0,
      data: {
        captions: [{ lan: 'en', url: 'https://cacdn.hakunaymatata.com/example.srt', delay: 0 }],
      },
    },
  };
}
function network(data = fixtures()) {
  const fetchMock = vi.fn(async (input: string, _init?: RequestInit) => {
    if (input.includes('/subject/play?')) return Response.json(data.play);
    if (input.includes('/subject/caption?')) return Response.json(data.captions);
    if (input.includes('/detail?')) return Response.json(data.detail);
    if (input === 'https://cacdn.hakunaymatata.com/example.srt')
      return new Response('1\n00:00:01,000 --> 00:00:02,000\nHello\n');
    throw new Error('Unexpected host');
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
afterEach(() => vi.unstubAllGlobals());
function mediaResponse() {
  return Object.assign(new EventEmitter(), { status: vi.fn(), setHeader: vi.fn() });
}

describe('MovieBox media delivery', () => {
  it('streams selected media with the provider referrer and forwards byte ranges', async () => {
    const fetchMock = network();
    const controller = new MovieboxController();
    const session = await controller.playback({ ...query, season: 2 });
    const url = session.sources[0]!.url;
    expect(url).toMatch(/^\/api\/v1\/moviebox\/media\/[a-f0-9]{48}$/);
    fetchMock.mockResolvedValueOnce(
      new Response('video bytes', {
        status: 206,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Range': 'bytes 10-20/100',
          'Accept-Ranges': 'bytes',
          'Content-Length': '11',
        },
      }),
    );
    const response = mediaResponse();
    const file = await controller.stream(
      url.split('/').pop()!,
      'bytes=10-20',
      { method: 'GET' } as Request,
      response as unknown as HttpResponse,
    );
    const chunks = [];
    for await (const chunk of file!.getStream()) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe('video bytes');
    expect(response.status).toHaveBeenCalledWith(206);
    expect(response.setHeader).toHaveBeenCalledWith('content-range', 'bytes 10-20/100');
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://bcdnxw.hakunaymatata.com/example.mp4',
      expect.objectContaining({
        redirect: 'error',
        headers: {
          Range: 'bytes=10-20',
          Referer: `https://movie-box.co/spa/videoPlayPage/movies/money-heist-8UcoFG3Uog?id=${subjectId}&detailSe=3&detailEp=1`,
        },
      }),
    );
    const signal = fetchMock.mock.calls.at(-1)![1]!.signal!;
    response.emit('close');
    expect(signal.aborted).toBe(true);
  });

  it('rejects arbitrary URLs and malformed ranges before contacting the CDN', async () => {
    const fetchMock = network();
    const controller = new MovieboxController();
    const response = mediaResponse() as unknown as HttpResponse;
    const request = { method: 'GET' } as Request;
    await expect(
      controller.stream('https://example.com/video', undefined, request, response),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(fetchMock).not.toHaveBeenCalled();
    const session = await controller.playback(query);
    const calls = fetchMock.mock.calls.length;
    await expect(
      controller.stream(
        session.sources[0]!.url.split('/').pop()!,
        'bytes=0-1,10-20',
        request,
        response,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RANGE' });
    expect(fetchMock).toHaveBeenCalledTimes(calls);
  });

  it('does not serve provider HTML errors as video', async () => {
    const fetchMock = network();
    const controller = new MovieboxController();
    const session = await controller.playback(query);
    fetchMock.mockResolvedValueOnce(
      new Response('<html>Error</html>', { headers: { 'Content-Type': 'text/html' } }),
    );
    await expect(
      controller.stream(
        session.sources[0]!.url.split('/').pop()!,
        undefined,
        { method: 'GET' } as Request,
        mediaResponse() as unknown as HttpResponse,
      ),
    ).rejects.toMatchObject({ code: 'MOVIEBOX_UNAVAILABLE' });
  });
});

describe('MovieBox free playback', () => {
  it('does not request nonexistent Part 1 Episode 14 without an explicit source selection', async () => {
    const fetchMock = network();
    await expect(
      new MovieboxController().playback({ ...query, episode: 14 }),
    ).rejects.toMatchObject({ code: 'MOVIEBOX_SOURCE_SELECTION_REQUIRED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('uses explicitly selected source coordinates instead of the catalog episode', async () => {
    const fetchMock = network();
    await new MovieboxController().playback({
      ...query,
      episode: 14,
      sourcePart: 2,
      sourceEpisode: 8,
    });
    const url = fetchMock.mock.calls
      .map(([url]) => url)
      .find((url) => url.includes('/subject/play?'))!;
    expect(new URL(url).searchParams.get('se')).toBe('2');
    expect(new URL(url).searchParams.get('ep')).toBe('8');
  });
  it.each([
    { ...query, episode: 14, sourcePart: 2, sourceEpisode: 10 },
    { ...query, episode: 14, sourcePart: 1 },
    { ...query, season: 2, sourcePart: 1, sourceEpisode: 1 },
  ])('rejects invalid explicit source coordinates before calling the provider', async (request) => {
    const fetchMock = network();
    await expect(new MovieboxController().playback(request)).rejects.toMatchObject({
      code: 'MOVIEBOX_INVALID_SOURCE',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('returns the free MP4 with English WebVTT and requests captions for that MP4 ID', async () => {
    const fetchMock = network();
    const session = await new MovieboxController().playback(query);
    expect(session.sources.map((s) => s.resolution)).toEqual([480]);
    expect(session.englishVtt).toContain('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello');
    const captionUrl = fetchMock.mock.calls
      .map(([url]) => url)
      .find((url) => url.includes('/subject/caption?'))!;
    expect(new URL(captionUrl).searchParams.get('format')).toBe('MP4');
    expect(new URL(captionUrl).searchParams.get('id')).toBe('480');
  });
  it.each([
    [{ ...query, episode: 3 }, 1, 3],
    [{ ...query, season: 2 }, 3, 1],
    [{ ...query, season: 2, episode: 8 }, 3, 8],
    [{ ...query, season: 2, episode: 9 }, 4, 1],
    [{ ...query, season: 2, episode: 16 }, 4, 8],
    [{ ...query, season: 3, episode: 10 }, 5, 10],
  ] as const)(
    'requests the corresponding provider part for %j',
    async (request, season, episode) => {
      const fetchMock = network();
      expect((await new MovieboxController().playback(request)).sources).toHaveLength(1);
      const playUrl = fetchMock.mock.calls
        .map(([url]) => url)
        .find((url) => url.includes('/subject/play?'))!;
      expect(new URL(playUrl).searchParams.get('se')).toBe(String(season));
      expect(new URL(playUrl).searchParams.get('ep')).toBe(String(episode));
      const init = fetchMock.mock.calls.find(([url]) => url === playUrl)![1];
      expect(new Headers(init?.headers).get('Referer')).toBe(
        `https://movie-box.co/spa/videoPlayPage/movies/money-heist-8UcoFG3Uog?id=${subjectId}&detailSe=${season}&detailEp=${episode}`,
      );
    },
  );
  it('rejects forbidden titles before requesting streams', async () => {
    const data = fixtures();
    data.detail.data.isForbid = true;
    const fetchMock = network(data);
    await expect(new MovieboxController().playback(query)).rejects.toMatchObject({
      code: 'MOVIEBOX_ACCESS_REQUIRED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('allows a null title policy when the episode supplies an unlocked stream', async () => {
    const data = fixtures();
    const fetchMock = network(data);
    fetchMock.mockImplementationOnce(async () =>
      Response.json({ ...data.detail, data: { ...data.detail.data, accessStrategy: null } }),
    );
    expect((await new MovieboxController().playback({ ...query, season: 2 })).sources).toHaveLength(
      1,
    );
  });
  it('reports empty provider resources separately from an access restriction', async () => {
    const data = fixtures();
    data.play.data.streams = [];
    network(data);
    await expect(new MovieboxController().playback(query)).rejects.toMatchObject({
      code: 'MOVIEBOX_NO_STREAMS',
    });
  });
  it('rejects limited playback and locked-only resources', async () => {
    const data = fixtures();
    data.play.data.limited = true;
    network(data);
    await expect(new MovieboxController().playback(query)).rejects.toMatchObject({
      code: 'MOVIEBOX_ACCESS_REQUIRED',
    });
    data.play.data.limited = false;
    data.play.data.streams.forEach((s) => {
      s.vipLocked = true;
    });
    await expect(new MovieboxController().playback(query)).rejects.toMatchObject({
      code: 'MOVIEBOX_UNAVAILABLE',
    });
  });
  it('does not confuse a failed caption lookup with working subtitles', async () => {
    const data = fixtures();
    data.captions.data.captions = [];
    network(data);
    expect(await new MovieboxController().playback(query)).toMatchObject({
      englishVtt: null,
      subtitleStatus: 'UNAVAILABLE',
    });
  });
  it('rejects a different audio edition', async () => {
    const data = fixtures();
    data.detail.data.subject.dubs[0]!.lanCode = 'en';
    network(data);
    await expect(new MovieboxController().playback(query)).rejects.toMatchObject({
      code: 'MOVIEBOX_UNAVAILABLE',
    });
  });
  it('does not fetch unexpected media hosts', async () => {
    const data = fixtures();
    data.play.data.streams[0]!.url = 'http://127.0.0.1/private';
    network(data);
    await expect(new MovieboxController().playback(query)).rejects.toMatchObject({
      code: 'MOVIEBOX_UNAVAILABLE',
    });
    expect(
      safeMovieboxUrl('https://cacdn.hakunaymatata.com.evil.test/x', 'cacdn.hakunaymatata.com'),
    ).toBe(false);
  });
  it('converts only timestamped plain subtitle text', () => {
    expect(srtToVtt('\uFEFF1\r\n00:00:01,000 --> 00:00:02,000\r\n<b>Hi</b> & bye')).toContain(
      'Hi &amp; bye',
    );
    expect(() => srtToVtt('<html>Access denied</html>')).toThrow();
  });
});
