import type { IncomingMessage } from 'node:http';
import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { ServerOptions } from 'socket.io';
import { AppConfig } from '../config/app-config';
import { RedisFactory } from '../redis/redis.module';

/** Socket.IO adapter backed by Redis pub/sub so rooms span multiple API instances. */
export class RealtimeIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private readonly config: AppConfig;

  constructor(private readonly appContext: INestApplicationContext) {
    super(appContext);
    this.config = appContext.get(AppConfig);
  }

  async connectToRedis() {
    const factory = this.appContext.get(RedisFactory);
    const pub = factory.create({ pubSub: true });
    const sub = factory.create({ pubSub: true });
    await Promise.all([pub.ping(), sub.ping()]);
    this.adapterConstructor = createAdapter(pub, sub);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.config.env.WEB_ORIGINS, credentials: true },
      allowRequest: (
        req: IncomingMessage,
        callback: (err: string | null | undefined, ok: boolean) => void,
      ) => {
        // Reject cross-site WebSocket hijacking: browsers always send Origin on handshakes.
        const origin = req.headers.origin;
        callback(null, !origin || this.config.env.WEB_ORIGINS.includes(origin));
      },
      pingInterval: 10_000,
      pingTimeout: 8_000,
      maxHttpBufferSize: 64 * 1024,
      connectionStateRecovery: { maxDisconnectionDuration: 60_000, skipMiddlewares: false },
    });
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
