import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { api } from '../api/client';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  /** After PATCH /api/me/contact — keeps session email/phone in sync with server */
  syncUserFromServer: (partial: Partial<Pick<User, 'email' | 'phone'>>) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  login: async () => {},
  logout: () => {},
  isLoading: true,
  syncUserFromServer: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Parse and hydrate session from localStorage (used on init and cross-tab sync)
  const hydrateFromStorage = () => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (savedToken && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser) as User;
        setToken(savedToken);
        setUser(parsedUser);
        return parsedUser;
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken(null);
        setUser(null);
      }
    } else {
      setToken(null);
      setUser(null);
    }
    return null;
  };

  useEffect(() => {
    hydrateFromStorage();
    setIsLoading(false);

    // When another tab logs in as a different user (or logs out), sync this tab immediately
    // instead of silently failing API calls with a mismatched token.
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'token' || e.key === 'user') {
        hydrateFromStorage();
      }
    };

    const handleUnauthorized = () => {
      setToken(null);
      setUser(null);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  const login = async (email: string, password: string) => {
    const result = await api.login(email, password);
    const userData: User = {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role: result.user.role as User['role'],
      operatorId: result.user.operatorId,
    };
    setToken(result.token);
    setUser(userData);
    localStorage.setItem('token', result.token);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  const syncUserFromServer = (partial: Partial<Pick<User, 'email' | 'phone'>>) => {
    setUser((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...partial };
      try {
        localStorage.setItem('user', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading, syncUserFromServer }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
