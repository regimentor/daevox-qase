import { describe, expect, it, vi } from 'vitest';
import { createBrowserSessionCoordination } from './browser-session-coordination';

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function createChannelFactory() {
  const channels = new Set<{
    onmessage: ((event: MessageEvent) => void) | null;
  }>();
  const broadcast = (message: unknown, sender?: object) => {
    for (const peer of channels) {
      if (peer !== sender) peer.onmessage?.({ data: message } as MessageEvent);
    }
  };
  const createChannel = () => {
    const channel = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      send(message: unknown) {
        broadcast(message, channel);
      },
      close() {
        channels.delete(channel);
      },
    };
    channels.add(channel);
    return channel;
  };
  return { broadcast, createChannel };
}

function createLocks() {
  let tail = Promise.resolve();
  return {
    async request<T>(_name: string, callback: () => Promise<T>) {
      const previous = tail;
      let release: (() => void) | undefined;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await callback();
      } finally {
        release?.();
      }
    },
  };
}

describe('browser session coordination', () => {
  it('shares the winning refresh result with a tab waiting for the browser lock', async () => {
    const storage = createStorage();
    const { createChannel } = createChannelFactory();
    const locks = createLocks();
    const first = createBrowserSessionCoordination({
      storage,
      createChannel,
      locks,
      tabId: 'first',
    });
    const second = createBrowserSessionCoordination({
      storage,
      createChannel,
      locks,
      tabId: 'second',
    });
    const initial = first.publish({
      accessToken: 'access-1',
      accessTokenExpiresAt: '2026-08-24T10:00:30.000Z',
      refreshToken: 'refresh-1',
    });
    const refresh = vi.fn(async () => ({
      accessToken: 'access-2',
      accessTokenExpiresAt: '2026-08-24T10:15:00.000Z',
      refreshToken: 'refresh-2',
    }));

    const [firstResult, secondResult] = await Promise.all([
      first.runRefresh(initial.generation, refresh),
      second.runRefresh(initial.generation, refresh),
    ]);

    expect(firstResult).toEqual(secondResult);
    expect(firstResult.generation).toBe(2);
    expect(refresh).toHaveBeenCalledOnce();
    first.dispose();
    second.dispose();
  });

  it('notifies another tab when the session ends', () => {
    const storage = createStorage();
    const { createChannel } = createChannelFactory();
    const first = createBrowserSessionCoordination({ storage, createChannel, tabId: 'first' });
    const second = createBrowserSessionCoordination({ storage, createChannel, tabId: 'second' });
    const listener = vi.fn();
    second.subscribe(listener);

    const generation = first.end();

    expect(listener).toHaveBeenCalledWith({ type: 'session-ended', generation });
    first.dispose();
    second.dispose();
  });

  it('discards a refresh result that completes after the session ends', async () => {
    const storage = createStorage();
    const { createChannel } = createChannelFactory();
    const coordination = createBrowserSessionCoordination({
      storage,
      createChannel,
      locks: createLocks(),
      tabId: 'first',
    });
    let completeRefresh:
      | ((tokens: {
          accessToken: string;
          accessTokenExpiresAt: string;
          refreshToken: string;
        }) => void)
      | undefined;
    const refresh = coordination.runRefresh(
      0,
      () =>
        new Promise((resolve) => {
          completeRefresh = resolve;
        }),
    );
    await Promise.resolve();

    const endedGeneration = coordination.end();
    completeRefresh?.({
      accessToken: 'late-access',
      accessTokenExpiresAt: '2026-08-24T10:15:00.000Z',
      refreshToken: 'late-refresh',
    });

    await expect(refresh).rejects.toThrow('Session changed during refresh');
    expect(storage.getItem('daevox.session.generation')).toBe(String(endedGeneration));
    coordination.dispose();
  });

  it('ignores a token message from an older session generation', () => {
    const storage = createStorage();
    const channelHub = createChannelFactory();
    const first = createBrowserSessionCoordination({
      storage,
      createChannel: channelHub.createChannel,
      tabId: 'first',
    });
    const second = createBrowserSessionCoordination({
      storage,
      createChannel: channelHub.createChannel,
      tabId: 'second',
    });
    const listener = vi.fn();
    second.subscribe(listener);
    const oldTokens = {
      accessToken: 'access-1',
      accessTokenExpiresAt: '2026-08-24T10:01:00.000Z',
      refreshToken: 'refresh-1',
    };
    first.publish(oldTokens);
    first.publish({
      accessToken: 'access-2',
      accessTokenExpiresAt: '2026-08-24T10:15:00.000Z',
      refreshToken: 'refresh-2',
    });
    listener.mockClear();

    channelHub.broadcast({
      sender: 'delayed-tab',
      event: { type: 'tokens-updated', tokens: oldTokens, generation: 1 },
    });

    expect(listener).not.toHaveBeenCalled();
    first.dispose();
    second.dispose();
  });

  it('takes over an expired storage lease when browser locks are unavailable', async () => {
    const storage = createStorage();
    storage.setItem(
      'daevox.session.refresh-lease',
      JSON.stringify({ owner: 'closed-tab', expiresAt: 999 }),
    );
    const coordination = createBrowserSessionCoordination({
      storage,
      createChannel: undefined,
      locks: null,
      eventTarget: undefined,
      now: () => 1_000,
      delay: async () => undefined,
      tabId: 'survivor',
    });

    const result = await coordination.runRefresh(0, async () => ({
      accessToken: 'access-2',
      accessTokenExpiresAt: '2026-08-24T10:15:00.000Z',
      refreshToken: 'refresh-2',
    }));

    expect(result.generation).toBe(1);
    expect(storage.getItem('daevox.session.refresh-lease')).toBeNull();
    coordination.dispose();
  });
});
