-- Đổi thông báo Admin cộng/trừ ví ("Ví đã được nạp tiền" / "Ví đã bị trừ
-- tiền") sang dạng "Biến động số dư" giống tin nhắn ngân hàng - cùng định
-- dạng với thông báo duyệt lệnh nạp/rút:
--   TK <mã hội viên>: +100,000,000 VND luc 13:51 02/10/2026. ND: CT CP VINCLUB CHUYEN TIEN
-- Thông báo mới do AdminWalletModal tạo sẵn đúng định dạng (kèm SD = số dư
-- sau giao dịch); thông báo cũ không lưu số dư lúc đó nên bỏ phần SD.
-- Chỉ sửa tiêu đề / nội dung / loại; giữ nguyên id, thời điểm, đã đọc.

CREATE OR REPLACE FUNCTION pg_temp.vn_memo(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  select upper(btrim(regexp_replace(translate(coalesce(p, ''),
    'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydAAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD'),
    '\s+', ' ', 'g')));
$$;

WITH src AS (
  SELECT n.id,
         n.title = 'Ví đã được nạp tiền' AS credit,
         replace((regexp_match(n.content, '(?:cộng|trừ) ([0-9.]+) VNĐ'))[1], '.', '')::numeric AS amount,
         nullif(btrim(regexp_replace((regexp_match(n.content, 'Lý do: (.*)$'))[1], '[\s.]+$', '')), '') AS reason,
         coalesce(nullif(btrim(u.identifier), ''), nullif(split_part(coalesce(u.email, ''), '@', 1), ''), n.user_id) AS account,
         n.created_date AT TIME ZONE 'Asia/Ho_Chi_Minh' AS vn_at
    FROM public.notifications n
    LEFT JOIN public.users u ON u.id = n.user_id
   WHERE n.title IN ('Ví đã được nạp tiền', 'Ví đã bị trừ tiền')
     AND n.content ~ '(cộng|trừ) [0-9.]+ VNĐ'
)
UPDATE public.notifications n
   SET title = 'Biến động số dư',
       type = CASE WHEN s.credit THEN 'deposit' ELSE 'withdraw' END,
       content = 'TK ' || s.account || ': ' || CASE WHEN s.credit THEN '+' ELSE '-' END ||
                 to_char(s.amount, 'FM999,999,999,999,999') ||
                 ' VND luc ' || to_char(s.vn_at, 'HH24:MI DD/MM/YYYY') ||
                 '. ND: ' || coalesce(nullif(left(pg_temp.vn_memo(s.reason), 160), ''),
                                      CASE WHEN s.credit THEN 'CT CP VINCLUB CHUYEN TIEN' ELSE 'VINCLUB DIEU CHINH SO DU' END)
  FROM src s
 WHERE n.id = s.id;
