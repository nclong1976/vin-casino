import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Chiều "trong app -> Telegram" của cầu nối CSKH (nhóm CSKH + Telegram
// Business) - trước đây chạy như 1 kênh Supabase Realtime lắng nghe liên tục
// trong server.ts (phụ thuộc Render còn thức hay không). Giờ được gọi bởi 1
// Database Webhook (trigger notify_telegram_cskh_outbound trên bảng
// messages, xem migration 20260914140000_telegram_cskh_database_webhook.sql)
// mỗi khi có INSERT/UPDATE/DELETE - hạ tầng Supabase tự đảm bảo gọi được,
// không cần 1 tiến trình Node nào đang lắng nghe.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SECRET_KEYS_RAW = Deno.env.get("SUPABASE_SECRET_KEYS");
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required");
if (!SUPABASE_SECRET_KEYS_RAW) throw new Error("SUPABASE_SECRET_KEYS is required");

const secretKeys = JSON.parse(SUPABASE_SECRET_KEYS_RAW) as Record<string, string>;
const secretKey = Object.values(secretKeys)[0];
if (!secretKey) throw new Error("At least one Supabase secret key is required");

const admin = createClient(SUPABASE_URL, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TELEGRAM_API = TELEGRAM_BOT_TOKEN ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}` : null;
// Trần thời gian chờ MỖI lần gọi API Telegram - thấp hơn timeout_milliseconds
// (10s) mà trigger notify_telegram_cskh_outbound() đặt cho net.http_post(),
// để hàm này luôn kịp trả lỗi rõ ràng trước khi phía gọi (pg_net) tự bỏ
// cuộc/phát lại request - 1 lượt gọi Telegram bị treo vô thời hạn (mạng
// chậm, Telegram phản hồi chậm) từng góp phần gây timeout 504 ở tầng
// gateway, kéo theo webhook bị gọi lại nhiều lần cho cùng 1 tin nhắn.
const TELEGRAM_FETCH_TIMEOUT_MS = 8000;
// Telegram giới hạn ảnh gửi qua sendPhoto tối đa ~10MB - giữ mốc thấp hơn
// (8MB) cùng ngưỡng đã dùng trước đây ở server.ts, an toàn cho cả ảnh lẫn
// tránh phình quá cỡ 1 dòng Postgres nếu forward ngược base64.
const TELEGRAM_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
// Telegram giới hạn tên Forum Topic tối đa 128 ký tự.
const TELEGRAM_TOPIC_NAME_MAX = 128;

function escapeHtml(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Tin nhắn có id bắt đầu bằng 1 trong 2 tiền tố này ĐÃ TỒN TẠI trên Telegram
// rồi (vừa được chính telegram-webhook ghi vào messages) - forward NGƯỢC lại
// những tin này sẽ tạo vòng lặp/trùng lặp vô nghĩa, phải loại trừ.
function isTelegramOriginMessageId(id: unknown): boolean {
  return typeof id === "string" && (id.startsWith("id_tg_") || id.startsWith("id_tgb_"));
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sendTelegramMessage(
  text: string,
  replyToMessageId?: number,
  messageThreadId?: number,
  chatId: string | undefined = TELEGRAM_CHAT_ID
): Promise<number | null> {
  if (!TELEGRAM_API || !chatId) return null;
  try {
    const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "HTML" };
    if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
    if (messageThreadId) body.message_thread_id = messageThreadId;
    const resp = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TELEGRAM_FETCH_TIMEOUT_MS),
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

async function sendTelegramPhoto(
  buffer: Uint8Array,
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
    const resp = await fetch(`${TELEGRAM_API}/sendPhoto`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(TELEGRAM_FETCH_TIMEOUT_MS),
    });
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
      body: JSON.stringify({ business_connection_id: businessConnectionId, chat_id: chatId, text, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(TELEGRAM_FETCH_TIMEOUT_MS),
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
  buffer: Uint8Array,
  filename: string
): Promise<number | null> {
  if (!TELEGRAM_API) return null;
  try {
    const form = new FormData();
    form.append("business_connection_id", businessConnectionId);
    form.append("chat_id", String(chatId));
    form.append("photo", new Blob([buffer]), filename);
    const resp = await fetch(`${TELEGRAM_API}/sendPhoto`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(TELEGRAM_FETCH_TIMEOUT_MS),
    });
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

async function attachmentToImageBuffer(url: unknown): Promise<{ buffer: Uint8Array; ext: string } | null> {
  if (typeof url !== "string") return null;
  try {
    if (url.startsWith("data:image/")) {
      const match = url.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) return null;
      const buffer = base64ToBytes(match[2]);
      if (buffer.length > TELEGRAM_MAX_IMAGE_BYTES) {
        console.warn(`[Telegram] Ảnh user gửi quá lớn (${buffer.length} bytes) - bỏ qua forward.`);
        return null;
      }
      return { buffer, ext: (match[1].split("+")[0] || "jpg").toLowerCase() };
    }
    if (/^https?:\/\//i.test(url) && /\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(url)) {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const buffer = new Uint8Array(await resp.arrayBuffer());
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

/** Tra tên hiển thị của 1 user từ bảng users. */
async function getUserDisplayName(userId: string): Promise<string> {
  if (!userId) return userId;
  try {
    const { data: userRow } = await admin
      .from("users")
      .select("full_name, name, username, email")
      .eq("id", userId)
      .maybeSingle();
    if (userRow) return userRow.full_name || userRow.name || userRow.username || userRow.email || userId;
  } catch (_e) {}
  return userId;
}

/** "Phân loại từng KHÁCH HÀNG tại nhóm Telegram" - mỗi khách có 1 Forum
 * Topic RIÊNG VÀ DUY NHẤT (bảng telegram_customer_threads, khóa theo
 * user_id ổn định suốt đời). Trả về null nếu nhóm CHƯA bật Forum Topics
 * hoặc ghi Postgres thất bại - không chặn forward CSKH. */
async function ensureForumTopicForUser(userId: string, userName: string): Promise<number | null> {
  if (!TELEGRAM_API || !TELEGRAM_CHAT_ID || !userId) return null;

  try {
    const { data: existing } = await admin
      .from("telegram_customer_threads")
      .select("telegram_thread_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing?.telegram_thread_id) return existing.telegram_thread_id;
  } catch (e) {
    console.error("[Telegram] Không đọc được telegram_thread_id:", e);
  }

  try {
    const topicName = (userName || userId).slice(0, TELEGRAM_TOPIC_NAME_MAX);
    const resp = await fetch(`${TELEGRAM_API}/createForumTopic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, name: topicName }),
      signal: AbortSignal.timeout(TELEGRAM_FETCH_TIMEOUT_MS),
    });
    const data: any = await resp.json();
    if (!data.ok) {
      console.warn("[Telegram] Không tạo được Forum Topic (nhóm có thể chưa bật Topics):", data.description);
      return null;
    }
    const threadId = data.result?.message_thread_id;
    if (!threadId) return null;

    try {
      await admin
        .from("telegram_customer_threads")
        .upsert({ user_id: userId, telegram_thread_id: threadId }, { onConflict: "user_id" });
    } catch (e) {
      console.error("[Telegram] Không lưu được telegram_thread_id:", e);
    }
    return threadId;
  } catch (err: any) {
    console.error("[Telegram] createForumTopic exception:", err?.message || err);
    return null;
  }
}

