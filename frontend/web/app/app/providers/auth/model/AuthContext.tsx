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
  apolloClient,
  bootstrapSession,
  onSessionExpired,
  sessionController,
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

  const clearSession = useCallback(async (publish = true) => {
    sessionController.clear(publish);
    setUser(null);
    await apolloClient.clearStore();
  }, []);

  useEffect(() => {
    let active = true;
    let restoring = false;
    let restored = false;
    const restore = () => {
      if (restoring || restored) return;
      restoring = true;
      void bootstrapSession()
        .then((nextUser) => {
          restored = true;
          if (active) {
            setUser(nextUser);
            setReady(true);
          }
        })
        .catch(() => {
          // Keep the app in recovery state while a retained session is temporarily unavailable.
        })
        .finally(() => {
          restoring = false;
        });
    };
    restore();
    window.addEventListener('online', restore);
    window.addEventListener('focus', restore);
    const unsubscribe = onSessionExpired(() => void clearSession(false));
    return () => {
      active = false;
      window.removeEventListener('online', restore);
      window.removeEventListener('focus', restore);
      unsubscribe();
    };
  }, [clearSession]);

  const acceptPayload = useCallback(
    (payload: {
      accessToken: string;
      accessTokenExpiresAt: string;
      refreshToken: string;
      user: Pick<User, 'id' | 'email' | 'name'>;
    }) => {
      sessionController.accept(payload);
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
