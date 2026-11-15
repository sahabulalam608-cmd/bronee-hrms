import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import type { SessionUser } from '@shared/types';

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<SessionUser>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  homePath: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await api.login(email, password);
      setUser(result.user);
      return result.user;
    },
    [],
  );

  const signOut = useCallback(async () => {
    await api.logout();
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const homePath = user?.portal === 'HR' ? '/hr/dashboard' : '/employee/dashboard';

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, refresh, homePath }),
    [user, loading, signIn, signOut, refresh, homePath],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
