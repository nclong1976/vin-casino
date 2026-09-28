# Supabase Edge Functions

- `_shared/docLayout/` là **bản chép sinh tự động** của `src/shared/docLayout/`
  (bộ dàn trang văn bản điện tử dùng chung giữa trình duyệt và Edge Function).
  Không sửa tay: sửa ở `src/shared/docLayout/` rồi chạy `npm run sync:shared`.
  CI (`npm run check:shared` + `deno check`) báo lỗi nếu bản chép bị lệch.
- `dispatch-campaign/`: phát hành một đợt văn bản theo lô (spec mục 8.2).
  Logic thuần ở `core.ts` (test: `deno test supabase/functions/`), truy cập
  Supabase ở `repo.ts`. Cần cấu hình:
  - Secret Edge Function `ESIGN_INTERNAL_SECRET` (chuỗi ngẫu nhiên) và
    `APP_PUBLIC_URL` (gốc URL app, cho mã QR /verify).
  - Vault: `esign_functions_base_url` (`https://<project>.supabase.co/functions/v1`)
    và `esign_internal_secret` (trùng `ESIGN_INTERNAL_SECRET`) để pg_cron chạy
    đợt hẹn giờ / chạy tiếp đợt bị ngắt. Thiếu 2 secret này thì chỉ phát hành
    ngay khi Admin bấm, và đợt quá lớn phải bấm "Chạy tiếp".
- `sign-document`, `render-document-pdf`, `get-document-pdf`,
  `purge-expired-documents` được thêm ở các sprint sau (spec mục 10).
