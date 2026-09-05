-- Cho phép Admin sắp xếp thủ công thứ tự hiển thị bài viết Tin tức (độc lập
-- với "Ngày đăng" - admin có thể muốn ghim 1 bài lên đầu mà không cần đổi
-- ngày đăng thật của nó). Mọi nơi hiển thị Tin tức (News.jsx, NewsSection.jsx
-- trên trang chủ, NewsTab.jsx ở admin) đều sẽ sắp theo cột này (giảm dần),
-- thay cho việc chỉ sắp theo created_date như trước.
--
-- Backfill = epoch millisecond của created_date hiện có - giữ nguyên chính
-- xác thứ tự "-created_date" đang hiển thị hôm nay, không có bài nào bị xáo
-- trộn vị trí khi migration này chạy. Bài mới (NewsTab.jsx) sẽ tự gán
-- sort_order = Date.now() lúc tạo, y hệt hành vi "mới nhất lên đầu" cũ.
alter table public.news
  add column if not exists sort_order bigint;

update public.news
  set sort_order = floor(extract(epoch from created_date) * 1000)::bigint
  where sort_order is null;

alter table public.news
  alter column sort_order set default 0;

comment on column public.news.sort_order is 'Thứ tự hiển thị thủ công (giảm dần = lên đầu) - admin chỉnh qua nút mũi tên lên/xuống ở NewsTab.jsx. Độc lập với "date" (ngày đăng hiển thị) và created_date (mốc tạo thật) - cho phép ghim bài mà không cần đổi ngày đăng.';
