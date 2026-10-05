import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../../common/config.js';
import type { ObjectMetadata, ObjectStorage } from './object-storage.js';

@Injectable()
export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly signingClient: S3Client;

  public constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.client = new S3Client({
      // Browser uploads have no body at signing time; a default checksum would describe empty bytes.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      endpoint: config.s3.endpoint,
      region: config.s3.region,
      forcePathStyle: config.s3.forcePathStyle,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
    });
    this.signingClient = config.s3.publicEndpoint
      ? new S3Client({
          requestChecksumCalculation: 'WHEN_REQUIRED',
          endpoint: config.s3.publicEndpoint,
          region: config.s3.region,
          forcePathStyle: config.s3.forcePathStyle,
          credentials: {
            accessKeyId: config.s3.accessKeyId,
            secretAccessKey: config.s3.secretAccessKey,
          },
        })
      : this.client;
  }

  public presignPut(
    key: string,
    contentType: string,
    size: bigint,
    expiresSeconds: number,
  ): Promise<string> {
    return getSignedUrl(
      this.signingClient,
      new PutObjectCommand({
        Bucket: this.config.s3.bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: Number(size),
      }),
      { expiresIn: expiresSeconds },
    );
  }

  public presignGet(key: string, filename: string, expiresSeconds: number): Promise<string> {
    return getSignedUrl(
      this.signingClient,
      new GetObjectCommand({
        Bucket: this.config.s3.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      }),
      { expiresIn: expiresSeconds },
    );
  }

  public async head(key: string): Promise<ObjectMetadata> {
    const response = await this.client.send(
      new HeadObjectCommand({ Bucket: this.config.s3.bucket, Key: key }),
    );
    return { size: BigInt(response.ContentLength ?? 0), contentType: response.ContentType };
  }

  public async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.s3.bucket, Key: key }));
  }

  public async ready(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.config.s3.bucket }));
  }
}
