# Supabase Edge Functions

- `_shared/docLayout/` là **bản chép sinh tự động** của `src/shared/docLayout/`
  (bộ dàn trang văn bản điện tử dùng chung giữa trình duyệt và Edge Function).
  Không sửa tay: sửa ở `src/shared/docLayout/` rồi chạy `npm run sync:shared`.
  CI (`npm run check:shared` + `deno check`) báo lỗi nếu bản chép bị lệch.
- Các Edge Function của tính năng ký văn bản (`dispatch-campaign`,
  `sign-document`, `render-document-pdf`, `get-document-pdf`,
  `purge-expired-documents`) được thêm ở các sprint sau - xem
  `docs/design/e-sign-letterhead-spec.md` mục 8 và 10.
