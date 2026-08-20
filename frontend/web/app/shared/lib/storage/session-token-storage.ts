const REFRESH_TOKEN_KEY = 'daevox.session.refresh';

export interface SessionTokenStorage {
  readRefreshToken(): string | null;
  writeRefreshToken(token: string): void;
  clear(): void;
}

export function createSessionTokenStorage(
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): SessionTokenStorage {
  const target = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
  return {
    readRefreshToken: () => target?.getItem(REFRESH_TOKEN_KEY) ?? null,
    writeRefreshToken: (token) => target?.setItem(REFRESH_TOKEN_KEY, token),
    clear: () => target?.removeItem(REFRESH_TOKEN_KEY),
  };
}

export const sessionTokenStorage = createSessionTokenStorage();
