import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PublicUser } from '@bronee/shared';
import { api } from './api';

export type AuthContextValue = {
  user: PublicUser | null;
  permissions: string[];
  isLoading: boolean;
  isAuthenticated: boolean;
  isHr: boolean;
  login: (email: string, password: string) => Promise<PublicUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{ user: PublicUser; permissions: string[] }>('/auth/me');
      setUser(data.user);
      setPermissions(data.permissions ?? []);
    } catch {
      setUser(null);
      setPermissions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api.post<{ user: PublicUser }>('/auth/login', { email, password });
      setUser(data.user);
      await refresh();
      await queryClient.invalidateQueries();
      return data.user;
    },
    [queryClient, refresh],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
      setPermissions([]);
      queryClient.clear();
    }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      permissions,
      isLoading,
      isAuthenticated: Boolean(user),
      isHr: user?.role === 'hr' || user?.role === 'super_admin',
      login,
      logout,
      refresh,
      hasPermission: (permission: string) => permissions.includes(permission),
    }),
    [user, permissions, isLoading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
