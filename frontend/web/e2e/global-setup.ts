import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { MinioContainer } from '@testcontainers/minio';
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

  const [postgres, minio] = await Promise.all([
    new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('daevox_web_e2e')
      .withUsername('daevox')
      .withPassword('daevox')
      .start(),
    new MinioContainer('minio/minio:latest')
      .withUsername('minio-test-user')
      .withPassword('minio-test-password')
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
    S3_ENDPOINT: minio.getConnectionUrl(),
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'daevox-web-e2e',
    S3_ACCESS_KEY_ID: minio.getUsername(),
    S3_SECRET_ACCESS_KEY: minio.getPassword(),
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
    endpoint: minio.getConnectionUrl(),
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: minio.getUsername(), secretAccessKey: minio.getPassword() },
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
    await Promise.all([postgres.stop(), minio.stop()]);
  };
}
