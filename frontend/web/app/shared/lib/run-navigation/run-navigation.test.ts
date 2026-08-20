import { describe, expect, it } from 'vitest';
import { adjacentRunCase, nextUntestedRunCase } from '.';
const cases = [
  { id: '1', currentStatus: 'PASSED' },
  { id: '2', currentStatus: 'FAILED' },
  { id: '3', currentStatus: 'UNTESTED' },
];
describe('run navigation', () => {
  it('finds adjacent cases', () => {
    expect(adjacentRunCase(cases, '2', 'previous')?.id).toBe('1');
    expect(adjacentRunCase(cases, '2', 'next')?.id).toBe('3');
    expect(adjacentRunCase(cases, 'missing', 'next')).toBeUndefined();
  });
  it('prefers following untested then wraps', () => {
    expect(nextUntestedRunCase(cases, '1')?.id).toBe('3');
    expect(nextUntestedRunCase(cases, '3')?.id).toBe('3');
  });
});
