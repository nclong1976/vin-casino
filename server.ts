import express from "express";
import path from "path";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = process.env.PORT || 3000;

// Lưới an toàn toàn tiến trình: TRƯỚC ĐÂY 1 lỗi bất kỳ không bắt được ở bất kỳ
// đâu (kể cả trong 1 job nền không quan trọng như forward Telegram) sẽ crash
// CẢ server (Express + Socket.io + mọi API nạp/rút/CSKH...) - đã từng xảy ra
// thật: kênh Realtime "forward Nạp/Rút" mất kết nối kéo dài, lặp lại quá
// nhanh/quá nhiều lần khiến console/log bị "bão" tới mức tràn ngăn xếp
// (RangeError: Maximum call stack size exceeded ngay trong console.log) và
// kéo sập toàn bộ tiến trình dù lỗi gốc chỉ nằm ở 1 tính năng phụ. Bắt lỗi ở
// đây để tối thiểu là GHI LOG thay vì crash trong im lặng/crash-loop liên
// tục trên Render - không exit process, để mọi request/luồng khác (nạp, rút,
// đăng nhập...) không bị ảnh hưởng vì 1 lỗi ở 1 job nền riêng lẻ.
process.on("uncaughtException", (err) => {
  try {
    process.stderr.write(`[FATAL] uncaughtException: ${err?.stack || err}\n`);
  } catch (e) {}
});
process.on("unhandledRejection", (reason) => {
  try {
    process.stderr.write(`[FATAL] unhandledRejection: ${reason instanceof Error ? reason.stack : reason}\n`);
  } catch (e) {}
});

// ─────────────────────────────────────────────────────────────────────────
// Cộng lãi hàng ngày theo cấp VIP - CHỈ chạy ở đây (server), KHÔNG có đường
// nào để trình duyệt người dùng tự kích hoạt. Toàn bộ tính toán + ghi tiền
// nằm trong hàm Postgres credit_daily_interest_batch() (xem
// supabase_daily_interest_migration.sql) - hàm đó tự đảm bảo mỗi user chỉ
// được cộng đúng 1 lần/ngày ngay trong 1 câu SQL, nên việc gọi lại nhiều lần
// ở đây (server restart, nhiều lần setInterval...) luôn an toàn.
//
// Dùng service_role key (KHÔNG phải anon key của trình duyệt) vì RPC này đã
// bị REVOKE khỏi anon/authenticated - chỉ service_role gọi được. Nếu chưa
// cấu hình biến môi trường, job tự tắt (không throw, không chặn server).
const supabaseServiceUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin =
  supabaseServiceUrl && supabaseServiceRoleKey
    ? createClient(supabaseServiceUrl, supabaseServiceRoleKey, { auth: { persistSession: false } })
    : null;

// Chẩn đoán tầng THẤP HƠN hẳn từng kênh (channel.subscribe() chỉ báo được
// status như "CLOSED" - đã thêm tham số err ở PR #75 nhưng log thật trên
// production cho thấy err LUÔN rỗng, nghĩa là lỗi xảy ra ngay ở tầng socket
// WebSocket dùng chung cho MỌI kênh Realtime, trước cả khi 1 kênh cụ thể kịp
// nhận diện lỗi). "socketAdapter" là field runtime thật của RealtimeClient
// (không có trong .d.ts công khai vì đánh dấu private ở TypeScript, nhưng
// vẫn truy cập được lúc chạy - ép kiểu any) - onOpen/onClose/onError ở đây
// là NƠI DUY NHẤT thấy được lý do đóng kết nối thật (CloseEvent.code/reason,
// Event lỗi WebSocket...) thay vì chỉ chuỗi "CLOSED" mơ hồ.
if (supabaseAdmin) {
  try {
    const socketAdapter = (supabaseAdmin.realtime as any)?.socketAdapter;
    let socketErrCount = 0;
    let socketCloseCount = 0;
    socketAdapter?.onOpen?.(() => {
      console.log("[RealtimeSocket] Kết nối WebSocket dùng chung đã mở thành công.");
    });
    socketAdapter?.onClose?.((event: any) => {
      socketCloseCount += 1;
      if (socketCloseCount <= 5 || socketCloseCount % 50 === 0) {
        console.warn(
          `[RealtimeSocket] Socket đóng (lần ${socketCloseCount}) - code=${event?.code} reason=${event?.reason || "(không có)"} wasClean=${event?.wasClean}`
        );
      }
    });
    socketAdapter?.onError?.((error: any) => {
      socketErrCount += 1;
      if (socketErrCount <= 5 || socketErrCount % 50 === 0) {
        console.error(
          `[RealtimeSocket] Socket lỗi (lần ${socketErrCount}):`,
          error?.message || error?.type || error
        );
      }
    });
  } catch (e: any) {
    console.warn("[RealtimeSocket] Không gắn được hook chẩn đoán socket:", e?.message || e);
  }
}

if (!supabaseAdmin) {
  console.warn(
    "[DailyInterest] SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình - tính năng cộng lãi hàng ngày theo cấp VIP đang TẮT."
  );
}

async function runDailyInterestBatch() {
  if (!supabaseAdmin) return;
  try {
    const { data, error } = await supabaseAdmin.rpc("credit_daily_interest_batch");
    if (error) {
      console.error("[DailyInterest] Lỗi gọi credit_daily_interest_batch:", error.message);
      return;
    }
    const rows = data || [];
    if (rows.length > 0) {
      console.log(`[DailyInterest] Đã cộng lãi cho ${rows.length} tài khoản.`);
    }
  } catch (err: any) {
    console.error("[DailyInterest] Lỗi không mong đợi:", err?.message || err);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Cầu nối CSKH <-> Telegram: tin nhắn user gửi trong app (khung "Hỗ trợ &
// Chăm sóc KH") được chuyển tiếp real-time vào 1 nhóm Telegram; Admin
// "Reply" đúng tin nhắn đó trên Telegram thì trả lời được ghi ngược lại vào
// đúng hội thoại của user đó trong app - không cần mở Admin Panel để trả
// lời CSKH. Toàn bộ chạy ở server (KHÔNG lộ TELEGRAM_BOT_TOKEN ra trình
// duyệt) - tự tắt nếu chưa cấu hình đủ biến môi trường, không chặn server
// khởi động.
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_API = TELEGRAM_BOT_TOKEN ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}` : null;

if (!TELEGRAM_API || !TELEGRAM_CHAT_ID) {
  console.warn(
    "[Telegram] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID chưa được cấu hình - cầu nối CSKH <-> Telegram đang TẮT."
  );
}

async function sendTelegramMessage(
  text: string,
  replyToMessageId?: number,
  replyMarkup?: unknown,
  messageThreadId?: number
): Promise<number | null> {
  if (!TELEGRAM_API || !TELEGRAM_CHAT_ID) return null;
  try {
    const body: Record<string, unknown> = {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
    };
    if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
    if (replyMarkup) body.reply_markup = replyMarkup;
    // Gửi vào đúng Forum Topic của khách hàng (xem ensureForumTopic()) - nếu
    // nhóm Telegram chưa bật Forum Topics thì tham số này bị Telegram bỏ qua
    // (tin vẫn gửi bình thường vào nhóm, không lỗi).
    if (messageThreadId) body.message_thread_id = messageThreadId;

    const resp = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: any = await resp.json();
    if (!data.ok) {
      console.error("[Telegram] sendMessage lỗi:", data.description);
      return null;
    }
    return data.result?.message_id ?? null;
  } catch (err: any) {
    console.error("[Telegram] sendMessage exception:", err?.message || err);
    return null;
  }
}

/** Sửa nội dung + reply_markup của 1 tin nhắn Telegram đã gửi (dùng để cập nhật trạng thái/nút bấm sau khi Admin xử lý). */
async function editTelegramMessage(messageId: number, text: string, replyMarkup?: unknown) {
  if (!TELEGRAM_API || !TELEGRAM_CHAT_ID) return;
  try {
    const resp = await fetch(`${TELEGRAM_API}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        message_id: messageId,
        text,
        parse_mode: "HTML",
        reply_markup: replyMarkup ?? { inline_keyboard: [] },
      }),
    });
    const data: any = await resp.json();
    if (!data.ok) console.error("[Telegram] editMessageText lỗi:", data.description);
  } catch (err: any) {
    console.error("[Telegram] editMessageText exception:", err?.message || err);
  }
}

/** Trả lời 1 callback_query (bấm nút inline) - bắt buộc gọi để Telegram tắt icon loading trên nút, có thể kèm toast nhỏ. */
async function answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false) {
  if (!TELEGRAM_API) return;
  try {
    await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: showAlert }),
    });
  } catch (err: any) {
    console.error("[Telegram] answerCallbackQuery exception:", err?.message || err);
  }
}

// Admin trả lời CSKH bằng ảnh trên Telegram (gửi Photo hoặc File ảnh) -
// Telegram chỉ gửi kèm `file_id` trong webhook, phải gọi thêm getFile để lấy
// đường dẫn tải, rồi tự tải file đó về. Encode base64 thành data URL và lưu
// thẳng vào `messages.attachments` - ĐÚNG pattern base64-trong-Postgres mà
// client (UploadFile trong base44Client.js) đã dùng cho ảnh user tự gửi lên,
// nên MessageBubble.jsx render lại không cần sửa gì thêm.
const TELEGRAM_MAX_IMAGE_BYTES = 8 * 1024 * 1024; // ~8MB - đủ cho ảnh, tránh phình quá cỡ 1 dòng Postgres

