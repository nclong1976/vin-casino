import { upsertSupabaseUser, updateSupabaseUser, subscribeSupabaseUsersTable } from './supabaseDb';
import { pushUserToRTDB } from './rtdbSync';

/**
 * twoWaySync — Bộ điều phối đồng bộ dữ liệu 2 chiều (Two-Way Sync):
 * SUPABASE DATABASE (PostgreSQL) ◄═══════► FIREBASE REALTIME DATABASE (RTDB)
 *
 * Tính năng chính:
 * 1. Supabase -> RTDB: Khi tài khoản tạo/sửa ở Supabase -> đẩy tức thì sang RTDB.
 * 2. RTDB -> Supabase: Khi Admin cộng/trừ tiền hoặc game cập nhật số dư trên RTDB -> đồng bộ về Supabase.
 * 3. Chống lặp vô hạn (Loop Prevention): Sử dụng hash timestamp & flag theo dõi nguồn cập nhật.
 */

// Lưu dấu vết thời gian & nguồn cập nhật để chống vòng lặp vô hạn
const syncRegistry = new Map();

function shouldSync(uid, source, version) {
  const key = `${uid}`;
  const record = syncRegistry.get(key) || { lastSource: null, lastVersion: null, lastTime: 0 };
  const now = Date.now();

  // Bỏ qua nếu vừa được cập nhật từ chính nguồn này trong vòng 1.5 giây
  if (record.lastSource === source && record.lastVersion === version && now - record.lastTime < 1500) {
    return false;
  }

  syncRegistry.set(key, { lastSource: source, lastVersion: version, lastTime: now });
  return true;
}

// ====================================================================
// 1. SYNC TO SUPABASE (Từ bất kỳ nguồn nào -> Supabase Database)
// ====================================================================

const debounceTimers = new Map();

export function syncUserToSupabase(user, options = { debounceMs: 300 }) {
  if (!user || (!user.id && !user.email)) return;
  const uid = user.id || 'u_' + (user.email ? user.email.replace(/[^a-zA-Z0-9]/g, '_') : 'unknown');

  const version = `${user.balance}_${user.is_locked}_${user.membership_tier}`;
  if (!shouldSync(uid, 'TO_SUPABASE', version)) {
    return;
  }

  if (debounceTimers.has(uid)) {
    clearTimeout(debounceTimers.get(uid));
  }

  const timer = setTimeout(async () => {
    debounceTimers.delete(uid);
    try {
      await upsertSupabaseUser(user);
      console.log(`[TwoWaySync] 🔄 Synced user ${uid} to Supabase DB`);
    } catch (err) {
      console.warn(`[TwoWaySync] ⚠️ Failed to sync user ${uid} to Supabase DB:`, err);
    }
  }, options.debounceMs || 0);

  debounceTimers.set(uid, timer);
}

// ====================================================================
// 2. SYNC TO RTDB (Từ Supabase -> Firebase Realtime Database)
// ====================================================================

export function syncUserToRTDB(user) {
  if (!user || (!user.id && !user.email)) return;
  const uid = user.id || 'u_' + (user.email ? user.email.replace(/[^a-zA-Z0-9]/g, '_') : 'unknown');

  const version = `${user.balance}_${user.is_locked}_${user.membership_tier}`;
  if (!shouldSync(uid, 'TO_RTDB', version)) {
    return;
  }

  try {
    pushUserToRTDB(user);
    console.log(`[TwoWaySync] 🔄 Synced user ${uid} to Firebase RTDB`);
  } catch (err) {
    console.warn(`[TwoWaySync] ⚠️ Failed to sync user ${uid} to RTDB:`, err);
  }
}

// ====================================================================
// 3. KHỞI CHẠY ĐỒNG BỘ 2 CHIỀU TỰ ĐỘNG (BACKGROUND LISTENER)
// ====================================================================

let isInitialized = false;
let unsubs = [];

export function startTwoWaySync() {
  if (isInitialized) return () => {};
  isInitialized = true;
  console.log('[TwoWaySync] 🚀 Starting Sync (Supabase -> Firebase RTDB)');

  // CHỈ còn 1 CHIỀU: Supabase Realtime Postgres Changes -> đẩy sang RTDB
  // (để chat/presence/các nơi khác đọc RTDB vẫn thấy tên/avatar/is_locked...
  // mới nhất). Trước đây còn có chiều ngược lại (RTDB -> Supabase, nghe MỌI
  // thay đổi RTDB rồi ghi ngược vào Supabase) - đã bỏ vì không còn nơi nào
  // ghi số dư/thông tin thật trực tiếp vào RTDB nữa (mọi ghi số dư thật đều
  // qua RPC increment_user_balance/set_user_balance_absolute thẳng vào
  // Supabase - RTDB giờ chỉ là bản sao được đẩy TỪ Supabase). Giữ chiều
  // ngược lại sẽ chỉ tạo nguy cơ vòng lặp ping-pong 2 chiều mà không phục vụ
  // mục đích thật nào (xem whimsical-napping-floyd.md Bước 6).
  const unsubSupabase = subscribeSupabaseUsersTable((payload) => {
    const { eventType, new: newRecord } = payload;
    if (newRecord && (newRecord.id || newRecord.email)) {
      console.log(`[TwoWaySync] 📥 Supabase Realtime Event [${eventType}]:`, newRecord.id);
      syncUserToRTDB(newRecord);
    }
  });
  unsubs.push(unsubSupabase);

  return () => {
    unsubs.forEach(u => typeof u === 'function' && u());
    unsubs = [];
    isInitialized = false;
  };
}
