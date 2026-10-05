import { CreateBucketCommand, DeleteBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { execFileSync } from 'node:child_process';
import { createServer, request as proxyRequest, type Server } from 'node:http';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AppConfig } from '../src/common/config.js';
import { S3ObjectStorage } from '../src/infrastructure/object-storage/s3-object-storage.js';

describe('SeaweedFS ObjectStorage compatibility', () => {
  let container: StartedTestContainer | undefined;
  let proxy: Server;
  let endpoint: string;
  let storage: S3ObjectStorage;
  let client: S3Client;
  let config: AppConfig;
  const bucket = `compatibility-${Date.now()}`;
  const key = 'workspace/project/attachment';
  const bytes = 'SeaweedFS attachment: проверка';

  beforeAll(async () => {
    endpoint = process.env.SEAWEED_TEST_ENDPOINT ?? '';
    if (!endpoint) {
      container = await new GenericContainer('chrislusf/seaweedfs:4.48')
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
        .start();
      endpoint = `http://${container.getHost()}:${container.getMappedPort(8333)}`;
    }
    // Model nginx's dedicated S3 listener: retain the signed Host and request target.
    proxy = createServer((incoming, outgoing) => {
      const forwarded = proxyRequest(
        new URL(incoming.url ?? '/', endpoint),
        {
          method: incoming.method,
          headers: incoming.headers,
        },
        (response) => {
          outgoing.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(outgoing);
        },
      );
      forwarded.on('error', () => outgoing.destroy());
      incoming.pipe(forwarded);
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const address = proxy.address();
    if (!address || typeof address === 'string') throw new Error('Missing proxy address');
    const s3: AppConfig['s3'] = {
      endpoint,
      publicEndpoint: `http://127.0.0.1:${address.port}`,
      region: 'us-east-1',
      bucket,
      forcePathStyle: true,
      accessKeyId: 'seaweedfs-test-user',
      secretAccessKey: 'seaweedfs-test-password',
    };
    // S3ObjectStorage consumes only the object-storage portion of configuration.
    config = {
      s3,
      nodeEnv: 'test',
      port: 3000,
      databaseUrl: '',
      accessTokenPrivateKey: '',
      accessTokenPublicKey: '',
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 2592000,
      corsOrigins: [],
      attachmentMaxBytes: 26214400,
      attachmentAllowedMimeTypes: new Set(['text/plain']),
    };
    storage = new S3ObjectStorage(config);
    client = new S3Client({
      endpoint,
      region: s3.region,
      forcePathStyle: true,
      credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
    });
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  });

  afterAll(async () => {
    if (storage) await storage.delete(key);
    if (client) {
      await client.send(new DeleteBucketCommand({ Bucket: bucket }));
      client.destroy();
    }
    if (proxy) await new Promise<void>((resolve) => proxy.close(() => resolve()));
    await container?.stop();
  });

  it('rejects anonymous reads, listing and writes', async () => {
    for (const [method, path] of [
      ['GET', '/'],
      ['GET', `/${bucket}/`],
      ['GET', `/${bucket}/${key}`],
      ['PUT', `/${bucket}/${key}`],
    ]) {
      const response = await fetch(`${endpoint}${path}`, { method });
      expect(response.status).toBe(403);
    }
  });

  it('supports browser CORS, signed PUT, HEAD and Cyrillic download names through a proxy', async () => {
    await storage.ready();
    const put = await storage.presignPut(key, 'text/plain', BigInt(Buffer.byteLength(bytes)), 60);
    const preflight = await fetch(put, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    expect(preflight.ok).toBe(true);
    expect(preflight.headers.get('access-control-allow-origin')).toBeTruthy();
    const uploaded = await fetch(put, {
      method: 'PUT',
      body: bytes,
      headers: { 'Content-Type': 'text/plain', Origin: 'http://localhost:5173' },
    });
    expect(uploaded.ok, await uploaded.text()).toBe(true);
    expect(await storage.head(key)).toEqual({
      size: BigInt(Buffer.byteLength(bytes)),
      contentType: 'text/plain',
    });
    const downloaded = await fetch(await storage.presignGet(key, 'отчёт.txt', 60));
    expect(downloaded.ok).toBe(true);
    expect(await downloaded.text()).toBe(bytes);
    expect(downloaded.headers.get('content-disposition')).toContain(
      encodeURIComponent('отчёт.txt'),
    );
  });

  it('copies and verifies objects through S3 and survives a container restart', async () => {
    const targetBucket = `${bucket}-copy`;
    const env = {
      ...process.env,
      SOURCE_S3_ENDPOINT: endpoint,
      SOURCE_S3_BUCKET: bucket,
      SOURCE_S3_ACCESS_KEY_ID: 'seaweedfs-test-user',
      SOURCE_S3_SECRET_ACCESS_KEY: 'seaweedfs-test-password',
      TARGET_S3_ENDPOINT: endpoint,
      TARGET_S3_BUCKET: targetBucket,
      TARGET_S3_ACCESS_KEY_ID: 'seaweedfs-test-user',
      TARGET_S3_SECRET_ACCESS_KEY: 'seaweedfs-test-password',
    };
    try {
      for (const mode of ['inventory', 'copy', 'copy', 'verify']) {
        const result = JSON.parse(
          execFileSync(process.execPath, ['scripts/migrate-object-storage.mjs', mode], {
            env,
            encoding: 'utf8',
          }),
        );
        expect(result.objects).toBe(1);
        expect(result.bytes).toBe(String(Buffer.byteLength(bytes)));
      }
      if (container) {
        await container.restart();
        endpoint = `http://${container.getHost()}:${container.getMappedPort(8333)}`;
        config.s3.endpoint = endpoint;
        storage = new S3ObjectStorage(config);
        client.destroy();
        client = new S3Client({
          endpoint,
          region: config.s3.region,
          forcePathStyle: true,
          credentials: {
            accessKeyId: config.s3.accessKeyId,
            secretAccessKey: config.s3.secretAccessKey,
          },
        });
        await storage.ready();
        expect(await (await fetch(await storage.presignGet(key, 'restart.txt', 60))).text()).toBe(
          bytes,
        );
      }
    } finally {
      const target = new S3ObjectStorage({
        s3: {
          endpoint,
          region: 'us-east-1',
          bucket: targetBucket,
          forcePathStyle: true,
          accessKeyId: 'seaweedfs-test-user',
          secretAccessKey: 'seaweedfs-test-password',
        },
        nodeEnv: 'test',
        port: 3000,
        databaseUrl: '',
        accessTokenPrivateKey: '',
        accessTokenPublicKey: '',
        accessTokenTtlSeconds: 900,
        refreshTokenTtlSeconds: 2592000,
        corsOrigins: [],
        attachmentMaxBytes: 26214400,
        attachmentAllowedMimeTypes: new Set(),
      });
      await target.delete(key);
      await client.send(new DeleteBucketCommand({ Bucket: targetBucket }));
    }
  });

  it('rejects expired signatures and supports idempotent deletion and missing-bucket readiness', async () => {
    const expired = await storage.presignGet(key, 'expired.txt', 1);
    await new Promise((resolve) => setTimeout(resolve, 2100));
    expect((await fetch(expired)).status).toBe(403);
    await storage.delete(key);
    await storage.delete(key);
    await expect(storage.head(key)).rejects.toThrow();
    await client.send(new DeleteBucketCommand({ Bucket: bucket }));
    await expect(storage.ready()).rejects.toThrow();
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  });
});
