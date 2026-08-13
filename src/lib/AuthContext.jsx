import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { startFirebaseSync, stopFirebaseSync } from '@/lib/firebaseSync';
import { runDailyYieldAndMaturityCheck } from '@/lib/dailyYieldEngine';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  useEffect(() => {
    checkAppState();
  }, []);

  // Tự động đồng bộ hóa Firebase và số dư thời gian thực khi người dùng đăng nhập thành công
  useEffect(() => {
    if (isAuthenticated && user) {
      startFirebaseSync();

      const refreshUserBalance = async () => {
        try {
          const localUserStr = localStorage.getItem('base44_local_user');
          if (!localUserStr) return;
          const localUser = JSON.parse(localUserStr);
          const currentBal = Number(localUser.balance || 0);

          setUser((prev) => {
            if (!prev) return localUser;
            if (prev.balance === currentBal && prev.total_deposited === localUser.total_deposited) return prev;
            return { ...prev, balance: currentBal, total_deposited: localUser.total_deposited };
          });
        } catch (e) {
          console.error("AuthContext sync balance error:", e);
        }
      };

      // Real-time subscribers
      const unsubWT = base44.entities.WalletTransaction.subscribe(() => {
        refreshUserBalance();
      });

      const unsubUser = base44.entities.User?.subscribe(() => {
        refreshUserBalance();
      });

      const handleBalanceEvent = () => {
        refreshUserBalance();
      };

      window.addEventListener("vinclub:balance_updated", handleBalanceEvent);
      window.addEventListener("storage", handleBalanceEvent);

      refreshUserBalance();
      runDailyYieldAndMaturityCheck(user);

      // Periodically check maturity & 9 AM yield every 30 seconds
      const yieldInterval = setInterval(() => {
        runDailyYieldAndMaturityCheck(user);
      }, 30000);

      return () => {
        clearInterval(yieldInterval);
        stopFirebaseSync();
        if (typeof unsubWT === "function") unsubWT();
        if (typeof unsubUser === "function") unsubUser();
        window.removeEventListener("vinclub:balance_updated", handleBalanceEvent);
        window.removeEventListener("storage", handleBalanceEvent);
      };
    } else {
      stopFirebaseSync();
    }
  }, [isAuthenticated, user?.id]);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      setAppPublicSettings({ id: appParams.appId || 'vin-investment-app', public_settings: {} });
      await checkUserAuth();
      setIsLoadingPublicSettings(false);
    } catch (error) {
      console.warn('App state check warning:', error);
      setAppPublicSettings({ id: appParams.appId || 'vin-investment-app', public_settings: {} });
      await checkUserAuth();
      setIsLoadingPublicSettings(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      if (error?.status !== 401) {
        console.error('User auth check failed:', error);
      } else {
        console.log('User not authenticated (Normal state)');
      }
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);
      
      // If user auth fails, we set auth required
      setAuthError({
        type: 'auth_required',
        message: error?.message || 'Authentication required'
      });
    }
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    base44.auth.logout();
    window.location.href = '/login';
  };

  const navigateToLogin = () => {
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
