import { createRequire } from 'node:module';
import { createServer } from 'node:http';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const { S3Client, CreateBucketCommand, DeleteBucketCommand } = require('@aws-sdk/client-s3');
const { S3ObjectStorage } =
  await import('../../backend/api/dist/src/infrastructure/object-storage/s3-object-storage.js');
const s3 = {
  endpoint: process.env.SEAWEED_TEST_ENDPOINT ?? 'http://127.0.0.1:8333',
  region: 'us-east-1',
  bucket: `browser-compatibility-${Date.now()}`,
  forcePathStyle: true,
  accessKeyId: 'seaweedfs-test-user',
  secretAccessKey: 'seaweedfs-test-password',
};
const client = new S3Client({
  endpoint: s3.endpoint,
  region: s3.region,
  forcePathStyle: true,
  credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
});
const storage = new S3ObjectStorage({ s3 });
const server = createServer((_request, response) =>
  response.end('<!doctype html><title>S3 test</title>'),
);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  await client.send(new CreateBucketCommand({ Bucket: s3.bucket }));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const bytes = 'Browser upload: проверка';
  const put = await storage.presignPut(
    'browser-check',
    'text/plain',
    BigInt(Buffer.byteLength(bytes)),
    60,
  );
  const get = await storage.presignGet('browser-check', 'отчёт.txt', 60);
  const result = await page.evaluate(
    async ({ put, get, bytes }) => {
      const uploaded = await fetch(put, {
        method: 'PUT',
        body: new Blob([bytes], { type: 'text/plain' }),
        headers: { 'Content-Type': 'text/plain' },
      });
      const downloaded = await fetch(get);
      return { put: uploaded.status, get: downloaded.status, bytes: await downloaded.text() };
    },
    { put, get, bytes },
  );
  if (result.put !== 200 || result.get !== 200 || result.bytes !== bytes)
    throw Error('Browser S3 roundtrip failed');
  console.log('Chromium cross-origin presigned PUT/GET passed');
} finally {
  await browser?.close();
  await storage.delete('browser-check');
  await client.send(new DeleteBucketCommand({ Bucket: s3.bucket }));
  client.destroy();
  await new Promise((resolve) => server.close(resolve));
}
