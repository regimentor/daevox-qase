import { describe, expect, it } from 'vitest';
import { routes, safeReturnTo } from '.';
describe('route builders', () => {
  it('builds every application route', () => {
    expect(routes.register()).toBe('/register');
    expect(routes.workspaces()).toBe('/workspaces');
    expect(routes.workspace('w')).toBe('/w/w');
    expect(routes.members('w')).toContain('/settings/members');
    expect(routes.newProject('w')).toContain('/projects/new');
    expect(routes.project('w', 'p')).toBe('/w/w/p/p');
    expect(routes.dashboard('w', 'p')).toContain('/dashboard');
    expect(routes.repository('w', 'p')).toContain('/repository');
    expect(routes.plans('w', 'p')).toContain('/plans');
    expect(routes.plan('w', 'p', 'plan')).toContain('/plans/plan');
    expect(routes.runs('w', 'p')).toContain('/runs');
    expect(routes.run('w', 'p', 'r')).toContain('/runs/r');
    expect(routes.environments('w', 'p')).toContain('/settings/environments');
    expect(routes.execute('w 1', 'p/1', 'r1')).toBe('/w/w%201/p/p%2F1/runs/r1/execute');
    expect(routes.execute('w 1', 'p/1', 'r1', 'c1')).toBe('/w/w%201/p/p%2F1/runs/r1/execute/c1');
  });
  it.each([
    ['https://evil.test', '/workspaces'],
    ['//evil.test', '/workspaces'],
    ['/safe?q=1', '/safe?q=1'],
    [null, '/workspaces'],
    ['/\\evil', '/workspaces'],
  ])('sanitizes %s', (value, expected) => expect(safeReturnTo(value)).toBe(expected));
  it('encodes returnTo', () => {
    expect(routes.login('/w/1')).toBe('/login?returnTo=%2Fw%2F1');
    expect(routes.login()).toBe('/login');
  });
});
