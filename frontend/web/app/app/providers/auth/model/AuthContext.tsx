import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type { User } from '@/shared/api/graphql';
import { LoginDocument, LogoutDocument, RegisterDocument } from '@/shared/api/graphql';
import { sessionTokenStorage } from '@/shared/lib/storage';
import {
  accessTokenMemory,
  apolloClient,
  bootstrapSession,
  onSessionExpired,
} from '@/app/providers/apollo';

interface AuthContextValue {
  user: Pick<User, 'id' | 'email' | 'name'> | null;
  ready: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, name: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthContextValue['user']>(null);
  const [ready, setReady] = useState(false);

  const clearSession = useCallback(async () => {
    accessTokenMemory.clear();
    sessionTokenStorage.clear();
    setUser(null);
    await apolloClient.clearStore();
  }, []);

  useEffect(() => {
    let active = true;
    void bootstrapSession().then((nextUser) => {
      if (active) {
        setUser(nextUser);
        setReady(true);
      }
    });
    const unsubscribe = onSessionExpired(() => void clearSession());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [clearSession]);

  const acceptPayload = useCallback(
    (payload: {
      accessToken: string;
      refreshToken: string;
      user: Pick<User, 'id' | 'email' | 'name'>;
    }) => {
      accessTokenMemory.write(payload.accessToken);
      sessionTokenStorage.writeRefreshToken(payload.refreshToken);
      setUser(payload.user);
    },
    [],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await apolloClient.mutate({
        mutation: LoginDocument,
        variables: { email, password },
      });
      if (!result.data) throw new Error('Пустой ответ авторизации');
      acceptPayload(result.data.login);
    },
    [acceptPayload],
  );

  const register = useCallback(
    async (email: string, name: string, password: string) => {
      const result = await apolloClient.mutate({
        mutation: RegisterDocument,
        variables: { email, name, password },
      });
      if (!result.data) throw new Error('Пустой ответ регистрации');
      acceptPayload(result.data.register);
    },
    [acceptPayload],
  );

  const logout = useCallback(async () => {
    const refreshToken = sessionTokenStorage.readRefreshToken();
    try {
      if (refreshToken)
        await apolloClient.mutate({ mutation: LogoutDocument, variables: { refreshToken } });
    } finally {
      await clearSession();
      sessionStorage.clear();
    }
  }, [clearSession]);

  const value = useMemo(
    () => ({ user, ready, login, register, logout }),
    [user, ready, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