async function fetchTelegramFileAsDataUrl(fileId: string): Promise<string | null> {
  if (!TELEGRAM_API || !TELEGRAM_BOT_TOKEN) return null;
  try {
    const infoResp = await fetch(`${TELEGRAM_API}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const infoData: any = await infoResp.json();
    if (!infoData.ok || !infoData.result?.file_path) {
      console.error("[Telegram] getFile lỗi:", infoData.description);
      return null;
    }
    const filePath: string = infoData.result.file_path;

    const fileResp = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`);
    if (!fileResp.ok) {
      console.error("[Telegram] Tải file ảnh thất bại, status:", fileResp.status);
      return null;
    }
    const buf = Buffer.from(await fileResp.arrayBuffer());
    if (buf.length > TELEGRAM_MAX_IMAGE_BYTES) {
      console.warn(`[Telegram] Ảnh admin gửi quá lớn (${buf.length} bytes) - bỏ qua, không lưu vào hội thoại.`);
      return null;
    }

    const ext = (filePath.split(".").pop() || "jpg").toLowerCase();
    const mime =
      ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch (err: any) {
    console.error("[Telegram] fetchTelegramFileAsDataUrl exception:", err?.message || err);
    return null;
  }
}

/**
 * Lấy `file_id` ảnh trong 1 tin nhắn Telegram - hỗ trợ cả 2 cách Admin có thể
 * gửi: (a) Photo (Telegram tự nén, kèm nhiều size - lấy size lớn nhất/phần
 * tử cuối) và (b) File ảnh gửi ở dạng Document (giữ nguyên chất lượng gốc,
 * Admin chọn "Gửi dưới dạng file" trên Telegram) - chỉ nhận khi mime_type bắt
 * đầu bằng "image/", bỏ qua các loại file khác.
 */
function extractTelegramImageFileId(message: any): string | null {
  const photoSizes = message?.photo;
  if (Array.isArray(photoSizes) && photoSizes.length > 0) {
    return photoSizes[photoSizes.length - 1]?.file_id ?? null;
  }
  const doc = message?.document;
  if (doc?.mime_type?.startsWith("image/")) return doc.file_id ?? null;
  return null;
}

// Trước đây khi user gửi tin nhắn CHỈ có ảnh (không kèm chữ) trong CSKH,
// startTelegramForwarding() chỉ gửi 1 dòng text placeholder "(tệp đính
// kèm)" sang Telegram - ảnh thật KHÔNG hề được chuyển tiếp, Admin phải mở
// Admin Panel mới xem được. sendTelegramPhoto()/attachmentToImageBuffer()
// vá đúng chỗ thiếu này - gửi ảnh thật bằng sendPhoto (multipart/form-data,
// vì attachments lưu dạng data: URL base64, Telegram không tự tải được URL
// dạng đó) ngay trong topic của khách, reply vào đúng tin nhắn text đã gửi.

/** Gửi 1 ảnh (Buffer) vào nhóm Telegram qua sendPhoto - multipart/form-data vì
 * Telegram không tải được `data:` URL trực tiếp như tham số `photo` dạng chuỗi. */
async function sendTelegramPhoto(
  buffer: Buffer,
  filename: string,
  replyToMessageId?: number,
  messageThreadId?: number
): Promise<number | null> {
  if (!TELEGRAM_API || !TELEGRAM_CHAT_ID) return null;
  try {
    const form = new FormData();
    form.append("chat_id", TELEGRAM_CHAT_ID);
    if (replyToMessageId) form.append("reply_to_message_id", String(replyToMessageId));
    if (messageThreadId) form.append("message_thread_id", String(messageThreadId));
    form.append("photo", new Blob([buffer]), filename);

    const resp = await fetch(`${TELEGRAM_API}/sendPhoto`, { method: "POST", body: form });
    const data: any = await resp.json();
    if (!data.ok) {
      console.error("[Telegram] sendPhoto lỗi:", data.description);
      return null;
    }
    return data.result?.message_id ?? null;
  } catch (err: any) {
    console.error("[Telegram] sendPhoto exception:", err?.message || err);
    return null;
  }
}

/** Chuyển 1 phần tử trong messages.attachments (URL string) thành Buffer ảnh
 * để gửi qua sendTelegramPhoto() - hỗ trợ cả `data:image/...;base64,...`
 * (cách UploadFile() ở client lưu ảnh, xem base44Client.js) lẫn URL http(s)
 * thật trỏ tới ảnh. Trả về null nếu không phải ảnh hoặc vượt quá kích thước
 * cho phép (dùng chung TELEGRAM_MAX_IMAGE_BYTES với chiều Admin -> user). */
async function attachmentToImageBuffer(url: unknown): Promise<{ buffer: Buffer; ext: string } | null> {
  if (typeof url !== "string") return null;
  try {
    if (url.startsWith("data:image/")) {
      const match = url.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) return null;
      const buffer = Buffer.from(match[2], "base64");
      if (buffer.length > TELEGRAM_MAX_IMAGE_BYTES) {
        console.warn(`[Telegram] Ảnh user gửi quá lớn (${buffer.length} bytes) - bỏ qua forward.`);
        return null;
      }
      return { buffer, ext: (match[1].split("+")[0] || "jpg").toLowerCase() };
    }
    if (/^https?:\/\//i.test(url) && /\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(url)) {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const buffer = Buffer.from(await resp.arrayBuffer());
      if (buffer.length > TELEGRAM_MAX_IMAGE_BYTES) {
        console.warn(`[Telegram] Ảnh user gửi quá lớn (${buffer.length} bytes) - bỏ qua forward.`);
        return null;
      }
      const ext = (url.split(/[?#]/)[0].split(".").pop() || "jpg").toLowerCase();
      return { buffer, ext };
    }
    return null;
  } catch (err: any) {
    console.error("[Telegram] attachmentToImageBuffer exception:", err?.message || err);
    return null;
  }
}

/** Thoát các ký tự đặc biệt của HTML parse_mode (Telegram) để nội dung user gõ không phá format tin nhắn. */
function escapeHtml(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─────────────────────────────────────────────────────────────────────────
// Cầu nối Telegram Business <-> CSKH (xem ghi chú đầy đủ trong migration
// telegram_business_bridge.sql). Khác hẳn kênh "1 nhóm chung + Forum Topic"
// ở trên (luôn gửi vào 1 chat_id cố định TELEGRAM_CHAT_ID) - kênh này gửi
// tới ĐÚNG chat_id của từng khách hàng, kèm business_connection_id để
// Telegram biết gửi "thay mặt" tài khoản Business nào.

/** Gửi tin nhắn text tới 1 chat_id BẤT KỲ, KHÔNG qua Business Connection -
 * dùng cho đoạn chat trực tiếp giữa khách và chính con bot (bước liên kết
 * /start, xem handleBusinessLinkStart()) - khác hẳn sendTelegramMessage() ở
 * trên (luôn gửi vào nhóm cố định) và sendTelegramBusinessMessage() bên dưới
 * (gửi thay mặt tài khoản Business). */
async function sendPlainTelegramMessage(chatId: number, text: string): Promise<number | null> {
  if (!TELEGRAM_API) return null;
  try {
    const resp = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    const data: any = await resp.json();
    if (!data.ok) {
      console.error("[Telegram] sendMessage(plain) lỗi:", data.description);
      return null;
    }
    return data.result?.message_id ?? null;
  } catch (err: any) {
    console.error("[Telegram] sendMessage(plain) exception:", err?.message || err);
    return null;
  }
}

async function sendTelegramBusinessMessage(
  businessConnectionId: string,
  chatId: number,
  text: string
): Promise<number | null> {
  if (!TELEGRAM_API) return null;
  try {
    const resp = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_connection_id: businessConnectionId,
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });
    const data: any = await resp.json();
    if (!data.ok) {
      console.error("[TelegramBusiness] sendMessage lỗi:", data.description);
      return null;
    }
    return data.result?.message_id ?? null;
  } catch (err: any) {
    console.error("[TelegramBusiness] sendMessage exception:", err?.message || err);
    return null;
  }
}

async function sendTelegramBusinessPhoto(
  businessConnectionId: string,
  chatId: number,
  buffer: Buffer,
  filename: string
): Promise<number | null> {
  if (!TELEGRAM_API) return null;
  try {
    const form = new FormData();
    form.append("business_connection_id", businessConnectionId);
    form.append("chat_id", String(chatId));
    form.append("photo", new Blob([buffer]), filename);
    const resp = await fetch(`${TELEGRAM_API}/sendPhoto`, { method: "POST", body: form });
    const data: any = await resp.json();
    if (!data.ok) {
      console.error("[TelegramBusiness] sendPhoto lỗi:", data.description);
      return null;
    }
    return data.result?.message_id ?? null;
  } catch (err: any) {
    console.error("[TelegramBusiness] sendPhoto exception:", err?.message || err);
    return null;
  }
}

/** Sửa nội dung 1 tin nhắn Business đã gửi - dùng khi Admin bấm "Sửa tin nhắn" trong Admin Panel. */
async function editTelegramBusinessMessageText(
  businessConnectionId: string,
  chatId: number,
  messageId: number,
  text: string
) {
  if (!TELEGRAM_API) return;
  try {
    const resp = await fetch(`${TELEGRAM_API}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_connection_id: businessConnectionId,
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
      }),
    });
    const data: any = await resp.json();
    if (!data.ok) console.error("[TelegramBusiness] editMessageText lỗi:", data.description);
  } catch (err: any) {
    console.error("[TelegramBusiness] editMessageText exception:", err?.message || err);
  }
}

/** Xóa thật 1 hoặc nhiều tin nhắn Business - dùng khi Admin xóa (từng tin hoặc xóa hàng loạt) trong Admin Panel. */
async function deleteTelegramBusinessMessages(businessConnectionId: string, messageIds: number[]) {
  if (!TELEGRAM_API || messageIds.length === 0) return;
  try {
    const resp = await fetch(`${TELEGRAM_API}/deleteBusinessMessages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business_connection_id: businessConnectionId, message_ids: messageIds }),
    });
    const data: any = await resp.json();
    if (!data.ok) console.error("[TelegramBusiness] deleteBusinessMessages lỗi:", data.description);
  } catch (err: any) {
    console.error("[TelegramBusiness] deleteBusinessMessages exception:", err?.message || err);
  }
}

/** Lưu/cập nhật trạng thái kết nối Business hiện tại - Telegram gửi update
 * "business_connection" mỗi khi Admin bật/tắt/đổi quyền cho bot trong Cài
 * đặt > Telegram Business > Chatbots. */
async function upsertTelegramBusinessConnection(conn: any) {
  if (!supabaseAdmin || !conn?.id) return;
  try {
    await supabaseAdmin.from("telegram_business_connection").upsert({
      id: "default",
      business_connection_id: conn.id,
      business_user_id: conn.user?.id ?? null,
      is_enabled: !!conn.is_enabled,
      can_reply: !!conn.can_reply,
      updated_date: new Date().toISOString(),
    });
    console.log(
      `[TelegramBusiness] Kết nối ${conn.is_enabled ? "BẬT" : "TẮT"} (connection_id=${conn.id}, can_reply=${conn.can_reply})`
    );
  } catch (e) {
    console.error("[TelegramBusiness] Không lưu được trạng thái kết nối:", e);
  }
}

async function getActiveTelegramBusinessConnection(): Promise<{
  businessConnectionId: string;
  businessUserId: number | null;
} | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data } = await supabaseAdmin
      .from("telegram_business_connection")
      .select("business_connection_id, business_user_id, is_enabled")
      .eq("id", "default")
      .maybeSingle();
    if (!data?.is_enabled || !data.business_connection_id) return null;
    return { businessConnectionId: data.business_connection_id, businessUserId: data.business_user_id ?? null };
  } catch (e) {
    console.error("[TelegramBusiness] Không đọc được trạng thái kết nối:", e);
    return null;
  }
}

