import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

for (const file of [resolve(process.cwd(), '.env')]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

async function main() {
  const { startTracing } = await import('./observability/tracing');
  await startTracing();
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('./app.module');
  const { configureApp } = await import('./bootstrap');
  const { RealtimeIoAdapter } = await import('./realtime/io-adapter');

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = configureApp(app);
  const adapter = new RealtimeIoAdapter(app);
  await adapter.connectToRedis();
  app.useWebSocketAdapter(adapter);
  await app.listen(config.env.PORT);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
