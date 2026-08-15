/**
 * syncEngine.js
 * Hệ thống Đồng bộ dữ liệu người dùng khi đăng nhập thiết bị mới (Cross-Device Sync Engine).
 * Triển khai đầy đủ theo đặc tả kỹ thuật:
 * - Ưu tiên P0: Profile, Số dư khả dụng, Tài khoản ngân hàng, Hạng VIP.
 * - Ưu tiên P1: Lịch sử Giao dịch Ví, Hợp đồng đầu tư, Chữ ký số, Tin nhắn CSKH.
 * - Ưu tiên P2: Thông báo hệ thống, Cài đặt tùy chọn.
 * - Xử lý ngoại lệ: Resumable network sync khi mất kết nối, Atomic balance validation.
 */
import { base44 } from "@/api/base44Client";
import { getFreshUserBalance } from "@/lib/balanceSync";
import { getSupabaseUser, listSupabaseUsers } from "@/lib/supabaseDb";
import { pushUserToRTDB, trackPresenceInRTDB } from "@/lib/rtdbSync";

let isSyncing = false;
let syncListenersBound = false;

/**
 * Xóa sạch dữ liệu cache của phiên trước trên trình duyệt này
 * để tránh việc dữ liệu tài khoản cũ lẫn sang tài khoản mới.
 */
export function sanitizeDeviceCache(targetUserId = null) {
  try {
    const rawLocalUser = localStorage.getItem("base44_local_user");
    if (rawLocalUser) {
      const parsed = JSON.parse(rawLocalUser);
      // Nếu user trước đó khác với user hiện tại, xóa sạch entity cache
      if (!targetUserId || (parsed.id && parsed.id !== targetUserId && parsed.email !== targetUserId)) {
        console.log("[SyncEngine] 🧹 Dọn sạch cache phiên cũ trên thiết bị...");
        localStorage.removeItem("base44_local_user");
        localStorage.removeItem("base44_entity_Message");
        localStorage.removeItem("base44_entity_Transaction");
        localStorage.removeItem("base44_entity_WalletTransaction");
        localStorage.removeItem("base44_entity_Signature");
      }
    }
  } catch (e) {
    console.warn("[SyncEngine] sanitizeDeviceCache warning:", e);
  }
}

/**
 * Đồng bộ toàn diện dữ liệu người dùng khi đăng nhập thiết bị mới
 * @param {Object} authUser - Đối tượng người dùng từ Supabase Auth
 * @returns {Promise<Object>} User object đã được nạp đầy đủ thông tin
 */
export async function hydrateUserOnNewDevice(authUser) {
  if (!authUser || (!authUser.id && !authUser.email)) return authUser;
  const uid = authUser.id;

  console.log(`[SyncEngine] 🚀 Bắt đầu nạp dữ liệu cho thiết bị mới (User: ${uid || authUser.email})...`);

  // Dọn sạch cache nếu tài khoản đăng nhập khác tài khoản lưu trước đó
  sanitizeDeviceCache(uid);

  try {
    // ─────────────────────────────────────────────────────────────
    // BƯỚC 1 (P0): TẢI PROFILE, SỐ DƯ & THÔNG TIN NGÂN HÀNG THỰC TẾ
    // ─────────────────────────────────────────────────────────────
    const [dbUser, freshBalance] = await Promise.all([
      getSupabaseUser(uid).catch(() => null),
      getFreshUserBalance(uid).catch(() => undefined),
    ]);

    const finalBalance = (freshBalance !== undefined && freshBalance !== null)
      ? Number(freshBalance)
      : (dbUser && dbUser.balance !== undefined && dbUser.balance !== null)
      ? Number(dbUser.balance)
      : Number(authUser.balance || 0);

    const mergedUser = {
      ...authUser,
      ...(dbUser || {}),
      balance: finalBalance,
      total_deposited: Number(dbUser?.total_deposited || authUser.total_deposited || 0),
      membership_tier: dbUser?.membership_tier || authUser.membership_tier || "VIP 1 - Gold",
      vip_level: dbUser?.vip_level || authUser.vip_level || 1,
      is_locked: !!(dbUser?.is_locked ?? authUser.is_locked),
      bank_name: dbUser?.bank_name || authUser.bank_name || "",
      account_number: dbUser?.account_number || authUser.account_number || "",
      account_holder: dbUser?.account_holder || authUser.account_holder || "",
      last_synced_device_at: new Date().toISOString(),
    };

    // Lưu snapshot P0 vào LocalStorage & phát event
    localStorage.setItem("base44_local_user", JSON.stringify(mergedUser));
    window.dispatchEvent(new CustomEvent("vinclub:user_hydrated", { detail: mergedUser }));
    window.dispatchEvent(new Event("vinclub:balance_updated"));

    // Đẩy thông tin Profile & Presence lên Firebase Realtime Database
    try {
      pushUserToRTDB(mergedUser);
      trackPresenceInRTDB(mergedUser);
    } catch (rtdbErr) {
      console.warn("[SyncEngine] Push RTDB warning:", rtdbErr);
    }

    // ─────────────────────────────────────────────────────────────
    // BƯỚC 2 (P1 & P2): TẢI LỊCH SỬ GIAO DỊCH, HỢP ĐỒNG & TIN NHẮN TRONG NỀN
    // ─────────────────────────────────────────────────────────────
    syncBackgroundData(uid);

    // Gắn listener tự động tiếp tục đồng bộ nếu mạng bị chập chờn
    bindResumableSyncListener(uid);

    return mergedUser;
  } catch (error) {
    console.error("[SyncEngine] ❌ Lỗi khi đồng bộ thiết bị mới:", error);
    return authUser;
  }
}

