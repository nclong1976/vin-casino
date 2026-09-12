-- BUG THẬT (khách gửi tin CSKH liên tiếp trong cùng 1 hội thoại, xảy ra rất
-- thường xuyên trong 1 khung chat): pollAndForwardUnsentCskhMessages()
-- (server.ts, thêm ở PR #79) chỉ dedup theo cặp (conversation_id, cửa sổ
-- thời gian created_at trong [message.created_date, +5 phút]) vì bảng này
-- trước đó KHÔNG hề lưu message_id gốc - không có cách nào tra "tin nhắn
-- CỤ THỂ này đã forward chưa", chỉ đoán được "hội thoại này gần đây có
-- forward gì không".
--
-- Hậu quả: nếu 2 tin nhắn A (gửi trước) và B (gửi ngay sau, vẫn cùng
-- conversation_id) cùng rơi vào 1 lượt poll (rất thường gặp - khách gõ vài
-- tin liên tục), A được forward trước và ghi link với created_at = thời
-- điểm forward (luôn SAU B.created_date vì B đã tồn tại trước khi lượt
-- poll này chạy) và trong vòng vài giây nên chắc chắn <= B.created_date +
-- 5 phút. Khi xử lý tới B, query dedup ở trên khớp NHẦM link của A (cùng
-- conversation_id, created_at nằm trong cửa sổ) -> B bị coi là "đã forward
-- rồi", bị bỏ qua vĩnh viễn (cursor đã đi qua, không bao giờ quét lại) dù
-- CHƯA HỀ được gửi sang Telegram. Vì kênh Realtime đã xác nhận không kết
-- nối được kéo dài trên production (xem PR #73-#79), polling REST là
-- đường DUY NHẤT hiện có -> tin bị bỏ sót ở đây mất hẳn, không có lưới an
-- toàn nào khác bắt lại.
--
-- Vá bằng cách lưu thẳng message_id gốc (messages.id, kiểu text - xem
-- baseline) vào link, để polling tra ĐÚNG 1 tin nhắn cụ thể (eq message_id)
-- thay vì đoán qua cửa sổ thời gian. Cột nullable + không backfill dữ liệu
-- cũ: các link cũ (trước migration này) không cần dedup lại vì
-- cskhPollingCursor luôn khởi động từ thời điểm server start, không quét
-- ngược lịch sử.
alter table public.telegram_message_links
  add column message_id text;

create index idx_telegram_message_links_message_id
  on public.telegram_message_links (message_id)
  where message_id is not null;
