import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  Send,
  ChevronLeft,
  MessageSquare,
  MessageSquareText,
  Paperclip,
  Copy,
  Check,
  CheckCheck,
  AlertCircle,
  Maximize2,
  X,
  FileText,
  Film,
  UserCheck,
  Trash2,
  Loader2,
  Clock,
  Pencil,
  RefreshCcw,
} from "lucide-react";
import { base44, subscribeToConnectionStatus } from "@/api/base44Client";
import { listSupabaseUsersPage, subscribeSupabaseUsersTable, fetchMessagesPageByUser, requestCskhSessionReset } from "@/lib/supabaseDb";
import { pollWithBackoff } from "@/lib/pollWithBackoff";
import { deriveMessageStatus, markDelivered, markRead } from "@/lib/messageLifecycle";
import { compressImageFile } from "@/lib/imageCompression";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useAutoSaveDraft } from "@/hooks/useAutoSaveDraft";
import { CSKH_AWAY_THRESHOLD_MS } from "@/lib/cskhConversation";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { isSuperAdminUser } from "@/lib/isAdminUser";
import {
  SUPPORT_STATUS_LABELS,
  SUPPORT_STATUS_BADGE_CLASSES,
  DEFAULT_SUPPORT_STATUS,
} from "@/constants/supportStatus";

// Độ ưu tiên hội thoại - cột support_conversations.priority đã tồn tại sẵn
// trong database (CHECK IN low/normal/high/urgent, mặc định "normal") từ
// trước, nhưng chưa từng có nơi nào đọc/ghi - chỉ dùng ở đây (Admin), khách
// hàng không tự đặt được nên không cần đưa vào constants/supportStatus.js
// (file đó dành cho dữ liệu DÙNG CHUNG cả 2 phía).
const PRIORITY_LABELS = {
  low: "Thấp",
  normal: "Bình thường",
  high: "Cao",
  urgent: "Khẩn cấp",
};

const PRIORITY_BADGE_CLASSES = {
  low: "bg-gray-100 text-gray-500",
  normal: "bg-gray-100 text-gray-500",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

const DEFAULT_PRIORITY = "normal";

const STATUS_FILTERS = [
  { key: "all", label: "Tất cả" },
  { key: "open", label: "Đang mở" },
  { key: "pending", label: "Chờ phản hồi" },
  { key: "closed", label: "Đã đóng" },
];

// "Video quá lớn" chỉ là cảnh báo mềm (không nén được video client-side, xem
// src/lib/imageCompression.js) - không chặn gửi.
const LARGE_VIDEO_WARN_BYTES = 15 * 1024 * 1024;

const fileType = (url) => {
  if (!url) return "file";
  const ext = (url.split("?")[0].split(".").pop() || "").toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "avi", "mkv", "m4v", "ogg"].includes(ext)) return "video";
  if (url.startsWith("data:image/")) return "image";
  return "file";
};

const fmtTime = (iso) =>
  new Date(iso || Date.now()).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

// Mẫu tin nhắn CSKH soạn sẵn cho các tình huống thường gặp (nạp/rút/đầu tư/
// khóa tài khoản) - chọn 1 mẫu chỉ ĐIỀN vào ô soạn tin (replyText), KHÔNG tự
// gửi, để admin xem/sửa lại trước khi bấm gửi như bình thường.
const QUICK_REPLY_TEMPLATES = [
  { label: "Lời chào mở đầu", text: "Xin chào Quý khách! Em là CSKH VinClub. Em có thể hỗ trợ gì cho Quý khách ạ?" },
  { label: "Đã tiếp nhận, đang xử lý", text: "Dạ em đã tiếp nhận yêu cầu của Quý khách và đang chuyển bộ phận liên quan xử lý. Quý khách vui lòng chờ trong ít phút ạ." },
  { label: "Duyệt nạp tiền thành công", text: "Yêu cầu nạp tiền của Quý khách đã được duyệt thành công, số dư ví đã được cộng đầy đủ. Cảm ơn Quý khách đã tin tưởng đồng hành cùng VinClub!" },
  { label: "Duyệt rút tiền thành công", text: "Lệnh rút tiền của Quý khách đã được duyệt và chuyển khoản thành công. Quý khách vui lòng kiểm tra tài khoản ngân hàng, tiền sẽ về trong ít phút ạ." },
  { label: "Từ chối yêu cầu", text: "Rất tiếc, yêu cầu của Quý khách chưa thể xử lý do: [lý do]. Quý khách vui lòng kiểm tra lại và gửi lại yêu cầu ạ." },
  { label: "Yêu cầu bổ sung giấy tờ", text: "Để xác minh giao dịch, Quý khách vui lòng gửi thêm [ảnh CCCD/sao kê chuyển khoản] giúp em ạ. Em cảm ơn Quý khách!" },
  { label: "Thông báo tài khoản tạm khóa", text: "Tài khoản của Quý khách hiện đang tạm khóa để xác minh bảo mật. Quý khách vui lòng liên hệ CSKH để được hỗ trợ mở khóa sớm nhất ạ." },
  { label: "Xin lỗi vì phản hồi chậm", text: "Em xin lỗi vì đã để Quý khách chờ lâu. Hiện hệ thống đang xử lý nhiều yêu cầu cùng lúc, em sẽ hỗ trợ Quý khách ngay ạ." },
  { label: "Cảm ơn & kết thúc hỗ trợ", text: "Cảm ơn Quý khách đã liên hệ VinClub. Nếu cần hỗ trợ thêm, Quý khách cứ nhắn lại đây ạ. Chúc Quý khách một ngày tốt lành!" },
];

const fmtDate = (iso) => {
  const d = new Date(iso || Date.now());
  const today = new Date();
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (isToday) return `Hôm nay ${fmtTime(iso)}`;
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }) + " " + fmtTime(iso);
};

// Nhãn khoảng cách thời gian giữa 2 tin nhắn liên tiếp của CÙNG 1 khách -
// dùng cho vạch ngăn cách "khách quay lại sau X" (xem currentMessages.map()
// bên dưới). Chỉ hiện khi khoảng cách >= CSKH_AWAY_THRESHOLD_MS (đúng
// ngưỡng cskhConversation.js dùng để rotate conversation_id) - đây chính là
// mốc thật sự khiến khách rơi vào 1 "phiên" mới, không phải mốc tuỳ ý.
const formatGapLabel = (ms) => {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ`;
  const days = Math.round(hours / 24);
  return `${days} ngày`;
};

// ─── Stable Avatar ───────────────────────────────────────────────
const Avatar = React.memo(({ name, size = "md" }) => {
  const sz = size === "sm" ? "w-8 h-8 text-[11px]" : "w-10 h-10 text-[13px]";
  return (
    <div
      className={`${sz} rounded-full bg-gradient-to-br from-[#948154] to-[#6b5e3e] text-white font-bold flex items-center justify-center shrink-0 shadow-sm`}
    >
      {(name || "K").charAt(0).toUpperCase()}
    </div>
  );
});

