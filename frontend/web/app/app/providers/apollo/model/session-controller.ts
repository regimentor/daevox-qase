const REFRESH_WINDOW_MS = 60_000;

export interface SessionTokens {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
}

export interface SessionAuthorization {
  token: string;
  generation: number;
}

export interface CoordinatedSession {
  tokens: SessionTokens;
  generation: number;
}

export type SessionCoordinationEvent =
  | ({ type: 'tokens-updated' } & CoordinatedSession)
  | { type: 'session-ended'; generation: number };

export interface SessionCoordination {
  publish(tokens: SessionTokens): CoordinatedSession;
  runRefresh(
    knownGeneration: number,
    refresh: () => Promise<SessionTokens>,
  ): Promise<CoordinatedSession>;
  end(): number;
  subscribe(listener: (event: SessionCoordinationEvent) => void): () => void;
}

interface RefreshTokenStore {
  read(): string | null;
  write(token: string): void;
  clear(): void;
}

interface SessionControllerDependencies {
  now?: () => number;
  refresh(refreshToken: string): Promise<SessionTokens>;
  refreshTokens: RefreshTokenStore;
  isTerminalRefreshError?: (error: unknown) => boolean;
  onSessionEnded?: () => void;
  coordination?: SessionCoordination;
}

export function createSessionController({
  now = Date.now,
  refresh,
  refreshTokens,
  isTerminalRefreshError = () => false,
  onSessionEnded = () => undefined,
  coordination,
}: SessionControllerDependencies) {
  let accessToken: string | null = null;
  let accessTokenExpiresAt = 0;
  let generation = 0;
  let pendingRefresh: Promise<SessionAuthorization> | null = null;

  const clearLocal = (nextGeneration = generation + 1) => {
    accessToken = null;
    accessTokenExpiresAt = 0;
    generation = nextGeneration;
    refreshTokens.clear();
  };

  const apply = (tokens: SessionTokens, nextGeneration: number): SessionAuthorization => {
    if (nextGeneration <= generation && accessToken) return { token: accessToken, generation };
    accessToken = tokens.accessToken;
    accessTokenExpiresAt = new Date(tokens.accessTokenExpiresAt).getTime();
    generation = nextGeneration;
    refreshTokens.write(tokens.refreshToken);
    return { token: accessToken, generation };
  };

  const accept = (tokens: SessionTokens): SessionAuthorization => {
    const coordinated = coordination?.publish(tokens);
    return apply(tokens, coordinated?.generation ?? generation + 1);
  };

  coordination?.subscribe((event) => {
    if (event.generation <= generation) return;
    if (event.type === 'tokens-updated') {
      apply(event.tokens, event.generation);
      return;
    }
    clearLocal(event.generation);
    onSessionEnded();
  });

  const runRefresh = () => {
    if (!pendingRefresh) {
      pendingRefresh = (async () => {
        const execute = async () => {
          const refreshToken = refreshTokens.read();
          if (!refreshToken) throw new Error('Refresh token missing');
          return refresh(refreshToken);
        };
        if (coordination) {
          const result = await coordination.runRefresh(generation, execute);
          return apply(result.tokens, result.generation);
        }
        return apply(await execute(), generation + 1);
      })().finally(() => {
        pendingRefresh = null;
      });
    }
    return pendingRefresh;
  };

  const terminate = () => {
    const endedGeneration = coordination?.end() ?? generation + 1;
    if (endedGeneration > generation || accessToken) {
      clearLocal(endedGeneration);
      onSessionEnded();
    }
  };

  const recover = async (sentGeneration: number): Promise<SessionAuthorization> => {
    if (accessToken && generation !== sentGeneration) return { token: accessToken, generation };
    try {
      return await runRefresh();
    } catch (error) {
      if (isTerminalRefreshError(error)) {
        terminate();
      }
      throw error;
    }
  };

  return {
    accept,
    clear(publish = true) {
      clearLocal(publish ? (coordination?.end() ?? generation + 1) : generation);
    },
    recover,
    readAuthorization(): SessionAuthorization | null {
      return accessToken ? { token: accessToken, generation } : null;
    },
    async authorize(): Promise<SessionAuthorization | null> {
      if (!accessToken) {
        return refreshTokens.read() ? runRefresh() : null;
      }
      if (accessTokenExpiresAt - now() < REFRESH_WINDOW_MS) {
        try {
          return await runRefresh();
        } catch (error) {
          if (isTerminalRefreshError(error)) {
            terminate();
            throw error;
          }
          if (accessTokenExpiresAt > now()) return { token: accessToken, generation };
          throw error;
        }
      }
      return { token: accessToken, generation };
    },
  };
}
