import { supabase } from "@/lib/supabase";

/**
 * Cho phép lưu nhiều tài khoản Supabase đã từng đăng nhập TRÊN CÙNG một
 * thiết bị/trình duyệt, và chuyển đổi qua lại giữa chúng ngay lập tức mà
 * không cần nhập lại mật khẩu - tương tự cách Gmail/Instagram cho phép
 * "thêm tài khoản". Cơ chế: mỗi khi có phiên đăng nhập Supabase hợp lệ,
 * lưu lại access/refresh token của phiên đó; khi người dùng chọn chuyển
 * sang 1 tài khoản đã lưu, gọi supabase.auth.setSession() để khôi phục
 * đúng phiên đó - không phải đăng nhập lại từ đầu.
 *
 * Chỉ áp dụng cho tài khoản đã đăng nhập qua Supabase (không áp dụng cho
 * tài khoản base44 legacy như admin1, vốn không có access/refresh token
 * thật để khôi phục).
 */
const STORAGE_KEY = "vinclub_saved_accounts";

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {}
}

/**
 * Lưu/cập nhật 1 tài khoản vào danh sách chuyển đổi. Gọi mỗi khi có phiên
 * Supabase hợp lệ (đăng nhập, khôi phục phiên, làm mới token) để token
 * lưu lại luôn là bản mới nhất còn hiệu lực.
 */
export function saveAccountToSwitcher(user, session) {
  if (!user?.id || !session?.access_token || !session?.refresh_token) return;
  const list = readAll();
  const idx = list.findIndex((a) => a.id === user.id);
  const entry = {
    id: user.id,
    email: user.email || "",
    identifier: user.identifier || user.email || "",
    full_name: user.full_name || user.name || "Hội viên VinClub",
    avatar: user.avatar || user.avatar_url || "",
    role: user.role || "user",
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    saved_at: new Date().toISOString(),
  };
  if (idx === -1) {
    list.push(entry);
  } else {
    list[idx] = entry;
  }
  writeAll(list);
}

/** Danh sách tài khoản đã lưu trên thiết bị này (không kèm token, chỉ để hiển thị). */
export function getSavedAccounts() {
  return readAll().map(({ access_token, refresh_token, ...rest }) => rest);
}

/** Bỏ 1 tài khoản khỏi danh sách chuyển đổi trên thiết bị này (không xoá tài khoản thật). */
export function removeSavedAccount(userId) {
  const list = readAll().filter((a) => a.id !== userId);
  writeAll(list);
}

/**
 * Chuyển sang 1 tài khoản đã lưu bằng cách khôi phục đúng phiên Supabase
 * của tài khoản đó - không cần nhập lại mật khẩu.
 * @returns {Promise<boolean>} true nếu chuyển thành công, false nếu phiên
 *   đã hết hạn (cần đăng nhập lại thủ công).
 */
export async function switchToAccount(userId) {
  const list = readAll();
  const account = list.find((a) => a.id === userId);
  if (!account) return false;

  const { data, error } = await supabase.auth.setSession({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  });

  if (error || !data?.session) {
    // Refresh token hết hạn/không còn hợp lệ - bỏ khỏi danh sách để tránh
    // hiển thị 1 tài khoản không thể chuyển tới nữa
    removeSavedAccount(userId);
    return false;
  }

  // setSession() có thể trả về access/refresh token MỚI (đã tự làm mới) -
  // lưu lại luôn để lần chuyển tiếp theo vẫn dùng được token còn hạn
  writeAll(
    list.map((a) =>
      a.id === userId
        ? { ...a, access_token: data.session.access_token, refresh_token: data.session.refresh_token }
        : a
    )
  );
  return true;
}
