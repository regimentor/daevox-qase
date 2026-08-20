import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module.js';
import { AttachmentsService } from '../modules/attachments/attachments.service.js';

const app = await NestFactory.createApplicationContext(AppModule);
try {
  const removed = await app.get(AttachmentsService).cleanupPending();
  process.stdout.write(`${JSON.stringify({ removed })}\n`);
} finally {
  await app.close();
}
