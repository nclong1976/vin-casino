import express from "express";
import path from "path";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = process.env.PORT || 3000;

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
  replyMarkup?: unknown
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

/** Thoát các ký tự đặc biệt của HTML parse_mode (Telegram) để nội dung user gõ không phá format tin nhắn. */
function escapeHtml(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

/** Lắng nghe tin nhắn MỚI từ user (Supabase Realtime) và chuyển tiếp sang nhóm Telegram CSKH. */
function startTelegramForwarding() {
  if (!supabaseAdmin || !TELEGRAM_API || !TELEGRAM_CHAT_ID) return;

  supabaseAdmin
    .channel("telegram-cskh-forward")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      async (payload: any) => {
        const row = payload.new;
        if (!row || row.sender !== "user" || !row.conversation_id) return;

        const userName = await getUserDisplayName(row.conversation_id);
        const content = row.content || row.text || "(tệp đính kèm)";
        const text = `💬 <b>Tin nhắn CSKH mới</b>\nTừ: ${escapeHtml(userName)}\n\n${escapeHtml(content)}\n\n<i>Trả lời (Reply) tin nhắn này trên Telegram để phản hồi trực tiếp cho khách hàng.</i>`;

        const telegramMessageId = await sendTelegramMessage(text);
        if (telegramMessageId) {
          try {
            await supabaseAdmin!.from("telegram_message_links").insert({
              telegram_message_id: telegramMessageId,
              conversation_id: row.conversation_id,
              user_name: userName,
            });
          } catch (e) {
            console.error("[Telegram] Không lưu được link tin nhắn:", e);
          }
        }
      }
    )
    .subscribe((status: string) => {
      console.log(`[Telegram] Kênh forward CSKH: ${status}`);
    });
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

  supabaseAdmin
    .channel("telegram-wallet-forward")
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
    )
    .subscribe((status: string) => {
      console.log(`[Telegram] Kênh forward Nạp/Rút: ${status}`);
    });
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
// 2) message là REPLY trực tiếp tới 1 tin đã forward trước đó - khớp qua
//    telegram_wallet_links (REPLY nhập tay lý do từ chối nạp/rút) hoặc
//    telegram_message_links (REPLY trả lời CSKH). Tin nhắn thường/chat chit
//    trong nhóm không khớp REPLY nào thì bị bỏ qua.
app.post("/api/telegram-webhook", async (req, res) => {
  res.sendStatus(200); // luôn trả 200 ngay để Telegram không retry/timeout

  if (!supabaseAdmin) return;
  try {
    if (req.body?.callback_query) {
      await handleTelegramWalletCallback(req.body.callback_query);
      return;
    }

    const message = req.body?.message;
    const replyToId = message?.reply_to_message?.message_id;
    const text = message?.text;
    if (!replyToId || !text) return;
    // Bỏ qua tin nhắn của chính bot (tránh vòng lặp nếu bot tự phản hồi gì đó)
    if (message.from?.is_bot) return;

    const adminName = message.from?.username || message.from?.first_name || "Admin";

    // Ưu tiên kiểm tra REPLY nhập tay lý do từ chối nạp/rút trước
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

    const { data: link } = await supabaseAdmin
      .from("telegram_message_links")
      .select("conversation_id, user_name")
      .eq("telegram_message_id", replyToId)
      .maybeSingle();

    if (!link) {
      await sendTelegramMessage(
        "⚠️ Không tìm thấy hội thoại gốc cho tin nhắn này (có thể đã quá cũ). Vui lòng trả lời trực tiếp trong Admin Panel.",
        message.message_id
      );
      return;
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
      user_id: link.conversation_id,
      conversation_id: link.conversation_id,
      content: text,
      attachments: [],
      created_date: sentAt,
    });

    if (error) {
      console.error("[Telegram] Không ghi được tin nhắn trả lời:", error.message);
      await sendTelegramMessage(`⚠️ Gửi thất bại: ${error.message}`, message.message_id);
      return;
    }

    console.log(`[Telegram] Admin ${adminName} đã trả lời hội thoại ${link.conversation_id}`);
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

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