async function recordTelegramHealth(ok: boolean, errorMessage?: string) {
  try {
    const { data: current } = await admin
      .from("telegram_bridge_health")
      .select("status")
      .eq("id", "default")
      .maybeSingle();
    const status: any = { ...(current?.status || {}) };
    const now = new Date().toISOString();
    status.cskh = ok
      ? { ...(status.cskh || {}), last_success_at: now }
      : { ...(status.cskh || {}), last_error: errorMessage || "Lỗi không xác định", last_error_at: now };
    await admin.from("telegram_bridge_health").upsert({ id: "default", status, updated_at: now });
  } catch (e: any) {
    console.warn("[Telegram] recordTelegramHealth: lỗi ghi trạng thái (bỏ qua):", e?.message || e);
  }
}

async function getActiveTelegramBusinessConnection(): Promise<{
  businessConnectionId: string;
  businessUserId: number | null;
} | null> {
  try {
    const { data } = await admin
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

/** "Nhận vé" độc quyền forward 1 message_id sang 1 đích (target) cụ thể -
 * chống gửi trùng khi cùng 1 dòng bị gọi webhook nhiều lần (pg_net không
 * đảm bảo đúng-1-lần cho net.http_post(), có thể phát lại request; test/
 * khôi phục dữ liệu chạy lại INSERT cũng gây hiệu ứng tương tự). Dùng
 * INSERT ... ON CONFLICT DO NOTHING RETURNING (thao tác NGUYÊN TỬ ở tầng
 * Postgres) thay vì "SELECT kiểm tra trước rồi mới gửi" - cách đó có
 * khoảng hở đua nhau giữa 2 lượt gọi gần nhau (đã xảy ra thực tế, cách
 * nhau chỉ 12ms) khiến cả 2 đều thấy "chưa forward" rồi cùng gửi. */
async function claimForwardOnce(messageId: string | null | undefined, target: "group" | "business"): Promise<boolean> {
  if (!messageId) return true;
  try {
    const { data, error } = await admin
      .from("telegram_outbound_forward_claims")
      .insert({ message_id: messageId, target })
      .select("message_id");
    if (error) {
      // Vi phạm khoá chính (đã có người "nhận vé" trước) - KHÔNG coi là lỗi,
      // đây chính là cơ chế chống trùng hoạt động đúng.
      if ((error as any).code === "23505") return false;
      // LỖI THẬT ĐÃ XẢY RA (không phải 23505 - vd timeout/mất kết nối tới
      // Postgres khi hệ thống đang tải cao): trước đây nhánh này "cho gửi
      // tiếp để không chặn nhầm" (return true), nhưng chính điều đó là
      // nguyên nhân 1 tin nhắn khách bị forward LẶP LẠI 5 LẦN vào nhóm
      // Telegram thật (xác nhận qua telegram_message_links: 5 dòng cùng
      // message_id trong khi telegram_outbound_forward_claims chỉ có ĐÚNG
      // 1 dòng - tức 4 trong 5 lượt gọi đã lọt qua nhánh lỗi này). KHÔNG
      // chắc chắn mình là người "nhận vé" duy nhất thì phải DỪNG (fail
      // closed) - webhook vốn đã được gọi lại nhiều lần cho cùng 1 dòng
      // (pg_net không đảm bảo đúng-1-lần), nên bỏ qua lượt này vẫn còn cơ
      // hội ở lượt gọi lại tiếp theo, không mất hẳn.
      console.error("[Telegram] claimForwardOnce lỗi (bỏ qua lượt này, không chắc đã nhận vé):", error);
      return false;
    }
    return !!data?.length;
  } catch (e) {
    console.error("[Telegram] claimForwardOnce exception (bỏ qua lượt này, không chắc đã nhận vé):", e);
    return false;
  }
}

/** Chuyển tiếp ĐÚNG 1 tin nhắn khách hàng (sender="user") sang nhóm Telegram CSKH. */
async function forwardUserMessageToTelegramGroup(row: any) {
  if (!row || row.sender !== "user" || !row.conversation_id) return;
  if (!(await claimForwardOnce(row.id, "group"))) return;

  const userId: string = row.user_id || row.conversation_id;
  const userName = await getUserDisplayName(userId);
  const attachments: unknown[] = Array.isArray(row.attachments) ? row.attachments : [];
  const content = row.content || row.text || (attachments.length ? "(Đã gửi ảnh - xem bên dưới)" : "(tệp đính kèm)");
  const text = `💬 <b>Tin nhắn CSKH mới</b>\nTừ: ${escapeHtml(userName)}\n\n${escapeHtml(content)}\n\n<i>Trả lời (Reply) tin nhắn này bằng chữ hoặc ảnh - hoặc gõ/gửi ảnh thẳng trong topic của khách nếu nhóm đã bật Forum Topics - để phản hồi trực tiếp cho khách hàng.</i>`;

  const threadId = await ensureForumTopicForUser(userId, userName);
  const telegramMessageId = await sendTelegramMessage(text, undefined, threadId ?? undefined);
  recordTelegramHealth(telegramMessageId !== null).catch(() => {});
  if (telegramMessageId) {
    try {
      await admin.from("telegram_message_links").insert({
        telegram_message_id: telegramMessageId,
        conversation_id: row.conversation_id,
        user_name: userName,
        message_id: row.id ?? null,
      });
    } catch (e) {
      console.error("[Telegram] Không lưu được link tin nhắn:", e);
    }
  }

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
        await admin.from("telegram_message_links").insert({
          telegram_message_id: photoMessageId,
          conversation_id: row.conversation_id,
          user_name: userName,
          message_id: row.id ?? null,
        });
      } catch (e) {
        console.error("[Telegram] Không lưu được link ảnh:", e);
      }
    }
  }
}