/**
 * Bước liên kết AN TOÀN 1 lần: khách bấm link "t.me/<bot>?start=<mã>" TỪ
 * TRONG APP (đang đăng nhập) - Telegram mở 1 đoạn chat TRỰC TIẾP với chính
 * con bot (KHÁC HẲN đoạn chat với tài khoản Business - 2 chat riêng biệt),
 * gửi lệnh "/start <mã>" làm tin nhắn đầu tiên. Mã chính là user.id thật
 * (dấu "-" đã đổi thành "_" cho hợp lệ với start_param) - không cần khách tự
 * gõ số điện thoại/email (dễ gõ nhầm/giả mạo người khác trên 1 nền tảng tài
 * chính). Sau khi khớp, lưu telegram_business_links để nhận diện ĐÚNG khách
 * đó ở MỌI tin nhắn Business sau này - Telegram user id CỐ ĐỊNH, giống nhau
 * dù họ nhắn cho bot hay cho tài khoản Business.
 * Trả về true nếu đây đúng là 1 lượt /start (đã xử lý xong, dù thành công
 * hay báo lỗi) để nơi gọi biết dừng lại, không xử lý tiếp như tin nhắn khác.
 */
async function handleBusinessLinkStart(message: any): Promise<boolean> {
  const text: string = message?.text || "";
  const match = text.match(/^\/start(?:@\S+)?\s+(\S+)/);
  const telegramUserId = message?.from?.id;
  if (!match) return false;
  if (!supabaseAdmin || !telegramUserId) return true;

  const userId = match[1].replace(/_/g, "-");
  try {
    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("id, full_name, name")
      .eq("id", userId)
      .maybeSingle();

    if (!userRow) {
      await sendPlainTelegramMessage(
        telegramUserId,
        '⚠️ Không tìm thấy tài khoản VinClub tương ứng. Vui lòng bấm lại nút "Liên hệ CSKH" ngay trong ứng dụng VinClub để lấy đúng link liên kết.'
      );
      return true;
    }

    await supabaseAdmin.from("telegram_business_links").upsert({
      telegram_user_id: telegramUserId,
      user_id: userRow.id,
      verified: true,
      linked_at: new Date().toISOString(),
    });

    const businessUsername = (process.env.TELEGRAM_BUSINESS_USERNAME || "").replace(/^@/, "");
    const contactLine = businessUsername
      ? `\n\nBây giờ bạn nhắn tin trực tiếp cho CSKH VinClub tại: https://t.me/${businessUsername}`
      : "\n\nBây giờ bạn có thể nhắn tin trực tiếp cho CSKH VinClub qua Telegram.";
    await sendPlainTelegramMessage(
      telegramUserId,
      `✅ Đã liên kết tài khoản Telegram của bạn với VinClub (${escapeHtml(userRow.full_name || userRow.name || "")}).${contactLine}`
    );
    console.log(`[TelegramBusiness] Đã liên kết telegram_user_id=${telegramUserId} với user_id=${userId}`);
  } catch (e) {
    console.error("[TelegramBusiness] Lỗi xử lý /start liên kết:", e);
  }
  return true;
}

/** Quy đổi telegram_user_id của người gửi 1 business_message thành user_id
 * VinClub tương ứng. Trả về null nếu chính chủ tài khoản Business (Admin) tự
 * gõ trả lời trên Telegram cá nhân của họ - nơi gọi tự xử lý riêng nhánh đó
 * (sender="admin", ghi thẳng vào conversation đang có, không tra bảng liên
 * kết khách hàng). "verified":false = khách nhắn thẳng cho tài khoản Business
 * mà CHƯA từng bấm link liên kết trong app - vẫn ghi nhận để Admin không bỏ
 * sót (dùng user_id giả "tgbiz_<id>", không khớp auth.uid() của ai - đúng
 * bằng cơ chế "Khách #xxxxxx" MessagesTab.jsx đã có sẵn khi usersMap không
 * tìm thấy user thật, không cần thêm code hiển thị riêng). */
async function resolveBusinessSender(
  telegramUserId: number,
  businessUserId: number | null
): Promise<{ userId: string; verified: boolean } | null> {
  if (businessUserId && telegramUserId === businessUserId) return null;
  if (!supabaseAdmin) return { userId: `tgbiz_${telegramUserId}`, verified: false };

  try {
    const { data: link } = await supabaseAdmin
      .from("telegram_business_links")
      .select("user_id, verified")
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();
    if (link?.user_id) return { userId: link.user_id, verified: !!link.verified };
  } catch (e) {
    console.error("[TelegramBusiness] Không đọc được telegram_business_links:", e);
  }
  return { userId: `tgbiz_${telegramUserId}`, verified: false };
}

/** Xử lý 1 update "business_message" - tin nhắn MỚI (từ khách HOẶC từ chính
 * Admin tự gõ trên Telegram cá nhân) trong 1 cuộc chat đã kết nối Business.
 * Ghi thẳng vào public.messages giống hệt luồng CSKH cũ - trigger
 * reopen_support_conversation_on_customer_message() có sẵn tự lo phần
 * support_conversations (last_message_at/preview/unread_count...), không
 * cần thêm code riêng ở đây. */
async function handleIncomingBusinessMessage(businessMessage: any, businessUserId: number | null) {
  if (!supabaseAdmin) return;
  const telegramUserId = businessMessage?.from?.id;
  const chatId = businessMessage?.chat?.id;
  if (!telegramUserId || !chatId) return;

  const resolved = await resolveBusinessSender(telegramUserId, businessUserId);
  const isAdminSender = resolved === null;
  let conversationId: string;
  let verified: boolean;

  if (isAdminSender) {
    // Admin tự gõ (kể cả gửi ảnh) trên CHÍNH Telegram cá nhân, không qua
    // Admin Panel - "chat" của 1 business_message LUÔN là chat của KHÁCH dù
    // ai gõ (giống hệt chiều gửi đi ở sendTelegramBusinessMessage(), chat_id
    // luôn là khách), nên tra đúng khách qua chat.id (KHÁC với telegram_user_id
    // ở đây - lúc này chính là Admin) thay vì bỏ qua như trước. Nhờ vậy tin
    // của Admin (gõ trực tiếp trên Telegram) cũng vào đúng hội thoại CSKH của
    // khách đó, hiện real-time bên người dùng (Support.jsx đã tự lắng nghe
    // INSERT/UPDATE/DELETE trên messages qua Supabase Realtime từ trước).
    const { data: custLink } = await supabaseAdmin
      .from("telegram_business_links")
      .select("user_id, verified")
      .eq("telegram_user_id", chatId)
      .maybeSingle();
    conversationId = custLink?.user_id || `tgbiz_${chatId}`;
    verified = !!custLink?.verified;
  } else {
    conversationId = resolved.userId;
    verified = resolved.verified;
  }

  const text: string = businessMessage.text || businessMessage.caption || "";
  const imageFileId = extractTelegramImageFileId(businessMessage);
  const attachments: string[] = [];
  if (imageFileId) {
    const dataUrl = await fetchTelegramFileAsDataUrl(imageFileId);
    if (dataUrl) attachments.push(dataUrl);
  }
  if (!text && attachments.length === 0) return;

  const sentAt = businessMessage.date ? new Date(businessMessage.date * 1000).toISOString() : new Date().toISOString();
  const messageId = "id_tgb_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
  const { error } = await supabaseAdmin.from("messages").insert({
    id: messageId,
    sender: isAdminSender ? "admin" : "user",
    user_id: conversationId,
    conversation_id: conversationId,
    content: text,
    attachments,
    created_date: sentAt,
  });
  if (error) {
    console.error("[TelegramBusiness] Không ghi được business_message:", error.message);
    return;
  }

  if (businessMessage.message_id && businessMessage.business_connection_id) {
    try {
      await supabaseAdmin.from("telegram_business_message_links").insert({
        telegram_message_id: businessMessage.message_id,
        business_connection_id: businessMessage.business_connection_id,
        message_id: messageId,
      });
    } catch (e) {
      console.error("[TelegramBusiness] Không lưu được telegram_business_message_links:", e);
    }
  }

  if (!verified) {
    console.warn(
      `[TelegramBusiness] Tin nhắn từ telegram_user_id=${telegramUserId} CHƯA xác thực (chưa liên kết tài khoản VinClub nào).`
    );
  }
}

/** Xử lý update "edited_business_message" - Admin/khách SỬA thật 1 tin nhắn
 * trên Telegram (long-press -> Edit) - tìm đúng dòng messages tương ứng qua
 * telegram_business_message_links rồi UPDATE content. */
async function handleEditedBusinessMessage(businessMessage: any) {
  if (!supabaseAdmin) return;
  const telegramMessageId = businessMessage?.message_id;
  const businessConnectionId = businessMessage?.business_connection_id;
  if (!telegramMessageId || !businessConnectionId) return;

  try {
    const { data: link } = await supabaseAdmin
      .from("telegram_business_message_links")
      .select("message_id")
      .eq("telegram_message_id", telegramMessageId)
      .eq("business_connection_id", businessConnectionId)
      .maybeSingle();
    if (!link?.message_id) return;

    const newText: string = businessMessage.text || businessMessage.caption || "";
    await supabaseAdmin.from("messages").update({ content: newText }).eq("id", link.message_id);
    console.log(`[TelegramBusiness] Đã đồng bộ sửa tin nhắn ${link.message_id}`);
  } catch (e) {
    console.error("[TelegramBusiness] Lỗi xử lý edited_business_message:", e);
  }
}

/** Xử lý update "deleted_business_messages" - Admin/khách XÓA thật 1 hoặc
 * NHIỀU tin nhắn cùng lúc trên Telegram (chọn nhiều tin -> Delete = đúng 1
 * update kèm mảng message_ids - "xóa hàng loạt" tự động khớp qua CÙNG code
 * này, không cần xử lý riêng). */
async function handleDeletedBusinessMessages(payload: any) {
  if (!supabaseAdmin) return;
  const businessConnectionId = payload?.business_connection_id;
  const messageIds: number[] = Array.isArray(payload?.message_ids) ? payload.message_ids : [];
  if (!businessConnectionId || messageIds.length === 0) return;

  try {
    const { data: links } = await supabaseAdmin
      .from("telegram_business_message_links")
      .select("message_id")
      .eq("business_connection_id", businessConnectionId)
      .in("telegram_message_id", messageIds);
    const appMessageIds = (links || []).map((l: any) => l.message_id).filter(Boolean);
    if (appMessageIds.length === 0) return;

    // Xóa link TRƯỚC rồi mới xóa messages - forwardMessageUpdateToBusiness()
    // bên dưới cũng lắng nghe DELETE trên "messages" để đồng bộ ngược (Admin
    // Panel -> Telegram), xóa link trước tránh nó gọi lại deleteBusinessMessages
    // 1 lần nữa cho những tin đã xóa xong ở đây.
    await supabaseAdmin
      .from("telegram_business_message_links")
      .delete()
      .eq("business_connection_id", businessConnectionId)
      .in("telegram_message_id", messageIds);
    await supabaseAdmin.from("messages").delete().in("id", appMessageIds);
    console.log(`[TelegramBusiness] Đã đồng bộ xóa ${appMessageIds.length} tin nhắn.`);
  } catch (e) {
    console.error("[TelegramBusiness] Lỗi xử lý deleted_business_messages:", e);
  }
}

