import { supabase } from './supabase';

/**
 * supabaseAuth — Bộ helper Auth toàn diện cho VinClub
 * ─────────────────────────────────────────────────────────────────
 * Bao gồm: signUp, signIn, signOut, getUser, onAuthStateChange,
 * updateProfile, resetPassword, updatePassword
 */

/**
 * Đăng ký tài khoản mới
 * @param {string} email
 * @param {string} password
 * @param {object} metadata - { full_name, phone, role, ... }
 */
export async function signUp(email, password, metadata = {}) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: metadata.full_name || metadata.name || '',
        phone: metadata.phone || '',
        membership_tier: metadata.membership_tier || 'Member',
        vip_level: metadata.vip_level || 'VIP 0',
        avatar_url: metadata.avatar_url || '',
        ...metadata,
      },
    },
  });

  if (error) throw error;
  return data;
}

/**
 * Đăng nhập bằng email + password
 * @param {string} email
 * @param {string} password
 */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

/**
 * Đăng xuất
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Lấy user đang đăng nhập hiện tại (từ session cache)
 */
export async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user ?? null;
}

/**
 * Lấy session hiện tại
 */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data?.session ?? null;
}

/**
 * Lắng nghe thay đổi trạng thái auth (đăng nhập / đăng xuất / token refresh)
 * @param {function} callback - (event, session) => void
 * @returns unsubscribe function
 */
export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return data.subscription.unsubscribe;
}

/**
 * Cập nhật thông tin profile user
 * @param {object} updates - { full_name, phone, avatar_url, ... }
 */
export async function updateProfile(updates) {
  const { data, error } = await supabase.auth.updateUser({
    data: updates,
  });
  if (error) throw error;
  return data;
}

/**
 * Gửi email đặt lại mật khẩu
 * @param {string} email
 */
export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}

/**
 * Cập nhật mật khẩu mới (sau khi nhận link reset)
 * @param {string} newPassword
 */
export async function updatePassword(newPassword) {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (error) throw error;
  return data;
}

/**
 * Chuyển đổi Supabase user object → định dạng VinClub user
 * để tương thích với toàn bộ UI hiện tại
 * @param {object} supaUser - Supabase User object
 * @param {object} extraData - dữ liệu bổ sung từ Supabase
 */
export function mapSupabaseUser(supaUser, extraData = {}) {
  if (!supaUser) return null;
  const meta = supaUser.user_metadata || {};
  return {
    id: supaUser.id,
    email: supaUser.email,
    identifier: meta.identifier || supaUser.email,
    full_name: meta.full_name || meta.name || supaUser.email?.split('@')[0] || 'Hội viên VinClub',
    name: meta.full_name || meta.name || supaUser.email?.split('@')[0] || 'Hội viên VinClub',
    phone: meta.phone || '',
    role: meta.role || 'user',
    is_super_admin: !!meta.is_super_admin,
    balance: Number(meta.balance || 0),
    total_deposited: Number(meta.total_deposited || 0),
    membership_tier: meta.membership_tier || 'Member',
    vip_level: meta.vip_level || 'VIP 0',
    is_locked: !!meta.is_locked,
    avatar: meta.avatar_url || meta.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde',
    avatar_url: meta.avatar_url || meta.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde',
    bank_name: meta.bank_name || '',
    account_number: meta.account_number || '',
    account_holder: meta.account_holder || '',
    created_at: supaUser.created_at || new Date().toISOString(),
    supabase_id: supaUser.id,
    ...extraData,
  };
}
