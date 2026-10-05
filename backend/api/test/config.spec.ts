import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/common/config.js';

const valid = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/database',
  ACCESS_TOKEN_PRIVATE_KEY: 'x'.repeat(32),
  ACCESS_TOKEN_PUBLIC_KEY: 'x'.repeat(32),
  CORS_ORIGINS: 'http://localhost:3001',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'test-bucket',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret-value',
  ATTACHMENT_ALLOWED_MIME_TYPES: 'image/png,application/pdf',
};

describe('configuration', () => {
  it('applies safe TTL and attachment defaults', () => {
    const config = loadConfig(valid);
    expect(config.accessTokenTtlSeconds).toBe(900);
    expect(config.refreshTokenTtlSeconds).toBe(2_592_000);
    expect(config.attachmentMaxBytes).toBe(26_214_400);
  });

  it('uses an optional browser endpoint without changing the internal S3 endpoint', () => {
    expect(loadConfig({ ...valid, S3_PUBLIC_ENDPOINT: '' }).s3.publicEndpoint).toBeUndefined();
    const config = loadConfig({ ...valid, S3_PUBLIC_ENDPOINT: 'https://attachments.example.com' });
    expect(config.s3.endpoint).toBe(valid.S3_ENDPOINT);
    expect(config.s3.publicEndpoint).toBe('https://attachments.example.com');
    expect(() => loadConfig({ ...valid, S3_PUBLIC_ENDPOINT: 'invalid' })).toThrow(
      'Invalid environment configuration',
    );
  });

  it('fails before startup when required configuration is invalid', () => {
    expect(() => loadConfig({ ...valid, DATABASE_URL: 'not-a-url' })).toThrow(
      'Invalid environment configuration',
    );
  });
});