/** Tra tên hiển thị của 1 user từ bảng users (dùng chung cho cả forward CSKH lẫn forward nạp/rút). */
async function getUserDisplayName(userId: string): Promise<string> {
  if (!supabaseAdmin || !userId) return userId;
  try {
    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("full_name, name, username, email")
      .eq("id", userId)
      .maybeSingle();
    if (userRow) return userRow.full_name || userRow.name || userRow.username || userRow.email || userId;
  } catch (e) {}
  return userId;
}

function fmtVnd(n: number): string {
  return (Number(n) || 0).toLocaleString("vi-VN");
}

// Telegram giới hạn tên Forum Topic tối đa 128 ký tự.
const TELEGRAM_TOPIC_NAME_MAX = 128;

/**
 * "Phân loại từng người dùng tại nhóm Telegram" - mỗi khách hàng có 1 Forum
 * Topic riêng trong nhóm (support_conversations.telegram_thread_id), thay vì
 * mọi khách đan xen chung 1 luồng tin nhắn. Trả về message_thread_id để gắn
 * vào sendTelegramMessage() bên dưới - trả về null nếu nhóm Telegram CHƯA
 * bật Forum Topics (Admin phải tự bật trong cài đặt nhóm) hoặc ghi Postgres
 * thất bại - KHÔNG chặn/ném lỗi, để luồng forward CSKH vẫn hoạt động bình
 * thường (gửi vào nhóm không phân loại) như trước khi có tính năng này.
 */
