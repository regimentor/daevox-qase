import type { User } from '@app/storage';
import { GqlArgumentsHost } from '@nestjs/graphql';
import type { ArgumentsHost } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { ThrottlerException } from '@nestjs/throttler';
import { describe, expect, it, vi } from 'vitest';

import { AppError, GraphqlErrorFilter, invariant } from '../src/common/errors.js';
import { withTransactionRetry } from '../src/common/transaction-retry.js';
import { UserLoader } from '../src/common/user.loader.js';
import { HealthController } from '../src/infrastructure/health.controller.js';
import type { ObjectStorage } from '../src/infrastructure/object-storage/object-storage.js';
import type { PrismaService } from '../src/infrastructure/prisma.service.js';

describe('common infrastructure', () => {
  it('retries transient transaction failures but not ordinary errors', async () => {
    const transient = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('deadlock detected'))
      .mockRejectedValueOnce(new Error('could not serialize access'))
      .mockResolvedValue('committed');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await expect(withTransactionRetry(transient)).resolves.toBe('committed');
    expect(transient).toHaveBeenCalledTimes(3);

    const permanent = vi.fn<() => Promise<never>>().mockRejectedValue(new Error('bad input'));
    await expect(withTransactionRetry(permanent)).rejects.toThrow('bad input');
    expect(permanent).toHaveBeenCalledOnce();

    const exhausted = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue(new Error('serialization failure'));
    await expect(withTransactionRetry(exhausted, 2)).rejects.toThrow('serialization failure');
    expect(exhausted).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it('maps expected and unexpected errors to safe GraphQL errors', () => {
    const context = { correlationId: '01TESTCORRELATION' };
    vi.spyOn(GqlArgumentsHost, 'create').mockReturnValue({
      getContext: () => context,
    } as unknown as GqlArgumentsHost);
    const filter = new GraphqlErrorFilter();
    const host = {} as ArgumentsHost;

    let expected: unknown;
    try {
      filter.catch(
        new AppError('VALIDATION_ERROR', 'Request validation failed', { name: 'required' }),
        host,
      );
    } catch (error: unknown) {
      expected = error;
    }
    expect(expected).toBeInstanceOf(GraphQLError);
    expect((expected as GraphQLError).extensions).toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: { name: 'required' },
      correlationId: context.correlationId,
    });

    expect(() => filter.catch(new ThrottlerException(), host)).toThrow('Too many requests');

    expect(() => filter.catch(new Error('database password leaked'), host)).toThrow(
      'Internal server error',
    );
    try {
      invariant(false, 'CONFLICT', 'conflict');
    } catch (error: unknown) {
      expect(error).toMatchObject({ name: 'AppError', code: 'CONFLICT' });
    }
    expect(() => invariant(true, 'CONFLICT', 'unused')).not.toThrow();
    vi.restoreAllMocks();
  });

  it('batches user lookups and preserves missing-key errors', async () => {
    const user = {
      id: 'user-1',
      email: 'one@example.com',
      name: 'One',
      passwordHash: 'redacted',
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies User;
    const findMany = vi.fn().mockResolvedValue([user]);
    const loader = new UserLoader({
      client: { user: { findMany } },
    } as unknown as PrismaService);

    const first = loader.load(user.id);
    const duplicate = loader.load(user.id);
    await expect(first).resolves.toBe(user);
    await expect(duplicate).resolves.toBe(user);
    expect(findMany).toHaveBeenCalledOnce();
    await expect(loader.load('missing')).rejects.toThrow('User not found');
  });

  it('checks both database and object storage readiness', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ ok: 1 }]);
    const storage: ObjectStorage = {
      presignPut: vi.fn(),
      presignGet: vi.fn(),
      head: vi.fn(),
      delete: vi.fn(),
      ready: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new HealthController(
      { client: { $queryRaw: queryRaw } } as unknown as PrismaService,
      storage,
    );
    expect(controller.live()).toEqual({ status: 'ok' });
    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(storage.ready).toHaveBeenCalledOnce();
  });
});
