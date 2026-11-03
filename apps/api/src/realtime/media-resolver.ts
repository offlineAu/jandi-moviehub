import { Injectable } from '@nestjs/common';
import { playableAssetWhere } from '../catalog/playability';
import { PrismaService } from '../prisma/prisma.service';

const FORMAT_PREFERENCE = { WEBM: 0, MP4: 1, HLS: 2 } as const;

export { playableAssetWhere } from '../catalog/playability';

/** Picks the asset whose duration defines the room timeline for a movie. */
@Injectable()
export class MediaResolver {
  constructor(private readonly prisma: PrismaService) {}

  async primaryAsset(movieId: string) {
    const assets = await this.prisma.mediaAsset.findMany({
      where: { movieId, ...playableAssetWhere() },
      select: { id: true, durationSec: true, format: true },
      orderBy: { createdAt: 'asc' },
    });
    assets.sort((a, b) => FORMAT_PREFERENCE[a.format] - FORMAT_PREFERENCE[b.format]);
    return assets[0] ?? null;
  }
}
