import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

WebBrowser.maybeCompleteAuthSession();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  // Get redirect URL based on platform
  const getRedirectUrl = () => {
    if (Platform.OS === 'web') {
      return `${API_URL}/`;
    }
    return Linking.createURL('/');
  };

  // Extract session_id from URL
  const extractSessionId = (url: string): string | null => {
    try {
      // Check hash first (#session_id=...)
      if (url.includes('#session_id=')) {
        const hash = url.split('#')[1];
        const params = new URLSearchParams(hash);
        return params.get('session_id');
      }
      // Check query params (?session_id=...)
      if (url.includes('?session_id=')) {
        const query = url.split('?')[1]?.split('#')[0];
        const params = new URLSearchParams(query);
        return params.get('session_id');
      }
    } catch (error) {
      console.error('Error extracting session_id:', error);
    }
    return null;
  };

  // Exchange session_id for session_token
  const exchangeSessionId = async (sessionId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': sessionId,
        },
      });

      if (response.ok) {
        const data = await response.json();
        await AsyncStorage.setItem('session_token', data.session_token);
        setSessionToken(data.session_token);
        setUser({
          user_id: data.user_id,
          email: data.email,
          name: data.name,
          picture: data.picture,
        });
        return true;
      }
    } catch (error) {
      console.error('Error exchanging session:', error);
    }
    return false;
  };

  // Check existing session
  const checkExistingSession = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      if (token) {
        const response = await fetch(`${API_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
          setSessionToken(token);
          return true;
        } else {
          // Token invalid, clear it
          await AsyncStorage.removeItem('session_token');
        }
      }
    } catch (error) {
      console.error('Error checking session:', error);
    }
    return false;
  }, []);

  // Handle initial URL (cold start)
  const handleInitialUrl = useCallback(async () => {
    try {
      const url = await Linking.getInitialURL();
      if (url) {
        const sessionId = extractSessionId(url);
        if (sessionId) {
          await exchangeSessionId(sessionId);
          return true;
        }
      }
    } catch (error) {
      console.error('Error handling initial URL:', error);
    }
    return false;
  }, []);

  // Handle URL changes (hot link)
  const handleUrlChange = useCallback(async (event: { url: string }) => {
    const sessionId = extractSessionId(event.url);
    if (sessionId) {
      setIsLoading(true);
      await exchangeSessionId(sessionId);
      setIsLoading(false);
    }
  }, []);

  // Initialize auth
  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);
      
      // For web, check URL hash first
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const hash = window.location.hash;
        if (hash.includes('session_id=')) {
          const sessionId = extractSessionId(window.location.href);
          if (sessionId) {
            await exchangeSessionId(sessionId);
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
            setIsLoading(false);
            return;
          }
        }
      }
      
      // Check for session_id in initial URL (mobile)
      const handledInitial = await handleInitialUrl();
      if (!handledInitial) {
        // No session_id, check existing session
        await checkExistingSession();
      }
      
      setIsLoading(false);
    };

    initAuth();

    // Listen for URL changes
    const subscription = Linking.addEventListener('url', handleUrlChange);
    
    return () => {
      subscription.remove();
    };
  }, [handleInitialUrl, handleUrlChange, checkExistingSession]);

  // Login function
  const login = async () => {
    const redirectUrl = getRedirectUrl();
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    
    if (Platform.OS === 'web') {
      // Web: redirect directly
      window.location.href = authUrl;
    } else {
      // Mobile: use WebBrowser
      try {
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
        
        if (result.type === 'success' && result.url) {
          const sessionId = extractSessionId(result.url);
          if (sessionId) {
            setIsLoading(true);
            await exchangeSessionId(sessionId);
            setIsLoading(false);
          }
        }
      } catch (error) {
        console.error('Login error:', error);
      }
    }
  };

  // Logout function
  const logout = async () => {
    try {
      if (sessionToken) {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
          },
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      await AsyncStorage.removeItem('session_token');
      setUser(null);
      setSessionToken(null);
    }
  };

  // Refresh user data
  const refreshUser = async () => {
    if (sessionToken) {
      await checkExistingSession();
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