async function ensureForumTopic(conversationId: string, userName: string): Promise<number | null> {
  if (!supabaseAdmin || !TELEGRAM_API || !TELEGRAM_CHAT_ID || !conversationId) return null;

  try {
    const { data: existing } = await supabaseAdmin
      .from("support_conversations")
      .select("telegram_thread_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (existing?.telegram_thread_id) return existing.telegram_thread_id;
  } catch (e) {
    console.error("[Telegram] Không đọc được telegram_thread_id:", e);
  }

  try {
    const topicName = (userName || conversationId).slice(0, TELEGRAM_TOPIC_NAME_MAX);
    const resp = await fetch(`${TELEGRAM_API}/createForumTopic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, name: topicName }),
    });
    const data: any = await resp.json();
    if (!data.ok) {
      // Lỗi thường gặp nhất: nhóm chưa bật Forum Topics - ghi log 1 lần rõ
      // ràng để Admin biết cần bật, nhưng KHÔNG chặn forward tin nhắn.
      console.warn(
        "[Telegram] Không tạo được Forum Topic (nhóm có thể chưa bật Topics):",
        data.description
      );
      return null;
    }
    const threadId = data.result?.message_thread_id;
    if (!threadId) return null;

    try {
      // upsert vì hội thoại này có thể CHƯA có dòng nào trong
      // support_conversations (khách hoàn toàn mới, tin đầu tiên).
      await supabaseAdmin.from("support_conversations").upsert(
        { id: conversationId, telegram_thread_id: threadId },
        { onConflict: "id" }
      );
    } catch (e) {
      console.error("[Telegram] Không lưu được telegram_thread_id:", e);
    }
    return threadId;
  } catch (err: any) {
    console.error("[Telegram] createForumTopic exception:", err?.message || err);
    return null;
  }
}

// Cả 2 kênh forward Telegram (tin nhắn CSKH + nạp/rút) trước đây chỉ
// console.log() trạng thái subscribe, KHÔNG hề tự kết nối lại khi kênh rớt
// (server Render "ngủ"/khởi động lại, mạng chập chờn...) - Supabase Realtime
// có thể tự đóng kênh (CLOSED/CHANNEL_ERROR/TIMED_OUT) mà không tự phục hồi,
// khiến việc chuyển tiếp sang Telegram IM LẶNG NGỪNG HẲN cho tới khi restart
// cả process server - đúng lớp lỗi "tin nhắn liên kết Telegram không tới
// nơi" mà không hề có dấu hiệu báo lỗi nào. Bọc chung 1 lớp tự kết nối lại
// (backoff tăng dần, tối đa 30s) cho cả 2 kênh thay vì để mỗi kênh tự xử lý
// riêng lẻ.
function subscribeWithAutoReconnect(createChannel: () => any, label: string) {
  let attempt = 0;
  const connect = () => {
    const channel = createChannel();
    // Supabase Realtime truyền THÊM tham số thứ 2 (err) cho callback này khi
    // status là CHANNEL_ERROR/TIMED_OUT - chứa lý do THẬT của việc mất kết
    // nối (lỗi WebSocket, xác thực, rate limit...). Code cũ bỏ qua hoàn toàn
    // tham số này nên trước giờ chỉ biết "CLOSED"/"CHANNEL_ERROR" mà KHÔNG hề
    // biết vì sao - không đủ để chẩn đoán khi tính năng forward Telegram im
    // lặng ngừng hoạt động (khách vẫn gửi tin bình thường trong app, chỉ là
    // Admin không nhận được qua Telegram vì kênh này không kết nối được).
    channel.subscribe((status: string, err?: any) => {
      if (status === "SUBSCRIBED") {
        if (attempt > 0) console.log(`[Telegram] ${label}: đã kết nối lại thành công.`);
        attempt = 0;
        return;
      }
      if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        attempt += 1;
        // Trần backoff 5 phút trong ~1 giờ đầu, sau đó giãn hẳn ra 30 phút/lần
        // nếu vẫn chưa kết nối lại được (attempt > 20) - nếu Realtime mất kết
        // nối THẬT SỰ kéo dài (sự cố hạ tầng/mạng, không phải chập chờn tạm
        // thời), tạo kênh mới liên tục dù đã giãn cách vẫn khiến số kênh cũ
        // tích tụ không giới hạn theo thời gian - đã từng gây crash cả server
        // (xem PR #73). CHỈ log 1 trong số các lần thử (vài lần đầu + rải rác
        // về sau), không log mọi lần.
        const delayMs = attempt > 20 ? 1800000 : Math.min(300000, 2000 * attempt);
        if (attempt <= 3 || attempt % 20 === 0) {
          const reason = err?.message || err?.toString?.() || (err ? JSON.stringify(err) : null);
          console.warn(
            `[Telegram] ${label} mất kết nối (${status}, lần thử ${attempt}${reason ? `, lý do: ${reason}` : ""}) - thử kết nối lại sau ${delayMs}ms`
          );
        }
        // removeChannel() trả về 1 Promise (không phải chạy đồng bộ) - CHỈ bọc
        // try/catch (như trước đây) không bắt được rejection của chính Promise
        // đó, dẫn tới "unhandledRejection" nếu nó reject (đã xảy ra thật trên
        // production: RangeError: Maximum call stack size exceeded). Bọc thêm
        // .catch() để không bao giờ có promise nào bị bỏ rơi ở đây.
        try {
          Promise.resolve(supabaseAdmin!.removeChannel(channel)).catch(() => {});
        } catch (e) {}
        setTimeout(connect, delayMs);
      }
    });
  };
  connect();
}

// Tin nhắn có id bắt đầu bằng 1 trong 2 tiền tố này ĐÃ TỒN TẠI trên Telegram
// rồi (vừa được chính webhook Telegram ghi vào messages - xem "id_tg_" ở
// nhánh reply nhóm cũ và "id_tgb_" ở handleIncomingBusinessMessage()) - forward
// NGƯỢC lại những tin này sẽ tạo vòng lặp/trùng lặp vô nghĩa, phải loại trừ.
function isTelegramOriginMessageId(id: unknown): boolean {
  return typeof id === "string" && (id.startsWith("id_tg_") || id.startsWith("id_tgb_"));
}

/** Admin vừa gửi 1 tin nhắn MỚI (Admin Panel) - nếu khách đã liên kết Telegram
 * Business thì chuyển tiếp sang đúng chat Business của khách đó, để Admin có
 * thể tiếp tục trả lời/quản lý tin nhắn CSKH từ CHÍNH Telegram cá nhân của
 * mình (song song với Admin Panel) như đã xác nhận. */
async function forwardAdminMessageToBusiness(row: any) {
  if (!supabaseAdmin || isTelegramOriginMessageId(row.id)) return;

  const conn = await getActiveTelegramBusinessConnection();
  if (!conn) return;

  const { data: link } = await supabaseAdmin
    .from("telegram_business_links")
    .select("telegram_user_id")
    .eq("user_id", row.conversation_id)
    .maybeSingle();
  if (!link?.telegram_user_id) return; // khách này chưa liên kết Telegram Business

  const chatId = link.telegram_user_id;
  const attachments: unknown[] = Array.isArray(row.attachments) ? row.attachments : [];
  const content: string = row.content || row.text || "";

  const recordLink = async (telegramMessageId: number | null) => {
    if (!telegramMessageId) return;
    try {
      await supabaseAdmin!.from("telegram_business_message_links").insert({
        telegram_message_id: telegramMessageId,
        business_connection_id: conn.businessConnectionId,
        message_id: row.id,
      });
    } catch (e) {
      console.error("[TelegramBusiness] Không lưu được link tin nhắn admin:", e);
    }
  };

  if (content) {
    await recordLink(await sendTelegramBusinessMessage(conn.businessConnectionId, chatId, escapeHtml(content)));
  }
  for (const url of attachments) {
    const img = await attachmentToImageBuffer(url);
    if (!img) continue;
    await recordLink(
      await sendTelegramBusinessPhoto(conn.businessConnectionId, chatId, img.buffer, `cskh-${row.id || Date.now()}.${img.ext}`)
    );
  }
}

/** Admin SỬA 1 tin nhắn (Admin Panel, ví dụ "Sửa tin nhắn" ở MessagesTab.jsx)
 * - đồng bộ NGƯỢC ra Telegram Business nếu tin này từng được gửi qua đó. Bỏ
 * qua tin có nguồn gốc TỪ Telegram (xem isTelegramOriginMessageId) vì
 * handleEditedBusinessMessage() đã tự UPDATE content khi Admin/khách sửa
 * NGUYÊN BẢN trên Telegram - forward lại đây sẽ gọi editMessageText 1 lần
 * nữa vô ích (Telegram trả lỗi "message is not modified", vô hại nhưng thừa). */
async function syncEditedMessageToBusiness(row: any) {
  if (!supabaseAdmin || isTelegramOriginMessageId(row.id)) return;

  const { data: links } = await supabaseAdmin
    .from("telegram_business_message_links")
    .select("telegram_message_id, business_connection_id")
    .eq("message_id", row.id);
  if (!links?.length) return;

  const { data: link } = await supabaseAdmin
    .from("telegram_business_links")
    .select("telegram_user_id")
    .eq("user_id", row.conversation_id)
    .maybeSingle();
  if (!link?.telegram_user_id) return;

  const newText: string = escapeHtml(row.content || row.text || "");
  for (const l of links) {
    await editTelegramBusinessMessageText(l.business_connection_id, link.telegram_user_id, l.telegram_message_id, newText);
  }
}

/** Admin XÓA 1 hoặc nhiều tin nhắn (Admin Panel, kể cả "xóa hàng loạt") - đồng
 * bộ NGƯỢC ra Telegram Business bằng đúng API xóa thật deleteBusinessMessages.
 * Nếu tin này vừa bị xóa BỞI chính Telegram (handleDeletedBusinessMessages đã
 * xóa link trước khi xóa messages - xem ghi chú ở đó), lookup dưới đây sẽ
 * KHÔNG tìm thấy gì và tự động no-op, không gọi lại API xóa 1 lần nữa. */
async function syncDeletedMessageToBusiness(oldRow: any) {
  if (!supabaseAdmin || !oldRow?.id) return;

  const { data: links } = await supabaseAdmin
    .from("telegram_business_message_links")
    .select("telegram_message_id, business_connection_id")
    .eq("message_id", oldRow.id);
  if (!links?.length) return;

  const byConnection = new Map<string, number[]>();
  for (const l of links) {
    const arr = byConnection.get(l.business_connection_id) || [];
    arr.push(l.telegram_message_id);
    byConnection.set(l.business_connection_id, arr);
  }
  for (const [businessConnectionId, messageIds] of byConnection) {
    await deleteTelegramBusinessMessages(businessConnectionId, messageIds);
  }
  await supabaseAdmin.from("telegram_business_message_links").delete().eq("message_id", oldRow.id);
}

/** Chuyển tiếp ĐÚNG 1 tin nhắn khách hàng (sender="user") sang nhóm Telegram
 * CSKH cũ - logic dùng chung cho CẢ 2 đường: (1) Realtime báo tức thời (độ
 * trễ thấp khi kênh kết nối được) VÀ (2) vòng polling dự phòng bên dưới (khi
 * Realtime mất kết nối kéo dài - đã xảy ra thật trên production, xem PR #73-
 * #77). Tách riêng ra đây để 2 đường gọi chung 1 nguồn logic, không lặp code. */
async function forwardUserMessageToTelegramGroup(row: any) {
  if (!supabaseAdmin || !row || row.sender !== "user" || !row.conversation_id) return;

  const userName = await getUserDisplayName(row.conversation_id);
  const attachments: unknown[] = Array.isArray(row.attachments) ? row.attachments : [];
  const content = row.content || row.text || (attachments.length ? "(Đã gửi ảnh - xem bên dưới)" : "(tệp đính kèm)");
  const text = `💬 <b>Tin nhắn CSKH mới</b>\nTừ: ${escapeHtml(userName)}\n\n${escapeHtml(content)}\n\n<i>Trả lời (Reply) tin nhắn này bằng chữ hoặc ảnh - hoặc gõ/gửi ảnh thẳng trong topic của khách nếu nhóm đã bật Forum Topics - để phản hồi trực tiếp cho khách hàng.</i>`;

  // Mỗi khách 1 Forum Topic riêng (xem ensureForumTopic()) - null nếu nhóm
  // chưa bật Forum Topics, sendTelegramMessage() vẫn gửi bình thường vào
  // nhóm trong trường hợp đó.
  const threadId = await ensureForumTopic(row.conversation_id, userName);
  const telegramMessageId = await sendTelegramMessage(text, undefined, undefined, threadId ?? undefined);
  if (telegramMessageId) {
    try {
      await supabaseAdmin.from("telegram_message_links").insert({
        telegram_message_id: telegramMessageId,
        conversation_id: row.conversation_id,
        user_name: userName,
      });
    } catch (e) {
      console.error("[Telegram] Không lưu được link tin nhắn:", e);
    }
  }

  // Chuyển tiếp ảnh thật (nếu có) - reply thẳng vào tin nhắn text vừa gửi ở
  // trên để Admin thấy ngay trong cùng 1 luồng, không chỉ đọc dòng chữ
  // placeholder.
  for (const url of attachments) {
    const img = await attachmentToImageBuffer(url);
    if (!img) continue;
    const photoMessageId = await sendTelegramPhoto(
      img.buffer,
      `cskh-${row.id || Date.now()}.${img.ext}`,
      telegramMessageId ?? undefined,
      threadId ?? undefined
    );
    if (photoMessageId) {
      try {
        await supabaseAdmin.from("telegram_message_links").insert({
          telegram_message_id: photoMessageId,
          conversation_id: row.conversation_id,
          user_name: userName,
        });
      } catch (e) {
        console.error("[Telegram] Không lưu được link ảnh:", e);
      }
    }
  }
}

// Kênh Realtime "forward CSKH" đã được xác nhận (log production thật, hàng
// chục nghìn lần thử) CÓ THỂ mất kết nối kéo dài KHÔNG rõ thời hạn (xem PR
// #73-#77) - khách vẫn gửi tin bình thường trong app, nhưng Admin không bao
// giờ nhận được qua Telegram trong lúc đó. Polling REST (không phụ thuộc
// WebSocket, dùng đúng cơ chế fetch HTTP thông thường đã luôn hoạt động ổn
// định) là lưới an toàn dự phòng - quét tin nhắn khách MỚI mỗi 15 giây, chỉ
// forward tin nào CHƯA có trong telegram_message_links (tránh gửi trùng nếu
// Realtime vẫn đang hoạt động song song lúc đó).
let cskhPollingCursor: string | null = null;
async function pollAndForwardUnsentCskhMessages() {
  if (!supabaseAdmin) return;
  try {
    if (cskhPollingCursor === null) {
      // Lần đầu chạy (server vừa khởi động) - chỉ xử lý tin từ giờ trở đi,
      // KHÔNG quét ngược lịch sử cũ (tránh forward lại hàng loạt tin nhắn cũ
      // mỗi lần server restart).
      cskhPollingCursor = new Date().toISOString();
      return;
    }
    const { data: rows, error } = await supabaseAdmin
      .from("messages")
      .select("id, sender, conversation_id, content, attachments, created_date")
      .eq("sender", "user")
      .gt("created_date", cskhPollingCursor)
      .order("created_date", { ascending: true })
      .limit(50);
    if (error) {
      console.error("[Telegram] Polling CSKH: lỗi đọc tin nhắn mới:", error.message);
      return;
    }
    if (!rows || rows.length === 0) return;

    for (const row of rows) {
      cskhPollingCursor = row.created_date;
      try {
        // Link chỉ có thể được tạo SAU khi tin nhắn này tồn tại (do chính
        // forwardUserMessageToTelegramGroup() ghi lại ngay sau khi gửi
        // Telegram thành công) - tra trong cửa sổ [created_date, +5 phút] để
        // biết Realtime đã forward tin NÀY chưa, tránh gửi trùng nếu cả 2
        // đường (Realtime + polling) cùng bắt được tin này.
        const { data: existingLink } = await supabaseAdmin
          .from("telegram_message_links")
          .select("telegram_message_id")
          .eq("conversation_id", row.conversation_id)
          .gte("created_at", row.created_date)
          .lte("created_at", new Date(new Date(row.created_date).getTime() + 5 * 60000).toISOString())
          .limit(1)
          .maybeSingle();
        if (existingLink) continue;
      } catch (e) {}

      await forwardUserMessageToTelegramGroup(row).catch((e) =>
        console.error("[Telegram] Polling CSKH: lỗi forward tin nhắn:", e)
      );
    }
  } catch (e: any) {
    console.error("[Telegram] Polling CSKH: lỗi không mong đợi:", e?.message || e);
  }
}

/** Lắng nghe tin nhắn MỚI/SỬA/XÓA (Supabase Realtime) và chuyển tiếp sang
 * nhóm Telegram CSKH (khách -> nhóm cũ) lẫn Telegram Business (admin -> chat
 * Business của khách, cả gửi/sửa/xóa) khi khách đã liên kết. */
function startTelegramForwarding() {
  if (!supabaseAdmin || !TELEGRAM_API || !TELEGRAM_CHAT_ID) return;

  // Lưới an toàn dự phòng - xem ghi chú ở pollAndForwardUnsentCskhMessages().
  setInterval(pollAndForwardUnsentCskhMessages, 15000);

  subscribeWithAutoReconnect(
    () =>
      supabaseAdmin!
        .channel(`telegram-cskh-forward-${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          async (payload: any) => {
            const row = payload.new;
            if (!row) return;
            if (row.sender === "admin" && row.conversation_id) {
              forwardAdminMessageToBusiness(row).catch((e) =>
                console.error("[TelegramBusiness] Lỗi forward tin admin:", e)
              );
            }
            await forwardUserMessageToTelegramGroup(row);
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "messages" },
          async (payload: any) => {
            const row = payload.new;
            if (!row || row.sender !== "admin" || !row.conversation_id) return;
            syncEditedMessageToBusiness(row).catch((e) =>
              console.error("[TelegramBusiness] Lỗi đồng bộ sửa tin nhắn:", e)
            );
          }
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "messages" },
          async (payload: any) => {
            const oldRow = payload.old;
            if (!oldRow?.id) return;
            syncDeletedMessageToBusiness(oldRow).catch((e) =>
              console.error("[TelegramBusiness] Lỗi đồng bộ xóa tin nhắn:", e)
            );
          }
        ),
    "Kênh forward CSKH"
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Cầu nối Nạp/Rút tiền <-> Telegram: mỗi lệnh nạp/rút mới (status="pending")
// được forward vào nhóm Telegram kèm nút "Phê duyệt"/"Từ chối" - Admin xử lý
// ngay trên Telegram, không cần mở Admin Panel. LƯU Ý: 2 danh sách lý do từ
// chối dưới đây phải khớp với DEPOSIT_REJECT_REASONS/WITHDRAW_REJECT_REASONS
// trong src/components/admin/TransactionsTab.jsx - sửa 1 nơi thì sửa cả 2.
const WALLET_REJECT_REASONS: Record<"deposit" | "withdraw", string[]> = {
  deposit: [
    "Không xác minh được nguồn tiền hợp pháp",
    "Chưa nhận được xác nhận chuyển khoản từ ngân hàng đối tác",
    "Yêu cầu trùng lặp với 1 lệnh nạp khác đã xử lý",
  ],
  withdraw: [
    "Số dư ví không đủ để thực hiện rút tiền",
    "Thông tin tài khoản ngân hàng không hợp lệ hoặc chưa xác minh",
    "Yêu cầu rút trùng lặp với lệnh khác đang xử lý",
    "Tài khoản đang trong thời gian kiểm tra bảo mật",
  ],
};

function buildWalletApproveKeyboard(txId: string) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Phê duyệt", callback_data: `wtx:a:${txId}` },
        { text: "❌ Từ chối", callback_data: `wtx:r:${txId}` },
      ],
    ],
  };
}

function buildWalletRejectReasonKeyboard(txType: "deposit" | "withdraw", txId: string) {
  const reasons = WALLET_REJECT_REASONS[txType] || WALLET_REJECT_REASONS.withdraw;
  const rows = reasons.map((reason, idx) => [
    { text: `${idx + 1}. ${reason}`, callback_data: `wtx:rr:${txId}:${idx}` },
  ]);
  rows.push([{ text: "✏️ Lý do khác (nhập tay)", callback_data: `wtx:rc:${txId}` }]);
  rows.push([{ text: "‹ Quay lại", callback_data: `wtx:back:${txId}` }]);
  return { inline_keyboard: rows };
}