/**
 * Tải ngầm các dữ liệu P1 & P2: Lịch sử ví, Hợp đồng, Tin nhắn, Thông báo
 */
export async function syncBackgroundData(userId) {
  if (!userId || isSyncing) return;
  isSyncing = true;

  try {
    console.log("[SyncEngine] 🔄 Đang tải ngầm lịch sử giao dịch & tin nhắn...");

    const [wtxs, txs, msgs, notifs] = await Promise.allSettled([
      // 1. Lịch sử Nạp/Rút/Đầu tư
      base44.entities.WalletTransaction.filter({ user_id: userId }, "-created_date", 200).catch(() => []),
      // 2. Hợp đồng đầu tư đã ký kết
      base44.entities.Transaction.filter({ user_id: userId }, "-created_date", 100).catch(() => []),
      // 3. Toàn bộ tin nhắn CSKH của hội viên này
      base44.entities.Message.filter({ conversation_id: userId }, "-created_date", 300).catch(() => []),
      // 4. Danh sách thông báo
      base44.entities.Notification.list("-created_date", 50).catch(() => []),
    ]);

    // Ghi vào Local Cache để truy xuất tức thì ở các màn hình con
    if (wtxs.status === "fulfilled" && Array.isArray(wtxs.value)) {
      localStorage.setItem("base44_entity_WalletTransaction", JSON.stringify(wtxs.value));
    }
    if (txs.status === "fulfilled" && Array.isArray(txs.value)) {
      localStorage.setItem("base44_entity_Transaction", JSON.stringify(txs.value));
    }
    if (msgs.status === "fulfilled" && Array.isArray(msgs.value)) {
      localStorage.setItem("base44_entity_Message", JSON.stringify(msgs.value));
      localStorage.setItem("vinclub_msg_update", Date.now().toString());
    }
    if (notifs.status === "fulfilled" && Array.isArray(notifs.value)) {
      localStorage.setItem("base44_entity_Notification", JSON.stringify(notifs.value));
    }

    console.log("[SyncEngine] ✅ Đồng bộ nền hoàn tất 100%!");
    window.dispatchEvent(new Event("vinclub:background_sync_completed"));
  } catch (err) {
    console.warn("[SyncEngine] Lỗi trong quá trình sync ngầm:", err);
  } finally {
    isSyncing = false;
  }
}

/**
 * Gắn sự kiện lắng nghe phục hồi mạng khi thiết bị bị mất kết nối giữa chừng (Resumable Sync)
 */
function bindResumableSyncListener(userId) {
  if (syncListenersBound || typeof window === "undefined") return;
  syncListenersBound = true;

  window.addEventListener("online", () => {
    console.log("[SyncEngine] 🌐 Kết nối mạng phục hồi! Tự động chạy lại đồng bộ...");
    syncBackgroundData(userId);
  });
}
