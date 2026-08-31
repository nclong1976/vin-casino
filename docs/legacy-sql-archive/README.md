# Legacy SQL archive

Các file `.sql` trong thư mục này từng nằm rời rạc ở thư mục gốc dự án, được chạy thủ công qua Supabase SQL Editor qua nhiều giai đoạn khác nhau — không được theo dõi như migration chuẩn nên có thể đã lệch so với schema thật hiện tại.

Kể từ 2026-09-01, toàn bộ schema thật (bảng, ràng buộc, index, RLS, function, trigger, cron job, realtime publication) được theo dõi tập trung tại:

```
supabase/migrations/20260901000000_baseline.sql
```

File baseline đó được dựng lại **trực tiếp từ schema thật đang chạy** trên Supabase (không phải từ các file dưới đây), nên là nguồn đáng tin cậy duy nhất. Các file trong thư mục này chỉ giữ lại để tham khảo lịch sử, **không nên chạy lại**.
