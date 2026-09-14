import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Chiều "Telegram -> trong app" của cầu nối CSKH (nhóm CSKH + Telegram
// Business) - URL công khai này được đăng ký làm webhook Telegram của bot
// (setWebhook, tham số secret_token=TELEGRAM_WEBHOOK_SECRET) thay thế hẳn
// route Express /api/telegram-webhook cũ trên server.ts/Render. Duyệt
// Nạp/Rút qua Telegram đã bị gỡ bỏ hoàn toàn nên webhook này giờ CHỈ còn
// phục vụ CSKH.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SECRET_KEYS_RAW = Deno.env.get("SUPABASE_SECRET_KEYS");
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
const TELEGRAM_BUSINESS_USERNAME = Deno.env.get("TELEGRAM_BUSINESS_USERNAME") || "";

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required");
if (!SUPABASE_SECRET_KEYS_RAW) throw new Error("SUPABASE_SECRET_KEYS is required");

const secretKeys = JSON.parse(SUPABASE_SECRET_KEYS_RAW) as Record<string, string>;
const secretKey = Object.values(secretKeys)[0];
if (!secretKey) throw new Error("At least one Supabase secret key is required");

const admin = createClient(SUPABASE_URL, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TELEGRAM_API = TELEGRAM_BOT_TOKEN ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}` : null;
const TELEGRAM_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function escapeHtml(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

/** Gửi tin nhắn text tới 1 chat_id BẤT KỲ, KHÔNG qua Business Connection -
 * dùng cho đoạn chat trực tiếp giữa khách và chính con bot (bước /start liên kết). */
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

// Admin trả lời CSKH bằng ảnh trên Telegram - Telegram chỉ gửi kèm file_id,
// phải gọi thêm getFile rồi tự tải file đó về, encode base64 lưu thẳng vào
// messages.attachments (đúng pattern base64-trong-Postgres UploadFile()
// dùng cho ảnh user tự gửi lên).
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
    const buf = new Uint8Array(await fileResp.arrayBuffer());
    if (buf.length > TELEGRAM_MAX_IMAGE_BYTES) {
      console.warn(`[Telegram] Ảnh admin gửi quá lớn (${buf.length} bytes) - bỏ qua, không lưu vào hội thoại.`);
      return null;
    }

    const ext = (filePath.split(".").pop() || "jpg").toLowerCase();
    const mime =
      ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
    let binary = "";
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    return `data:${mime};base64,${btoa(binary)}`;
  } catch (err: any) {
    console.error("[Telegram] fetchTelegramFileAsDataUrl exception:", err?.message || err);
    return null;
  }
}

/** Lấy file_id ảnh trong 1 tin nhắn Telegram - hỗ trợ cả Photo lẫn File ảnh
 * gửi ở dạng Document. */
function extractTelegramImageFileId(message: any): string | null {
  const photoSizes = message?.photo;
  if (Array.isArray(photoSizes) && photoSizes.length > 0) {
    return photoSizes[photoSizes.length - 1]?.file_id ?? null;
  }
  const doc = message?.document;
  if (doc?.mime_type?.startsWith("image/")) return doc.file_id ?? null;
  return null;
}

async function upsertTelegramBusinessConnection(conn: any) {
  if (!conn?.id) return;
  try {
    await admin.from("telegram_business_connection").upsert({
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

/** Bước liên kết AN TOÀN 1 lần: khách bấm link "t.me/<bot>?start=<mã>" TỪ
 * TRONG APP - Trả về true nếu đây đúng là 1 lượt /start (đã xử lý xong). */
async function handleBusinessLinkStart(message: any): Promise<boolean> {
  const text: string = message?.text || "";
  const match = text.match(/^\/start(?:@\S+)?\s+(\S+)/);
  const telegramUserId = message?.from?.id;
  if (!match) return false;
  if (!telegramUserId) return true;

  const userId = match[1].replace(/_/g, "-");
  try {
    const { data: userRow } = await admin.from("users").select("id, full_name, name").eq("id", userId).maybeSingle();

    if (!userRow) {
      await sendPlainTelegramMessage(
        telegramUserId,
        '⚠️ Không tìm thấy tài khoản VinClub tương ứng. Vui lòng bấm lại nút "Liên hệ CSKH" ngay trong ứng dụng VinClub để lấy đúng link liên kết.'
      );
      return true;
    }

    await admin.from("telegram_business_links").upsert({
      telegram_user_id: telegramUserId,
      user_id: userRow.id,
      verified: true,
      linked_at: new Date().toISOString(),
    });

    const businessUsername = TELEGRAM_BUSINESS_USERNAME.replace(/^@/, "");
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
 * VinClub tương ứng. Trả về null nếu chính chủ tài khoản Business tự gõ
 * trả lời trên Telegram cá nhân của họ. */
async function resolveBusinessSender(
  telegramUserId: number,
  businessUserId: number | null
): Promise<{ userId: string; verified: boolean } | null> {
  if (businessUserId && telegramUserId === businessUserId) return null;

  try {
    const { data: link } = await admin
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
 * Admin tự gõ trên Telegram cá nhân) trong 1 cuộc chat đã kết nối Business. */
async function handleIncomingBusinessMessage(businessMessage: any, businessUserId: number | null) {
  const telegramUserId = businessMessage?.from?.id;
  const chatId = businessMessage?.chat?.id;
  if (!telegramUserId || !chatId) return;

  const resolved = await resolveBusinessSender(telegramUserId, businessUserId);
  const isAdminSender = resolved === null;
  let conversationId: string;
  let verified: boolean;

  if (isAdminSender) {
    const { data: custLink } = await admin
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
  const { error } = await admin.from("messages").insert({
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
      await admin.from("telegram_business_message_links").insert({
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
 * trên Telegram. */
async function handleEditedBusinessMessage(businessMessage: any) {
  const telegramMessageId = businessMessage?.message_id;
  const businessConnectionId = businessMessage?.business_connection_id;
  if (!telegramMessageId || !businessConnectionId) return;

  try {
    const { data: link } = await admin
      .from("telegram_business_message_links")
      .select("message_id")
      .eq("telegram_message_id", telegramMessageId)
      .eq("business_connection_id", businessConnectionId)
      .maybeSingle();
    if (!link?.message_id) return;

    const newText: string = businessMessage.text || businessMessage.caption || "";
    await admin.from("messages").update({ content: newText }).eq("id", link.message_id);
    console.log(`[TelegramBusiness] Đã đồng bộ sửa tin nhắn ${link.message_id}`);
  } catch (e) {
    console.error("[TelegramBusiness] Lỗi xử lý edited_business_message:", e);
  }
}

/** Xử lý update "deleted_business_messages" - Admin/khách XÓA thật 1 hoặc
 * NHIỀU tin nhắn cùng lúc trên Telegram. */
async function handleDeletedBusinessMessages(payload: any) {
  const businessConnectionId = payload?.business_connection_id;
  const messageIds: number[] = Array.isArray(payload?.message_ids) ? payload.message_ids : [];
  if (!businessConnectionId || messageIds.length === 0) return;

  try {
    const { data: links } = await admin
      .from("telegram_business_message_links")
      .select("message_id")
      .eq("business_connection_id", businessConnectionId)
      .in("telegram_message_id", messageIds);
    const appMessageIds = (links || []).map((l: any) => l.message_id).filter(Boolean);
    if (appMessageIds.length === 0) return;

    await admin
      .from("telegram_business_message_links")
      .delete()
      .eq("business_connection_id", businessConnectionId)
      .in("telegram_message_id", messageIds);
    await admin.from("messages").delete().in("id", appMessageIds);
    console.log(`[TelegramBusiness] Đã đồng bộ xóa ${appMessageIds.length} tin nhắn.`);
  } catch (e) {
    console.error("[TelegramBusiness] Lỗi xử lý deleted_business_messages:", e);
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  // Telegram tự gắn header này với đúng giá trị secret_token đã đăng ký lúc
  // setWebhook - xác thực request thật từ Telegram, không phải ai gọi cũng
  // được (khác Database Webhook ở Edge Function kia dùng header tự đặt).
  if (!WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Luôn trả 200 ngay để Telegram không retry/timeout - toàn bộ xử lý thật
  // chạy NỀN SAU KHI đã trả response (EdgeRuntime.waitUntil - API nền tảng
  // của Supabase Edge Functions để giữ tiến trình chạy tiếp sau khi
  // response đã gửi, tương đương Cloudflare Workers ctx.waitUntil()) -
  // không dùng thì runtime có thể dừng ngay khi response trả về, cắt ngang
  // xử lý thật đang chạy dở.
  let update: any;
  try {
    update = await request.json();
  } catch {
    return new Response("ok");
  }

  const processUpdate = async () => {
    try {
      if (update?.business_connection) {
        await upsertTelegramBusinessConnection(update.business_connection);
        return;
      }
      if (update?.business_message) {
        const conn = await getActiveTelegramBusinessConnection();
        await handleIncomingBusinessMessage(update.business_message, conn?.businessUserId ?? null);
        return;
      }
      if (update?.edited_business_message) {
        await handleEditedBusinessMessage(update.edited_business_message);
        return;
      }
      if (update?.deleted_business_messages) {
        await handleDeletedBusinessMessages(update.deleted_business_messages);
        return;
      }

      const message = update?.message;
      if (message?.text && (await handleBusinessLinkStart(message))) return;
      if (!message) return;

      const replyToId = message?.reply_to_message?.message_id;
      const messageThreadId = message?.message_thread_id;
      const text = message?.text || message?.caption || "";
      const imageFileId = extractTelegramImageFileId(message);
      if (!text && !imageFileId) return;
      if (message.from?.is_bot) return;

      const adminName = message.from?.username || message.from?.first_name || "Admin";

      // (a) Khớp theo REPLY trực tiếp tới 1 tin CSKH đã forward.
      let conversationId: string | null = null;
      // user_id THẬT của khách (ổn định suốt đời) - KHÁC conversation_id
      // (xoay vòng mỗi khi khách "bắt đầu hội thoại mới", xem migration
      // cskh_rotating_conversation_id.sql). RLS phía khách
      // (messages_select_own_or_admin) so khớp auth.uid() với
      // messages.user_id - ghi nhầm conversation_id vào đây (lỗi thực tế đã
      // xảy ra, xem git blame) khiến khách KHÔNG BAO GIỜ đọc được tin admin
      // vừa trả lời qua Telegram, và phía Admin Panel cũng không tra được
      // tên hiển thị (usersMap khoá theo user_id thật) - phải resolve đúng
      // giá trị này y hệt cách sendReply() trong MessagesTab.jsx đang làm
      // (supportConvMap[cid]?.user_id).
      let resolvedUserId: string | null = null;
      if (replyToId) {
        const { data: link } = await admin
          .from("telegram_message_links")
          .select("conversation_id")
          .eq("telegram_message_id", replyToId)
          .maybeSingle();
        if (link) conversationId = link.conversation_id;
      }
      if (conversationId) {
        const { data: conv } = await admin
          .from("support_conversations")
          .select("user_id")
          .eq("id", conversationId)
          .maybeSingle();
        if (conv?.user_id) resolvedUserId = conv.user_id;
      }

      // (b) Không phải REPLY (hoặc không khớp) - thử khớp theo Forum Topic
      // đang gõ.
      if (!conversationId && messageThreadId) {
        const { data: thread } = await admin
          .from("telegram_customer_threads")
          .select("user_id")
          .eq("telegram_thread_id", messageThreadId)
          .maybeSingle();
        if (thread?.user_id) {
          resolvedUserId = thread.user_id;
          const { data: conv } = await admin
            .from("support_conversations")
            .select("id")
            .eq("user_id", thread.user_id)
            .order("last_message_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (conv) conversationId = conv.id;
        }
      }

      if (!conversationId) {
        if (replyToId) {
          await sendTelegramMessage(
            "⚠️ Không tìm thấy hội thoại gốc cho tin nhắn này (có thể đã quá cũ). Vui lòng trả lời trực tiếp trong Admin Panel.",
            message.message_id,
            undefined,
            message.chat?.id ? String(message.chat.id) : TELEGRAM_CHAT_ID
          );
        }
        return;
      }

      const attachments: string[] = [];
      if (imageFileId) {
        const dataUrl = await fetchTelegramFileAsDataUrl(imageFileId);
        if (dataUrl) {
          attachments.push(dataUrl);
        } else {
          await sendTelegramMessage(
            "⚠️ Không gửi được ảnh này cho khách (ảnh quá lớn hoặc tải thất bại). Vui lòng thử lại với ảnh nhỏ hơn.",
            message.message_id,
            undefined,
            message.chat?.id ? String(message.chat.id) : TELEGRAM_CHAT_ID
          );
          if (!text) return;
        }
      }

      const sentAt = message.date ? new Date(message.date * 1000).toISOString() : new Date().toISOString();
      const { error } = await admin.from("messages").insert({
        id: "id_tg_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
        sender: "admin",
        // resolvedUserId gần như luôn có giá trị đúng (support_conversations
        // được tạo với user_id thật ngay từ tin nhắn ĐẦU TIÊN của khách) -
        // conversationId chỉ dùng làm phương án dự phòng cuối cùng nếu
        // support_conversations/telegram_customer_threads lỡ chưa có dữ
        // liệu, để không chặn hẳn việc ghi tin (giữ đúng hành vi cũ trong
        // trường hợp hiếm này thay vì làm mất tin nhắn).
        user_id: resolvedUserId || conversationId,
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
  };

  // @ts-ignore - EdgeRuntime là global runtime của Supabase Edge Functions/Deno Deploy, không có trong lib.dom types.
  if (typeof EdgeRuntime !== "undefined") {
    // @ts-ignore
    EdgeRuntime.waitUntil(processUpdate());
  } else {
    await processUpdate();
  }

  return new Response("ok");
});
