import { describe, expect, it } from 'vitest';
import { formatDate, formatDuration } from '.';
describe('date and duration formatting', () => {
  it('formats empty and invalid dates safely', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
  });
  it('formats a valid instant in the user locale', () => {
    expect(formatDate('2026-08-20T08:00:00Z')).not.toBe('—');
  });
  it.each([
    [0, '0 сек'],
    [45, '45 сек'],
    [90, '1 мин 30 сек'],
    [3600, '1 ч'],
    [3665, '1 ч 1 мин'],
  ])('formats %s seconds', (seconds, expected) => expect(formatDuration(seconds)).toBe(expected));
  it('handles null duration', () => expect(formatDuration(null)).toBe('—'));
});
