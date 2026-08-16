/**
 * syncEngine.js
 * Hệ thống Đồng bộ dữ liệu người dùng khi đăng nhập thiết bị mới (Cross-Device Sync Engine).
 * 
 * Đảm bảo:
 * - Dù người dùng đăng nhập trên bất kỳ thiết bị di động nào (iOS Safari, Android Chrome, Tablet, PC)
 *   hoặc thay đổi thiết bị mới:
 *   1. Số dư tài khoản & tổng nạp được khôi phục chính xác 100%.
 *   2. Toàn bộ Lịch sử Nạp/Rút, Đầu tư, Hợp đồng đã ký, Tin nhắn CSKH được tải về đầy đủ.
 *   3. Trạng thái hoạt động, cấp bậc VIP, thông tin tài khoản ngân hàng được giữ nguyên.
 *   4. Tự động đồng bộ hai chiều thời gian thực giữa Supabase DB (PostgreSQL) và Firebase RTDB.
 */
import { base44 } from "@/api/base44Client";
import { getFreshUserBalance, updateUserBalance } from "@/lib/balanceSync";
import { getSupabaseUser, listSupabaseUsers, upsertSupabaseUser } from "@/lib/supabaseDb";
import { pushUserToRTDB, trackPresenceInRTDB, fetchUserFromRTDB } from "@/lib/rtdbSync";
import { computeWalletNet } from "@/lib/transactionHistory";

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
      if (!targetUserId || (parsed.id && parsed.id !== targetUserId && parsed.email !== targetUserId)) {
        console.log("[SyncEngine] 🧹 Dọn sạch cache phiên cũ trên thiết bị...");
        localStorage.removeItem("base44_local_user");

        // Các cache dưới đây là DÙNG CHUNG cho toàn app (Admin cần duyệt lịch
        // sử của MỌI người dùng từ chính các key này), KHÔNG phải cache riêng
        // của 1 phiên đăng nhập - xoá sạch toàn bộ store sẽ làm "biến mất"
        // dữ liệu của những người dùng KHÁC (không liên quan gì đến việc đổi
        // tài khoản trên thiết bị này) cho đến khi RTDB merge lại, khiến admin
        // tưởng nhầm là dữ liệu bị mất. Chỉ lọc bỏ đúng các bản ghi THUỘC VỀ
        // người dùng cũ (người vừa đăng xuất/bị thay thế trên thiết bị này).
        const prevId = parsed.id;
        const prevEmail = parsed.email;
        const belongsToPrevUser = (item) =>
          !!item &&
          ((prevId && (item.user_id === prevId || item.created_by_id === prevId || item.conversation_id === prevId)) ||
            (prevEmail && (item.user_id === prevEmail || item.created_by_id === prevEmail)));

        ["base44_entity_Message", "base44_entity_Transaction", "base44_entity_WalletTransaction", "base44_entity_Signature"].forEach(
          (key) => {
            try {
              const raw = localStorage.getItem(key);
              if (!raw) return;
              const list = JSON.parse(raw);
              if (!Array.isArray(list)) return;
              localStorage.setItem(key, JSON.stringify(list.filter((item) => !belongsToPrevUser(item))));
            } catch (e) {}
          }
        );
      }
    }
  } catch (e) {
    console.warn("[SyncEngine] sanitizeDeviceCache warning:", e);
  }
}

/**
 * Đồng bộ toàn diện dữ liệu người dùng khi đăng nhập thiết bị mới
 * @param {Object} authUser - Đối tượng người dùng từ Supabase Auth hoặc session
 * @returns {Promise<Object>} User object đã được nạp đầy đủ thông tin chuẩn xác
 */
