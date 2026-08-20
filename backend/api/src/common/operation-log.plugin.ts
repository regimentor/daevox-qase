import type { ApolloServerPlugin } from '@apollo/server';

import type { RequestContext } from '../modules/auth/auth.types.js';

export const operationLogPlugin: ApolloServerPlugin<RequestContext> = {
  async requestDidStart(initial) {
    const started = performance.now();
    return {
      async didEncounterErrors(context) {
        for (const error of context.errors) {
          error.extensions.correlationId ??= context.contextValue.correlationId;
          error.extensions.code ??= 'INTERNAL_SERVER_ERROR';
        }
      },
      async willSendResponse(context) {
        const body = context.response.body;
        const errors = body.kind === 'single' ? body.singleResult.errors : undefined;
        const firstCode = errors?.[0]?.extensions?.code;
        process.stdout.write(
          `${JSON.stringify({
            level: errors?.length ? 'warn' : 'info',
            correlationId: initial.contextValue.correlationId,
            operationName: initial.request.operationName ?? 'anonymous',
            userId: initial.contextValue.user?.id,
            durationMs: Math.round((performance.now() - started) * 100) / 100,
            resultCode:
              typeof firstCode === 'string'
                ? firstCode
                : errors?.length
                  ? 'INTERNAL_SERVER_ERROR'
                  : 'OK',
          })}\n`,
        );
      },
    };
  },
};
