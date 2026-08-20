import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import type { AuthenticatedUser, RequestContext } from './auth.types.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, executionContext: ExecutionContext): AuthenticatedUser => {
    const context = GqlExecutionContext.create(executionContext).getContext<RequestContext>();
    if (!context.user) throw new Error('Authentication guard did not provide a user');
    return context.user;
  },
);