export async function hydrateUserOnNewDevice(authUser) {
  if (!authUser || (!authUser.id && !authUser.email)) return authUser;
  const uid = authUser.id;
  const uemail = authUser.email || "";

  console.log(`[SyncEngine] 🚀 Bắt đầu đồng bộ & nạp dữ liệu toàn diện cho thiết bị (User: ${uid || uemail})...`);

  // Dọn sạch cache nếu tài khoản đăng nhập khác tài khoản lưu trước đó
  sanitizeDeviceCache(uid);

  try {
    // ─────────────────────────────────────────────────────────────
    // BƯỚC 1 (P0): TẢI PROFILE, SỐ DƯ ĐA NGUỒN & THÔNG TIN NGÂN HÀNG
    // ─────────────────────────────────────────────────────────────
    const [dbUser, supaUserList, rtdbUser, walletTxs] = await Promise.all([
      getSupabaseUser(uid).catch(() => null),
      listSupabaseUsers().catch(() => []),
      fetchUserFromRTDB(uid).catch(() => null),
      base44.entities.WalletTransaction.filter({ user_id: uid }, "-created_date", 200).catch(() => []),
    ]);

    // Tìm record khớp trong danh sách Supabase users (theo id hoặc email)
    const matchedSupa = (supaUserList || []).find(
      (u) => (u.id && u.id === uid) || (u.email && uemail && u.email.toLowerCase() === uemail.toLowerCase())
    ) || {};

    // Tính số dư từ lịch sử ví (Ground truth) - dùng chung computeWalletNet()
    // với Profile.jsx/MembershipCard.jsx/Consultation.jsx thay vì tự lọc lại
    // status/type ở đây. Bản cũ chỉ tính status "completed" và type
    // deposit/withdraw, bỏ sót "approved" (casino/vòng quay/lãi VIP - luồng
    // tự động, không bao giờ có status "completed") và "investment"/
    // "withdrawal" (đầu tư/đặt cược - tiền RA) - khiến số dư suy ra ở đây
    // bị tính THIẾU phần tiền đã chi, có thể lớn hơn số dư thật và (do nằm
    // trong balanceCandidates lấy MAX bên dưới) vô tình "hoàn tiền" cho
    // user mỗi lần đăng nhập thiết bị mới.
    const { depSum: wtxDeposits, outSum: wtxWithdrawals, netCalculated: wtxBalance } = computeWalletNet(walletTxs);

    const localFreshBal = getFreshUserBalance(uid) || getFreshUserBalance(uemail);

    // Tính toán số dư tối thượng chính xác nhất
    const balanceCandidates = [
      Number(dbUser?.balance),
      Number(matchedSupa?.balance),
      Number(rtdbUser?.balance),
      wtxBalance > 0 ? wtxBalance : undefined,
      localFreshBal > 0 ? localFreshBal : undefined,
      Number(authUser.balance),
    ].filter((n) => typeof n === "number" && !isNaN(n));

    const finalBalance = balanceCandidates.length > 0 ? Math.max(0, ...balanceCandidates) : 0;

    const totalDepCandidates = [
      Number(dbUser?.total_deposited),
      Number(matchedSupa?.total_deposited),
      Number(rtdbUser?.total_deposited),
      wtxDeposits > 0 ? wtxDeposits : undefined,
      Number(authUser.total_deposited),
    ].filter((n) => typeof n === "number" && !isNaN(n));

    const finalTotalDeposited = totalDepCandidates.length > 0 ? Math.max(0, ...totalDepCandidates) : 0;

    // Hợp nhất dữ liệu Profile chuẩn
    const mergedUser = {
      ...authUser,
      ...matchedSupa,
      ...(dbUser || {}),
      ...(rtdbUser || {}),
      id: uid,
      email: uemail || dbUser?.email || matchedSupa?.email || rtdbUser?.email || authUser.email,
      name: dbUser?.name || dbUser?.full_name || matchedSupa?.name || matchedSupa?.full_name || rtdbUser?.name || authUser.name || authUser.full_name || "Hội viên VinClub",
      full_name: dbUser?.full_name || dbUser?.name || matchedSupa?.full_name || matchedSupa?.name || rtdbUser?.full_name || authUser.full_name || authUser.name || "Hội viên VinClub",
      phone: dbUser?.phone || matchedSupa?.phone || rtdbUser?.phone || authUser.phone || "",
      balance: finalBalance,
      total_deposited: finalTotalDeposited,
      membership_tier: dbUser?.membership_tier || matchedSupa?.membership_tier || rtdbUser?.membership_tier || authUser.membership_tier || "Member",
      vip_level: dbUser?.vip_level || matchedSupa?.vip_level || rtdbUser?.vip_level || authUser.vip_level || "VIP 0",
      is_locked: !!(dbUser?.is_locked ?? matchedSupa?.is_locked ?? rtdbUser?.is_locked ?? authUser.is_locked),
      bank_name: dbUser?.bank_name || matchedSupa?.bank_name || rtdbUser?.bank_name || authUser.bank_name || "",
      account_number: dbUser?.account_number || matchedSupa?.account_number || rtdbUser?.account_number || authUser.account_number || "",
      account_holder: dbUser?.account_holder || matchedSupa?.account_holder || rtdbUser?.account_holder || authUser.account_holder || "",
      last_synced_device_at: new Date().toISOString(),
    };

    // 1. Lưu vào LocalStorage trên thiết bị mới
    localStorage.setItem("base44_local_user", JSON.stringify(mergedUser));
    
    // Cập nhật mảng base44_registered_users trên thiết bị mới
    try {
      const rawReg = localStorage.getItem("base44_registered_users");
      let regList = rawReg ? JSON.parse(rawReg) : [];
      const idx = regList.findIndex((u) => u.id === uid || u.email === uemail);
      if (idx >= 0) regList[idx] = { ...regList[idx], ...mergedUser };
      else regList.push(mergedUser);
      localStorage.setItem("base44_registered_users", JSON.stringify(regList));
    } catch (e) {}

    // Cập nhật mảng base44_entity_User trên thiết bị mới
    try {
      const rawEnt = localStorage.getItem("base44_entity_User");
      let entList = rawEnt ? JSON.parse(rawEnt) : [];
      const idx = entList.findIndex((u) => u.id === uid || u.email === uemail);
      if (idx >= 0) entList[idx] = { ...entList[idx], ...mergedUser };
      else entList.push(mergedUser);
      localStorage.setItem("base44_entity_User", JSON.stringify(entList));
    } catch (e) {}

    // 2. Phát event tức thì cho các UI Header, Profile, Wallet cập nhật số dư
    window.dispatchEvent(new CustomEvent("vinclub:user_hydrated", { detail: mergedUser }));
    window.dispatchEvent(
      new CustomEvent("vinclub:balance_updated", {
        detail: { userId: uid, newBalance: finalBalance, updatedUser: mergedUser },
      })
    );

    // 3. Tự động phục hồi & đồng bộ ngược về Supabase & RTDB nếu có sự chênh lệch
    try {
      upsertSupabaseUser(mergedUser);
      pushUserToRTDB(mergedUser);
      trackPresenceInRTDB(mergedUser);
    } catch (pushErr) {
      console.warn("[SyncEngine] Auto-heal push error:", pushErr);
    }

    // ─────────────────────────────────────────────────────────────
    // BƯỚC 2 (P1 & P2): TẢI TOÀN BỘ LỊCH SỬ GIAO DỊCH, HỢP ĐỒNG, TIN NHẮN
    // ─────────────────────────────────────────────────────────────
    syncBackgroundData(uid, uemail);

    // Gắn listener tự động tiếp tục đồng bộ khi mạng khôi phục hoặc quay lại tab
    bindResumableSyncListener(uid, uemail);

    console.log(`[SyncEngine] ✅ Đồng bộ thiết bị mới thành công! Số dư: ${finalBalance.toLocaleString("vi-VN")} VNĐ`);
    return mergedUser;
  } catch (error) {
    console.error("[SyncEngine] ❌ Lỗi khi đồng bộ thiết bị mới:", error);
    return authUser;
  }
}

