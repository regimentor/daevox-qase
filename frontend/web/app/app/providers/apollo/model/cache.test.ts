import { describe, expect, it } from 'vitest';
import { createApolloCache, mergeOffsetConnection, readOffsetConnection } from './cache';
const ref = (id: string) => ({ __ref: id });
it('creates an isolated normalized cache', () => expect(createApolloCache().extract()).toEqual({}));
describe('offset connection policy', () => {
  it('merges pages by nested page offset', () => {
    const first = { items: [ref('1'), ref('2')], pageInfo: { limit: 2, offset: 0, total: 4 } };
    const merged = mergeOffsetConnection(
      first,
      { items: [ref('3'), ref('4')], pageInfo: { limit: 2, offset: 2, total: 4 } },
      { args: { page: { offset: 2 } } },
    );
    expect(merged.items.map((item) => item.__ref)).toEqual(['1', '2', '3', '4']);
  });
  it('reads requested slice and misses absent pages', () => {
    const existing = { items: [ref('1'), ref('2')], pageInfo: { limit: 2, offset: 0, total: 4 } };
    expect(
      readOffsetConnection(existing, { args: { page: { offset: 0, limit: 1 } } })?.items,
    ).toHaveLength(1);
    expect(
      readOffsetConnection(existing, { args: { page: { offset: 3, limit: 1 } } }),
    ).toBeUndefined();
    expect(readOffsetConnection(undefined, { args: null })).toBeUndefined();
  });
});
