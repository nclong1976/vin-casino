-- Gỡ bỏ TOÀN BỘ liên kết CSKH <-> Telegram theo yêu cầu người dùng. Khung
-- chat admin-khách trong app (Support.jsx/MessagesTab.jsx) vốn đã chạy
-- trực tiếp qua Supabase Realtime từ trước, không phụ thuộc Telegram - việc
-- này chỉ gỡ cầu nối phụ (đồng bộ 2 chiều sang Telegram group/Business),
-- không ảnh hưởng gì đến tính năng CSKH chính trong app.

-- 1) Trigger tự forward tin nhắn user sang Telegram (gọi Edge Function
--    telegram-cskh-outbound qua net.http_post) + hàm đứng sau nó.
drop trigger if exists telegram_cskh_outbound_insert on public.messages;
drop trigger if exists telegram_cskh_outbound_update on public.messages;
drop trigger if exists telegram_cskh_outbound_delete on public.messages;
drop function if exists public.notify_telegram_cskh_outbound();

-- 2) RPC duyệt Nạp/Rút qua Telegram - tính năng này đã bị gỡ khỏi server.ts
--    từ trước (chỉ còn duyệt trong Admin Panel), hàm RPC là phần còn sót lại.
drop function if exists public.telegram_process_wallet_transaction(
  p_tx_id text, p_action text, p_reason text, p_admin_label text
);

-- 3) Toàn bộ bảng chỉ phục vụ cầu nối Telegram (liên kết tin nhắn, forum
--    topic theo khách hàng, Telegram Business, trạng thái backfill/sức
--    khoẻ cầu nối, claim chống forward trùng). Không có dữ liệu nào trong
--    các bảng này được dùng ở nơi khác trong app.
drop table if exists public.telegram_message_links cascade;
drop table if exists public.telegram_wallet_links cascade;
drop table if exists public.telegram_business_connection cascade;
drop table if exists public.telegram_business_links cascade;
drop table if exists public.telegram_business_message_links cascade;
drop table if exists public.cskh_telegram_backfill_state cascade;
drop table if exists public.telegram_customer_threads cascade;
drop table if exists public.telegram_bridge_health cascade;
drop table if exists public.telegram_outbound_forward_claims cascade;

-- 4) Cột trỏ tới forum topic Telegram trên support_conversations - không
--    được đọc ở đâu khác trong code (đã kiểm tra: 0 tham chiếu trong src/).
alter table public.support_conversations drop column if exists telegram_thread_id;
