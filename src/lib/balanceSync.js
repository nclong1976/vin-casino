import { pushUserToRTDB } from '@/lib/rtdbSync';

export function updateUserBalance(userId, newBalance, totalDepositedAdd = 0) {
  if (!userId) return null;
  const numBalance = Math.max(0, Number(newBalance) || 0);
  const numDepositAdd = Math.max(0, Number(totalDepositedAdd) || 0);

  try {
    let updatedUser = null;

    // 1. Update in registered users list
    const rawUsers = localStorage.getItem('base44_registered_users');
    let users = rawUsers ? JSON.parse(rawUsers) : [];
    users = users.map(u => {
      if (u.id === userId || u.email === userId) {
        const currentDep = Number(u.total_deposited) || 0;
        const updated = {
          ...u,
          balance: numBalance,
          total_deposited: currentDep + numDepositAdd
        };
        updatedUser = updated;
        return updated;
      }
      return u;
    });
    localStorage.setItem('base44_registered_users', JSON.stringify(users));

    // 2. Update current active local user if matching
    const currentLocalStr = localStorage.getItem('base44_local_user');
    if (currentLocalStr) {
      const currentLocal = JSON.parse(currentLocalStr);
      if (currentLocal.id === userId || currentLocal.email === userId) {
        const currentDep = Number(currentLocal.total_deposited) || 0;
        const newLocal = {
          ...currentLocal,
          balance: numBalance,
          total_deposited: currentDep + numDepositAdd
        };
        localStorage.setItem('base44_local_user', JSON.stringify(newLocal));
        updatedUser = newLocal;
      }
    }

    // 3. Update entity User in localStorage
    const rawEntityUsers = localStorage.getItem('base44_entity_User');
    if (rawEntityUsers) {
      try {
        let entityUsers = JSON.parse(rawEntityUsers);
        entityUsers = entityUsers.map(u => {
          if (u.id === userId || u.email === userId) {
            const currentDep = Number(u.total_deposited) || 0;
            return {
              ...u,
              balance: numBalance,
              total_deposited: currentDep + numDepositAdd
            };
          }
          return u;
        });
        localStorage.setItem('base44_entity_User', JSON.stringify(entityUsers));
      } catch (e) {}
    }

    // If updatedUser is not in local storage yet, create fallback object
    if (!updatedUser) {
      updatedUser = {
        id: userId,
        balance: numBalance,
        last_active: new Date().toISOString()
      };
    }

    // 4. Push updated balance directly to Firebase Realtime Database for instant multi-device sync
    try {
      pushUserToRTDB(updatedUser);
    } catch (e) {
      console.warn("pushUserToRTDB error in updateUserBalance:", e);
    }

    // 5. Dispatch custom event for real-time UI synchronization across all open pages & components
    window.dispatchEvent(
      new CustomEvent("vinclub:balance_updated", {
        detail: { userId, newBalance: numBalance, updatedUser }
      })
    );

    return updatedUser;
  } catch (e) {
    console.error("updateUserBalance error:", e);
    return null;
  }
}

export function getUserBalance(user) {
  if (!user) return 0;
  return Number(user.balance || 0);
}
