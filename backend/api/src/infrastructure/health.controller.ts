import { Controller, Get, Inject } from '@nestjs/common';

import { PrismaService } from './prisma.service.js';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage/object-storage.js';
import { Public } from '../modules/auth/public.decorator.js';

@Controller('health')
export class HealthController {
  public constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  @Public()
  @Get('live')
  public live() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  public async ready() {
    await Promise.all([this.prisma.client.$queryRaw`SELECT 1`, this.storage.ready()]);
    return { status: 'ok' };
  }
}
