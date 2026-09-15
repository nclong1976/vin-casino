-- Chuyển job cộng lãi hàng ngày theo cấp VIP từ setInterval() trên
-- server.ts/Render sang pg_cron chạy thẳng trong Postgres - loại bỏ phụ
-- thuộc cuối cùng của tính năng này vào việc Render có đang thức hay
-- không. credit_daily_interest_batch() (đã có sẵn) tự đảm bảo idempotent
-- (mỗi tài khoản chỉ cộng đúng 1 lần/ngày theo giờ VN, tự return sớm nếu
-- trước 9h sáng) nên gọi lặp lại nhiều lần/ngày như dưới đây là an toàn -
-- giữ đúng tần suất 15 phút/lần đã dùng ở server.ts trước đây, cùng mẫu
-- với job "disburse-daily-investment-payouts" đã có sẵn trong project.
select cron.schedule(
  'credit-daily-interest',
  '*/15 * * * *',
  $$select public.credit_daily_interest_batch();$$
);