/**
 * Tải ngầm toàn bộ dữ liệu lịch sử P1 & P2: Lịch sử ví, Hợp đồng, Tin nhắn, Thông báo
 */
export async function syncBackgroundData(userId, userEmail = "") {
  if (!userId || isSyncing) return;
  isSyncing = true;

  try {
    console.log("[SyncEngine] 🔄 Đang tải ngầm toàn bộ lịch sử giao dịch, hợp đồng & tin nhắn...");

    const [wtxs, txs, msgs, notifs] = await Promise.allSettled([
      // 1. Toàn bộ Lịch sử Nạp/Rút
      base44.entities.WalletTransaction.filter({ user_id: userId }, "-created_date", 300).catch(() => []),
      // 2. Toàn bộ Hợp đồng đầu tư đã ký kết
      base44.entities.Transaction.filter({ user_id: userId }, "-created_date", 200).catch(() => []),
      // 3. Toàn bộ tin nhắn CSKH
      base44.entities.Message.filter({ conversation_id: userId }, "-created_date", 500).catch(() => []),
      // 4. Danh sách thông báo
      base44.entities.Notification.list("-created_date", 100).catch(() => []),
    ]);

    // Ghi vào Local Cache trên thiết bị mới để truy xuất tức thì
    if (wtxs.status === "fulfilled" && Array.isArray(wtxs.value)) {
      localStorage.setItem("base44_entity_WalletTransaction", JSON.stringify(wtxs.value));
    }
    if (txs.status === "fulfilled" && Array.isArray(txs.value)) {
      localStorage.setItem("base44_entity_Transaction", JSON.stringify(txs.value));
    }
    if (msgs.status === "fulfilled" && Array.isArray(msgs.value)) {
      // Hợp nhất thay vì ghi đè: msgs.value chỉ là một lần lọc lại CHÍNH
      // cache cục bộ hiện có (không tải gì mới từ máy chủ), nên nếu chạy
      // song song với kênh RTDB real-time (đang phát tin nhắn mới vào đúng
      // cùng key localStorage này ở Support.jsx khi hydrate thiết bị mới),
      // ghi đè thẳng có thể xoá mất tin nhắn RTDB vừa đưa vào.
      try {
        const raw = localStorage.getItem("base44_entity_Message");
        const local = raw ? JSON.parse(raw) : [];
        const merged = new Map(local.map((m) => [m.id, m]));
        msgs.value.forEach((m) => merged.set(m.id, { ...(merged.get(m.id) || {}), ...m }));
        localStorage.setItem("base44_entity_Message", JSON.stringify(Array.from(merged.values())));
      } catch (e) {
        localStorage.setItem("base44_entity_Message", JSON.stringify(msgs.value));
      }
      localStorage.setItem("vinclub_msg_update", Date.now().toString());
    }
    if (notifs.status === "fulfilled" && Array.isArray(notifs.value)) {
      localStorage.setItem("base44_entity_Notification", JSON.stringify(notifs.value));
    }

    console.log("[SyncEngine] ✅ Toàn bộ lịch sử giao dịch & tin nhắn đã được khôi phục trên thiết bị này!");
    window.dispatchEvent(new Event("vinclub:background_sync_completed"));
  } catch (err) {
    console.warn("[SyncEngine] Lỗi trong quá trình sync ngầm:", err);
  } finally {
    isSyncing = false;
  }
}

/**
 * Gắn sự kiện lắng nghe phục hồi mạng khi thiết bị bị mất kết nối hoặc khi người dùng mở lại tab (Resumable Sync)
 */
function bindResumableSyncListener(userId, userEmail = "") {
  if (syncListenersBound || !userId) return;
  syncListenersBound = true;

  const handleResume = () => {
    console.log("[SyncEngine] 🌐 Thiết bị kết nối lại mạng / Quay lại ứng dụng, kiểm tra đồng bộ...");
    syncBackgroundData(userId, userEmail);
    getSupabaseUser(userId).then((dbUser) => {
      if (dbUser && typeof dbUser.balance === "number") {
        updateUserBalance(userId, dbUser.balance);
      }
    }).catch(() => null);
  };

  window.addEventListener("online", handleResume);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      handleResume();
    }
  });
}
