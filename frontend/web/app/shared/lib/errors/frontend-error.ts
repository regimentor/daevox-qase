import { CombinedGraphQLErrors } from '@apollo/client/errors';
import type { FormInstance } from 'antd';

export type FrontendErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'LAST_ADMIN_REQUIRED'
  | 'RUN_SOURCE_INVALID'
  | 'RUN_STATE_INVALID'
  | 'CONFLICT'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export interface FrontendError {
  code: FrontendErrorCode;
  message: string;
  fields: Record<string, string>;
  correlationId?: string;
}

const messages: Partial<Record<FrontendErrorCode, string>> = {
  INVALID_CREDENTIALS: 'Неверный email или пароль.',
  UNAUTHENTICATED: 'Сессия истекла. Войдите снова.',
  FORBIDDEN: 'У вас нет прав для этого действия.',
  RESOURCE_NOT_FOUND: 'Объект не найден или недоступен.',
  LAST_ADMIN_REQUIRED: 'В рабочем пространстве должен остаться хотя бы один администратор.',
  RUN_SOURCE_INVALID: 'Выберите либо тест-план, либо тест-кейсы.',
  RUN_STATE_INVALID: 'Действие недоступно в текущем состоянии запуска.',
  CONFLICT: 'Действие конфликтует с существующими данными.',
  NETWORK_ERROR: 'Нет соединения с сервером. Проверьте сеть и повторите попытку.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function toFrontendError(error: unknown): FrontendError {
  if (CombinedGraphQLErrors.is(error)) {
    const first = error.errors[0];
    const extensions = isRecord(first?.extensions) ? first.extensions : {};
    const rawCode = typeof extensions.code === 'string' ? extensions.code : 'UNKNOWN';
    const code =
      rawCode in messages || ['VALIDATION_ERROR'].includes(rawCode)
        ? (rawCode as FrontendErrorCode)
        : 'UNKNOWN';
    const rawFields = isRecord(extensions.fields) ? extensions.fields : {};
    const fields = Object.fromEntries(
      Object.entries(rawFields).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
    const correlationId =
      typeof extensions.correlationId === 'string' ? extensions.correlationId : undefined;
    return {
      code,
      message: messages[code] ?? first?.message ?? 'Неожиданная ошибка.',
      fields,
      correlationId,
    };
  }
  if (error instanceof TypeError)
    return { code: 'NETWORK_ERROR', message: messages.NETWORK_ERROR!, fields: {} };
  if (isRecord(error) && typeof error.code === 'string' && typeof error.message === 'string') {
    return { code: error.code as FrontendErrorCode, message: error.message, fields: {} };
  }
  return {
    code: 'UNKNOWN',
    message: error instanceof Error ? error.message : 'Неожиданная ошибка.',
    fields: {},
  };
}

export function applyServerFieldErrors<T extends object>(form: FormInstance<T>, error: unknown) {
  const mapped = toFrontendError(error);
  const fields = Object.entries(mapped.fields).map(([name, message]) => ({
    name: [name],
    errors: [message],
  }));
  form.setFields(fields as Parameters<FormInstance<T>['setFields']>[0]);
  return mapped;
}