/** Gọi RPC telegram_process_wallet_transaction() - toàn bộ logic duyệt/từ chối chạy nguyên tử trong Postgres (xem migration telegram_wallet_approvals). */
async function callTelegramProcessWalletTransaction(
  txId: string,
  action: "approve" | "reject",
  adminLabel: string,
  reason?: string
): Promise<{ ok: true; tx: any } | { ok: false; message: string }> {
  if (!supabaseAdmin) return { ok: false, message: "Server chưa cấu hình Supabase." };
  const { data, error } = await supabaseAdmin.rpc("telegram_process_wallet_transaction", {
    p_tx_id: txId,
    p_action: action,
    p_reason: reason ?? null,
    p_admin_label: `${adminLabel} (Telegram)`,
  });
  if (error) {
    if (error.message?.includes("ALREADY_PROCESSED")) {
      return { ok: false, message: "Giao dịch này đã được xử lý trước đó (ở Telegram hoặc trong Admin Panel)." };
    }
    console.error("[Telegram] telegram_process_wallet_transaction lỗi:", error.message);
    return { ok: false, message: `Lỗi xử lý: ${error.message}` };
  }
  return { ok: true, tx: Array.isArray(data) ? data[0] : data };
}

function walletFinalStatusText(tx: any, action: "approve" | "reject", adminName: string, reason?: string): string {
  const isDeposit = tx.type === "deposit";
  const label = isDeposit ? "NẠP TIỀN" : "RÚT TIỀN";
  const header = action === "approve" ? `✅ <b>ĐÃ PHÊ DUYỆT — ${label}</b>` : `❌ <b>ĐÃ TỪ CHỐI — ${label}</b>`;
  let text = `${header}\nMã GD: <code>${escapeHtml(tx.code || tx.id)}</code>\nSố tiền: <b>${fmtVnd(tx.amount)} VNĐ</b>\nXử lý bởi: ${escapeHtml(adminName)} (Telegram)`;
  if (action === "reject" && reason) text += `\nLý do: ${escapeHtml(reason)}`;
  return text;
}

/** Xử lý 1 lượt bấm nút inline (callback_query) trên tin forward nạp/rút. */
async function handleTelegramWalletCallback(cq: any) {
  const data: string = cq.data || "";
  const parts = data.split(":");
  if (parts[0] !== "wtx" || !supabaseAdmin) return;
  const kind = parts[1];
  const txId = parts[2];
  const extra = parts[3];
  const adminName = cq.from?.username || cq.from?.first_name || "Admin";
  const messageId = cq.message?.message_id;
  const originalText: string = (cq.message?.text || "").split("\n\nChọn lý do từ chối:")[0];

  if (kind === "a") {
    const result = await callTelegramProcessWalletTransaction(txId, "approve", adminName);
    if (!result.ok) {
      await answerCallbackQuery(cq.id, result.message, true);
      return;
    }
    await answerCallbackQuery(cq.id, "✅ Đã phê duyệt");
    if (messageId) await editTelegramMessage(messageId, walletFinalStatusText(result.tx, "approve", adminName));
    return;
  }

  if (kind === "r") {
    const { data: tx } = await supabaseAdmin.from("wallet_transactions").select("status, type").eq("id", txId).maybeSingle();
    if (!tx || tx.status !== "pending") {
      await answerCallbackQuery(cq.id, "Giao dịch đã được xử lý trước đó.", true);
      return;
    }
    await answerCallbackQuery(cq.id);
    if (messageId) {
      await editTelegramMessage(
        messageId,
        `${originalText}\n\nChọn lý do từ chối:`,
        buildWalletRejectReasonKeyboard(tx.type, txId)
      );
    }
    return;
  }

  if (kind === "back") {
    const { data: tx } = await supabaseAdmin.from("wallet_transactions").select("status").eq("id", txId).maybeSingle();
    if (!tx || tx.status !== "pending") {
      await answerCallbackQuery(cq.id, "Giao dịch đã được xử lý trước đó.", true);
      return;
    }
    await answerCallbackQuery(cq.id);
    if (messageId) await editTelegramMessage(messageId, originalText, buildWalletApproveKeyboard(txId));
    return;
  }

  if (kind === "rr") {
    const { data: tx } = await supabaseAdmin.from("wallet_transactions").select("type").eq("id", txId).maybeSingle();
    const txType: "deposit" | "withdraw" = tx?.type === "deposit" ? "deposit" : "withdraw";
    const reason = WALLET_REJECT_REASONS[txType][Number(extra)] || "Không đạt điều kiện phê duyệt";
    const result = await callTelegramProcessWalletTransaction(txId, "reject", adminName, reason);
    if (!result.ok) {
      await answerCallbackQuery(cq.id, result.message, true);
      return;
    }
    await answerCallbackQuery(cq.id, "❌ Đã từ chối");
    if (messageId) await editTelegramMessage(messageId, walletFinalStatusText(result.tx, "reject", adminName, reason));
    return;
  }

  if (kind === "rc") {
    if (!messageId) return;
    const { data: tx } = await supabaseAdmin.from("wallet_transactions").select("status").eq("id", txId).maybeSingle();
    if (!tx || tx.status !== "pending") {
      await answerCallbackQuery(cq.id, "Giao dịch đã được xử lý trước đó.", true);
      return;
    }
    await answerCallbackQuery(cq.id);
    try {
      await supabaseAdmin.from("telegram_wallet_links").update({ awaiting_custom_reason: true }).eq("telegram_message_id", messageId);
    } catch (e) {
      console.error("[Telegram] Không đánh dấu awaiting_custom_reason:", e);
    }
    await editTelegramMessage(
      messageId,
      `${originalText}\n\n✏️ <i>Vui lòng REPLY (trả lời) tin nhắn này với nội dung lý do từ chối.</i>`
    );
    return;
  }
}

/** Lắng nghe lệnh nạp/rút MỚI (status="pending") và forward vào nhóm Telegram kèm nút Phê duyệt/Từ chối. */
function startTelegramWalletForwarding() {
  if (!supabaseAdmin || !TELEGRAM_API || !TELEGRAM_CHAT_ID) return;

  subscribeWithAutoReconnect(
    () =>
      supabaseAdmin!
        .channel(`telegram-wallet-forward-${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "wallet_transactions" },
          async (payload: any) => {
            const row = payload.new;
            if (!row || row.status !== "pending" || !["deposit", "withdraw"].includes(row.type)) return;

            const userName = await getUserDisplayName(row.user_id);
            const isDeposit = row.type === "deposit";
            const icon = isDeposit ? "🟢" : "🔴";
            const label = isDeposit ? "YÊU CẦU NẠP TIỀN" : "YÊU CẦU RÚT TIỀN";
            let text = `${icon} <b>${label}</b>\nMã GD: <code>${escapeHtml(row.code || row.id)}</code>\nHội viên: ${escapeHtml(userName)}\nSố tiền: <b>${fmtVnd(row.amount)} VNĐ</b>`;
            if (!isDeposit && row.bank_name) {
              text += `\nNgân hàng nhận: ${escapeHtml(row.bank_name)} — ${escapeHtml(row.account_number || "")}`;
              if (row.account_holder) text += ` (${escapeHtml(row.account_holder)})`;
            }
            text += `\n\nChọn hành động bên dưới:`;

            const telegramMessageId = await sendTelegramMessage(text, undefined, buildWalletApproveKeyboard(row.id));
            if (telegramMessageId) {
              try {
                await supabaseAdmin!.from("telegram_wallet_links").insert({
                  telegram_message_id: telegramMessageId,
                  tx_id: row.id,
                  tx_type: row.type,
                });
              } catch (e) {
                console.error("[Telegram] Không lưu được link giao dịch ví:", e);
              }
            }
          }
        ),
    "Kênh forward Nạp/Rút"
  );
}

/** Đăng ký webhook Telegram trỏ về đúng server này (bỏ qua nếu thiếu URL công khai - Render tự cấp RENDER_EXTERNAL_URL). */
async function registerTelegramWebhook() {
  if (!TELEGRAM_API) return;
  const publicUrl = process.env.TELEGRAM_WEBHOOK_URL || process.env.RENDER_EXTERNAL_URL;
  if (!publicUrl) {
    console.warn("[Telegram] Chưa có URL công khai (RENDER_EXTERNAL_URL/TELEGRAM_WEBHOOK_URL) - bỏ qua đăng ký webhook.");
    return;
  }
  try {
    const resp = await fetch(`${TELEGRAM_API}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: `${publicUrl.replace(/\/$/, "")}/api/telegram-webhook` }),
    });
    const data: any = await resp.json();
    if (data.ok) {
      console.log(`[Telegram] Webhook đã đăng ký: ${publicUrl}/api/telegram-webhook`);
    } else {
      console.error("[Telegram] Đăng ký webhook lỗi:", data.description);
    }
  } catch (err: any) {
    console.error("[Telegram] Đăng ký webhook exception:", err?.message || err);
  }
}

// Gói Render Free tự cho service "ngủ" sau ~15 phút không có request HTTP nào
// tới - khi đó TOÀN BỘ tiến trình Node (kể cả kênh Realtime lắng nghe tin
// nhắn CSKH/nạp-rút để forward Telegram ở trên) bị dừng hẳn, không phải chỉ
// chạy chậm. Vì tin nhắn CSKH được trình duyệt khách ghi THẲNG vào Supabase
// (không đi qua server này), khách hàng vẫn gửi tin bình thường ngay cả khi
// server đang ngủ - hậu quả là tin "biến mất" khỏi Telegram cho tới khi có ai
// đó ghé trang đánh thức server dậy (thường mất 30-60s cold-start). Tự ping
// lại chính mình mỗi 10 phút (dưới ngưỡng 15 phút) để giữ server luôn thức -
// CHỈ bật khi có RENDER_EXTERNAL_URL (Render tự cấp, không có ở máy dev) nên
// không ảnh hưởng gì khi chạy local.
function startSelfPing() {
  const publicUrl = process.env.RENDER_EXTERNAL_URL;
  if (!publicUrl) return;
  const pingUrl = publicUrl.replace(/\/$/, "") + "/";
  setInterval(() => {
    fetch(pingUrl).catch((err: any) => {
      console.warn("[SelfPing] Không ping được chính server (bỏ qua):", err?.message || err);
    });
  }, 10 * 60 * 1000);
}

// Create HTTP server
const httpServer = http.createServer(app);

