import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { startFirebaseSync, stopFirebaseSync } from '@/lib/firebaseSync';
import { runDailyYieldAndMaturityCheck } from '@/lib/dailyYieldEngine';
import { checkScheduledProjects } from '@/lib/projectScheduler';
import { pushUserToRTDB, trackPresenceInRTDB, subscribeUserFromRTDB } from '@/lib/rtdbSync';
import { signOut as supaSignOut, getSession, onAuthStateChange, mapSupabaseUser } from '@/lib/supabaseAuth';
import { getSupabaseUser } from '@/lib/supabaseDb';
import { startTwoWaySync } from '@/lib/twoWaySync';
import { saveAccountToSwitcher, switchToAccount as switchToSavedAccount } from '@/lib/accountSwitcher';
import { hydrateUserOnNewDevice } from '@/lib/syncEngine';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  // ──────────────────────────────────────────────────────────────────
  // Supabase Auth State Listener
  // Lắng nghe mọi thay đổi session: đăng nhập, đăng xuất, token refresh
  // ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setAppPublicSettings({ id: appParams.appId || 'vin-investment-app', public_settings: {} });
    setIsLoadingPublicSettings(false);

    // Khởi động hệ thống đồng bộ hai chiều Supabase <-> Firebase RTDB
    const stopTwoWaySync = startTwoWaySync();

    // Kiểm tra session đang tồn tại khi khởi động app
    const initAuth = async () => {
      setIsLoadingAuth(true);
      try {
        const session = await getSession();
        if (session?.user) {
          const vinUser = mapSupabaseUser(session.user);
          const hydrated = await hydrateUserOnNewDevice(vinUser);
          setUser(hydrated);
          setIsAuthenticated(true);
          saveAccountToSwitcher(hydrated, session);
        } else {
          // Fallback: thử base44 legacy auth
          try {
            const legacyUser = await base44.auth.me();
            if (legacyUser) {
              const hydrated = await hydrateUserOnNewDevice(legacyUser);
              setUser(hydrated);
              setIsAuthenticated(true);
            } else {
              setIsAuthenticated(false);
            }
          } catch {
            setIsAuthenticated(false);
          }
        }
      } catch (e) {
        console.warn('[AuthContext] initAuth error:', e);
        setIsAuthenticated(false);
      } finally {
        setIsLoadingAuth(false);
        setAuthChecked(true);
      }
    };

    initAuth();

    // Subscribe thay đổi Supabase session real-time
    const unsubSupabase = onAuthStateChange(async (event, session) => {
      console.log('[AuthContext] Supabase auth event:', event);
      if (event === 'SIGNED_IN' && session?.user) {
        const vinUser = mapSupabaseUser(session.user);
        const hydrated = await hydrateUserOnNewDevice(vinUser);
        setUser(hydrated);
        setIsAuthenticated(true);
        setAuthChecked(true);
        saveAccountToSwitcher(hydrated, session);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsAuthenticated(false);
        setAuthChecked(true);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        const vinUser = mapSupabaseUser(session.user);
        const hydrated = await hydrateUserOnNewDevice(vinUser);
        setUser(hydrated);
        saveAccountToSwitcher(hydrated, session);
      } else if (event === 'USER_UPDATED' && session?.user) {
        const vinUser = mapSupabaseUser(session.user);
        const hydrated = await hydrateUserOnNewDevice(vinUser);
        setUser(hydrated);
      }
    });

    return () => {
      if (typeof unsubSupabase === 'function') unsubSupabase();
      if (typeof stopTwoWaySync === 'function') stopTwoWaySync();
    };
  }, []);

  // ──────────────────────────────────────────────────────────────────
  // Firebase RTDB Sync — giữ nguyên để real-time balance hoạt động
  // ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isAuthenticated && user) {
      startFirebaseSync();
      pushUserToRTDB(user);
      const unsubPresence = trackPresenceInRTDB(user);

      // Lắng nghe số dư real-time từ Firebase RTDB
      const unsubRTDBUser = subscribeUserFromRTDB(user.id, (rtdbUser) => {
        if (rtdbUser && typeof rtdbUser.balance === 'number') {
          setUser((prev) => {
            if (!prev) return prev;
            if (prev.balance === rtdbUser.balance && prev.is_locked === rtdbUser.is_locked) return prev;
            return { ...prev, balance: rtdbUser.balance, is_locked: rtdbUser.is_locked };
          });
        }
      });

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
          console.error('[AuthContext] sync balance error:', e);
        }
      };

      const unsubWT = base44.entities.WalletTransaction?.subscribe?.(() => { refreshUserBalance(); });
      const unsubUser = base44.entities.User?.subscribe?.(() => { refreshUserBalance(); });

      const handleBalanceEvent = () => { refreshUserBalance(); };
      window.addEventListener('vinclub:balance_updated', handleBalanceEvent);
      window.addEventListener('storage', handleBalanceEvent);

      refreshUserBalance();
      runDailyYieldAndMaturityCheck(user);
      checkScheduledProjects();

      const yieldInterval = setInterval(() => {
        runDailyYieldAndMaturityCheck(user);
        checkScheduledProjects();
      }, 30000);

      return () => {
        clearInterval(yieldInterval);
        stopFirebaseSync();
        if (typeof unsubPresence === 'function') unsubPresence();
        if (typeof unsubRTDBUser === 'function') unsubRTDBUser();
        if (typeof unsubWT === 'function') unsubWT();
        if (typeof unsubUser === 'function') unsubUser();
        window.removeEventListener('vinclub:balance_updated', handleBalanceEvent);
        window.removeEventListener('storage', handleBalanceEvent);
      };
    } else {
      stopFirebaseSync();
    }
  }, [isAuthenticated, user?.id]);

  // ──────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────

  /**
   * Nạp số dư/thông tin THẬT từ bảng users trên Supabase (nguồn dữ liệu
   * dùng chung cho mọi thiết bị, luôn được cập nhật mỗi khi số dư đổi -
   * xem updateUserBalance/syncUserToSupabase) thay vì tin vào
   * user_metadata của Supabase Auth, vốn chỉ được ghi 1 lần lúc đăng ký
   * và không bao giờ cập nhật lại. Nếu thiếu (tài khoản legacy chưa từng
   * đồng bộ lên Supabase), rơi về dữ liệu cục bộ như trước.
   */
  async function hydrateUserData(supaUser) {
    try {
      const dbUser = await getSupabaseUser(supaUser.id);
      if (dbUser && dbUser.balance !== undefined && dbUser.balance !== null) {
        return {
          ...supaUser,
          balance: Number(dbUser.balance || 0),
          total_deposited: Number(dbUser.total_deposited || 0),
          is_locked: !!dbUser.is_locked,
          membership_tier: dbUser.membership_tier || supaUser.membership_tier,
          vip_level: dbUser.vip_level || supaUser.vip_level,
          bank_name: dbUser.bank_name || supaUser.bank_name || '',
          account_number: dbUser.account_number || supaUser.account_number || '',
          account_holder: dbUser.account_holder || supaUser.account_holder || '',
        };
      }
    } catch (e) {}
    return mergeWithLocalData(supaUser);
  }

  /**
   * Merge Supabase user với dữ liệu balance/profile từ localStorage
   * để không mất số dư đã có trong local storage
   */
  function mergeWithLocalData(supaUser) {
    try {
      const localStr = localStorage.getItem('base44_local_user');
      if (localStr) {
        const local = JSON.parse(localStr);
        if (local.email === supaUser.email || local.id === supaUser.id) {
          return {
            ...supaUser,
            balance: Number(local.balance || supaUser.balance || 0),
            total_deposited: Number(local.total_deposited || supaUser.total_deposited || 0),
            bank_name: local.bank_name || supaUser.bank_name || '',
            account_number: local.account_number || supaUser.account_number || '',
            account_holder: local.account_holder || supaUser.account_holder || '',
          };
        }
      }
    } catch (e) {}
    return supaUser;
  }

  const checkUserAuth = async () => {
    setIsLoadingAuth(true);
    try {
      const session = await getSession();
      if (session?.user) {
        const vinUser = mapSupabaseUser(session.user);
        const hydrated = await hydrateUserOnNewDevice(vinUser);
        setUser(hydrated);
        setIsAuthenticated(true);
      } else {
        const legacyUser = await base44.auth.me();
        if (legacyUser) {
          const hydrated = await hydrateUserOnNewDevice(legacyUser);
          setUser(hydrated);
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          setAuthError({ type: 'auth_required', message: 'Authentication required' });
        }
      }
    } catch (error) {
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: error?.message || 'Authentication required' });
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const checkAppState = async () => {
    setIsLoadingPublicSettings(true);
    setAuthError(null);
    setAppPublicSettings({ id: appParams.appId || 'vin-investment-app', public_settings: {} });
    await checkUserAuth();
    setIsLoadingPublicSettings(false);
  };

  const logout = async () => {
    try {
      await supaSignOut();
    } catch (e) {}
    localStorage.removeItem('base44_local_user');
    localStorage.removeItem('base44_local_token');
    localStorage.removeItem('vinclub_supabase_session');
    sessionStorage.setItem('vinclub_welcome_seen', 'true');
    setUser(null);
    setIsAuthenticated(false);
    window.location.href = '/login';
  };

  /**
   * Chuyển sang 1 tài khoản đã lưu trên CÙNG thiết bị này mà không cần
   * đăng xuất/đăng nhập lại thủ công. setSession() ở dưới tự bắn sự kiện
   * SIGNED_IN qua onAuthStateChange (đã lắng nghe ở trên) nên user/state
   * toàn app sẽ tự cập nhật theo tài khoản mới ngay khi chuyển thành công.
   */
  const switchAccount = async (userId) => {
    const ok = await switchToSavedAccount(userId);
    if (ok) {
      window.location.href = '/';
    }
    return ok;
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
      switchAccount,
      navigateToLogin,
      checkUserAuth,
      checkAppState,
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
