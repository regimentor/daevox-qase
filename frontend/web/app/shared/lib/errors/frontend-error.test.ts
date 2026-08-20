import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { describe, expect, it, vi } from 'vitest';
import { applyServerFieldErrors, toFrontendError } from './frontend-error';
describe('GraphQL error mapping', () => {
  it('maps domain code, fields and correlation id', () => {
    const error = new CombinedGraphQLErrors({
      errors: [
        {
          message: 'invalid',
          extensions: {
            code: 'VALIDATION_ERROR',
            fields: { email: 'Некорректно', ignored: 2 },
            correlationId: 'req-1',
          },
        },
      ],
    });
    expect(toFrontendError(error)).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'invalid',
      fields: { email: 'Некорректно' },
      correlationId: 'req-1',
    });
  });
  it('uses safe messages and maps form fields', () => {
    const error = new CombinedGraphQLErrors({
      errors: [{ message: 'raw', extensions: { code: 'LAST_ADMIN_REQUIRED' } }],
    });
    const form = { setFields: vi.fn() };
    expect(applyServerFieldErrors(form as never, error).message).toContain('администратор');
    expect(form.setFields).toHaveBeenCalled();
  });
  it('maps an archived suite error', () => {
    const error = new CombinedGraphQLErrors({
      errors: [{ message: 'raw', extensions: { code: 'SUITE_ARCHIVED' } }],
    });
    expect(toFrontendError(error).message).toBe('Suite архивирован. Сначала восстановите его.');
  });
  it('maps network and unknown errors', () => {
    expect(toFrontendError(new TypeError('fetch')).code).toBe('NETWORK_ERROR');
    expect(toFrontendError(new Error('boom')).message).toBe('boom');
    expect(toFrontendError(null).code).toBe('UNKNOWN');
  });
});
