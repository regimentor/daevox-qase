import { describe, expect, it, vi } from 'vitest';
import { RefreshCoordinator } from './refresh-coordinator';
describe('RefreshCoordinator', () => {
  it('coalesces concurrent refreshes and resets afterwards', async () => {
    const coordinator = new RefreshCoordinator<string>();
    const refresh = vi.fn(async () => 'token');
    const [first, second] = await Promise.all([coordinator.run(refresh), coordinator.run(refresh)]);
    expect([first, second]).toEqual(['token', 'token']);
    expect(refresh).toHaveBeenCalledTimes(1);
    await coordinator.run(refresh);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
  it('resets after failure', async () => {
    const coordinator = new RefreshCoordinator<string>();
    await expect(
      coordinator.run(async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    await expect(coordinator.run(async () => 'ok')).resolves.toBe('ok');
  });
});
