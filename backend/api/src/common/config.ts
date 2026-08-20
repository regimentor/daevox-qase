import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { z } from 'zod';

const envPath = resolve(process.cwd(), '../../.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65_535),
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  ACCESS_TOKEN_PRIVATE_KEY: z.string().min(32),
  ACCESS_TOKEN_PUBLIC_KEY: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).default(2_592_000),
  CORS_ORIGINS: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(8),
  S3_FORCE_PATH_STYLE: booleanString.default(false),
  ATTACHMENT_MAX_BYTES: z.coerce.number().int().positive().default(26_214_400),
  ATTACHMENT_ALLOWED_MIME_TYPES: z.string().min(1),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  accessTokenPrivateKey: string;
  accessTokenPublicKey: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  corsOrigins: string[];
  s3: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
  };
  attachmentMaxBytes: number;
  attachmentAllowedMimeTypes: Set<string>;
};

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment configuration: ${JSON.stringify(fields)}`);
  }
  const value = parsed.data;
  return {
    nodeEnv: value.NODE_ENV,
    port: value.PORT,
    databaseUrl: value.DATABASE_URL,
    accessTokenPrivateKey: value.ACCESS_TOKEN_PRIVATE_KEY,
    accessTokenPublicKey: value.ACCESS_TOKEN_PUBLIC_KEY,
    accessTokenTtlSeconds: value.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: value.REFRESH_TOKEN_TTL_SECONDS,
    corsOrigins: value.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
    s3: {
      endpoint: value.S3_ENDPOINT,
      region: value.S3_REGION,
      bucket: value.S3_BUCKET,
      accessKeyId: value.S3_ACCESS_KEY_ID,
      secretAccessKey: value.S3_SECRET_ACCESS_KEY,
      forcePathStyle: value.S3_FORCE_PATH_STYLE,
    },
    attachmentMaxBytes: value.ATTACHMENT_MAX_BYTES,
    attachmentAllowedMimeTypes: new Set(
      value.ATTACHMENT_ALLOWED_MIME_TYPES.split(',').map((mime) => mime.trim().toLowerCase()),
    ),
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
