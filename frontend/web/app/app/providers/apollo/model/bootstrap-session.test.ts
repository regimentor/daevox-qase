import { describe, expect, it, vi } from 'vitest';
import { restoreSession } from './bootstrap-session';

describe('session bootstrap', () => {
  it('surfaces a temporary refresh failure while the refresh token is retained', async () => {
    const unavailable = new Error('server unavailable');
    const clearStore = vi.fn(async () => undefined);

    await expect(
      restoreSession({
        hasRefreshToken: () => true,
        authorize: async () => {
          throw unavailable;
        },
        loadUser: vi.fn(),
        clearStore,
      }),
    ).rejects.toBe(unavailable);
    expect(clearStore).toHaveBeenCalledOnce();
  });

  it('returns an empty session after a terminal refresh failure clears the token', async () => {
    let hasRefreshToken = true;

    await expect(
      restoreSession({
        hasRefreshToken: () => hasRefreshToken,
        authorize: async () => {
          hasRefreshToken = false;
          throw new Error('refresh token invalid');
        },
        loadUser: vi.fn(),
        clearStore: vi.fn(async () => undefined),
      }),
    ).resolves.toBeNull();
  });
});
