import { CombinedGraphQLErrors } from '@apollo/client';

const TERMINAL_REFRESH_CODES = new Set(['REFRESH_TOKEN_INVALID', 'REFRESH_TOKEN_REUSED']);

export function isTerminalRefreshError(error: unknown) {
  return (
    CombinedGraphQLErrors.is(error) &&
    error.errors.some(
      (item) =>
        typeof item.extensions?.code === 'string' &&
        TERMINAL_REFRESH_CODES.has(item.extensions.code),
    )
  );
}
