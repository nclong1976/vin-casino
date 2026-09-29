# Supabase Edge Functions

- `_shared/docLayout/` là **bản chép sinh tự động** của `src/shared/docLayout/`
  (bộ dàn trang văn bản điện tử dùng chung giữa trình duyệt và Edge Function).
  Không sửa tay: sửa ở `src/shared/docLayout/` rồi chạy `npm run sync:shared`.
  CI (`npm run check:shared` + `deno check`) báo lỗi nếu bản chép bị lệch.
- `dispatch-campaign/`: phát hành một đợt văn bản theo lô (spec mục 8.2).
  Logic thuần ở `core.ts` (test: `deno test supabase/functions/`), truy cập
  Supabase ở `repo.ts`. Cần cấu hình:
  - Supabase Vault (tạo bằng SQL, không đưa giá trị vào git):
    `esign_functions_base_url` (`https://<project>.supabase.co/functions/v1`),
    `esign_internal_secret` (chuỗi ngẫu nhiên) và `esign_app_public_url`
    (gốc URL app, cho mã QR /verify và tải font khi tạo PDF). pg_cron dùng 2
    secret đầu để chạy đợt hẹn giờ / chạy tiếp đợt bị ngắt / tạo lại PDF; các
    Edge Function đọc `esign_internal_secret` + `esign_app_public_url` qua RPC
    `esign_runtime_config` (chỉ service role) - xem `_shared/esign/http.ts`.
  - Không bắt buộc: secret Edge Function `ESIGN_INTERNAL_SECRET` /
    `APP_PUBLIC_URL` - nếu đặt thì được ưu tiên hơn giá trị trong Vault
    (`ESIGN_INTERNAL_SECRET` khi đó phải trùng `esign_internal_secret`).
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
  Dùng chung cấu hình Vault ở trên.
- `purge-expired-documents` được thêm ở sprint sau (spec mục 10).
