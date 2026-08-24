import { CombinedGraphQLErrors } from '@apollo/client';
import { describe, expect, it } from 'vitest';
import { isTerminalRefreshError } from './refresh-error';

describe('refresh error classification', () => {
  it.each(['REFRESH_TOKEN_INVALID', 'REFRESH_TOKEN_REUSED'])('ends the session for %s', (code) => {
    const error = new CombinedGraphQLErrors({ errors: [{ message: code, extensions: { code } }] });
    expect(isTerminalRefreshError(error)).toBe(true);
  });

  it.each([
    new TypeError('network unavailable'),
    new CombinedGraphQLErrors({
      errors: [{ message: 'slow down', extensions: { code: 'TOO_MANY_REQUESTS' } }],
    }),
    new Error('server unavailable'),
  ])('preserves the session for temporary error %#', (error) => {
    expect(isTerminalRefreshError(error)).toBe(false);
  });
});
