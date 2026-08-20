import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { GqlArgumentsHost } from '@nestjs/graphql';
import { ThrottlerException } from '@nestjs/throttler';
import { GraphQLError } from 'graphql';
import { ulid } from 'ulidx';

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'RESOURCE_NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_SERVER_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_ALREADY_EXISTS'
  | 'REFRESH_TOKEN_INVALID'
  | 'REFRESH_TOKEN_REUSED'
  | 'WORKSPACE_MEMBER_ALREADY_EXISTS'
  | 'LAST_ADMIN_REQUIRED'
  | 'PROJECT_CODE_ALREADY_EXISTS'
  | 'PROJECT_ARCHIVED'
  | 'SUITE_CYCLE'
  | 'SUITE_NOT_EMPTY'
  | 'TEST_CASE_ARCHIVED'
  | 'RUN_SOURCE_INVALID'
  | 'RUN_STATE_INVALID'
  | 'RUN_DELETE_FORBIDDEN'
  | 'ATTACHMENT_NOT_READY'
  | 'ATTACHMENT_METADATA_MISMATCH'
  | 'RATE_LIMITED';

export class AppError extends Error {
  public constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly fields?: Readonly<Record<string, string>>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function invariant(
  condition: unknown,
  code: ErrorCode,
  message: string,
  fields?: Readonly<Record<string, string>>,
): asserts condition {
  if (!condition) throw new AppError(code, message, fields);
}

@Catch()
export class GraphqlErrorFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): never {
    const gqlHost = GqlArgumentsHost.create(host);
    const context = gqlHost.getContext<{ correlationId?: string }>();
    const correlationId = context.correlationId ?? ulid();
    if (exception instanceof ThrottlerException) {
      throw new GraphQLError('Too many requests', {
        extensions: { code: 'RATE_LIMITED', correlationId },
      });
    }
    if (exception instanceof AppError) {
      throw new GraphQLError(exception.message, {
        extensions: {
          code: exception.code,
          ...(exception.fields ? { fields: exception.fields } : {}),
          correlationId,
        },
      });
    }
    throw new GraphQLError('Internal server error', {
      extensions: { code: 'INTERNAL_SERVER_ERROR', correlationId },
    });
  }
}
