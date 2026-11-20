import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import { API_BASE_URL } from '@/config/api';
import { AccountApprovedModal } from '@/components/AccountApprovedModal';
import { isAccountUnderReview } from '@/utils/ownerStatus';

export const MIN_SPLASH_MS = 2400;

interface User {
  id: number;
  name: string;
  email: string;
  role?: string;
  token?: string;
  profile_photo_url?: string;
  firstname?: string;
  lastname?: string;
  approval_status?: 'pending' | 'approved' | 'rejected';
  approval_label?: string;
  account_under_review?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  dismissApprovalCelebration: () => void;
  showApprovalCelebration: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Diri basahon ang token ug user nga na-save.
async function readStoredAuth(): Promise<{ token: string | null; user: string | null }> {
  if (Platform.OS === 'web') {
    return {
      token: localStorage.getItem('token'),
      user: localStorage.getItem('user'),
    };
  }
  return {
    token: await SecureStore.getItemAsync('token'),
    user: await SecureStore.getItemAsync('user'),
  };
}

// Diri i-save ang token ug user.
async function persistAuth(newToken: string, newUser: User) {
  const serialized = JSON.stringify(newUser);
  if (Platform.OS === 'web') {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', serialized);
  } else {
    await Promise.all([
      SecureStore.setItemAsync('token', newToken),
      SecureStore.setItemAsync('user', serialized),
    ]);
  }
}

// Diri papason ang na-save nga token ug user.
async function clearStoredAuth() {
  if (Platform.OS === 'web') {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  } else {
    await Promise.all([
      SecureStore.deleteItemAsync('token'),
      SecureStore.deleteItemAsync('user'),
    ]);
  }
}

// Diri susihon kung pending pa ang approval sa user.
function wasPendingApproval(user?: User | null): boolean {
  return Boolean(user && isAccountUnderReview(user));
}

// Diri susihon kung na-approve na ang user.
function isNowApproved(user?: User | null): boolean {
  return Boolean(user && user.approval_status === 'approved' && !user.account_under_review);
}

// Diri ang provider sa auth sa tibuok app.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showApprovalCelebration, setShowApprovalCelebration] = useState(false);
  const userRef = useRef<User | null>(null);
  const tokenRef = useRef<string | null>(null);
  const refreshingRef = useRef(false);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // Diri i-apply ang bag-ong user data.
  const applyFreshUser = useCallback(async (storedToken: string, previousUser: User | null, freshUser: User) => {
    const merged = { ...(previousUser || {}), ...freshUser };
    setToken(storedToken);
    setUser(merged);
    await persistAuth(storedToken, merged);

    if (wasPendingApproval(previousUser) && isNowApproved(merged)) {
      setShowApprovalCelebration(true);
    }

    return merged;
  }, []);

  // Diri kuhaon balik ang user gikan sa server.
  const refreshUser = useCallback(async (): Promise<User | null> => {
    const currentToken = tokenRef.current;
    if (!currentToken || refreshingRef.current) {
      return userRef.current;
    }

    refreshingRef.current = true;
    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/user`, {
        headers: { Authorization: `Bearer ${currentToken}` },
        timeout: 12000,
      });

      if (response.data?.success && response.data.user) {
        return await applyFreshUser(currentToken, userRef.current, response.data.user);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          await clearStoredAuth();
          setToken(null);
          setUser(null);
          return null;
        }
        if (error.response?.status === 403 && error.response?.data?.approval_rejected) {
          await clearStoredAuth();
          setToken(null);
          setUser(null);
          return null;
        }
      }
    } finally {
      refreshingRef.current = false;
    }

    return userRef.current;
  }, [applyFreshUser]);

  useEffect(() => {
    restoreSession();
  }, []);

  // Diri i-restore ang session inig abli sa app.
  const restoreSession = async () => {
    const startedAt = Date.now();

    try {
      const { token: storedToken, user: storedUser } = await readStoredAuth();

      if (!storedToken || !storedUser) {
        return;
      }

      let parsedUser: User;
      try {
        parsedUser = JSON.parse(storedUser);
      } catch {
        await clearStoredAuth();
        return;
      }

      try {
        const response = await axios.get(`${API_BASE_URL}/api/mobile/user`, {
          headers: { Authorization: `Bearer ${storedToken}` },
          timeout: 12000,
        });

        if (response.data?.success && response.data.user) {
          await applyFreshUser(storedToken, parsedUser, response.data.user);
          return;
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.response?.status === 401) {
            await clearStoredAuth();
            return;
          }
          if (error.response?.status === 403 && error.response?.data?.approval_rejected) {
            await clearStoredAuth();
            return;
          }
        }

        // Offline or server unreachable — keep the saved session.
        setToken(storedToken);
        setUser(parsedUser);
      }
    } catch (error) {
      console.error('Error restoring session:', error);
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_SPLASH_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_SPLASH_MS - elapsed));
      }
      setIsLoading(false);
    }
  };

  // While under review, poll so approval updates without a full app restart.
  useEffect(() => {
    if (!token || !wasPendingApproval(user)) return;

    const interval = setInterval(() => {
      refreshUser();
    }, 15000);

    return () => clearInterval(interval);
  }, [token, user?.approval_status, user?.account_under_review, refreshUser]);

  // Refresh when the app returns to the foreground.
  useEffect(() => {
    if (!token) return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshUser();
      }
    });

    return () => subscription.remove();
  }, [token, refreshUser]);

  // Diri i-save ang login sa user.
  const login = async (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    void persistAuth(newToken, newUser).catch((error) => {
      console.error('Error saving login:', error);
    });
  };

  // Diri mo-logout ug papason ang session.
  const logout = async () => {
    const currentToken = tokenRef.current;
    setToken(null);
    setUser(null);
    setShowApprovalCelebration(false);
    void clearStoredAuth().catch((error) => {
      console.error('Error clearing login:', error);
    });
    if (currentToken) {
      void axios.post(
        `${API_BASE_URL}/api/mobile/logout`,
        {},
        { headers: { Authorization: `Bearer ${currentToken}` }, timeout: 4000 }
      ).catch(() => {});
    }
  };

  // Diri isira ang approval celebration.
  const dismissApprovalCelebration = useCallback(() => {
    setShowApprovalCelebration(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!token,
        login,
        logout,
        refreshUser,
        dismissApprovalCelebration,
        showApprovalCelebration,
      }}
    >
      {children}
      <AccountApprovedModal
        visible={showApprovalCelebration}
        onDismiss={dismissApprovalCelebration}
      />
    </AuthContext.Provider>
  );
}

// Diri gamiton ang auth context.
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
