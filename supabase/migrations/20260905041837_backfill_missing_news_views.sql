-- Bài tin tức thật đầu tiên đăng qua NewsTab.jsx (trước khi có mặc định
-- randomInitialViews()) bị lưu views='0' - nhìn lạc lõng "chưa ai xem" so
-- với 6 bài dữ liệu mẫu bên cạnh (đều sẵn có vài nghìn lượt xem). views chỉ
-- là số biên tập tĩnh (không có cơ chế đếm view thật), gán 1 số hợp lý
-- trong cùng khoảng với các bài mẫu.
update public.news
  set views = '2,640'
  where id = 'cong-huong-suc-manh-cmc-corporation-va-vingroup-bat-tay-nang-cap-toan-dien-he-sinh-thai-vinclub-016025'
    and views = '0';