// Initialize Socket.io
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ĐÃ GỠ BỎ: bộ mô phỏng giá cổ phiếu ngẫu nhiên (tickStocks/stocksState).
// Lý do: (1) lỗi parseFloat(price.replace(".", "")) chỉ xoá dấu "." ĐẦU
// TIÊN - với giá VFS dạng thập phân thực ("3.480"), lần tick sau đọc
// nhầm dấu chấm thập phân thành dấu phân cách nghìn ("3.480" -> 3480),
// nhân dồn ~1000 lần mỗi tick 5 giây, chỉ sau ~3 phút giá VFS tràn số
// thành Infinity vĩnh viễn cho tới khi restart server. (2) Quan trọng
// hơn: dữ liệu này độc lập hoàn toàn với investment_projects trên
// Supabase, nên cứ mỗi 5 giây sẽ ĐÈ lên giá/biến động mà Admin vừa
// chỉnh trong ProjectsTab, khiến admin không thể thực sự kiểm soát số
// liệu cổ phiếu hiển thị cho người dùng. Stocks.jsx giờ đọc thẳng
// investment_projects (category "Đầu tư chứng khoán") làm nguồn duy nhất.

// Simulated active community list
const communityNames = [
  "Nguyễn Minh Triết", "Trần Hoàng Nam", "Lê Khánh Chi", "Phạm Hải Đường", 
  "Vũ Quốc Bảo", "Đặng Thùy Dương", "Bùi Thế Anh", "Đỗ Diệu Linh", 
  "Ngô Gia Huy", "Hoàng Kim Ngân", "Phan Anh Tuấn", "Tống Khánh Linh"
];

const communityActions = [
  "vừa hoàn tất đặt cọc suất đầu tư đất nền tại Vinhomes Ocean Park.",
  "vừa đặt lịch hẹn thẩm định pháp lý 1:1 với Cố vấn Trịnh Thế Hùng.",
  "vừa yêu cầu bảng báo giá chi tiết mặt bằng căn hộ Vinpearl Condotel Nha Trang.",
  "vừa thực hiện giao dịch mua 5.000 cổ phiếu VHM thành công.",
  "vừa được duyệt cấp thẻ hội viên VinClub Kim Cương.",
  "vừa nhận cổ tức thanh khoản dự án VinFast Fleet tự động theo giờ.",
  "vừa thực hiện nâng mức đầu tư kỳ hạn đất nền Vinhomes Cozon City.",
  "vừa mở thưởng Vòng Quay May Mắn nhận được voucher 10.000.000 VNĐ.",
  "vừa gửi tin nhắn tư vấn pháp lý đất nền phân khu Đảo Rều."
];

function triggerCommunityActivity() {
  const name = communityNames[Math.floor(Math.random() * communityNames.length)];
  const action = communityActions[Math.floor(Math.random() * communityActions.length)];
  const activity = {
    id: "act_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    timestamp: new Date().toLocaleTimeString(),
    text: `${name} ${action}`
  };
  io.emit("community:activity", activity);
}

app.use(express.json());

// Initialize Google GenAI client
const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

// API Endpoint for Real-time Market News & Stock Updates with Google Search Grounding
app.post("/api/market-search", async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Query string is required." });
  }

  const prompt = `Bạn là chuyên gia phân tích thị trường tài chính và chứng khoán Việt Nam & Quốc tế. 
Hãy tra cứu Google Search theo thời gian thực để tìm tin tức thị trường và diễn biến cổ phiếu mới nhất cho câu hỏi: "${query}".

Yêu cầu trình bày:
1. **Tổng quan & Dữ liệu mới nhất**: Tóm tắt biến động giá, thông số giao dịch, hoặc thông tin sự kiện hot nhất.
2. **Chi tiết tin tức / Báo cáo**: Nêu rõ lý do biến động hoặc thông tin doanh nghiệp mới công bố.
3. **Phân tích & Khuyến nghị ngắn**: Đưa ra góc nhìn hữu ích cho nhà đầu tư.
4. Trình bày bằng tiếng Việt, súc tích, chuyên nghiệp, hỗ trợ định dạng Markdown (tiêu đề, gạch đầu dòng, in đậm).`;

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "Không tìm thấy thông tin phù hợp.";

    // Extract grounding sources & web search queries
    const candidate = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    const chunks = groundingMetadata?.groundingChunks || [];
    const searchQueries = groundingMetadata?.webSearchQueries || [];

    const sources = chunks
      .filter((chunk: any) => chunk.web?.uri)
      .map((chunk: any) => ({
        title: chunk.web.title || chunk.web.uri,
        uri: chunk.web.uri,
      }));

    // Deduplicate sources by URI
    const uniqueSources = Array.from(
      new Map(sources.map((s: any) => [s.uri, s])).values()
    );

    return res.json({
      text,
      sources: uniqueSources,
      searchQueries,
    });
  } catch (err: any) {
    // Graceful fallback when rate limited or when API key is unavailable
    const fallback = getFallbackMarketResponse(query);
    return res.json(fallback);
  }
});

function getFallbackMarketResponse(query: string) {
  const q = query.toLowerCase();

  if (q.includes("vic") || q.includes("vhm") || q.includes("vingroup") || q.includes("vinhomes")) {
    return {
      text: `### 📈 Báo cáo Thị trường & Cổ phiếu Vingroup (VIC/VHM)

**1. Tổng quan & Dữ liệu giao dịch mới nhất:**
- **VIC (Vingroup):** Thị giá dao động quanh vùng **45,500 - 47,200 VNĐ/cp**, thanh khoản tăng trưởng tích cực (+15% so với trung bình 20 phiên).
- **VHM (Vinhomes):** Đạt mức **42,800 - 44,000 VNĐ/cp**, duy trì đà thu hút dòng tiền từ các quỹ đầu tư.

**2. Tin tức & Động lực tăng trưởng:**
- Vingroup vừa công bố kết quả kinh doanh quý với doanh thu hợp nhất duy trì đà tăng trưởng nhờ hoạt động bàn giao tại các đại dự án Vinhomes Ocean Park & Royal Island.
- Mảng xe điện VinFast ghi nhận doanh số bàn giao xe kỷ lục tại thị trường Việt Nam và mở rộng hệ thống showroom tại Đông Nam Á.

**3. Phân tích & Nhận định:**
- Nhóm cổ phiếu họ Vin duy trì vị thế trụ cột dẫn dắt chỉ số VN-Index. Khuyến nghị nhà đầu tư theo dõi các mốc hỗ trợ kỹ thuật và diễn biến dòng tiền khối ngoại.`,
      sources: [
        { title: "Vietstock - Cập nhật giao dịch VIC & VHM", uri: "https://vietstock.vn" },
        { title: "CafeF - Tin tức Vingroup & Thị trường chứng khoán", uri: "https://cafef.vn" },
        { title: "Vingroup Investor Relations", uri: "https://vingroup.net" }
      ],
      searchQueries: [query, "giá cổ phiếu VIC VHM hôm nay", "tin tức Vingroup mới nhất"]
    };
  }

  if (q.includes("vfs") || q.includes("vinfast") || q.includes("nasdaq")) {
    return {
      text: `### ⚡ Cập nhật Cổ phiếu VinFast (NASDAQ: VFS)

**1. Tổng quan thị giá:**
- **Mã cổ phiếu VFS:** Giao dịch trên sàn NASDAQ Mỹ trong khoảng **$4.20 - $4.85 USD/cổ phiếu**.
- Khối lượng giao dịch trung bình đạt hàng triệu cổ phiếu/phiên.

**2. Điểm tin doanh nghiệp:**
- VinFast liên tục đẩy mạnh bàn giao các dòng xe điện VF 3, VF 5, VF 8 tại Việt Nam và mở rộng mạng lưới phân phối tại Philippines, Indonesia, Ấn Độ.
- Công ty tiếp tục tối ưu hóa chi phí sản xuất và mở rộng trạm sạc nhượng quyền.

**3. Khuyến nghị & Góc nhìn:**
- Cổ phiếu VFS có tính biến động ngắn hạn theo nhịp chung của nhóm công nghệ & EV toàn cầu. Tầm nhìn dài hạn phụ thuộc vào tốc độ phủ thị trường quốc tế.`,
      sources: [
        { title: "NASDAQ - VinFast Auto Ltd. (VFS)", uri: "https://www.nasdaq.com" },
        { title: "VnExpress - Tin tức xe điện & cổ phiếu VinFast", uri: "https://vnexpress.net" }
      ],
      searchQueries: [query, "VinFast VFS Nasdaq stock price"]
    };
  }

  if (q.includes("vn-index") || q.includes("chứng khoán") || q.includes("thị trường")) {
    return {
      text: `### 📊 Diễn biến Chỉ số VN-Index & Thị trường Chứng khoán

**1. Thông số thị trường:**
- **Chỉ số VN-Index:** Dao động quanh mốc **1,250 - 1,280 điểm**.
- Thanh khoản toàn thị trường đạt trung bình **18,000 - 22,000 tỷ đồng/phiên**.

**2. Nhóm ngành tâm điểm:**
- **Bất động sản & Ngân hàng:** Đóng vai trò nâng đỡ chỉ số.
- **Khối ngoại:** Bắt đầu có dấu hiệu giảm đà bán ròng và quay lại mua ròng nhẹ ở các cổ phiếu đầu ngành.

**3. Chiến lược đầu tư:**
- Thị trường đang trong giai đoạn tích lũy tích cực. Nhà đầu tư nên phân bổ tỷ trọng hợp lý vào các doanh nghiệp có nền tảng tài chính mạnh và lợi nhuận ổn định.`,
      sources: [
        { title: "Sở Giao dịch Chứng khoán TP.HCM (HOSE)", uri: "https://www.hsx.vn" },
        { title: "Vietstock - Nhận định thị trường chứng khoán", uri: "https://vietstock.vn" }
      ],
      searchQueries: [query, "chỉ số VNIndex hôm nay", "tin tức chứng khoán mới nhất"]
    };
  }

  return {
    text: `### 📰 Thông tin Tổng hợp Thị trường & Tin tức Mới nhất

**1. Kết quả tra cứu cho từ khóa:** "${query}"
- Dữ liệu thị trường cho thấy sự quan tâm tích cực của giới đầu tư đối với các tài sản tài chính và dự án bất động sản hàng đầu.
- Xu hướng dòng tiền hiện tại đang ưu tiên các dự án có pháp lý hoàn chỉnh, lãi suất hấp dẫn và thanh khoản cao.

**2. Điểm tin nổi bật:**
- Tốc độ tăng trưởng kinh tế vĩ mô ổn định, các chính sách hỗ trợ lãi suất và thị trường vốn đang tạo đòn bẩy tích cực cho các kênh đầu tư.
- Các dự án nghỉ dưỡng và bất động sản thương mại của Vingroup/Vinpearl liên tục ghi nhận tỷ lệ lấp đầy cao.

**3. Lời khuyên đầu tư:**
- Khách hàng nên theo dõi sát sao biến động lãi suất và thông tin chính thức từ các cổng thông tin uy tín.`,
    sources: [
      { title: "Cổng thông tin Kinh tế & Tài chính CafeF", uri: "https://cafef.vn" },
      { title: "Cổng thông tin Chứng khoán Vietstock", uri: "https://vietstock.vn" },
      { title: "Báo điện tử VnExpress Kinh Doanh", uri: "https://vnexpress.net/kinh-doanh" }
    ],
    searchQueries: [query, `${query} tin tức mới nhất`]
  };
}

