import { ApolloLink, CombinedGraphQLErrors, Observable } from '@apollo/client';
import { SetContextLink } from '@apollo/client/link/context';
import type { SessionAuthorization } from './session-controller';

export interface SessionAuthorizer {
  authorize(): Promise<SessionAuthorization | null>;
  recover(sentGeneration: number): Promise<SessionAuthorization>;
}

const SESSION_OPERATIONS = new Set(['Login', 'Register', 'Logout', 'RefreshSession']);

export function createSessionLink(session: SessionAuthorizer): ApolloLink {
  const authorizationLink = new SetContextLink(async (context, operation) => {
    if (SESSION_OPERATIONS.has(operation.operationName ?? '')) {
      return { ...context, skipSession: true };
    }
    const authorization = await session.authorize();
    return {
      ...context,
      sessionGeneration: authorization?.generation,
      headers: {
        ...context.headers,
        ...(authorization ? { authorization: `Bearer ${authorization.token}` } : {}),
      },
    };
  });

  const recoveryLink = new ApolloLink(
    (operation, forward) =>
      new Observable((observer) => {
        let retrySubscription: { unsubscribe(): void } | undefined;
        const subscription = forward(operation).subscribe({
          next: (value) => observer.next(value),
          complete: () => observer.complete(),
          error: (error: unknown) => {
            const unauthenticated =
              CombinedGraphQLErrors.is(error) &&
              error.data == null &&
              error.errors.some((item) => item.extensions?.code === 'UNAUTHENTICATED');
            const context = operation.getContext();
            if (!unauthenticated || context.authRetried === true || context.skipSession === true) {
              observer.error(error);
              return;
            }
            const sentGeneration = context.sessionGeneration;
            if (typeof sentGeneration !== 'number') {
              observer.error(error);
              return;
            }
            session
              .recover(sentGeneration)
              .then((authorization) => {
                operation.setContext(({ headers = {} }) => ({
                  headers: {
                    ...headers,
                    authorization: `Bearer ${authorization.token}`,
                  },
                  sessionGeneration: authorization.generation,
                  authRetried: true,
                }));
                retrySubscription = forward(operation).subscribe(observer);
              })
              .catch((recoveryError: unknown) => observer.error(recoveryError));
          },
        });
        return () => {
          subscription.unsubscribe();
          retrySubscription?.unsubscribe();
        };
      }),
  );

  return ApolloLink.from([authorizationLink, recoveryLink]);
}
