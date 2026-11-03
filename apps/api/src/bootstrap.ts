import { type INestApplication, RequestMethod } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { Application } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { APP_NAME } from '@jandi/shared';
import { AppConfig } from './config/app-config';

/** Shared HTTP setup used by main.ts and integration tests. */
export function configureApp(app: INestApplication) {
  const config = app.get(AppConfig);
  const express = app.getHttpAdapter().getInstance() as Application;
  express.disable('x-powered-by');
  if (config.env.TRUST_PROXY) express.set('trust proxy', 1);

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1', { exclude: [{ path: '/', method: RequestMethod.GET }] });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          // Swagger UI needs inline styles/scripts on the docs route only.
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(cookieParser());
  app.enableCors({ origin: config.env.WEB_ORIGINS, credentials: true });
  app.enableShutdownHooks();

  const doc = new DocumentBuilder()
    .setTitle(`${APP_NAME} API`)
    .setDescription(
      'REST API for Jandi MovieHub. Real-time events are documented in docs/api/REALTIME.md.',
    )
    .setVersion('1.0')
    .addCookieAuth('jandi_session')
    .build();
  const document = SwaggerModule.createDocument(app, doc);
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs/openapi.json' });
  return config;
}
