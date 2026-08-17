import { pushUserToRTDB } from '@/lib/rtdbSync';
import { syncUserToSupabase } from '@/lib/twoWaySync';
import { incrementUserBalance, setUserBalanceAbsolute } from '@/lib/supabaseDb';

/**
 * Ghi số dư/total_deposited (giá trị TUYỆT ĐỐI, đã tính sẵn) vào mọi nơi
 * cục bộ + RTDB + Supabase, và bắn sự kiện cho UI. Dùng chung cho cả
 * updateUserBalance (đường cũ) và adjustUserBalance (đường atomic mới) -
 * cả 2 chỉ khác nhau ở CHỖ TÍNH ra numBalance/numDeposit, còn việc ghi thì
 * giống hệt nhau.
 */
function applyBalanceToLocalStores(userId, numBalance, numDeposit, numVersion) {
  let updatedUser = null;
  // balance_version chỉ có khi gọi từ adjustUserBalance() (RPC trả về) -
  // undefined thì bỏ qua field này, giữ nguyên version cũ đang có trong cache
  // (không ghi đè bằng undefined, spread {...u, ...patch} sẽ set key thành
  // undefined nếu ta luôn đưa key vào object patch).
  const versionPatch = numVersion === undefined ? {} : { balance_version: numVersion };

  // 1. Update in registered users list
  const rawUsers = localStorage.getItem('base44_registered_users');
  let users = rawUsers ? JSON.parse(rawUsers) : [];
  users = users.map(u => {
    if (u.id === userId || u.email === userId) {
      const updated = { ...u, balance: numBalance, total_deposited: numDeposit, ...versionPatch };
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
      const newLocal = { ...currentLocal, balance: numBalance, total_deposited: numDeposit, ...versionPatch };
      localStorage.setItem('base44_local_user', JSON.stringify(newLocal));
      updatedUser = newLocal;
    }
  }

  // 3. Update entity User in localStorage
  const rawEntityUsers = localStorage.getItem('base44_entity_User');
  if (rawEntityUsers) {
    try {
      let entityUsers = JSON.parse(rawEntityUsers);
      entityUsers = entityUsers.map(u =>
        (u.id === userId || u.email === userId)
          ? { ...u, balance: numBalance, total_deposited: numDeposit, ...versionPatch }
          : u
      );
      localStorage.setItem('base44_entity_User', JSON.stringify(entityUsers));
    } catch (e) {}
  }

  if (!updatedUser) {
    updatedUser = { id: userId, balance: numBalance, total_deposited: numDeposit, last_active: new Date().toISOString(), ...versionPatch };
  }

  // 4. Push updated balance directly to Firebase Realtime Database for instant multi-device sync
  try {
    pushUserToRTDB(updatedUser);
  } catch (e) {
    console.warn("pushUserToRTDB error in balanceSync:", e);
  }

  // 5. Dispatch custom event for real-time UI synchronization across all open pages & components
  window.dispatchEvent(
    new CustomEvent("vinclub:balance_updated", {
      detail: { userId, newBalance: numBalance, updatedUser }
    })
  );

  return updatedUser;
}

/**
 * Đặt balance/total_deposited về đúng giá trị TUYỆT ĐỐI cho cả 2 trường
 * cùng lúc, ghi xuống mọi nơi (local + RTDB + Supabase) - khác với
 * updateUserBalance() (chỉ set balance tuyệt đối, còn total_deposited chỉ
 * CỘNG THÊM chứ không thể giảm). Dùng cho thao tác hiệu chỉnh dữ liệu của
 * admin khi cần sửa lại cả 2 trường về đúng số thực tế (vd. khắc phục sự
 * cố dữ liệu bị lỗi cộng dồn sai).
 */
export async function setAbsoluteUserBalanceAndDeposit(userId, newBalance, newTotalDeposited) {
  if (!userId) return null;
  const numBalance = Math.max(0, Number(newBalance) || 0);
  const numDeposit = Math.max(0, Number(newTotalDeposited) || 0);

  try {
    const rpcResult = await setUserBalanceAbsolute(userId, numBalance, numDeposit);
    if (rpcResult) {
      // Ghi qua RPC nguyên tử để balance_version cũng tăng - nếu chỉ upsert
      // thường thì phiên Realtime khác (AuthContext) sẽ không nhận ra đây là
      // thay đổi mới hơn và âm thầm bỏ qua (xem set_user_balance_absolute
      // trong supabase_schema.sql).
      return applyBalanceToLocalStores(userId, rpcResult.balance, rpcResult.total_deposited, rpcResult.balance_version);
    }

    // Fallback: RPC lỗi (vd. project chưa chạy migration mới nhất) - vẫn cho
    // thao tác hoàn tất bằng upsert thường như trước đây (không tăng version)
    console.warn("[balanceSync] set_user_balance_absolute RPC unavailable, falling back to upsert");
    const updatedUser = applyBalanceToLocalStores(userId, numBalance, numDeposit);
    try {
      syncUserToSupabase(updatedUser, { debounceMs: 0 });
    } catch (e) {
      console.warn("syncUserToSupabase error in setAbsoluteUserBalanceAndDeposit:", e);
    }
    return updatedUser;
  } catch (e) {
    console.error("setAbsoluteUserBalanceAndDeposit error:", e);
    return null;
  }
}

/**
 * Nạp lại cache cục bộ (localStorage + RTDB) từ 1 bản ghi Supabase ĐÃ ĐỌC
 * SẴN (vd. sau khi mạng phục hồi, chỉ để đồng bộ thiết bị này theo kịp) -
 * KHÔNG ghi ngược lại Supabase (vì giá trị vừa đọc ra từ chính Supabase,
 * ghi lại là thừa) và giữ nguyên balance_version thật của bản ghi thay vì
 * tăng thêm, tránh làm phiên khác hiểu nhầm là có thay đổi mới.
 */
export function refreshLocalUserFromSupabase(userId, dbUser) {
  if (!userId || !dbUser) return null;
  const numBalance = Math.max(0, Number(dbUser.balance) || 0);
  const numDeposit = Math.max(0, Number(dbUser.total_deposited) || 0);
  const numVersion = Number(dbUser.balance_version || 0);
  return applyBalanceToLocalStores(userId, numBalance, numDeposit, numVersion);
}

export function updateUserBalance(userId, newBalance, totalDepositedAdd = 0) {
  if (!userId) return null;
  const numBalance = Math.max(0, Number(newBalance) || 0);
  const numDepositAdd = Math.max(0, Number(totalDepositedAdd) || 0);

  try {
    const currentDep = Number(getFreshUserTotalDeposited(userId)) || 0;
    const updatedUser = applyBalanceToLocalStores(userId, numBalance, currentDep + numDepositAdd);

    // Push updated balance to Supabase Database (PostgreSQL)
    try {
      syncUserToSupabase(updatedUser, { debounceMs: 0 });
    } catch (e) {
      console.warn("syncUserToSupabase error in updateUserBalance:", e);
    }

    return updatedUser;
  } catch (e) {
    console.error("updateUserBalance error:", e);
    return null;
  }
}

/**
 * Cộng/trừ số dư kiểu NGUYÊN TỬ (atomic) qua hàm Postgres
 * increment_user_balance thay vì tự đọc-tính-ghi ở phía client. Đây là
 * đường được khuyến nghị cho mọi thao tác cộng/trừ tiền thật (rút tiền,
 * hoàn tiền, admin điều chỉnh ví, đầu tư) vì loại bỏ hoàn toàn race
 * condition khi 2 thao tác xảy ra gần như đồng thời từ 2 thiết bị khác
 * nhau - Postgres tự khoá dòng trong lúc UPDATE nên không lệnh nào bị mất.
 *
 * @param {string} userId
 * @param {number} delta - số tiền cộng (dương) hoặc trừ (âm)
 * @param {number} totalDepositedDelta - phần cộng thêm vào total_deposited (mặc định 0)
 */
export async function adjustUserBalance(userId, delta, totalDepositedDelta = 0) {
  if (!userId) return null;
  const numDelta = Math.trunc(Number(delta) || 0);
  const numDepositDelta = Math.trunc(Number(totalDepositedDelta) || 0);

  const rpcResult = await incrementUserBalance(userId, numDelta, numDepositDelta);
  if (rpcResult) {
    // Ghi đúng giá trị THẬT mà Postgres vừa tính ra (không phải giá trị
    // đoán ở client) xuống mọi nơi cục bộ + RTDB, kèm balance_version mới
    // để phiên đăng nhập khác nhận diện đây là bản cập nhật mới hơn
    return applyBalanceToLocalStores(userId, rpcResult.balance, rpcResult.total_deposited, rpcResult.balance_version);
  }

  // Fallback: RPC lỗi (vd. project chưa chạy migration increment_user_balance
  // trong supabase_schema.sql) - vẫn cho thao tác hoàn tất bằng cách đọc số
  // dư gần nhất rồi cộng tay, để không chặn người dùng giữa chừng
  console.warn("[balanceSync] increment_user_balance RPC unavailable, falling back to read-then-write");
  const currentBal = getFreshUserBalance(userId);
  const currentDep = getFreshUserTotalDeposited(userId);
  return updateUserBalance(userId, currentBal + numDelta, Math.max(0, numDepositDelta));
}

export function getUserBalance(user) {
  if (!user) return 0;
  return Number(user.balance || 0);
}

/**
 * Đọc số dư hiện tại của user trực tiếp từ localStorage (nguồn ghi thật sự
 * của updateUserBalance) thay vì dùng snapshot React state có thể đã cũ.
 * Dùng trước khi cộng/trừ số dư để tránh 2 thao tác liên tiếp (vd: từ chối
 * 2 lệnh rút của cùng 1 user trong thời gian ngắn) ghi đè lên nhau và làm
 * mất phần thay đổi của thao tác trước.
 */
export function getFreshUserBalance(userId) {
  if (!userId) return 0;
  try {
    const rawUsers = localStorage.getItem('base44_registered_users');
    const users = rawUsers ? JSON.parse(rawUsers) : [];
    const found = users.find(u => u.id === userId || u.email === userId);
    if (found) return Number(found.balance || 0);
  } catch (e) {}

  try {
    const currentLocalStr = localStorage.getItem('base44_local_user');
    if (currentLocalStr) {
      const currentLocal = JSON.parse(currentLocalStr);
      if (currentLocal.id === userId || currentLocal.email === userId) {
        return Number(currentLocal.balance || 0);
      }
    }
  } catch (e) {}

  return 0;
}

/** Tương tự getFreshUserBalance nhưng đọc total_deposited. */
export function getFreshUserTotalDeposited(userId) {
  if (!userId) return 0;
  try {
    const rawUsers = localStorage.getItem('base44_registered_users');
    const users = rawUsers ? JSON.parse(rawUsers) : [];
    const found = users.find(u => u.id === userId || u.email === userId);
    if (found) return Number(found.total_deposited || 0);
  } catch (e) {}

  try {
    const currentLocalStr = localStorage.getItem('base44_local_user');
    if (currentLocalStr) {
      const currentLocal = JSON.parse(currentLocalStr);
      if (currentLocal.id === userId || currentLocal.email === userId) {
        return Number(currentLocal.total_deposited || 0);
      }
    }
  } catch (e) {}

  return 0;
}
