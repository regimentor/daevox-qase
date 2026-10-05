import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { GenericContainer, Wait } from 'testcontainers';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { NestFactory } from '@nestjs/core';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { resolve } from 'node:path';
import type { FullConfig } from '@playwright/test';

export default async function globalSetup(_config: FullConfig) {
  if (process.env.E2E_GRAPHQL_URL) return;

  const repositoryRoot = resolve(process.cwd(), '../..');
  execFileSync('npm', ['run', 'build'], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'pipe',
  });

  const [postgres, seaweedfs] = await Promise.all([
    new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('daevox_web_e2e')
      .withUsername('daevox')
      .withPassword('daevox')
      .start(),
    new GenericContainer('chrislusf/seaweedfs:4.48')
      .withCommand([
        'mini',
        '-dir=/data',
        '-ip=127.0.0.1',
        '-ip.bind=0.0.0.0',
        '-webdav=false',
        '-admin.ui=false',
        '-s3.port.iceberg=0',
        '-s3.port.lance=0',
      ])
      .withEnvironment({
        AWS_ACCESS_KEY_ID: 'seaweedfs-test-user',
        AWS_SECRET_ACCESS_KEY: 'seaweedfs-test-password',
      })
      .withExposedPorts(8333)
      .withWaitStrategy(Wait.forHttp('/', 8333).forStatusCode(403))
      .start(),
  ]);

  const databaseUrl = postgres.getConnectionUri().replace(/^postgres:/, 'postgresql:');
  const keys = generateKeyPairSync('ed25519');
  Object.assign(process.env, {
    NODE_ENV: 'test',
    PORT: '3000',
    DATABASE_URL: databaseUrl,
    ACCESS_TOKEN_PRIVATE_KEY: keys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    ACCESS_TOKEN_PUBLIC_KEY: keys.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    ACCESS_TOKEN_TTL_SECONDS: '60',
    REFRESH_TOKEN_TTL_SECONDS: '2592000',
    CORS_ORIGINS: 'http://127.0.0.1:5173',
    S3_ENDPOINT: `http://${seaweedfs.getHost()}:${seaweedfs.getMappedPort(8333)}`,
    S3_PUBLIC_ENDPOINT: '',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'daevox-web-e2e',
    S3_ACCESS_KEY_ID: 'seaweedfs-test-user',
    S3_SECRET_ACCESS_KEY: 'seaweedfs-test-password',
    S3_FORCE_PATH_STYLE: 'true',
    ATTACHMENT_MAX_BYTES: '26214400',
    ATTACHMENT_ALLOWED_MIME_TYPES:
      'image/png,image/jpeg,image/webp,application/pdf,text/plain,application/json',
  });

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: resolve(repositoryRoot, 'backend/storage'),
    env: process.env,
    stdio: 'pipe',
  });

  const s3 = new S3Client({
    endpoint: `http://${seaweedfs.getHost()}:${seaweedfs.getMappedPort(8333)}`,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: 'seaweedfs-test-user', secretAccessKey: 'seaweedfs-test-password' },
  });
  await s3.send(new CreateBucketCommand({ Bucket: 'daevox-web-e2e' }));

  const backendModuleUrl = new URL('../../../backend/api/dist/src/app.module.js', import.meta.url)
    .href;
  const { AppModule } = await import(backendModuleUrl);
  const app = await NestFactory.create(AppModule, { logger: false });
  app.enableCors({ origin: 'http://127.0.0.1:5173' });
  await app.listen(3000, '127.0.0.1');

  return async () => {
    await app.close();
    await Promise.all([postgres.stop(), seaweedfs.stop()]);
  };
}