// ─── Message Bubble ───────────────────────────────────────────────
const MessageBubble = React.memo(({ m, isAdmin, senderName, isSuperAdmin, onCopy, onDelete, copiedId, onPreview, isEditing, editText, onEditChange, onStartEdit, onSaveEdit, onCancelEdit, status, onRetry }) => (
  <div className={`flex ${isAdmin ? "justify-end" : "justify-start"} group`}>
    <div className={`max-w-[78%] flex flex-col ${isAdmin ? "items-end" : "items-start"}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[8.5px] font-bold text-gray-400">{isAdmin ? "Admin CSKH" : senderName}</span>
        {!isEditing && (
          <button
            onClick={() => onCopy(m)}
            className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-black transition-opacity"
            title="Sao chép"
          >
            {copiedId === m.id ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
          </button>
        )}
        {isSuperAdmin && !isEditing && m.content && (
          <button
            onClick={() => onStartEdit(m)}
            className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-[#948154] transition-opacity"
            title="Sửa tin nhắn"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
        {isSuperAdmin && !isEditing && (
          <button
            onClick={() => onDelete(m)}
            className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-600 transition-opacity"
            title="Xóa tin nhắn"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="w-full min-w-[220px] space-y-1.5">
          <textarea
            autoFocus
            value={editText}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSaveEdit(m);
              } else if (e.key === "Escape") {
                onCancelEdit();
              }
            }}
            rows={2}
            className="w-full py-2 px-3 rounded-xl border border-[#948154] text-[11.5px] focus:outline-none resize-none leading-relaxed"
          />
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={onCancelEdit}
              className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-[10px] font-bold cursor-pointer transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={() => onSaveEdit(m)}
              className="px-2.5 py-1 rounded-lg bg-[#948154] hover:bg-[#7a6c44] text-white text-[10px] font-bold cursor-pointer transition-colors"
            >
              Lưu
            </button>
          </div>
        </div>
      ) : (
      <div
        className={`rounded-2xl px-3 py-2 text-[11.5px] leading-relaxed shadow-xs ${
          isAdmin
            ? "bg-[#948154] text-white rounded-br-sm"
            : "bg-gray-100 text-black rounded-bl-sm border border-gray-200/80"
        }`}
      >
        {m.content && <p className="whitespace-pre-wrap break-words font-medium">{m.content}</p>}
        {m.attachments?.length > 0 && (
          <div className={`space-y-1.5 ${m.content ? "mt-1.5 pt-1.5 border-t border-black/10" : ""}`}>
            {m.attachments.map((url, i) => {
              const t = fileType(url);
              if (t === "image") {
                return (
                  <div key={i} className="relative group/img overflow-hidden rounded-xl border border-black/10 bg-gray-100">
                    <img
                      src={url}
                      alt=""
                      loading="lazy"
                      onClick={() => onPreview(url)}
                      // aspect-[4/3] giữ chỗ khung ảnh CỐ ĐỊNH ngay từ đầu (trước
                      // khi trình duyệt biết kích thước thật của ảnh) - không có
                      // dòng này, bong bóng ảnh co gần về 0px trong lúc tải rồi
                      // "bung ra" đột ngột khi tải xong, nhìn như tin nhắn vừa
                      // biến mất rồi hiện lại.
                      className="w-full aspect-[4/3] max-h-48 object-cover cursor-pointer hover:scale-[1.02] transition-transform"
                    />
                    <button
                      onClick={() => onPreview(url)}
                      className="absolute bottom-1 right-1 bg-black/60 text-white p-1 rounded-md text-[9px] flex items-center gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity"
                    >
                      <Maximize2 className="w-2.5 h-2.5" /> Xem
                    </button>
                  </div>
                );
              }
              return (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-[10px] underline p-1.5 bg-black/5 rounded-lg"
                >
                  <FileText className="w-3.5 h-3.5" /> Tập tin đính kèm
                </a>
              );
            })}
          </div>
        )}
      </div>
      )}

      <div className="flex items-center gap-1 mt-0.5">
        <span className="text-[8px] text-gray-400">{fmtTime(m.created_date)}</span>
        {/* Tick trạng thái - CHỈ trên bubble tin admin đã gửi (isAdmin) */}
        {status === "sending" && <Loader2 className="w-2.5 h-2.5 text-gray-400 animate-spin" />}
        {status === "sent" && <Check className="w-3 h-3 text-gray-400" />}
        {status === "delivered" && <CheckCheck className="w-3 h-3 text-gray-400" />}
        {status === "read" && <CheckCheck className="w-3 h-3 text-[#948154]" />}
        {status === "failed" && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-0.5 text-red-500 hover:text-red-600 text-[9px] font-bold cursor-pointer"
          >
            <AlertCircle className="w-3 h-3" />
            Gửi lại
          </button>
        )}
      </div>
    </div>
  </div>
));

// ─── Main Component ───────────────────────────────────────────────
export default function MessagesTab({ initialSelectedUserId = null }) {
  const { user } = useAuth();
  const isSuperAdmin = isSuperAdminUser(user);

  const [messages, setMessages] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [supportConvMap, setSupportConvMap] = useState({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState(initialSelectedUserId);
  const [replyText, setReplyText] = useState("");
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  // Trạng thái kênh Realtime THẬT (SUBSCRIBED/CLOSED/CHANNEL_ERROR/...) - cùng
  // subscribeToConnectionStatus() Support.jsx đang dùng cho banner "Đang kết
  // nối lại..." phía khách hàng. Badge "● Realtime" trước đây là text tĩnh,
  // luôn hiện xanh kể cả khi kênh rớt - đổi thành phản ánh đúng trạng thái
  // thật để Admin không bị đánh lừa là "đang real-time" trong lúc thực ra
  // kênh đã rớt và chỉ còn poll 20s dự phòng đang gánh.
  const [connStatus, setConnStatus] = useState(null);

  useEffect(() => {
    if (initialSelectedUserId) {
      setSelectedUser(initialSelectedUserId);
    }
  }, [initialSelectedUserId]);
  const [previewImage, setPreviewImage] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // {type: 'msg'|'conv', target}
  const [resetSessionConfirm, setResetSessionConfirm] = useState(null); // {userId, userName} - "Bắt đầu cuộc trò chuyện mới"
  const [resettingSession, setResettingSession] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);

  // Cache riêng theo khách (fetchMessagesPageByUser - src/lib/supabaseDb.js,
  // WHERE user_id + LIMIT thật, khóa theo user_id để không mất lịch sử qua
  // các lần rotate conversation_id) - KHÔNG thay thế "messages" (mảng toàn
  // cục nuôi danh sách hội thoại + realtime, xem applyMessages() bên dưới),
  // chỉ MERGE THÊM vào currentMessages để thấy đủ lịch sử 1 khách cụ thể
  // thay vì chỉ 300 tin gần nhất TOÀN HỆ THỐNG.
  const [conversationPageCache, setConversationPageCache] = useState({});
  const [loadingOlder, setLoadingOlder] = useState(false);
  const hasMoreOlderRef = useRef({});
  const prependScrollAdjustRef = useRef(null);

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const templatesRef = useRef(null);
  const prevMsgCountRef = useRef(0);
  const prevConvRef = useRef(null);

  // useTypingIndicator được gọi PHÍA DƯỚI, sau khi currentConv đã tính xong
  // (xem ghi chú tại đó) - vị trí gọi hook không nhất thiết phải ở đầu
  // component, chỉ cần gọi vô điều kiện & cùng thứ tự mỗi lần render.

  // Đóng danh sách mẫu khi bấm ra ngoài - cùng cách NotificationBell.jsx
  // đang đóng dropdown của nó.
  useEffect(() => {
    const handler = (e) => {
      if (templatesRef.current && !templatesRef.current.contains(e.target)) setShowTemplates(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Load users - KHÔNG chỉ 1 lần lúc mount ──────────────────────
  // Trước đây usersMap chỉ tải đúng 1 lần khi component mount. Nếu lần tải
  // đó rơi đúng lúc bảng users tạm thời lỗi (mất mạng, hoặc sự cố RLS như
  // đệ quy vô hạn từng xảy ra 05/09) thì usersMap kẹt RỖNG VĨNH VIỄN cho
  // hết phiên làm việc - không có gì kích hoạt tải lại - khiến mọi hội
  // thoại hiển thị "Khách #xxxxxx" dù dữ liệu tên người dùng thật đã có
  // sẵn trên server từ lâu. Giờ tự làm mới qua Realtime (ngay khi bảng
  // users đổi) + poll định kỳ làm lưới an toàn, đúng mẫu đã dùng ở
  // UsersTab.jsx.
  useEffect(() => {
    let cancelled = false;
    // Trước đây gọi SONG SONG cả base44.entities.User.list() LẪN
    // listSupabaseUsers() rồi merge - 2 hàm này cùng đọc thẳng bảng "users"
    // (User.list() cũng chỉ là fetchFromSupabase('User') → listSupabaseUsers()
    // nếu cache chưa đủ mới), nên phần lớn thời gian đây là 2 lượt SELECT *
    // FROM users TỐN KÉM chạy trùng nhau cho cùng 1 kết quả - không có ích
    // gì thêm, chỉ tốn gấp đôi. Giờ chỉ còn 1 nguồn duy nhất
    // (listSupabaseUsersPage - có giới hạn + throw thật khi lỗi, cần cho
    // pollWithBackoff bên dưới phân biệt được "lỗi" với "danh sách rỗng").
    const fetchUsersMap = () => listSupabaseUsersPage({ limit: 2000 }).then((r) => r.rows);
    const applyRows = (rows) => {
      if (cancelled || !Array.isArray(rows)) return;
      const map = {};
      rows.forEach((u) => {
        if (u?.id) map[u.id] = u;
        if (u?.email) map[u.email] = u;
      });
      setUsersMap(map);
    };
    fetchUsersMap().then(applyRows).catch(() => {});

    const unsubUsers = subscribeSupabaseUsersTable(() => {
      fetchUsersMap().then(applyRows).catch(() => {});
    });
    // pollWithBackoff thay setInterval(30000) cố định: lỗi liên tiếp (vd.
    // 522) sẽ tự giãn cách thử lại thay vì cứ đều đặn dội lại câu truy vấn
    // tốn kém mỗi 30 giây bất kể đang lỗi hay không - xem pollWithBackoff.js.
    const stopPoll = pollWithBackoff(fetchUsersMap, {
      baseMs: 30000,
      maxMs: 300000,
      onResult: applyRows,
      onError: (err) => console.warn("[MessagesTab] poll usersMap lưới an toàn thất bại, sẽ tự giãn cách thử lại:", err?.message || err),
    });

    return () => {
      cancelled = true;
      if (typeof unsubUsers === "function") unsubUsers();
      stopPoll();
    };
  }, []);

  // ── Trạng thái hội thoại (support_conversations) - ticket/status/gán xử lý ──
  // Cùng mẫu Realtime + poll dự phòng như usersMap/messages ở trên. Hội
  // thoại nào chưa có dòng trong bảng (chưa admin nào từng đổi trạng thái)
  // coi như mặc định "open", không gán ai - xử lý ở bước gộp vào convList
  // bên dưới (useMemo conversations), không cần tạo sẵn dòng rỗng ở đây.
  useEffect(() => {
    let cancelled = false;
    const applyRows = (rows) => {
      if (cancelled || !Array.isArray(rows)) return;
      const map = {};
      rows.forEach((r) => {
        if (r?.id) map[r.id] = r;
      });
      setSupportConvMap(map);
    };

    base44.entities.SupportConversation.list().then(applyRows).catch(() => {});
    const unsub = base44.entities.SupportConversation.subscribe(applyRows);
    const retryInterval = setInterval(() => {
      base44.entities.SupportConversation.list().then(applyRows).catch(() => {});
    }, 20000);

    return () => {
      cancelled = true;
      if (typeof unsub === "function") unsub();
      clearInterval(retryInterval);
    };
  }, []);

  // ── Trạng thái kênh Realtime thật (cho badge "● Realtime" ở header) ──
  useEffect(() => {
    const unsub = subscribeToConnectionStatus("Message", setConnStatus);
    return unsub;
  }, []);

  // ── Realtime messages via Supabase Realtime (push chính) + poll an toàn ──
  useEffect(() => {
    let unsubBase44;
    let cancelled = false;

    const applyMessages = (msgList) => {
      if (!Array.isArray(msgList)) return;
      // __deletedId: xác nhận xóa ĐÚNG 1 dòng (từ Message.delete() cục bộ
      // hoặc sự kiện Realtime DELETE thật, xem base44Client.js) - chỉ lọc bỏ
      // đúng id đó khỏi state HIỆN CÓ, KHÔNG ghi đè toàn bộ bằng msgList (có
      // thể là snapshot cũ/thiếu tin nhắn mới lấy từ cache localStorage - xem
      // ghi chú ở LocalEntityClient.delete()). Mọi lượt khác (REST fetch thật
      // qua fetchMessages(), Realtime INSERT/UPDATE) vẫn ghi đè như cũ vì đó
      // luôn là danh sách đầy đủ/mới nhất.
      const deletedId = msgList.__deletedId;
      if (deletedId !== undefined) {
        setMessages((prev) => prev.filter((m) => m.id !== deletedId));
        setLastUpdate(Date.now());
        setLoading(false);
        return;
      }
      setMessages(msgList);
      setLastUpdate(Date.now());
      setLoading(false);
    };

    // base44.entities.Message.subscribe() chạy trên Supabase Realtime
    // (ensureSupabaseRealtime trong base44Client.js) - đủ nhanh cho chat,
    // không cần kênh Firebase RTDB riêng nữa. Dùng THẲNG mảng callback trả
    // về (đã tải mới từ Supabase hoặc vừa tính lại trong bộ nhớ) thay vì tự
    // đọc lại localStorage - localStorage["base44_entity_Message"] có thể
    // CŨ/THIẾU nếu lần ghi trước đó bị lỗi âm thầm (setLocalStore() nuốt lỗi
    // "vượt hạn mức lưu trữ" khi tin nhắn có ảnh đính kèm base64 dung lượng
    // lớn) - tự đọc lại từ đây từng khiến toàn bộ hội thoại admin đang xem
    // bị ghi đè về một danh sách cũ/thiếu ngay sau khi tải đúng đủ, dù dữ
    // liệu mới vừa được truyền sẵn qua tham số callback.
    unsubBase44 = base44.entities.Message.subscribe((freshItems) => {
      applyMessages(freshItems);
    });

    // Tải danh sách tin nhắn thật từ Supabase - chỉ áp dụng khi có dữ liệu
    // thật trả về (length > 0), KHÔNG BAO GIỜ ghi đè hội thoại đang hiện
    // bằng danh sách rỗng - nếu lượt tải này lỗi/rớt mạng, cứ giữ nguyên
    // những gì đang có (cache cục bộ hoặc lượt tải trước đó).
    const fetchMessages = () => {
      base44.entities.Message.list("-created_date", 300)
        .then((msgs) => {
          if (cancelled) return;
          if (Array.isArray(msgs) && msgs.length > 0) applyMessages(msgs);
          else setLoading(false);
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
    };
    fetchMessages();

    // Poll an toàn dự phòng (20s) - Realtime (ở trên) là kênh cập nhật
    // chính, nhưng 1 THIẾT BỊ MỚI (chưa từng mở tab CSKH này, nên không có
    // cache cục bộ để lùi về) mà đúng lúc lượt tải ban đầu ở trên gặp trục
    // trặc mạng thoáng qua sẽ bị kẹt hiển thị "chưa có tin nhắn" VĨNH VIỄN
    // cho tới khi có 1 tin nhắn MỚI kích hoạt lại Realtime - đây chính là
    // nguyên nhân "đăng nhập ở thiết bị khác mất hết tin nhắn" đã xảy ra
    // trong thực tế. usersMap ở trên đã có lưới an toàn tương tự (30s) vì
    // cùng 1 lớp lỗi; áp dụng lại đúng mẫu đó cho tin nhắn.
    const retryInterval = setInterval(fetchMessages, 20000);

    // Tín hiệu đồng bộ chéo tab (Support.jsx ghi "vinclub_msg_update" mỗi khi
    // gửi tin) - "Message" giờ dùng backing store TRONG BỘ NHỚ (xem
    // MEMORY_ONLY_ENTITIES trong base44Client.js) nên KHÔNG còn đọc lại
    // localStorage["base44_entity_Message"] ở đây nữa (dữ liệu đó có thể
    // cũ/thiếu nếu tab khác vừa gặp lỗi ghi) - gọi thẳng fetchMessages() (tải
    // thật từ Postgres) để chắc chắn đúng, tận dụng tín hiệu này chỉ để bắt
    // kịp NHANH HƠN thay vì đợi tới chu kỳ poll 20s.
    const handleStorage = (e) => {
      if (e.key === "vinclub_msg_update") fetchMessages();
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      cancelled = true;
      if (typeof unsubBase44 === "function") unsubBase44();
      clearInterval(retryInterval);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // ── Auto scroll only on new messages ────────────────────────────
  useEffect(() => {
    if (!selectedUser || !scrollRef.current) return;
    // On conversation switch: scroll immediately
    if (prevConvRef.current !== selectedUser) {
      prevConvRef.current = selectedUser;
      prevMsgCountRef.current = 0;
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      return;
    }
    const count = messages.filter((m) => m.user_id === selectedUser).length;
    if (count !== prevMsgCountRef.current) {
      prevMsgCountRef.current = count;
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, selectedUser]);

  // ── Auto-resize textarea ─────────────────────────────────────────
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 110)}px`;
    }
  }, [replyText]);

  // ── Memoized conversations grouping ─────────────────────────────
  // Nhóm theo user_id THẬT (ổn định vĩnh viễn cho 1 khách) thay vì
  // conversation_id - conversation_id có thể ROTATE qua thời gian (khách
  // rời trang CSKH quá lâu (xem CSKH_AWAY_THRESHOLD_MS) thì lần quay lại sau nhận 1 conversation_id mới,
  // xem src/lib/cskhConversation.js - KHÔNG đụng vào file đó). Nhóm theo
  // conversation_id cũ khiến 1 khách đã rotate bị tách thành "khách mới"
  // riêng trong sidebar admin, và khi admin trả lời trong hội thoại đã
  // rotate, tin bị ghi với conversation_id CŨ - Support.jsx (khách) lọc
  // cứng theo conversation_id đang active nên không bao giờ thấy được tin
  // đó. Mỗi nhóm giữ thêm latestConversationId (conversation_id của tin mới
  // nhất) - dùng làm proxy "conversation_id đang active" khi gửi trả lời/
  // đổi trạng thái hội thoại/đặt tên kênh typing-indicator, vì ngay khi
  // khách rotate xong, tin/hội thoại kế tiếp của khách luôn mang
  // conversation_id mới đó.
  const { conversations, convList } = useMemo(() => {
    const convMap = {};
    (Array.isArray(messages) ? messages : []).forEach((m) => {
      if (!m) return;
      const uid = String(m.user_id || m.conversation_id || m.sender || "unknown");
      if (!convMap[uid]) {
        convMap[uid] = {
          id: uid,
          latestConversationId: m.conversation_id || uid,
          messages: [],
          lastDate: m.created_date || new Date().toISOString(),
          unread: 0,
        };
      }
      const g = convMap[uid];
      g.messages.push(m);
      if (m.sender === "user" && !m.read_at) g.unread++;
      if (!g.lastDate || m.created_date >= g.lastDate) {
        g.lastDate = m.created_date;
        if (m.conversation_id) g.latestConversationId = m.conversation_id;
      }
    });

    const list = Object.values(convMap)
      .map((g) => {
        const u = usersMap[g.id] || null;
        const supportConv = supportConvMap[g.latestConversationId] || null;
        return {
          ...g,
          userName: u?.full_name || u?.name || u?.email || (g.id !== "unknown" ? `Khách #${g.id.slice(0, 6)}` : "Khách"),
          userEmail: u?.email || "—",
          status: supportConv?.status || DEFAULT_SUPPORT_STATUS,
          priority: supportConv?.priority || DEFAULT_PRIORITY,
          assignedAdminId: supportConv?.assigned_admin_id || null,
          assignedAdminName: supportConv?.assigned_admin_name || null,
          topic: supportConv?.topic || null,
        };
      })
      .sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));

    const map = {};
    list.forEach((c) => {
      map[c.id] = c;
    });
    return { conversations: map, convList: list };
  }, [messages, usersMap, supportConvMap]);

  // Danh sách chủ đề để lọc - lấy TRỰC TIẾP từ dữ liệu thật (topic đã ghi
  // nhận trên các hội thoại), không hardcode lại y hệt QUICK_TOPICS ở
  // ChatInput.jsx (2 nơi dễ lệch nhau khi có thêm chủ đề mới).
  const topicOptions = useMemo(
    () => Array.from(new Set(convList.map((c) => c.topic).filter(Boolean))),
    [convList]
  );
  const [topicFilter, setTopicFilter] = useState("all");

  const filteredConvList = useMemo(() => {
    let list = statusFilter === "all" ? convList : convList.filter((c) => c.status === statusFilter);
    if (topicFilter !== "all") list = list.filter((c) => c.topic === topicFilter);
    return list;
  }, [convList, statusFilter, topicFilter]);

  const currentConv = selectedUser ? conversations[selectedUser] : null;

  // Kênh typing-indicator phải trùng TÊN với kênh Support.jsx (khách) đang
  // lắng nghe - khách dùng đúng conversation_id ĐANG ACTIVE của họ
  // (getActiveConversationId(), cskhConversation.js), nên phía admin phải
  // dùng latestConversationId (proxy tốt nhất hiện có cho "hội thoại đang
  // active của khách"), KHÔNG dùng selectedUser (giờ là user_id) trực tiếp -
  // đặt sau currentConv vì cần latestConversationId đã tính ở đó; vị trí gọi
  // hook không nhất thiết phải ở đầu component, chỉ cần vô điều kiện & cùng
  // thứ tự mỗi lần render.
  const { peerTyping, notifyTyping } = useTypingIndicator(
    currentConv?.latestConversationId || selectedUser,
    "admin"
  );

  // Auto-save nháp ô trả lời - khóa theo user_id (selectedUser, ổn định
  // vĩnh viễn cho 1 khách, KHÔNG dùng latestConversationId vì giá trị đó có
  // thể rotate giữa chừng lúc admin đang gõ dở - xem ghi chú useMemo nhóm hội
  // thoại ở trên) để đổi qua hội thoại khác không bị dính nháp của khách
  // trước, và quay lại đúng hội thoại cũ vẫn còn nguyên nội dung đang gõ dở.
  const replyDraftKey = selectedUser ? `vinclub_admin_cskh_draft:${selectedUser}` : null;
  const { clearDraft: clearReplyDraft } = useAutoSaveDraft(replyDraftKey, replyText, setReplyText);

  // Hợp nhất tin từ "messages" (mảng toàn cục, realtime) VỚI trang riêng đã
  // tải qua fetchMessagesPageByUser() (conversationPageCache) - dedup theo
  // id, sắp theo thời gian tăng dần. Không có currentConv (chưa có tin nào
  // trong "messages" cho khách này) vẫn phải hiện được lịch sử từ page cache.
  const currentMessages = useMemo(() => {
    const fromGlobal = currentConv ? currentConv.messages : [];
    const fromPageCache = (selectedUser && conversationPageCache[selectedUser]) || [];
    const merged = new Map();
    fromPageCache.forEach((m) => merged.set(m.id, m));
    fromGlobal.forEach((m) => merged.set(m.id, m));
    // Tie-break bằng id khi 2 tin TRÙNG created_date (hoàn toàn có thể xảy
    // ra - vd tin optimistic của khách + admin trả lời gần như đồng thời).
    // Array.sort ổn định nhưng chỉ giữ đúng thứ tự phần tử "bằng nhau" CÓ
    // SẴN trong mảng đầu vào - mảng ở đây tới từ Map, thứ tự chèn phụ thuộc
    // conversationPageCache/currentConv.messages đổi qua từng lượt render
    // (REST/poll/Realtime khác thứ tự nhau), thiếu tiêu chí phụ cố định
    // khiến 2 tin trùng giờ có thể đổi chỗ nhau giữa các lần render - nhìn
    // như tin nhắn "tự nhảy" vị trí dù nội dung không đổi (cùng lớp lỗi vừa
    // sửa ở Support.jsx phía khách).
    return Array.from(merged.values()).sort((a, b) => {
      const t = new Date(a.created_date || 0) - new Date(b.created_date || 0);
      if (t !== 0) return t;
      const ai = String(a.id ?? "");
      const bi = String(b.id ?? "");
      return ai < bi ? -1 : ai > bi ? 1 : 0;
    });
  }, [currentConv, conversationPageCache, selectedUser]);

  // ── Handlers ─────────────────────────────────────────────────────
  const openConversation = useCallback(
    async (cid) => {
      setSelectedUser(cid);
      const conv = conversations[cid];
      if (!conv) return;
      const unreadMsgs = conv.messages.filter((m) => m.sender === "user" && !m.read_at);
      if (unreadMsgs.length === 0) return;
      try {
        const now = new Date().toISOString();
        await base44.entities.Message.bulkUpdate(
          unreadMsgs.map((m) => ({ id: m.id, read_at: now }))
        );
        setMessages((prev) =>
          prev.map((m) => (unreadMsgs.some((u) => u.id === m.id) ? { ...m, read_at: now } : m))
        );
        window.dispatchEvent(new CustomEvent("vinclub:msg_update"));
      } catch {}
    },
    [conversations]
  );

  // Seed lịch sử ĐÚNG khách đang mở qua fetchMessagesPageByUser() (thật WHERE
  // user_id, không phải slice từ 300 tin gần nhất TOÀN HỆ THỐNG) - chạy cho
  // cả 2 đường vào 1 hội thoại (bấm chọn qua openConversation() lẫn
  // initialSelectedUserId truyền thẳng từ nơi khác), vì cả 2 đều đổi
  // selectedUser (giờ luôn là user_id, xem ghi chú useMemo nhóm hội thoại ở
  // trên). Lọc theo user_id thay vì conversation_id để không bỏ sót lịch sử
  // trước khi khách rotate conversation_id. Không đụng "messages" (mảng
  // toàn cục) - chỉ ghi vào conversationPageCache, merge ở currentMessages
  // phía trên.
  useEffect(() => {
    if (!selectedUser) return;
    hasMoreOlderRef.current[selectedUser] = true;
    let cancelled = false;
    fetchMessagesPageByUser(selectedUser, { limit: 50 })
      .then((page) => {
        if (cancelled || !page) return;
        setConversationPageCache((prev) => ({ ...prev, [selectedUser]: page }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedUser]);

  // Cursor pagination khi cuộn lên đầu khung chat - tải thêm tin CŨ HƠN tin
  // cũ nhất đang có (cả trong page cache lẫn "messages" toàn cục) vào
  // conversationPageCache[selectedUser].
  const loadOlderMessages = useCallback(async () => {
    if (!selectedUser || loadingOlder || hasMoreOlderRef.current[selectedUser] === false) return;
    if (currentMessages.length === 0 || !scrollRef.current) return;
    const oldest = currentMessages[0];
    if (!oldest?.created_date) return;
    setLoadingOlder(true);
    prependScrollAdjustRef.current = scrollRef.current.scrollHeight;
    try {
      const older = await fetchMessagesPageByUser(selectedUser, {
        beforeCreatedAt: oldest.created_date,
        limit: 30,
      });
      if (!older || older.length === 0) {
        hasMoreOlderRef.current[selectedUser] = false;
        prependScrollAdjustRef.current = null;
        return;
      }
      setConversationPageCache((prev) => {
        const existing = prev[selectedUser] || [];
        const existingIds = new Set(existing.map((m) => m.id));
        const toAdd = older.filter((m) => !existingIds.has(m.id));
        if (toAdd.length === 0) {
          prependScrollAdjustRef.current = null;
          return prev;
        }
        return { ...prev, [selectedUser]: [...toAdd, ...existing] };
      });
    } catch (e) {
      prependScrollAdjustRef.current = null;
    } finally {
      setLoadingOlder(false);
    }
  }, [selectedUser, loadingOlder, currentMessages]);

  useLayoutEffect(() => {
    if (prependScrollAdjustRef.current != null && scrollRef.current) {
      const prevHeight = prependScrollAdjustRef.current;
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevHeight;
      prependScrollAdjustRef.current = null;
    }
  }, [currentMessages]);

  const handleScroll = useCallback(
    (e) => {
      if (e.target.scrollTop < 60) loadOlderMessages();
    },
    [loadOlderMessages]
  );

  // Đánh dấu "Delivered" cho tin khách vừa nhận qua realtime/refetch (chưa
  // delivered_at) - áp dụng cho TOÀN BỘ "messages" (không chỉ hội thoại đang
  // mở), vì "delivered" đúng nghĩa là "đã tới 1 thiết bị admin đang mở CSKH",
  // không cần đúng admin nào đang xem hội thoại đó.
  useEffect(() => {
    const undelivered = messages.filter((m) => m.sender === "user" && !m.delivered_at).map((m) => m.id);
    if (undelivered.length > 0) markDelivered(undelivered);
  }, [messages]);

  // Đánh dấu "Read" cho tin khách MỚI tới trong khi hội thoại đang thật sự
  // mở (đối xứng openConversation() ở trên, vốn chỉ chạy 1 lần lúc bấm mở) -
  // và tab đang visible.
  useEffect(() => {
    if (!selectedUser) return;
    const markVisibleAsRead = () => {
      if (document.visibilityState !== "visible") return;
      const unreadIds = currentMessages.filter((m) => m.sender === "user" && !m.read_at).map((m) => m.id);
      if (unreadIds.length > 0) markRead(unreadIds);
    };
    markVisibleAsRead();
    document.addEventListener("visibilitychange", markVisibleAsRead);
    return () => document.removeEventListener("visibilitychange", markVisibleAsRead);
  }, [currentMessages, selectedUser]);

  // Ghi trạng thái/người phụ trách xuống support_conversations - update()
  // nếu dòng đã tồn tại thật trên Supabase (đã có trong supportConvMap, lấy
  // từ list()/subscribe() ở trên), create() (upsert theo id) nếu đây là lần
  // đầu tiên hội thoại này có ai đổi trạng thái. Optimistic update local
  // trước để UI đổi ngay, không đợi round-trip Realtime.
  const patchConversationStatus = useCallback(
    async (cid, patch) => {
      setSupportConvMap((prev) => ({
        ...prev,
        [cid]: { ...(prev[cid] || { id: cid, status: DEFAULT_SUPPORT_STATUS }), ...patch },
      }));
      try {
        if (supportConvMap[cid]) {
          await base44.entities.SupportConversation.update(cid, patch);
        } else {
          await base44.entities.SupportConversation.create({
            id: cid,
            status: DEFAULT_SUPPORT_STATUS,
            assigned_admin_id: null,
            assigned_admin_name: null,
            ...patch,
          });
        }
      } catch {
        toast.error("Không thể cập nhật trạng thái hội thoại");
      }
    },
    [supportConvMap]
  );

  const assignToSelf = useCallback(
    (cid) => {
      const adminName = user?.full_name || user?.name || user?.email || "Admin CSKH";
      patchConversationStatus(cid, { assigned_admin_id: user?.id || null, assigned_admin_name: adminName });
    },
    [patchConversationStatus, user]
  );

  const changeConvStatus = useCallback(
    (cid, status) => {
      patchConversationStatus(cid, { status });
    },
    [patchConversationStatus]
  );

  const changeConvPriority = useCallback(
    (cid, priority) => {
      patchConversationStatus(cid, { priority });
    },
    [patchConversationStatus]
  );

  const handleCopy = useCallback((m) => {
    const text = m.content || (m.attachments?.join("\n")) || "";
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(m.id);
      toast.success("Đã sao chép!");
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const confirmDeleteMessage = useCallback((m) => {
    if (!isSuperAdmin) return;
    setDeleteConfirm({ type: "msg", target: m });
  }, [isSuperAdmin]);

  const confirmDeleteConversation = useCallback(() => {
    if (!isSuperAdmin || !currentConv) return;
    setDeleteConfirm({ type: "conv", target: currentConv });
  }, [isSuperAdmin, currentConv]);

  // "Bắt đầu cuộc trò chuyện mới" cho khách - KHÔNG giới hạn isSuperAdmin
  // (khác nút Xóa ở trên): hành động này không phá huỷ dữ liệu, lịch sử cũ
  // vẫn nguyên vẹn để admin tra cứu (chỉ ẩn phía khách) - xem
  // requestCskhSessionReset() (supabaseDb.js) + applyAdminRequestedReset()
  // (cskhConversation.js, phía Support.jsx tự đọc/áp dụng).
  const confirmResetSession = useCallback(() => {
    if (!currentConv) return;
    setResetSessionConfirm({ userId: currentConv.id, userName: currentConv.userName });
  }, [currentConv]);

  const executeResetSession = useCallback(async () => {
    if (!resetSessionConfirm) return;
    const { userId, userName } = resetSessionConfirm;
    setResetSessionConfirm(null);
    setResettingSession(true);
    try {
      const ok = await requestCskhSessionReset(userId, user?.full_name || user?.email || "Admin");
      if (ok) toast.success(`Đã bắt đầu cuộc trò chuyện mới với ${userName}`);
      else toast.error("Không thể bắt đầu cuộc trò chuyện mới");
    } finally {
      setResettingSession(false);
    }
  }, [resetSessionConfirm, user]);

  const executeDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    const { type, target } = deleteConfirm;
    setDeleteConfirm(null);
    if (type === "msg") {
      setMessages((prev) => prev.filter((m) => m.id !== target.id));
      // currentMessages (mảng thật sự render lên màn hình) hợp nhất "messages"
      // (toàn cục) VỚI conversationPageCache (lịch sử tải qua
      // fetchMessagesPageByUser, giờ khóa theo user_id - xem ghi chú useMemo
      // nhóm hội thoại) - chỉ lọc "messages" ở trên KHÔNG đủ, vì mọi tin
      // nhắn từng hiển thị đều đã được nạp vào conversationPageCache khi mở
      // hội thoại/cuộn lên xem lịch sử cũ. Không dọn ở đây, tin nhắn "đã
      // xóa" vẫn tiếp tục hiển thị vĩnh viễn vì phần cache này không có cơ
      // chế nào khác để loại bỏ nó.
      const uid = target.user_id;
      if (uid) {
        setConversationPageCache((prev) =>
          prev[uid] ? { ...prev, [uid]: prev[uid].filter((m) => m.id !== target.id) } : prev
        );
      }
      try { await base44.entities.Message.delete(target.id); }
      catch { toast.error("Không thể xóa tin nhắn"); }
    } else {
      const ids = target.messages.map((m) => m.id);
      const idSet = new Set(ids);
      setMessages((prev) => prev.filter((m) => !idSet.has(m.id)));
      setConversationPageCache((prev) =>
        prev[target.id] ? { ...prev, [target.id]: prev[target.id].filter((m) => !idSet.has(m.id)) } : prev
      );
      setSelectedUser(null);
      try {
        await Promise.all(ids.map((id) => base44.entities.Message.delete(id)));
        toast.success("Đã xóa toàn bộ hội thoại");
      } catch { toast.error("Không thể xóa hết tin nhắn"); }
    }
  }, [deleteConfirm]);

  const startEditMessage = useCallback((m) => {
    if (!isSuperAdmin) return;
    setEditingId(m.id);
    setEditText(m.content || "");
  }, [isSuperAdmin]);

  const cancelEditMessage = useCallback(() => {
    setEditingId(null);
    setEditText("");
  }, []);

  const saveEditMessage = useCallback(async (m) => {
    const newContent = editText.trim();
    if (!newContent || newContent === m.content) {
      setEditingId(null);
      setEditText("");
      return;
    }
    setEditingId(null);
    setEditText("");
    setMessages((prev) => prev.map((msg) => (msg.id === m.id ? { ...msg, content: newContent } : msg)));
    try {
      // update() ghi Supabase, và Supabase Realtime (base44.entities.Message.
      // subscribe() ở trên) tự đẩy thay đổi tới mọi phiên đang mở, kể cả
      // phía user - không cần đẩy tay đi đâu nữa.
      await base44.entities.Message.update(m.id, { content: newContent });
    } catch {
      setMessages((prev) => prev.map((msg) => (msg.id === m.id ? { ...msg, content: m.content } : msg)));
      toast.error("Không thể sửa tin nhắn");
    }
  }, [editText]);

  const handlePaste = useCallback((e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imgs = items.flatMap((item) =>
      item.type.startsWith("image") ? [item.getAsFile()].filter(Boolean) : []
    );
    if (imgs.length > 0) {
      setFiles((f) => [...f, ...imgs]);
      toast.success(`Đã dán ${imgs.length} ảnh!`);
    }
  }, []);

  const pickFiles = useCallback((e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) setFiles((f) => [...f, ...selected]);
    e.target.value = "";
  }, []);

  const removeFile = useCallback((idx) => setFiles((f) => f.filter((_, i) => i !== idx)), []);

  // Gửi thật (tạo Message trên Postgres) - tách riêng để retryFailedReply()
  // (nút "Gửi lại" trên tin lỗi) tái dùng, không phải upload lại file đã
  // upload thành công trước đó (attachments lúc này đã là URL).
  const sendReply = useCallback(
    // userId = ID THẬT của khách hàng (support_conversations.user_id, khác
    // cid khi khách đã "bắt đầu hội thoại mới" - xem migration
    // cskh_rotating_conversation_id.sql) - PHẢI ghi đúng giá trị này vào
    // messages.user_id, KHÔNG PHẢI cid, vì RLS (messages_select_own_or_admin)
    // của khách check theo user_id: ghi nhầm cid ở đây sẽ khiến khách không
    // đọc được chính tin nhắn admin vừa trả lời cho mình.
    async (cid, content, attachments, userId) => {
      await base44.entities.Message.create({
        sender: "admin",
        conversation_id: cid,
        user_id: userId || cid,
        content,
        attachments: attachments || [],
      });
      // Không tạo thêm Notification "có tin nhắn mới" nữa - tin nhắn admin
      // vừa gửi ở trên đã tự nó là thông báo (hiển thị trực tiếp qua khung
      // chat CSKH real-time), tạo thêm Notification riêng theo user_id chỉ
      // gây trùng lặp và đi ngược quy tắc "chuông chỉ hiện tin chung".
      localStorage.setItem("vinclub_msg_update", Date.now().toString());
      window.dispatchEvent(new CustomEvent("vinclub:msg_update"));
    },
    []
  );

  const handleReply = useCallback(async () => {
    if ((!replyText.trim() && files.length === 0) || !selectedUser || sending) return;
    setSending(true);
    // conversationId = latestConversationId của khách đang mở (proxy cho
    // "hội thoại đang active" phía khách - xem ghi chú useTypingIndicator ở
    // trên), rơi về selectedUser (chính user_id) nếu khách này CHƯA có tin
    // nhắn nào (admin chủ động mở hội thoại mới từ UsersTab/TransactionsTab
    // qua initialSelectedUserId) - cùng quy ước conversation_id=user_id lúc
    // khởi tạo mà trigger reopen_support_conversation_on_customer_message
    // đã dùng cho hội thoại đầu tiên của 1 khách.
    const conversationId = currentConv?.latestConversationId || selectedUser;
    // Admin vừa trả lời nghĩa là hội thoại không còn "chờ phản hồi" nữa -
    // tự chuyển về "open". Không đụng tới "closed" (admin tự đóng có chủ ý,
    // 1 tin nhắn thêm vào sau đó - vd ghi chú - không nên tự ý mở lại) hay
    // "open" (không có gì đổi).
    if (currentConv?.status === "pending") {
      patchConversationStatus(conversationId, { status: "open" });
    }
    const content = replyText.trim();
    setReplyText("");
    clearReplyDraft();
    const pendingFiles = files;
    setFiles([]);

    try {
      const attachments = [];
      for (const file of pendingFiles) {
        try {
          if (file.type?.startsWith("video/") && file.size > LARGE_VIDEO_WARN_BYTES) {
            toast("Video khá nặng, có thể mất thêm thời gian để gửi");
          }
          const toUpload = file.type?.startsWith("image/") ? await compressImageFile(file) : file;
          const res = await base44.integrations.Core.UploadFile({ file: toUpload });
          if (res?.file_url) attachments.push(res.file_url);
        } catch {
          const reader = new FileReader();
          const dataUrl = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
          });
          if (dataUrl) attachments.push(dataUrl);
        }
      }

      // create() tự đẩy tin optimistic (cờ __status:"sending") vào cache cục
      // bộ + notify NGAY, rồi tự cập nhật lại thành sent/failed sau khi biết
      // kết quả ghi Postgres (xem LocalEntityClient.create() trong
      // base44Client.js) - Message.subscribe() ở trên nhận đủ cả 2 lượt
      // notify, KHÔNG cần tự quản lý mảng optimistic riêng nữa (cách làm cũ
      // dễ hiện 2 bubble trùng khi Realtime cũng đẩy tin thật về gần như
      // cùng lúc).
      // userId = selectedUser TRỰC TIẾP - giờ luôn là user_id thật của khách
      // (xem ghi chú useMemo nhóm hội thoại ở trên), không cần tra ngược qua
      // supportConvMap/usersMap như trước (đúng chỗ trước đây có thể lấy
      // nhầm giá trị nếu selectedUser là 1 conversation_id đã rotate không
      // khớp khóa nào trong 2 map đó, khiến userId cuối cùng rơi về "cid" -
      // 1 conversation_id giả làm user_id - và tin admin gửi ra không bao
      // giờ tới đúng khách theo RLS).
      await sendReply(conversationId, content, attachments, selectedUser);
    } catch {
      toast.error("Không thể gửi phản hồi");
    } finally {
      setSending(false);
    }
  }, [replyText, files, selectedUser, sending, currentConv, patchConversationStatus, sendReply, clearReplyDraft]);

  // Tin lỗi (message.__status === "failed") được GIỮ LẠI trên màn hình kèm
  // nút "Gửi lại" thay vì bị xoá như cách làm cũ.
  const retryFailedReply = useCallback(
    (failedMsg) => {
      setMessages((prev) => prev.filter((m) => m.id !== failedMsg.id));
      sendReply(
        failedMsg.conversation_id,
        failedMsg.content,
        failedMsg.attachments,
        failedMsg.user_id || supportConvMap[failedMsg.conversation_id]?.user_id
      ).catch(() => {
        toast.error("Không thể gửi lại tin nhắn. Vui lòng thử lại.");
      });
    },
    [sendReply, supportConvMap]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleReply();
      }
    },
    [handleReply]
  );

  const totalUnread = useMemo(() => convList.reduce((s, c) => s + c.unread, 0), [convList]);

  // ── Loading ──────────────────────────────────────────────────────
  if (loading)
    return (
      <div className="bg-white rounded-2xl p-10 text-center text-gray-400 border border-gray-100 shadow-xs">
        <Loader2 className="w-7 h-7 animate-spin mx-auto mb-2 text-[#948154]" />
        <p className="text-[12px] font-medium">Đang kết nối hệ thống CSKH thời gian thực...</p>
      </div>
    );

  // ── Empty state ──────────────────────────────────────────────────
  if (convList.length === 0)
    return (
      <div className="bg-white rounded-2xl p-10 text-center border border-gray-100 shadow-xs">
        <MessageSquare className="w-10 h-10 text-[#948154]/30 mx-auto mb-3" />
        <p className="text-[13px] font-bold text-gray-500">Chưa có tin nhắn hỗ trợ</p>
        <p className="text-[11px] text-gray-400 mt-1">Tin nhắn từ người dùng sẽ xuất hiện tại đây theo thời gian thực</p>
      </div>
    );

  // ── Chat detail view ─────────────────────────────────────────────
  if (currentConv) {
    return (
      <div className="flex flex-col gap-2.5" style={{ height: "calc(100vh - 200px)", minHeight: 460 }}>
        {/* Back + header */}
        <div className="bg-white rounded-2xl px-3.5 py-2.5 shadow-xs border border-gray-100 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setSelectedUser(null)}
                className="flex items-center gap-1 text-[11px] text-[#948154] font-bold hover:underline cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>CSKH</span>
              </button>
              <div className="w-px h-4 bg-gray-200" />
              <Avatar name={currentConv.userName} size="sm" />
              <div>
                <p className="text-[12px] font-bold text-black flex items-center gap-1">
                  {currentConv.userName}
                  <UserCheck className="w-3.5 h-3.5 text-blue-500" />
                </p>
                <p className="text-[9.5px] text-gray-400">{currentConv.userEmail}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {lastUpdate && (
                <span className="text-[9px] text-gray-400 flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  {fmtTime(new Date(lastUpdate).toISOString())}
                </span>
              )}
              <span
                className={`text-[8.5px] px-2 py-0.5 rounded-full font-bold ${
                  connStatus && connStatus !== "SUBSCRIBED"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {connStatus && connStatus !== "SUBSCRIBED" ? "● Đang kết nối lại..." : "● Realtime"}
              </span>
              <button
                onClick={confirmResetSession}
                disabled={resettingSession}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-[#948154]/10 hover:bg-[#948154]/20 text-[#948154] transition-colors cursor-pointer disabled:opacity-50"
                title="Bắt đầu cuộc trò chuyện mới cho khách"
              >
                {resettingSession ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
              </button>
              {isSuperAdmin && (
                <button
                  onClick={confirmDeleteConversation}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-red-50 hover:bg-red-100 text-red-600 transition-colors cursor-pointer"
                  title="Xóa toàn bộ hội thoại"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Ticket: trạng thái + người phụ trách */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-gray-50">
            <span
              className={`text-[9px] font-bold px-2 py-1 rounded-full ${SUPPORT_STATUS_BADGE_CLASSES[currentConv.status] || SUPPORT_STATUS_BADGE_CLASSES.open}`}
            >
              {SUPPORT_STATUS_LABELS[currentConv.status] || currentConv.status}
            </span>
            <select
              value={currentConv.priority}
              onChange={(e) => changeConvPriority(currentConv.latestConversationId, e.target.value)}
              className={`text-[9px] font-bold border-none rounded-full px-2 py-1 focus:outline-none cursor-pointer ${PRIORITY_BADGE_CLASSES[currentConv.priority] || PRIORITY_BADGE_CLASSES.normal}`}
            >
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {currentConv.assignedAdminName ? (
              <span className="text-[9px] text-gray-500 font-medium px-2 py-1 rounded-full bg-gray-50 border border-gray-100">
                Đang xử lý: <span className="text-black font-bold">{currentConv.assignedAdminName}</span>
              </span>
            ) : (
              <button
                onClick={() => assignToSelf(currentConv.latestConversationId)}
                className="text-[9px] font-bold px-2.5 py-1 rounded-full bg-[#948154] text-white hover:bg-[#7a6c44] transition-colors cursor-pointer"
              >
                Nhận xử lý
              </button>
            )}
            <select
              value={currentConv.status}
              onChange={(e) => changeConvStatus(currentConv.latestConversationId, e.target.value)}
              className="ml-auto text-[9.5px] border border-gray-200 rounded-full px-2 py-1 focus:outline-none focus:border-[#948154] cursor-pointer"
            >
              <option value="open">Đang mở</option>
              <option value="pending">Chờ phản hồi</option>
              <option value="closed">Đã đóng</option>
            </select>
          </div>
        </div>

        {/* Messages scroll area - KHÔNG dùng class "scroll-smooth": class này
            khiến MỌI thay đổi scrollTop tự chạy hoạt ảnh trượt, kể cả lượt
            gán scrollTop TRỰC TIẾP trong useLayoutEffect bên dưới (khôi phục
            đúng vị trí cuộn ngay sau khi chèn thêm tin CŨ vào đầu danh sách)
            vốn PHẢI tức thời mới đúng, gây cảm giác khung chat "giật/nhảy"
            mỗi lần cuộn lên xem lịch sử cũ (cùng lỗi vừa sửa ở Support.jsx
            phía khách). Cuộn mượt khi có tin mới vẫn giữ nguyên qua
            scrollTo({behavior:"smooth"}) ở nơi gọi tương ứng. */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 bg-white rounded-2xl p-4 shadow-xs border border-gray-100 space-y-3 overflow-y-auto"
          style={{ overscrollBehavior: "contain" }}
        >
          {currentMessages.length === 0 && (
            <p className="text-center text-[11px] text-gray-400 py-4">Chưa có tin nhắn trong hội thoại này</p>
          )}
          {currentMessages.map((m, idx) => {
            // Vạch ngăn cách "khách quay lại sau X" - đối chiếu đúng ngưỡng
            // cskhConversation.js dùng để tự rotate conversation_id
            // (CSKH_AWAY_THRESHOLD_MS). Admin trước đây chỉ thấy 1 dòng
            // tin nhắn liền mạch dù thực ra khách đã rời đi rất lâu giữa 2
            // tin, không có cách nào phân biệt "khách chat liên tục" với
            // "khách quay lại sau nhiều ngày" chỉ bằng cách nhìn timestamp
            // từng dòng.
            const prev = idx > 0 ? currentMessages[idx - 1] : null;
            const gapMs = prev
              ? new Date(m.created_date || 0).getTime() - new Date(prev.created_date || 0).getTime()
              : 0;
            const showGapDivider = prev && gapMs >= CSKH_AWAY_THRESHOLD_MS;

            return (
            <React.Fragment key={m.id}>
              {showGapDivider && (
                <div className="flex items-center gap-2 py-1">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-[9px] font-bold text-gray-400 whitespace-nowrap">
                    Khách quay lại sau {formatGapLabel(gapMs)}
                  </span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
              )}
            <MessageBubble
              m={m}
              isAdmin={m.sender === "admin"}
              senderName={currentConv.userName}
              isSuperAdmin={isSuperAdmin}
              copiedId={copiedId}
              onCopy={handleCopy}
              onDelete={confirmDeleteMessage}
              onPreview={setPreviewImage}
              isEditing={editingId === m.id}
              editText={editText}
              onEditChange={setEditText}
              onStartEdit={startEditMessage}
              onSaveEdit={saveEditMessage}
              onCancelEdit={cancelEditMessage}
              status={deriveMessageStatus(m, m.sender === "admin")}
              onRetry={m.sender === "admin" && m.__status === "failed" ? () => retryFailedReply(m) : undefined}
            />
            </React.Fragment>
            );
          })}

          {/* Typing indicator - "Khách đang nhập..." */}
          {peerTyping && (
            <div className="flex justify-start">
              <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-bl-sm px-3 py-2 text-[10.5px] text-gray-400 italic">
                Khách đang nhập...
              </div>
            </div>
          )}
        </div>

        {/* Reply Input */}
        <div className="relative bg-white rounded-2xl p-2.5 shadow-xs border border-gray-100 space-y-2">
          {files.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {files.map((f, i) => {
                const t = f.type || "";
                const isImage = t.startsWith("image/");
                const isVideo = t.startsWith("video/");
                return (
                  <div key={i} className="relative w-12 h-12 rounded-lg border overflow-hidden bg-gray-50 shrink-0 flex items-center justify-center">
                    {isImage ? (
                      <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                    ) : isVideo ? (
                      <Film className="w-5 h-5 text-[#948154]" />
                    ) : (
                      <FileText className="w-5 h-5 text-[#948154]" />
                    )}
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute top-0.5 right-0.5 bg-black/70 text-white p-0.5 rounded-full cursor-pointer"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-end gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,.pdf,.doc,.docx,.txt,.log"
              className="hidden"
              onChange={pickFiles}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
              title="Gửi ảnh/video/tệp đính kèm"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <div ref={templatesRef} className="relative shrink-0">
              <button
                onClick={() => setShowTemplates((v) => !v)}
                className={`w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-colors ${
                  showTemplates ? "bg-[#948154] text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                }`}
                title="Chèn mẫu tin nhắn"
              >
                <MessageSquareText className="w-4 h-4" />
              </button>

              {showTemplates && (
                <div className="absolute bottom-full left-0 mb-2 w-64 max-h-64 overflow-y-auto bg-white rounded-xl border border-gray-200 shadow-xl z-30 py-1">
                  {QUICK_REPLY_TEMPLATES.map((t, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setReplyText(t.text);
                        setShowTemplates(false);
                        textareaRef.current?.focus();
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-b-0"
                    >
                      <p className="text-[10.5px] font-bold text-black">{t.label}</p>
                      <p className="text-[9.5px] text-gray-400 line-clamp-1">{t.text}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <textarea
              ref={textareaRef}
              value={replyText}
              onChange={(e) => {
                setReplyText(e.target.value);
                notifyTyping();
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Nhập phản hồi CSKH… (Enter gửi · Shift+Enter xuống dòng · Dán ảnh)"
              rows={1}
              className="flex-1 py-2 px-3 rounded-xl border border-gray-200 text-[11.5px] focus:outline-none focus:border-[#948154] resize-none max-h-28 leading-relaxed transition-colors"
            />

            <button
              onClick={handleReply}
              disabled={sending || (!replyText.trim() && files.length === 0)}
              className="w-9 h-9 rounded-xl bg-[#948154] hover:bg-[#7a6c44] disabled:opacity-40 text-white flex items-center justify-center shrink-0 shadow-sm transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Lightbox */}
        {previewImage && (
          <div
            className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4"
            onClick={() => setPreviewImage(null)}
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 text-white rounded-full cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewImage}
              alt=""
              onClick={(e) => e.stopPropagation()}
              className="max-w-[90vw] max-h-[88vh] object-contain rounded-xl shadow-2xl"
            />
          </div>
        )}

        {/* Delete Confirm Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
            <div className="bg-white rounded-3xl p-5 max-w-xs w-full shadow-2xl space-y-4 border border-red-100">
              <h3 className="text-[13px] font-bold text-black">
                {deleteConfirm.type === "msg" ? "Xóa tin nhắn?" : `Xóa toàn bộ hội thoại với "${deleteConfirm.target.userName}"?`}
              </h3>
              <p className="text-[11px] text-gray-500">
                {deleteConfirm.type === "msg"
                  ? "Tin nhắn này sẽ bị xóa vĩnh viễn và không thể khôi phục."
                  : `Sẽ xóa ${deleteConfirm.target.messages.length} tin nhắn. Không thể hoàn tác.`}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-[12px] font-bold cursor-pointer transition-colors"
                >
                  Hủy
                </button>
                <button
                  onClick={executeDelete}
                  className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[12px] font-bold shadow-sm cursor-pointer transition-colors"
                >
                  Xóa vĩnh viễn
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reset Session Confirm Modal */}
        {resetSessionConfirm && (
          <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
            <div className="bg-white rounded-3xl p-5 max-w-xs w-full shadow-2xl space-y-4 border border-[#948154]/20">
              <h3 className="text-[13px] font-bold text-black">
                Bắt đầu cuộc trò chuyện mới với "{resetSessionConfirm.userName}"?
              </h3>
              <p className="text-[11px] text-gray-500">
                Khách sẽ không còn thấy lại cuộc trò chuyện hiện tại nữa (lịch sử
                vẫn nguyên vẹn ở đây để bạn tra cứu). Nếu khách đang mở sẵn CSKH,
                màn hình của họ sẽ đổi sang cuộc trò chuyện mới ngay lập tức.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setResetSessionConfirm(null)}
                  className="flex-1 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-[12px] font-bold cursor-pointer transition-colors"
                >
                  Hủy
                </button>
                <button
                  onClick={executeResetSession}
                  className="flex-1 py-2 rounded-xl bg-[#948154] hover:bg-[#7d6c43] text-white text-[12px] font-bold shadow-sm cursor-pointer transition-colors"
                >
                  Bắt đầu mới
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Conversation List ────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[13px] font-black text-black">Hội thoại CSKH</h3>
          <p className="text-[10px] text-gray-400">
            {convList.length} cuộc hội thoại
            {totalUnread > 0 && (
              <span className="ml-1.5 inline-flex items-center gap-0.5 bg-red-100 text-red-700 px-1.5 py-0.2 rounded-full text-[9px] font-bold">
                {totalUnread} chưa đọc
              </span>
            )}
            {lastUpdate && (
              <span className="ml-2 text-[9px] text-emerald-600 font-medium flex-inline items-center gap-0.5">
                ● Đồng bộ {fmtTime(new Date(lastUpdate).toISOString())}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`text-[10px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === f.key ? "bg-[#948154] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Topic filter tabs - chỉ hiện khi có ít nhất 1 hội thoại đã gắn chủ đề */}
      {topicOptions.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          <button
            onClick={() => setTopicFilter("all")}
            className={`text-[9.5px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer ${
              topicFilter === "all" ? "bg-[#948154]/80 text-white" : "bg-amber-50 text-[#948154] hover:bg-amber-100"
            }`}
          >
            Mọi chủ đề
          </button>
          {topicOptions.map((t) => (
            <button
              key={t}
              onClick={() => setTopicFilter(t)}
              className={`text-[9.5px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer ${
                topicFilter === t ? "bg-[#948154]/80 text-white" : "bg-amber-50 text-[#948154] hover:bg-amber-100"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {filteredConvList.length === 0 && (
          <p className="text-center text-[11px] text-gray-400 py-6">Không có hội thoại nào ở trạng thái này</p>
        )}
        {filteredConvList.map((c) => {
          const lastMsg = c.messages[c.messages.length - 1];
          const preview = lastMsg?.content || (lastMsg?.attachments?.length > 0 ? "📎 Tệp đính kèm" : "—");
          return (
            <button
              key={c.id}
              onClick={() => openConversation(c.id)}
              className={`w-full bg-white rounded-2xl px-4 py-3 shadow-xs border flex items-center gap-3 hover:border-[#948154]/40 hover:shadow-sm transition-all text-left group cursor-pointer ${
                c.unread > 0 ? "border-amber-300 bg-amber-50/30" : "border-gray-100"
              }`}
            >
              <div className="relative shrink-0">
                <div className="w-11 h-11 rounded-full bg-[#948154]/10 text-[#948154] flex items-center justify-center text-[13px] font-extrabold group-hover:bg-[#948154] group-hover:text-white transition-colors">
                  {(c.userName || "K").charAt(0).toUpperCase()}
                </div>
                {c.unread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[8.5px] font-black flex items-center justify-center border-2 border-white">
                    {c.unread > 9 ? "9+" : c.unread}
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <p className={`text-[12.5px] truncate ${c.unread > 0 ? "font-extrabold text-black" : "font-bold text-gray-800"}`}>
                    {c.userName}
                  </p>
                  <span className="text-[9px] text-gray-400 shrink-0 ml-2">{fmtDate(c.lastDate)}</span>
                </div>
                <p className={`text-[10.5px] truncate ${c.unread > 0 ? "text-black font-semibold" : "text-gray-500"}`}>
                  {lastMsg?.sender === "admin" && <span className="text-[#948154] font-semibold">Admin: </span>}
                  {preview}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  {c.priority !== DEFAULT_PRIORITY && (
                    <span className={`inline-block text-[8.5px] font-bold px-1.5 py-0.2 rounded-full ${PRIORITY_BADGE_CLASSES[c.priority] || PRIORITY_BADGE_CLASSES.normal}`}>
                      {PRIORITY_LABELS[c.priority] || c.priority}
                    </span>
                  )}
                  {c.topic && (
                    <span className="inline-block text-[8.5px] font-bold text-[#948154] bg-amber-50 border border-amber-200/80 px-1.5 py-0.2 rounded-full">
                      {c.topic}
                    </span>
                  )}
                </div>
              </div>

              <div className="shrink-0 flex flex-col items-end gap-1">
                <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-bold">
                  {c.messages.length} tin
                </span>
                <span
                  className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded-full ${SUPPORT_STATUS_BADGE_CLASSES[c.status] || SUPPORT_STATUS_BADGE_CLASSES.open}`}
                >
                  {SUPPORT_STATUS_LABELS[c.status] || c.status}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
