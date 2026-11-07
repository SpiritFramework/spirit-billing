import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setUnauthorizedHandler } from '../lib/api';

export type PanelStatus = 'linked' | 'missing' | 'unreachable';

export type User = {
  id: string;
  email: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl?: string | null;
  role: 'admin' | 'staff' | 'client';
  panelUserId: string | null;
  creditBalanceCents: number;
  createdAt: string;
};

type AuthState = {
  user: User | null;
  panelWebUrl: string;
  panelLinked: boolean;
  panelStatus: PanelStatus;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (user: User | null) => void;
  setPanelWebUrl: (url: string) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [panelWebUrl, setPanelWebUrl] = useState('http://localhost:5173');
  const [panelLinked, setPanelLinked] = useState(false);
  const [panelStatus, setPanelStatus] = useState<PanelStatus>('missing');
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const data = await api<{
        user: User;
        panelWebUrl: string;
        panelLinked?: boolean;
        panelStatus?: PanelStatus;
      }>('/auth/me');
      setUser(data.user);
      setPanelWebUrl(data.panelWebUrl);
      setPanelLinked(Boolean(data.panelLinked));
      setPanelStatus(data.panelStatus ?? (data.panelLinked ? 'linked' : 'missing'));
    } catch {
      setUser(null);
      setPanelLinked(false);
      setPanelStatus('missing');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setPanelLinked(false);
      setPanelStatus('missing');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* still clear local session */
    }
    setUser(null);
    setPanelLinked(false);
    setPanelStatus('missing');
    setPanelWebUrl('http://localhost:5173');
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        panelWebUrl,
        panelLinked,
        panelStatus,
        loading,
        refresh,
        setUser,
        setPanelWebUrl,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}

/** Sign out and send the user to the login page. */
export function useLogout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return async () => {
    await logout();
    navigate('/login', { replace: true });
  };
}
