import {
  ApolloClient,
  ApolloLink,
  CombinedGraphQLErrors,
  HttpLink,
  Observable,
} from '@apollo/client';
import { SetContextLink } from '@apollo/client/link/context';
import { CurrentUserDocument, RefreshSessionDocument } from '@/shared/api/graphql';
import { sessionTokenStorage } from '@/shared/lib/storage';
import { accessTokenMemory } from './access-token';
import { createApolloCache } from './cache';
import { RefreshCoordinator } from './refresh-coordinator';
import { emitSessionExpired } from './session-events';

const endpoint = import.meta.env.VITE_GRAPHQL_URL || '/graphql';
const httpLink = new HttpLink({ uri: endpoint });
const refreshClient = new ApolloClient({
  cache: createApolloCache(),
  link: httpLink,
  devtools: { enabled: false },
});
const refreshCoordinator = new RefreshCoordinator<string>();

async function refreshAccessToken(): Promise<string> {
  const refreshToken = sessionTokenStorage.readRefreshToken();
  if (!refreshToken) throw new Error('Refresh token missing');
  const response = await refreshClient.mutate({
    mutation: RefreshSessionDocument,
    variables: { refreshToken },
    fetchPolicy: 'no-cache',
  });
  if (!response.data) throw new Error('Refresh response missing');
  accessTokenMemory.write(response.data.refresh.accessToken);
  sessionTokenStorage.writeRefreshToken(response.data.refresh.refreshToken);
  return response.data.refresh.accessToken;
}

const authLink = new SetContextLink((context) => {
  const token = accessTokenMemory.read();
  return {
    headers: { ...context.headers, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  };
});

function isUnauthenticated(error: unknown) {
  return (
    CombinedGraphQLErrors.is(error) &&
    error.errors.some((item) => item.extensions?.code === 'UNAUTHENTICATED')
  );
}

const refreshLink = new ApolloLink(
  (operation, forward) =>
    new Observable((observer) => {
      let retrySubscription: { unsubscribe(): void } | undefined;
      const subscription = forward(operation).subscribe({
        next: (value) => observer.next(value),
        complete: () => observer.complete(),
        error: (error: unknown) => {
          const alreadyRetried = operation.getContext().authRetried === true;
          if (
            !isUnauthenticated(error) ||
            alreadyRetried ||
            operation.operationName === 'RefreshSession'
          ) {
            observer.error(error);
            return;
          }
          refreshCoordinator
            .run(refreshAccessToken)
            .then((token) => {
              operation.setContext(({ headers = {} }) => ({
                headers: { ...headers, authorization: `Bearer ${token}` },
                authRetried: true,
              }));
              retrySubscription = forward(operation).subscribe(observer);
            })
            .catch((refreshError: unknown) => {
              accessTokenMemory.clear();
              sessionTokenStorage.clear();
              emitSessionExpired();
              observer.error(refreshError);
            });
        },
      });
      return () => {
        subscription.unsubscribe();
        retrySubscription?.unsubscribe();
      };
    }),
);

export const apolloClient = new ApolloClient({
  cache: createApolloCache(),
  link: ApolloLink.from([refreshLink, authLink, httpLink]),
  devtools: { enabled: import.meta.env.DEV },
  defaultOptions: { watchQuery: { notifyOnNetworkStatusChange: true } },
});

export async function bootstrapSession() {
  if (!sessionTokenStorage.readRefreshToken()) return null;
  try {
    await refreshCoordinator.run(refreshAccessToken);
    const result = await apolloClient.query({
      query: CurrentUserDocument,
      fetchPolicy: 'network-only',
    });
    return result.data?.me ?? null;
  } catch {
    accessTokenMemory.clear();
    sessionTokenStorage.clear();
    await apolloClient.clearStore();
    return null;
  }
}