/** Admin vừa gửi 1 tin nhắn MỚI (Admin Panel) - nếu khách đã liên kết Telegram
 * Business thì chuyển tiếp sang đúng chat Business của khách đó. */
async function forwardAdminMessageToBusiness(row: any) {
  if (isTelegramOriginMessageId(row.id)) return;
  if (!(await claimForwardOnce(row.id, "business"))) return;

  const conn = await getActiveTelegramBusinessConnection();
  if (!conn) return;

  const { data: link } = await admin
    .from("telegram_business_links")
    .select("telegram_user_id")
    .eq("user_id", row.conversation_id)
    .maybeSingle();
  if (!link?.telegram_user_id) return;

  const chatId = link.telegram_user_id;
  const attachments: unknown[] = Array.isArray(row.attachments) ? row.attachments : [];
  const content: string = row.content || row.text || "";

  const recordLink = async (telegramMessageId: number | null) => {
    if (!telegramMessageId) return;
    try {
      await admin.from("telegram_business_message_links").insert({
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

/** Admin SỬA 1 tin nhắn - đồng bộ NGƯỢC ra Telegram Business nếu tin này
 * từng được gửi qua đó. */
async function syncEditedMessageToBusiness(row: any) {
  if (isTelegramOriginMessageId(row.id)) return;

  const { data: links } = await admin
    .from("telegram_business_message_links")
    .select("telegram_message_id, business_connection_id")
    .eq("message_id", row.id);
  if (!links?.length) return;

  const { data: link } = await admin
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

/** Admin XÓA 1 hoặc nhiều tin nhắn - đồng bộ NGƯỢC ra Telegram Business. */
async function syncDeletedMessageToBusiness(oldRow: any) {
  if (!oldRow?.id) return;

  const { data: links } = await admin
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
  await admin.from("telegram_business_message_links").delete().eq("message_id", oldRow.id);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!WEBHOOK_SECRET || request.headers.get("X-Webhook-Secret") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { type?: string; record?: any; old_record?: any };
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  try {
    if (body.type === "INSERT" && body.record) {
      const row = body.record;
      const tasks: Promise<unknown>[] = [forwardUserMessageToTelegramGroup(row)];
      if (row.sender === "admin" && row.conversation_id) {
        tasks.push(
          forwardAdminMessageToBusiness(row).catch((e) => console.error("[TelegramBusiness] Lỗi forward tin admin:", e))
        );
      }
      await Promise.all(tasks);
    } else if (body.type === "UPDATE" && body.record) {
      await syncEditedMessageToBusiness(body.record).catch((e) =>
        console.error("[TelegramBusiness] Lỗi đồng bộ sửa tin nhắn:", e)
      );
    } else if (body.type === "DELETE" && body.old_record) {
      await syncDeletedMessageToBusiness(body.old_record).catch((e) =>
        console.error("[TelegramBusiness] Lỗi đồng bộ xóa tin nhắn:", e)
      );
    }
  } catch (err: any) {
    console.error("[Telegram] Lỗi xử lý outbound webhook:", err?.message || err);
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
