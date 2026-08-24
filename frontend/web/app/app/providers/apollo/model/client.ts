import { ApolloClient, HttpLink } from '@apollo/client';
import { CurrentUserDocument, RefreshSessionDocument } from '@/shared/api/graphql';
import { sessionTokenStorage } from '@/shared/lib/storage';
import { createBrowserSessionCoordination } from './browser-session-coordination';
import { restoreSession } from './bootstrap-session';
import { createApolloCache } from './cache';
import { isTerminalRefreshError } from './refresh-error';
import { createSessionController, type SessionTokens } from './session-controller';
import { createSessionLink } from './session-link';
import { emitSessionExpired } from './session-events';

const endpoint = import.meta.env.VITE_GRAPHQL_URL || '/graphql';
const httpLink = new HttpLink({ uri: endpoint });
const refreshClient = new ApolloClient({
  cache: createApolloCache(),
  link: httpLink,
  devtools: { enabled: false },
});
async function refreshSession(refreshToken: string): Promise<SessionTokens> {
  const response = await refreshClient.mutate({
    mutation: RefreshSessionDocument,
    variables: { refreshToken },
    fetchPolicy: 'no-cache',
  });
  if (!response.data) throw new Error('Refresh response missing');
  return response.data.refresh;
}

const sessionCoordination = createBrowserSessionCoordination();

export const sessionController = createSessionController({
  refresh: refreshSession,
  refreshTokens: {
    read: () => sessionTokenStorage.readRefreshToken(),
    write: (token) => sessionTokenStorage.writeRefreshToken(token),
    clear: () => sessionTokenStorage.clear(),
  },
  isTerminalRefreshError,
  onSessionEnded: emitSessionExpired,
  coordination: sessionCoordination,
});

export const apolloClient = new ApolloClient({
  cache: createApolloCache(),
  link: createSessionLink(sessionController).concat(httpLink),
  devtools: { enabled: import.meta.env.DEV },
  defaultOptions: { watchQuery: { notifyOnNetworkStatusChange: true } },
});

export async function bootstrapSession() {
  return restoreSession({
    hasRefreshToken: () => Boolean(sessionTokenStorage.readRefreshToken()),
    authorize: () => sessionController.authorize(),
    loadUser: async () => {
      const result = await apolloClient.query({
        query: CurrentUserDocument,
        fetchPolicy: 'network-only',
      });
      return result.data?.me ?? null;
    },
    clearStore: () => apolloClient.clearStore(),
  });
}
