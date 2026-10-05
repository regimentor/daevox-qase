import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('GraphQL dependency injection bootstrap', () => {
  it('resolves HttpAdapterHost using the API workspace dependency tree', () => {
    // A separate Node process preserves real package resolution; Vitest can mask duplicate Nest copies.
    const result = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import { createRequire } from 'node:module';
      const require = createRequire(process.argv[1]);
      require('reflect-metadata');
      const { Module } = require('@nestjs/common');
      const { NestFactory } = require('@nestjs/core');
      const { GraphQLModule } = require('@nestjs/graphql');
      const { ApolloDriver } = require('@nestjs/apollo');
      class StartupModule {}
      Module({ imports: [GraphQLModule.forRoot({ driver: ApolloDriver, typeDefs: 'type Query { ping: String }' })] })(StartupModule);
      const app = await NestFactory.create(StartupModule, { logger: false, abortOnError: false });
      await app.init();
      await app.close();
      console.log('GraphQL bootstrap passed');
    `,
        fileURLToPath(new URL('../package.json', import.meta.url)),
      ],
      { encoding: 'utf8', timeout: 10_000 },
    );
    expect(result.trim()).toBe('GraphQL bootstrap passed');
  });
});
