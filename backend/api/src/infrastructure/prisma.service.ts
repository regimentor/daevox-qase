import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { createPrismaClient, type DatabaseClient } from '@app/storage';

import { APP_CONFIG, type AppConfig } from '../common/config.js';

@Injectable()
export class PrismaService implements OnModuleInit, OnApplicationShutdown {
  public readonly client: DatabaseClient;

  public constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = createPrismaClient(config.databaseUrl);
  }

  public async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.client.$disconnect();
  }
}
