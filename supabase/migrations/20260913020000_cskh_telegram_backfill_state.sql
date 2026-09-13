-- Bảng cờ đơn dòng (singleton) đánh dấu đã chạy xong việc forward BÙ 1 LẦN
-- toàn bộ tin nhắn CSKH cũ (sender='user') chưa từng tới được Telegram - do
-- kênh Realtime forward CSKH đã xác nhận mất kết nối kéo dài trên production
-- (xem PR #73-#82). Không dùng bảng chung nào sẵn có vì đây là trạng thái
-- "đã backfill lịch sử hay chưa", khác hẳn cấu hình/dữ liệu nghiệp vụ - chỉ
-- server.ts đọc/ghi (service_role), không client nào cần truy cập.
create table if not exists public.cskh_telegram_backfill_state (
  id text primary key default 'singleton',
  completed_at timestamptz not null default now(),
  forwarded_count integer not null default 0
);

alter table public.cskh_telegram_backfill_state enable row level security;
-- Không policy nào cho anon/authenticated - chỉ service_role (server.ts,
-- luôn bypass RLS) đọc/ghi được bảng này.
