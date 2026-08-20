import { describe, expect, it, vi } from 'vitest';
import { createSessionTokenStorage } from '.';
describe('session token storage', () => {
  it('isolates refresh token access', () => {
    const storage = { getItem: vi.fn(() => 'token'), setItem: vi.fn(), removeItem: vi.fn() };
    const adapter = createSessionTokenStorage(storage);
    expect(adapter.readRefreshToken()).toBe('token');
    adapter.writeRefreshToken('next');
    adapter.clear();
    expect(storage.setItem).toHaveBeenCalledWith('daevox.session.refresh', 'next');
    expect(storage.removeItem).toHaveBeenCalledWith('daevox.session.refresh');
  });
  it('works without browser storage', () =>
    expect(createSessionTokenStorage(undefined).readRefreshToken()).toBeNull());
});
