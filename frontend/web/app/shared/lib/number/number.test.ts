import { describe, expect, it } from 'vitest';
import { clampPercentage, formatPercentage } from '.';
describe('percentages', () => {
  it.each([
    [Number.NaN, 0],
    [-2, 0],
    [10.6, 11],
    [120, 100],
  ])('clamps %s', (value, expected) => expect(clampPercentage(value)).toBe(expected));
  it('formats', () => expect(formatPercentage(75.2)).toBe('75%'));
});
