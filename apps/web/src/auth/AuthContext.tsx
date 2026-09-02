import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { setToken } from '../api/client';
import { endpoints } from '../api';
import type { PublicUser } from '../api/types';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  user: PublicUser | null;
  login: (email: string, password: string) => Promise<PublicUser>;
  register: (body: { name: string; email: string; password: string; role: 'WAREHOUSE' | 'SALES' }) => Promise<PublicUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const me = await endpoints.auth.me();
        if (!cancelled) {
          setUser(me);
          setStatus('authenticated');
        }
      } catch {
        if (!cancelled) setStatus('anonymous');
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { accessToken, user: u } = await endpoints.auth.login({ email, password });
    setToken(accessToken);
    setUser(u);
    setStatus('authenticated');
    return u;
  }, []);

  const register = useCallback(
    async (body: { name: string; email: string; password: string; role: 'WAREHOUSE' | 'SALES' }) => {
      const u = await endpoints.auth.register(body);
      const { accessToken } = await endpoints.auth.login({ email: u.email, password: body.password });
      setToken(accessToken);
      setUser(u);
      setStatus('authenticated');
      return u;
    },
    [],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthState>(
    () => ({ status, user, login, register, logout }),
    [status, user, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
