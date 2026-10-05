import { createHash } from 'node:crypto';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

// Credentials come only from the environment; never print keys or signed URLs.
const mode = process.argv[2];
if (!['inventory', 'copy', 'verify'].includes(mode))
  throw new Error('Usage: node scripts/migrate-object-storage.mjs inventory|copy|verify');
function config(prefix) {
  const read = (name) => {
    const value = process.env[`${prefix}_${name}`];
    if (!value) throw new Error(`Missing ${prefix}_${name}`);
    return value;
  };
  return {
    bucket: read('BUCKET'),
    client: new S3Client({
      endpoint: read('ENDPOINT'),
      region: process.env[`${prefix}_REGION`] ?? 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: read('ACCESS_KEY_ID'),
        secretAccessKey: read('SECRET_ACCESS_KEY'),
      },
    }),
  };
}
async function digest(body) {
  const hash = createHash('sha256');
  for await (const chunk of body) hash.update(chunk);
  return hash.digest('hex');
}
const source = config('SOURCE_S3');
const target = mode === 'inventory' ? undefined : config('TARGET_S3');
if (
  target &&
  process.env.SOURCE_S3_ENDPOINT === process.env.TARGET_S3_ENDPOINT &&
  source.bucket === target.bucket
)
  throw new Error('Source and target must differ');
let count = 0;
let size = 0n;
try {
  if (target) {
    try {
      await target.client.send(new HeadBucketCommand({ Bucket: target.bucket }));
    } catch (error) {
      if (mode !== 'copy' || error.$metadata?.httpStatusCode !== 404) throw error;
      await target.client.send(new CreateBucketCommand({ Bucket: target.bucket }));
    }
  }
  let continuation;
  do {
    const page = await source.client.send(
      new ListObjectsV2Command({ Bucket: source.bucket, ContinuationToken: continuation }),
    );
    for (const item of page.Contents ?? []) {
      if (!item.Key) throw new Error('Object without key');
      count++;
      size += BigInt(item.Size ?? 0);
      if (!target) continue;
      const object = await source.client.send(
        new GetObjectCommand({ Bucket: source.bucket, Key: item.Key }),
      );
      if (mode === 'copy') {
        // At most one attachment in memory. Migration requires writers paused.
        const body = await object.Body.transformToByteArray();
        await target.client.send(
          new PutObjectCommand({
            Bucket: target.bucket,
            Key: item.Key,
            Body: body,
            ContentLength: body.length,
            ContentType: object.ContentType,
            Metadata: object.Metadata,
            ContentDisposition: object.ContentDisposition,
            CacheControl: object.CacheControl,
            ContentEncoding: object.ContentEncoding,
          }),
        );
        const saved = await target.client.send(
          new GetObjectCommand({ Bucket: target.bucket, Key: item.Key }),
        );
        if ((await digest(saved.Body)) !== createHash('sha256').update(body).digest('hex'))
          throw new Error(`Object ${count}: SHA-256 mismatch`);
      } else {
        const saved = await target.client.send(
          new GetObjectCommand({ Bucket: target.bucket, Key: item.Key }),
        );
        if ((await digest(object.Body)) !== (await digest(saved.Body)))
          throw new Error(`Object ${count}: SHA-256 mismatch`);
      }
      const metadata = await target.client.send(
        new HeadObjectCommand({ Bucket: target.bucket, Key: item.Key }),
      );
      if (
        metadata.ContentLength !== object.ContentLength ||
        metadata.ContentType !== object.ContentType
      )
        throw new Error(`Object ${count}: metadata mismatch`);
    }
    if (page.IsTruncated && !page.NextContinuationToken)
      throw new Error('Missing pagination token');
    continuation = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuation);
  if (target) {
    let targetCount = 0;
    let targetSize = 0n;
    let token;
    do {
      const page = await target.client.send(
        new ListObjectsV2Command({ Bucket: target.bucket, ContinuationToken: token }),
      );
      targetCount += page.Contents?.length ?? 0;
      for (const item of page.Contents ?? []) targetSize += BigInt(item.Size ?? 0);
      if (page.IsTruncated && !page.NextContinuationToken)
        throw new Error('Missing target pagination token');
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    if (targetCount !== count || targetSize !== size)
      throw new Error('Source/target object totals differ; use an empty dedicated target bucket');
  }
  console.log(
    JSON.stringify({
      mode,
      objects: count,
      bytes: size.toString(),
      verified: mode !== 'inventory',
    }),
  );
} finally {
  source.client.destroy();
  target?.client.destroy();
}
