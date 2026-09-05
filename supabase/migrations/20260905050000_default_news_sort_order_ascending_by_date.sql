-- Yêu cầu: mặc định hiển thị Tin tức từ NGÀY CŨ lên trên, ngày mới xuống
-- dưới - trong khi vẫn giữ nguyên nút mũi tên lên/xuống (moveNews trong
-- NewsTab.jsx) để admin tự ghim bất kỳ bài nào lên vị trí bất kỳ sau đó.
--
-- sortNewsList (constants/newsData.js) không đổi - vẫn sắp theo sort_order
-- GIẢM DẦN như cũ. Thay vào đó đổi Ý NGHĨA của "mặc định chưa ai ghim tay":
-- trước đây backfill = +epoch(created_date) (mới hơn -> số lớn hơn -> lên
-- đầu theo sort_order giảm dần). Giờ đổi thành = -epoch("Ngày đăng") (cũ
-- hơn -> số Ngày đăng nhỏ hơn -> số ÂM lớn hơn -> vẫn lên đầu theo đúng
-- sort_order giảm dần, nhưng bây giờ "lên đầu" nghĩa là "cũ hơn"). Cùng 1
-- trục số, chỉ đổi công thức khởi tạo - nút mũi tên (+1/-1 so với hàng
-- xóm hiện tại) hoạt động y hệt không cần sửa gì thêm.
--
-- Chỉ áp dụng cho 7 bài hiện có - CHƯA bài nào từng bị admin di chuyển tay
-- (tính năng nút mũi tên vừa merge, chưa ai dùng) nên an toàn ghi đè toàn bộ.
update public.news
  set sort_order = -1 * (extract(epoch from to_date(date, 'FMDD/FMMM/YYYY')) * 1000)::bigint
  where date ~ '^\d{1,2}/\d{1,2}/\d{4}$';
