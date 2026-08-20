import { CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Reflector } from '@nestjs/core';

import { AppError } from '../../common/errors.js';
import { AuthService } from './auth.service.js';
import type { RequestContext } from './auth.types.js';
import { IS_PUBLIC } from './public.decorator.js';

@Injectable()
export class AuthGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  public async canActivate(executionContext: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        executionContext.getHandler(),
        executionContext.getClass(),
      ])
    )
      return true;
    const context = GqlExecutionContext.create(executionContext).getContext<RequestContext>();
    const value = context.request.headers.authorization;
    const authorization = Array.isArray(value) ? value[0] : value;
    if (!authorization?.startsWith('Bearer '))
      throw new AppError('UNAUTHENTICATED', 'Authentication required');
    context.user = await this.auth.verifyAccessToken(authorization.slice(7));
    return true;
  }
}
