import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { resolve } from 'node:path';
import { ulid } from 'ulidx';

import { loadConfig } from './common/config.js';
import { ConfigurationModule } from './common/config.module.js';
import { GraphqlErrorFilter } from './common/errors.js';
import { GraphqlThrottlerGuard } from './common/graphql-throttler.guard.js';
import { operationLogPlugin } from './common/operation-log.plugin.js';
import { UserLoader } from './common/user.loader.js';
import { DatabaseModule } from './infrastructure/database.module.js';
import { HealthController } from './infrastructure/health.controller.js';
import { OBJECT_STORAGE } from './infrastructure/object-storage/object-storage.js';
import { S3ObjectStorage } from './infrastructure/object-storage/s3-object-storage.js';
import { AnalyticsService } from './modules/analytics/analytics.service.js';
import { AttachmentsService } from './modules/attachments/attachments.service.js';
import { AuthGuard } from './modules/auth/auth.guard.js';
import { AuthModule } from './modules/auth/auth.module.js';
import {
  AttachmentResolver,
  DomainResolver,
  WorkspaceMemberResolver,
} from './modules/domain.resolver.js';
import { EnvironmentsService } from './modules/environments/environments.service.js';
import { PlansService } from './modules/plans/plans.service.js';
import { ProjectsService } from './modules/projects/projects.service.js';
import { ResultsService } from './modules/results/results.service.js';
import { RunsService } from './modules/runs/runs.service.js';
import { SuitesService } from './modules/suites/suites.service.js';
import { TestCasesService } from './modules/test-cases/test-cases.service.js';
import { TenantService } from './modules/workspaces/tenant.service.js';
import { WorkspacesService } from './modules/workspaces/workspaces.service.js';
import { queryProtectionRule } from './schema/protection.js';
import { BigIntScalar, DateTimeScalar, UuidScalar } from './schema/scalars.js';

const config = loadConfig(process.env);

@Module({
  imports: [
    ConfigurationModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    DatabaseModule,
    AuthModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      typePaths: [resolve(import.meta.dirname, 'schema/schema.graphql')],
      path: '/graphql',
      introspection: config.nodeEnv !== 'production',
      playground: false,
      validationRules: [queryProtectionRule],
      plugins: [
        operationLogPlugin as never,
        (config.nodeEnv === 'production'
          ? ApolloServerPluginLandingPageDisabled()
          : ApolloServerPluginLandingPageLocalDefault({ embed: true })) as never,
      ],
      formatError: (formattedError) => {
        const extensions = { ...formattedError.extensions };
        delete extensions.stacktrace;
        return { ...formattedError, extensions };
      },
      context: ({ req, res }: { req: Request; res: Response }) => {
        const header = req.headers['x-correlation-id'];
        const correlationId = typeof header === 'string' && header.length <= 128 ? header : ulid();
        res.setHeader('x-correlation-id', correlationId);
        return { request: req, response: res, correlationId };
      },
    }),
  ],
  controllers: [HealthController],
  providers: [
    { provide: OBJECT_STORAGE, useClass: S3ObjectStorage },
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useClass: GraphqlThrottlerGuard },
    { provide: APP_FILTER, useClass: GraphqlErrorFilter },
    TenantService,
    WorkspacesService,
    ProjectsService,
    SuitesService,
    TestCasesService,
    PlansService,
    EnvironmentsService,
    RunsService,
    ResultsService,
    AttachmentsService,
    AnalyticsService,
    DomainResolver,
    AttachmentResolver,
    WorkspaceMemberResolver,
    UserLoader,
    UuidScalar,
    DateTimeScalar,
    BigIntScalar,
  ],
  exports: [AttachmentsService],
})
export class AppModule {}
