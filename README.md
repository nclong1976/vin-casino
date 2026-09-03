**VinClub — Vin Investment & Portfolio Platform**

Ứng dụng đầu tư/ví điện tử/casino, chạy trên Vite + React, dùng Supabase làm backend (Postgres, Auth, Realtime) và Render để deploy.

**Chạy ở máy local**

1. Cài đặt: `npm install`
2. Tạo file `.env.local` (xem `.env.example` để biết đầy đủ biến môi trường cần thiết — Supabase là bắt buộc, Telegram là tuỳ chọn)
3. Chạy: `npm run dev`

**Build & deploy**

- `npm run build` — build frontend (Vite) và server (esbuild)
- `npm start` — chạy bản đã build
- Production hiện đang deploy trên Render (xem `render.yaml`)

**Cơ sở dữ liệu**

Schema và các thay đổi Postgres nằm trong `supabase/migrations/` — đây là nguồn sự thật duy nhất cho cấu trúc database trên Supabase.
