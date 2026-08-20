import { describe, expect, it } from 'vitest';

import { AppError } from '../src/common/errors.js';
import { limits, optionalText, page, text, uniqueIds } from '../src/common/validation.js';

describe('input protection', () => {
  it('enforces the pagination hard limit', () => {
    expect(page(null)).toEqual({ limit: 50, offset: 0 });
    expect(page({ limit: 1, offset: 0 })).toEqual({ limit: 1, offset: 0 });
    expect(page({ limit: 100, offset: 25 })).toEqual({ limit: 100, offset: 25 });
    expect(() => page({ limit: 0 })).toThrow(AppError);
    expect(() => page({ limit: 101 })).toThrow(AppError);
    expect(() => page({ offset: -1 })).toThrow(AppError);
  });

  it('rejects duplicate bulk IDs before persistence', () => {
    expect(uniqueIds(['a', 'b'], 'ids', 2)).toBeUndefined();
    expect(() => uniqueIds(['a', 'a'], 'ids', 10)).toThrow(AppError);
    expect(() => uniqueIds(['a', 'b', 'c'], 'ids', 2)).toThrow(AppError);
  });

  it('normalizes required text and preserves explicit nullable updates', () => {
    expect(text('  QA  ', 'name', limits.name)).toBe('QA');
    expect(text('  QA  ', 'name', limits.name, { trim: false })).toBe('  QA  ');
    expect(() => text('   ', 'name', limits.name)).toThrow(AppError);
    expect(() => text('abc', 'tag', 2)).toThrow(AppError);
    expect(optionalText(undefined, 'description')).toBeUndefined();
    expect(optionalText(null, 'description')).toBeNull();
    expect(optionalText('', 'description')).toBe('');
    expect(() => optionalText('x'.repeat(limits.longText + 1), 'description')).toThrow(AppError);
  });
});