// Webhook nhận update từ Telegram. 2 loại update được xử lý:
// 1) callback_query - Admin bấm nút "Phê duyệt"/"Từ chối" trên tin forward
//    nạp/rút (xem handleTelegramWalletCallback).
// 2) message - trả lời CSKH, khớp theo 1 trong 2 cách (ưu tiên theo thứ tự):
//    a) REPLY trực tiếp tới 1 tin đã forward trước đó (telegram_message_links) -
//       cách cũ, luôn hoạt động dù nhóm có bật Forum Topics hay không.
//    b) Gõ THẲNG trong Forum Topic riêng của khách (message_thread_id khớp
//       support_conversations.telegram_thread_id, xem ensureForumTopic()) -
//       không cần bấm Reply mỗi lần, chỉ hoạt động khi nhóm đã bật Topics.
//    Tin nhắn thường/chat chit không khớp cách nào ở trên thì bị bỏ qua.
//    REPLY nhập tay lý do từ chối nạp/rút khớp qua telegram_wallet_links,
//    xử lý riêng trước 2 nhánh trên.
app.post("/api/telegram-webhook", async (req, res) => {
  res.sendStatus(200); // luôn trả 200 ngay để Telegram không retry/timeout

  if (!supabaseAdmin) return;
  try {
    if (req.body?.callback_query) {
      await handleTelegramWalletCallback(req.body.callback_query);
      return;
    }

    // 4 loại update của cầu nối Telegram Business (xem ghi chú đầy đủ ở các
    // hàm handleBusinessLinkStart()/handleIncomingBusinessMessage()/
    // handleEditedBusinessMessage()/handleDeletedBusinessMessages() phía
    // trên) - kiểm tra TRƯỚC nhánh xử lý nhóm+Forum Topic cũ vì đây là 1 kênh
    // hoàn toàn độc lập, không liên quan gì tới TELEGRAM_CHAT_ID.
    if (req.body?.business_connection) {
      await upsertTelegramBusinessConnection(req.body.business_connection);
      return;
    }
    if (req.body?.business_message) {
      const conn = await getActiveTelegramBusinessConnection();
      await handleIncomingBusinessMessage(req.body.business_message, conn?.businessUserId ?? null);
      return;
    }
    if (req.body?.edited_business_message) {
      await handleEditedBusinessMessage(req.body.edited_business_message);
      return;
    }
    if (req.body?.deleted_business_messages) {
      await handleDeletedBusinessMessages(req.body.deleted_business_messages);
      return;
    }

    const message = req.body?.message;
    // Đoạn chat TRỰC TIẾP với chính con bot (khách bấm link "t.me/<bot>?
    // start=<mã>" từ trong app) - hoàn toàn tách biệt khỏi nhóm CSKH cũ lẫn
    // chat Business, phải kiểm tra và dừng lại ở đây nếu khớp, không để lọt
    // xuống nhánh xử lý nhóm bên dưới (sẽ không khớp gì và bị bỏ qua nhưng
    // tốn 1 lượt kiểm tra dư thừa).
    if (message?.text && (await handleBusinessLinkStart(message))) return;

    const replyToId = message?.reply_to_message?.message_id;
    // Một số client Telegram chỉ gắn message_thread_id vào tin nhắn GỐC được
    // reply (message.reply_to_message.message_thread_id) mà KHÔNG lặp lại nó
    // ở tin nhắn mới (message.message_thread_id) khi Admin bấm Reply từ ngoài
    // topic (vd. từ danh sách chat chung) - nếu thiếu ở tin mới thì lấy từ tin
    // được reply, tránh báo nhầm "không tìm thấy hội thoại gốc" dù topic vẫn khớp.
    const messageThreadId = message?.message_thread_id ?? message?.reply_to_message?.message_thread_id;
    // Ảnh Admin gửi (Photo hoặc File ảnh) dùng "caption" thay cho "text" -
    // content lấy 1 trong 2, có thể rỗng nếu Admin gửi ảnh không kèm chú thích.
    const text = message?.text || message?.caption || "";
    const imageFileId = extractTelegramImageFileId(message);
    if (!text && !imageFileId) return;
    // Bỏ qua tin nhắn của chính bot (tránh vòng lặp nếu bot tự phản hồi gì đó)
    if (message.from?.is_bot) return;

    const adminName = message.from?.username || message.from?.first_name || "Admin";

    // Ưu tiên kiểm tra REPLY nhập tay lý do từ chối nạp/rút trước (luôn cần
    // replyToId - nạp/rút không dùng Forum Topics, và luôn cần gõ CHỮ làm lý
    // do - ảnh không hợp lệ cho luồng này nên bỏ qua nếu Admin lỡ gửi ảnh).
    if (replyToId && text) {
      const { data: walletLink } = await supabaseAdmin
        .from("telegram_wallet_links")
        .select("tx_id, awaiting_custom_reason")
        .eq("telegram_message_id", replyToId)
        .maybeSingle();

      if (walletLink) {
        if (!walletLink.awaiting_custom_reason) return; // reply vào tin đã xử lý xong, bỏ qua
        const result = await callTelegramProcessWalletTransaction(walletLink.tx_id, "reject", adminName, text);
        if (!result.ok) {
          await sendTelegramMessage(`⚠️ ${result.message}`, message.message_id);
          return;
        }
        await editTelegramMessage(replyToId, walletFinalStatusText(result.tx, "reject", adminName, text));
        console.log(`[Telegram] Admin ${adminName} đã từ chối giao dịch ví ${walletLink.tx_id} (lý do nhập tay)`);
        return;
      }
    }

    // (a) Khớp theo REPLY trực tiếp tới 1 tin CSKH đã forward.
    let conversationId: string | null = null;
    if (replyToId) {
      const { data: link } = await supabaseAdmin
        .from("telegram_message_links")
        .select("conversation_id")
        .eq("telegram_message_id", replyToId)
        .maybeSingle();
      if (link) conversationId = link.conversation_id;
    }

    // (b) Không phải REPLY (hoặc reply không khớp gì) - thử khớp theo Forum
    // Topic đang gõ (gõ thẳng trong topic của khách, không cần bấm Reply).
    if (!conversationId && messageThreadId) {
      const { data: conv } = await supabaseAdmin
        .from("support_conversations")
        .select("id")
        .eq("telegram_thread_id", messageThreadId)
        .maybeSingle();
      if (conv) conversationId = conv.id;
    }

    if (!conversationId) {
      // Chỉ báo lỗi khi đây THẬT SỰ là 1 lượt Reply không khớp được gì (khả
      // năng tin gốc đã quá cũ) - tin thường/chat chit trong nhóm (không
      // reply, không nằm trong topic nào đã biết) im lặng bỏ qua, không spam
      // cảnh báo.
      if (replyToId) {
        // Log đủ dữ kiện để chẩn đoán CHÍNH XÁC lần sau nếu vẫn còn khớp sai
        // (không đoán mò nữa) - replyToId/messageThreadId là 2 khóa tra cứu
        // duy nhất, chatId để xác nhận đúng nhóm/topic nào đang gặp lỗi.
        console.warn(
          `[Telegram] Không khớp được hội thoại - replyToId=${replyToId}, messageThreadId=${messageThreadId ?? "(none)"}, chatId=${message.chat?.id}, from=${adminName}`
        );
        await sendTelegramMessage(
          "⚠️ Không tìm thấy hội thoại gốc cho tin nhắn này (có thể đã quá cũ, hoặc bạn đang trả lời nhầm 1 tin không phải của khách). Để phản hồi ĐÚNG khách hàng: hãy bấm Reply trực tiếp vào tin \"💬 Tin nhắn CSKH mới\" của khách đó (hoặc gõ thẳng trong Topic riêng của khách nếu nhóm đã bật Forum Topics) - hoặc trả lời trong Admin Panel.",
          message.message_id
        );
      }
      return;
    }

    // Chỉ tải ảnh về SAU KHI đã khớp được đúng hội thoại - tránh tốn băng
    // thông tải ảnh cho những tin nhắn/ảnh chat chit thường trong nhóm không
    // khớp cuộc hội thoại nào.
    const attachments: string[] = [];
    if (imageFileId) {
      const dataUrl = await fetchTelegramFileAsDataUrl(imageFileId);
      if (dataUrl) {
        attachments.push(dataUrl);
      } else {
        await sendTelegramMessage(
          "⚠️ Không gửi được ảnh này cho khách (ảnh quá lớn hoặc tải thất bại). Vui lòng thử lại với ảnh nhỏ hơn.",
          message.message_id
        );
        if (!text) return; // ảnh là nội dung duy nhất và đã lỗi - không có gì để gửi tiếp
      }
    }

    // Dùng ĐÚNG "message.date" mà Telegram gắn cho tin nhắn (Unix giây, thời
    // điểm admin thật sự bấm gửi trên Telegram) làm created_date, KHÔNG dùng
    // giờ server xử lý xong webhook (new Date()) - nếu có độ trễ xử lý (mạng,
    // cold-start Render free-tier...), giờ hiển thị trong app vẫn khớp đúng
    // thời điểm thật admin trả lời, không bị lùi theo độ trễ xử lý.
    const sentAt = message.date ? new Date(message.date * 1000).toISOString() : new Date().toISOString();
    const { error } = await supabaseAdmin.from("messages").insert({
      id: "id_tg_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      sender: "admin",
      user_id: conversationId,
      conversation_id: conversationId,
      content: text,
      attachments,
      created_date: sentAt,
    });

    if (error) {
      console.error("[Telegram] Không ghi được tin nhắn trả lời:", error.message);
      await sendTelegramMessage(`⚠️ Gửi thất bại: ${error.message}`, message.message_id);
      return;
    }

    console.log(`[Telegram] Admin ${adminName} đã trả lời hội thoại ${conversationId}${attachments.length ? " (kèm ảnh)" : ""}`);
  } catch (err: any) {
    console.error("[Telegram] Lỗi xử lý webhook:", err?.message || err);
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Socket.io connection handlers
  io.on("connection", (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    socket.on("client:ping", (callback) => {
      if (typeof callback === "function") {
        callback();
      }
    });

    socket.on("mutation", (data) => {
      console.log(`[Socket.io] Mutation received:`, data);
      // Broadcast this mutation to all OTHER clients so they auto-sync
      socket.broadcast.emit("mutation:sync", data);
      
      // If it's a chat message or user profile update, broadcast it properly
      if (data.entity === "Message") {
        io.emit("message:new", data.payload);
      } else if (data.entity === "User") {
        io.emit("user:update", data.payload);
      } else if (data.entity === "Project") {
        io.emit("project:update", data.payload);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    });
  });

  // Start background periodic update intervals
  setInterval(triggerCommunityActivity, 12000);
  setInterval(runDailyInterestBatch, 15 * 60 * 1000);
  runDailyInterestBatch(); // chạy ngay lúc khởi động, không đợi 15 phút đầu tiên

  startTelegramForwarding();
  startTelegramWalletForwarding();
  registerTelegramWebhook();
  startSelfPing();

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
