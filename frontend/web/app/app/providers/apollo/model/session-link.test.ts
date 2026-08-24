import {
  ApolloClient,
  ApolloLink,
  CombinedGraphQLErrors,
  InMemoryCache,
  Observable,
  gql,
} from '@apollo/client';
import { describe, expect, it, vi } from 'vitest';
import { createSessionController } from './session-controller';
import { createSessionLink } from './session-link';

describe('Apollo session link', () => {
  it.each(['Login', 'Register', 'Logout', 'RefreshSession'])(
    'does not refresh before the %s session operation',
    async (operationName) => {
      const session = { authorize: vi.fn(), recover: vi.fn() };
      const network = new ApolloLink(
        () =>
          new Observable((observer) => {
            observer.next({ data: { ok: true } });
            observer.complete();
          }),
      );
      const client = new ApolloClient({
        cache: new InMemoryCache(),
        link: createSessionLink(session).concat(network),
      });

      await client.mutate({ mutation: gql`mutation ${operationName} { ok }` });

      expect(session.authorize).not.toHaveBeenCalled();
    },
  );

  it('refreshes a nearly expired session before sending the operation', async () => {
    const controller = createSessionController({
      now: () => new Date('2026-08-24T10:00:00.000Z').getTime(),
      refresh: async () => ({
        accessToken: 'access-2',
        accessTokenExpiresAt: '2026-08-24T10:15:00.000Z',
        refreshToken: 'refresh-2',
      }),
      refreshTokens: { read: () => 'refresh-1', write: vi.fn(), clear: vi.fn() },
    });
    controller.accept({
      accessToken: 'access-1',
      accessTokenExpiresAt: '2026-08-24T10:00:30.000Z',
      refreshToken: 'refresh-1',
    });
    const network = new ApolloLink(
      (operation) =>
        new Observable((observer) => {
          expect(operation.getContext().headers.authorization).toBe('Bearer access-2');
          observer.next({ data: { viewer: 'Alice' } });
          observer.complete();
        }),
    );
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: createSessionLink(controller).concat(network),
    });

    await expect(
      client.query({
        query: gql`
          query Viewer {
            viewer
          }
        `,
        fetchPolicy: 'no-cache',
      }),
    ).resolves.toMatchObject({ data: { viewer: 'Alice' } });
  });

  it('recovers an unauthenticated operation once with the refreshed authorization', async () => {
    const session = {
      authorize: vi.fn(async () => ({ token: 'access-1', generation: 4 })),
      recover: vi.fn(async () => ({ token: 'access-2', generation: 5 })),
    };
    let attempts = 0;
    const network = new ApolloLink(
      (operation) =>
        new Observable((observer) => {
          attempts += 1;
          if (attempts === 1) {
            observer.error(
              new CombinedGraphQLErrors({
                errors: [{ message: 'expired', extensions: { code: 'UNAUTHENTICATED' } }],
              }),
            );
            return;
          }
          expect(operation.getContext().headers.authorization).toBe('Bearer access-2');
          observer.next({ data: { viewer: 'Alice' } });
          observer.complete();
        }),
    );
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: createSessionLink(session).concat(network),
    });

    await expect(
      client.query({
        query: gql`
          query Viewer {
            viewer
          }
        `,
        fetchPolicy: 'no-cache',
      }),
    ).resolves.toMatchObject({ data: { viewer: 'Alice' } });
    expect(session.recover).toHaveBeenCalledWith(4);
    expect(attempts).toBe(2);
  });

  it('does not repeat an unauthenticated operation that returned partial data', async () => {
    const session = {
      authorize: vi.fn(async () => ({ token: 'access-1', generation: 1 })),
      recover: vi.fn(),
    };
    let attempts = 0;
    const partialError = new CombinedGraphQLErrors({
      data: { updateName: { id: 'user-1' } },
      errors: [{ message: 'expired', extensions: { code: 'UNAUTHENTICATED' } }],
    });
    const network = new ApolloLink(
      () =>
        new Observable((observer) => {
          attempts += 1;
          observer.error(partialError);
        }),
    );
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: createSessionLink(session).concat(network),
    });

    await expect(
      client.mutate({
        mutation: gql`
          mutation UpdateName {
            updateName {
              id
            }
          }
        `,
      }),
    ).rejects.toBe(partialError);
    expect(session.recover).not.toHaveBeenCalled();
    expect(attempts).toBe(1);
  });

  it('never retries the same operation more than once', async () => {
    const session = {
      authorize: vi.fn(async () => ({ token: 'access-1', generation: 1 })),
      recover: vi.fn(async () => ({ token: 'access-2', generation: 2 })),
    };
    let attempts = 0;
    const unauthenticated = new CombinedGraphQLErrors({
      errors: [{ message: 'expired', extensions: { code: 'UNAUTHENTICATED' } }],
    });
    const network = new ApolloLink(
      () =>
        new Observable((observer) => {
          attempts += 1;
          observer.error(unauthenticated);
        }),
    );
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: createSessionLink(session).concat(network),
    });

    await expect(
      client.query({
        query: gql`
          query Viewer {
            viewer
          }
        `,
      }),
    ).rejects.toBe(unauthenticated);
    expect(session.recover).toHaveBeenCalledOnce();
    expect(attempts).toBe(2);
  });
});
