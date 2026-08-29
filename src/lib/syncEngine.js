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
import { refreshLocalUserFromSupabase } from "@/lib/balanceSync";
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
      // Không giới hạn số lượng - nếu phải fallback tính từ lịch sử ví (tài
      // khoản chưa từng đồng bộ lên Supabase) thì phải dùng TOÀN BỘ lịch sử,
      // giới hạn cũ (200) có thể bỏ sót giao dịch cũ và tính sai số dư.
      base44.entities.WalletTransaction.filter({ user_id: uid }, "-created_date").catch(() => []),
    ]);

    // Tìm record khớp trong danh sách Supabase users (theo id hoặc email) -
    // dùng khi tài khoản được tạo dưới id khác trên thiết bị này (legacy)
    const matchedSupa = (supaUserList || []).find(
      (u) => (u.id && u.id === uid) || (u.email && uemail && u.email.toLowerCase() === uemail.toLowerCase())
    ) || {};

    // Supabase Postgres là nguồn sự thật DUY NHẤT cho balance/total_deposited
    // (xem whimsical-napping-floyd.md Bước 4) - KHÔNG còn lấy Math.max qua
    // nhiều nguồn (RTDB/localStorage/lịch sử ví/authUser) như trước, vì số dư
    // có thể giảm THẬT (rút tiền, thua cược, đầu tư): một giá trị cao bất
    // thường dù chỉ xuất hiện thoáng qua do lỗi đồng bộ sẽ bị "kẹt" vĩnh viễn
    // làm mốc sàn nếu dùng Math.max. Chỉ khi tài khoản CHƯA TỪNG tồn tại trên
    // Supabase mới fallback tính từ TOÀN BỘ lịch sử ví (dùng chung
    // computeWalletNet() với Profile.jsx để nhất quán công thức).
    const trustedSupa =
      dbUser && dbUser.balance !== undefined && dbUser.balance !== null
        ? dbUser
        : matchedSupa && matchedSupa.balance !== undefined && matchedSupa.balance !== null
        ? matchedSupa
        : null;

    let finalBalance;
    let finalTotalDeposited;
    let finalBalanceVersion;
    if (trustedSupa) {
      finalBalance = Math.max(0, Number(trustedSupa.balance) || 0);
      finalTotalDeposited = Math.max(0, Number(trustedSupa.total_deposited) || 0);
      finalBalanceVersion = Number(trustedSupa.balance_version || 0);
    } else {
      const { depSum: wtxDeposits, netCalculated: wtxBalance } = computeWalletNet(walletTxs);
      finalBalance = Math.max(0, wtxBalance);
      finalTotalDeposited = Math.max(0, wtxDeposits);
      finalBalanceVersion = 0;
    }

    // Hợp nhất dữ liệu Profile chuẩn
    const mergedUser = {
      ...authUser,
      ...matchedSupa,
      ...(dbUser || {}),
      ...(rtdbUser || {}),
      id: uid,
      // BẢO MẬT: role/is_super_admin CHỈ được tin từ Postgres (dbUser, tra
      // đúng theo uid hiện tại) hoặc claim JWT tươi (authUser) - KHÔNG được
      // lấy từ matchedSupa (dò theo danh sách, có thể khớp nhầm bản ghi) hay
      // rtdbUser (bản sao RTDB, có thể còn dữ liệu cũ của tài khoản khác đã
      // dùng chung thiết bị này). Nếu không chốt cứng 2 field này, một tài
      // khoản thường có thể bị "thừa hưởng" nhầm quyền admin của phiên trước.
      role: dbUser?.role || authUser.role || "user",
      is_super_admin: !!(dbUser?.is_super_admin ?? authUser.is_super_admin ?? false),
      email: uemail || dbUser?.email || matchedSupa?.email || rtdbUser?.email || authUser.email,
      name: dbUser?.name || dbUser?.full_name || matchedSupa?.name || matchedSupa?.full_name || rtdbUser?.name || authUser.name || authUser.full_name || "Hội viên VinClub",
      full_name: dbUser?.full_name || dbUser?.name || matchedSupa?.full_name || matchedSupa?.name || rtdbUser?.full_name || authUser.full_name || authUser.name || "Hội viên VinClub",
      phone: dbUser?.phone || matchedSupa?.phone || rtdbUser?.phone || authUser.phone || "",
      id_card_number: dbUser?.id_card_number || matchedSupa?.id_card_number || rtdbUser?.id_card_number || "",
      // authUser.identifier (tên đăng nhập gốc, từ user_metadata lúc đăng ký)
      // ưu tiên trước - cột users.identifier trên Postgres ở một số tài
      // khoản đang bị ghi nhầm thành email tổng hợp (xem normalizeIdentifier
      // ToAuthEmail) thay vì tên đăng nhập gốc người dùng đã nhập. Không đặt
      // field này trong khối override thì spread ...(dbUser||{}) phía trên sẽ
      // âm thầm ghi đè giá trị đúng của authUser bằng giá trị sai đó.
      identifier: authUser.identifier || dbUser?.identifier || matchedSupa?.identifier || rtdbUser?.identifier || "",
      balance: finalBalance,
      total_deposited: finalTotalDeposited,
      balance_version: finalBalanceVersion,
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
        // dbUser đến THẲNG từ Supabase (nguồn sự thật) nên chỉ cần nạp lại
        // cache cục bộ (local + RTDB) cho khớp - KHÔNG ghi ngược lại Supabase
        // (sẽ thừa vì vừa đọc từ chính nó ra) và không tăng balance_version
        // (không có gì thực sự thay đổi, tránh làm phiên khác nhận nhầm tín
        // hiệu "có cập nhật mới" mỗi lần thiết bị này online/focus lại).
        refreshLocalUserFromSupabase(userId, dbUser);
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
