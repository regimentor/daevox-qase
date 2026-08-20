import 'reflect-metadata';

import { json } from 'express';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';

import { APP_CONFIG, type AppConfig } from './common/config.js';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get<AppConfig>(APP_CONFIG);
  app.use(helmet({ contentSecurityPolicy: config.nodeEnv === 'production' }));
  app.use(json({ limit: '1mb' }));
  app.enableCors({ origin: config.corsOrigins, credentials: false });
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
}

void bootstrap();
