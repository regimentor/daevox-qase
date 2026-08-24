import { describe, expect, it, vi } from 'vitest';
import {
  createSessionController,
  type CoordinatedSession,
  type SessionCoordination,
  type SessionCoordinationEvent,
} from './session-controller';

function createSharedCoordination(): SessionCoordination {
  let generation = 0;
  let latest: CoordinatedSession | null = null;
  let pending: Promise<CoordinatedSession> | null = null;
  const listeners = new Set<(event: SessionCoordinationEvent) => void>();
  const publish = (tokens: Parameters<SessionCoordination['publish']>[0]) => {
    latest = { tokens, generation: ++generation };
    for (const listener of listeners) listener({ type: 'tokens-updated', ...latest });
    return latest;
  };
  return {
    publish,
    runRefresh: (knownGeneration, refresh) => {
      if (latest && generation > knownGeneration) return Promise.resolve(latest);
      if (!pending) {
        pending = refresh()
          .then(publish)
          .finally(() => {
            pending = null;
          });
      }
      return pending;
    },
    end: () => {
      generation += 1;
      for (const listener of listeners) listener({ type: 'session-ended', generation });
      return generation;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

describe('session controller', () => {
  it('refreshes authorization when the access token has less than 60 seconds left', async () => {
    const refresh = vi.fn(async () => ({
      accessToken: 'access-2',
      accessTokenExpiresAt: '2026-08-24T10:15:00.000Z',
      refreshToken: 'refresh-2',
    }));
    let storedRefreshToken: string | null = 'refresh-1';
    const controller = createSessionController({
      now: () => new Date('2026-08-24T10:00:00.000Z').getTime(),
      refresh,
      refreshTokens: {
        read: () => storedRefreshToken,
        write: (token) => {
          storedRefreshToken = token;
        },
        clear: () => {
          storedRefreshToken = null;
        },
      },
    });
    controller.accept({
      accessToken: 'access-1',
      accessTokenExpiresAt: '2026-08-24T10:00:59.999Z',
      refreshToken: 'refresh-1',
    });

    await expect(controller.authorize()).resolves.toEqual({
      token: 'access-2',
      generation: 2,
    });
    expect(refresh).toHaveBeenCalledWith('refresh-1');
    expect(storedRefreshToken).toBe('refresh-2');
  });

  it('keeps using a valid access token when proactive refresh fails temporarily', async () => {
    const controller = createSessionController({
      now: () => new Date('2026-08-24T10:00:00.000Z').getTime(),
      refresh: async () => {
        throw new Error('network unavailable');
      },
      refreshTokens: {
        read: () => 'refresh-1',
        write: vi.fn(),
        clear: vi.fn(),
      },
    });
    controller.accept({
      accessToken: 'access-1',
      accessTokenExpiresAt: '2026-08-24T10:00:30.000Z',
      refreshToken: 'refresh-1',
    });

    await expect(controller.authorize()).resolves.toEqual({ token: 'access-1', generation: 1 });
  });

  it('ends the session when refresh token rejection is definitive', async () => {
    const rejected = new Error('refresh token reused');
    let storedRefreshToken: string | null = 'refresh-1';
    const clearRefreshToken = vi.fn(() => {
      storedRefreshToken = null;
    });
    const onSessionEnded = vi.fn();
    const controller = createSessionController({
      now: () => new Date('2026-08-24T10:00:00.000Z').getTime(),
      refresh: async () => {
        throw rejected;
      },
      isTerminalRefreshError: (error) => error === rejected,
      onSessionEnded,
      refreshTokens: {
        read: () => storedRefreshToken,
        write: (token) => {
          storedRefreshToken = token;
        },
        clear: clearRefreshToken,
      },
    });
    controller.accept({
      accessToken: 'access-1',
      accessTokenExpiresAt: '2026-08-24T10:00:30.000Z',
      refreshToken: 'refresh-1',
    });

    await expect(controller.authorize()).rejects.toBe(rejected);
    expect(clearRefreshToken).toHaveBeenCalledOnce();
    expect(onSessionEnded).toHaveBeenCalledOnce();
    await expect(controller.authorize()).resolves.toBeNull();
  });

  it('recovers a late unauthenticated request with the newer token without refreshing again', async () => {
    const refresh = vi.fn();
    const controller = createSessionController({
      refresh,
      refreshTokens: { read: () => 'refresh-2', write: vi.fn(), clear: vi.fn() },
    });
    const sentAuthorization = controller.accept({
      accessToken: 'access-1',
      accessTokenExpiresAt: '2026-08-24T10:15:00.000Z',
      refreshToken: 'refresh-1',
    });
    controller.accept({
      accessToken: 'access-2',
      accessTokenExpiresAt: '2026-08-24T10:30:00.000Z',
      refreshToken: 'refresh-2',
    });

    await expect(controller.recover(sentAuthorization.generation)).resolves.toEqual({
      token: 'access-2',
      generation: 2,
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shares one refresh and its authorization between concurrent tabs', async () => {
    const coordination = createSharedCoordination();
    let refreshToken = 'refresh-1';
    const refresh = vi.fn(async () => ({
      accessToken: 'access-2',
      accessTokenExpiresAt: '2026-08-24T10:15:00.000Z',
      refreshToken: 'refresh-2',
    }));
    const dependencies = {
      now: () => new Date('2026-08-24T10:00:00.000Z').getTime(),
      refresh,
      refreshTokens: {
        read: () => refreshToken,
        write: (token: string) => {
          refreshToken = token;
        },
        clear: () => {
          refreshToken = '';
        },
      },
      coordination,
    };
    const firstTab = createSessionController(dependencies);
    const secondTab = createSessionController(dependencies);
    firstTab.accept({
      accessToken: 'access-1',
      accessTokenExpiresAt: '2026-08-24T10:00:30.000Z',
      refreshToken: 'refresh-1',
    });

    const [first, second] = await Promise.all([firstTab.authorize(), secondTab.authorize()]);

    expect(first).toEqual({ token: 'access-2', generation: 2 });
    expect(second).toEqual(first);
    expect(refresh).toHaveBeenCalledOnce();
  });
});
