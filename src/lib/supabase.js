import { createClient } from '@supabase/supabase-js';

/**
 * Supabase Client Singleton
 * ─────────────────────────────────────────────────────────────────
 * URL + Key được đọc từ biến môi trường Vite.
 * Chỉ khởi tạo 1 lần duy nhất, export để dùng ở toàn ứng dụng.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '[Supabase] ❌ Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_PUBLISHABLE_KEY trong .env'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Lưu session trong localStorage để giữ đăng nhập qua các lần tải lại trang
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'vinclub_supabase_session',
  },
});

export default supabase;
