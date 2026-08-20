import type { ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import type { RequestContext } from '../modules/auth/auth.types.js';

@Injectable()
export class GraphqlThrottlerGuard extends ThrottlerGuard {
  protected override getRequestResponse(context: ExecutionContext): {
    req: Request;
    res: Response;
  } {
    if (context.getType<string>() === 'http') {
      return {
        req: context.switchToHttp().getRequest<Request>(),
        res: context.switchToHttp().getResponse<Response>(),
      };
    }
    const gql = GqlExecutionContext.create(context).getContext<RequestContext>();
    return { req: gql.request as Request, res: gql.response as Response };
  }
}
