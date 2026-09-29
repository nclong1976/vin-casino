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
- `sign-document/` (spec mục 8.3): người nhận ký bằng JWT của mình. Kiểm tra
  PNG, hash nội dung, idempotency; ghi chữ ký qua RPC `esign_record_signature`
  rồi gọi `render-document-pdf` ở nền. Ảnh chữ ký lưu ở bucket private
  `signed-documents/<user_id>/<doc_id>.signature.png`.
- `render-document-pdf/` (spec mục 8.4): chỉ nhận lời gọi có
  `X-Internal-Secret`. Dàn trang bằng `_shared/docLayout` (giống hệt bản web),
  vẽ PDF bằng pdf-lib + trang chứng nhận ký, lưu `<user_id>/<doc_id>.pdf`.
  Job lỗi được pg_cron `esign-kick-pdf-jobs` gọi lại (tối đa 5 lần); Admin có
  nút "Tạo lại PDF". Font lấy từ `ESIGN_FONT_BASE_URL` (tuỳ chọn), mặc định
  `<APP_PUBLIC_URL>/fonts/noto-serif/` - chính file web đang dùng (đã subset
  bằng `scripts/subset-fonts.py`, bản gốc ở `assets/fonts-src/`).
- `get-document-pdf/`: signed URL 5 phút cho chủ văn bản hoặc Admin, ghi nhật
  ký `downloaded`.
- Cả 3 function đặt `verify_jwt = false` trong `config.toml` và tự kiểm tra
  JWT / secret. Triển khai:
  `supabase functions deploy sign-document render-document-pdf get-document-pdf`.
  Dùng chung secret `ESIGN_INTERNAL_SECRET`, `APP_PUBLIC_URL` và 2 secret Vault
  ở trên.
- `purge-expired-documents` được thêm ở sprint sau (spec mục 10).
