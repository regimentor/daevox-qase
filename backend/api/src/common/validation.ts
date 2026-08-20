import { AppError, invariant } from './errors.js';

export const limits = {
  name: 200,
  tagName: 64,
  code: 32,
  title: 500,
  longText: 100_000,
  steps: 500,
  cases: 10_000,
  attachments: 20,
  suiteDepth: 32,
} as const;

export function text(
  value: string,
  field: string,
  maximum: number,
  options: { trim?: boolean } = { trim: true },
): string {
  const normalized = options.trim === false ? value : value.trim();
  invariant(normalized.length > 0, 'VALIDATION_ERROR', 'Request validation failed', {
    [field]: `${field} is required`,
  });
  invariant(normalized.length <= maximum, 'VALIDATION_ERROR', 'Request validation failed', {
    [field]: `${field} must contain at most ${maximum} characters`,
  });
  return normalized;
}

export function optionalText(
  value: string | null | undefined,
  field: string,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value.length > limits.longText) {
    throw new AppError('VALIDATION_ERROR', 'Request validation failed', {
      [field]: `${field} must contain at most ${limits.longText} characters`,
    });
  }
  return value;
}

export function page(input?: { limit?: number | null; offset?: number | null } | null): {
  limit: number;
  offset: number;
} {
  const limit = input?.limit ?? 50;
  const offset = input?.offset ?? 0;
  invariant(limit >= 1 && limit <= 100, 'VALIDATION_ERROR', 'Request validation failed', {
    limit: 'limit must be between 1 and 100',
  });
  invariant(offset >= 0, 'VALIDATION_ERROR', 'Request validation failed', {
    offset: 'offset must be non-negative',
  });
  return { limit, offset };
}

export function uniqueIds(ids: readonly string[], field: string, maximum: number): void {
  invariant(ids.length <= maximum, 'VALIDATION_ERROR', 'Request validation failed', {
    [field]: `${field} accepts at most ${maximum} items`,
  });
  invariant(new Set(ids).size === ids.length, 'VALIDATION_ERROR', 'Request validation failed', {
    [field]: `${field} contains duplicates`,
  });
}
