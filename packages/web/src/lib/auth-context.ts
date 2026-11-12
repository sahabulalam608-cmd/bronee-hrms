import { createContext, useContext } from 'react';
import type { PublicUser } from '@bronee/shared';

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

/**
 * The auth context lives in its own module so `auth.tsx` can export only the
 * <AuthProvider /> component — that keeps React Fast Refresh working during
 * development instead of falling back to a full reload.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
