import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  Send,
  ChevronLeft,
  MessageSquare,
  Paperclip,
  Copy,
  Check,
  Maximize2,
  X,
  FileText,
  UserCheck,
  Trash2,
  Loader2,
  RefreshCw,
  Clock,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { listSupabaseUsers } from "@/lib/supabaseDb";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";

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
const MessageBubble = React.memo(({ m, isAdmin, senderName, isSuperAdmin, onCopy, onDelete, copiedId, onPreview }) => (
  <div className={`flex ${isAdmin ? "justify-end" : "justify-start"} group`}>
    <div className={`max-w-[78%] flex flex-col ${isAdmin ? "items-end" : "items-start"}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[8.5px] font-bold text-gray-400">{isAdmin ? "Admin CSKH" : senderName}</span>
        <button
          onClick={() => onCopy(m)}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-black transition-opacity"
          title="Sao chép"
        >
          {copiedId === m.id ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
        </button>
        {isSuperAdmin && (
          <button
            onClick={() => onDelete(m)}
            className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-600 transition-opacity"
            title="Xóa tin nhắn"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

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
                  <div key={i} className="relative group/img overflow-hidden rounded-xl border border-black/10">
                    <img
                      src={url}
                      alt=""
                      loading="lazy"
                      onClick={() => onPreview(url)}
                      className="w-full max-h-48 object-cover cursor-pointer hover:scale-[1.02] transition-transform"
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

      <span className="text-[8px] text-gray-400 mt-0.5">{fmtTime(m.created_date)}</span>
    </div>
  </div>
));

// ─── Main Component ───────────────────────────────────────────────
export default function MessagesTab() {
  const { user } = useAuth();
  const isSuperAdmin = !!user?.is_super_admin;

  const [messages, setMessages] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // {type: 'msg'|'conv', target}

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const prevMsgCountRef = useRef(0);
  const prevConvRef = useRef(null);

  // ── Load users once ─────────────────────────────────────────────
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const [usrs, supaUsrs] = await Promise.all([
          base44.entities.User.list().catch(() => []),
          listSupabaseUsers().catch(() => []),
        ]);
        const map = {};
        (Array.isArray(usrs) ? usrs : []).forEach((u) => {
          if (u?.id) map[u.id] = u;
          if (u?.email) map[u.email] = u;
        });
        (Array.isArray(supaUsrs) ? supaUsrs : []).forEach((su) => {
          if (!su) return;
          const key = su.id || su.email;
          if (key) map[key] = { ...(map[key] || {}), ...su };
        });
        setUsersMap(map);
      } catch {}
    };
    loadUsers();
  }, []);

  // ── Realtime messages via RTDB (no polling, push-only) ──────────
  useEffect(() => {
    let unsubRTDB;
    let unsubBase44;

    const applyMessages = (msgList) => {
      if (!Array.isArray(msgList)) return;
      setMessages(msgList);
      setLastUpdate(Date.now());
      setLoading(false);
    };

    // Primary: Firebase RTDB push (instant, true realtime)
    import("@/lib/rtdbSync")
      .then(({ subscribeMessagesFromRTDB }) => {
        unsubRTDB = subscribeMessagesFromRTDB((rtdbMsgList) => {
          if (Array.isArray(rtdbMsgList) && rtdbMsgList.length > 0) {
            applyMessages(rtdbMsgList);
          } else {
            // RTDB empty → fall back to base44 cache
            const raw = localStorage.getItem("base44_entity_Message");
            const cached = raw ? JSON.parse(raw) : [];
            applyMessages(cached);
          }
        });
      })
      .catch(() => null);

    // Fallback: base44 entity subscription for non-RTDB environments
    unsubBase44 = base44.entities.Message.subscribe(() => {
      const raw = localStorage.getItem("base44_entity_Message");
      const cached = raw ? JSON.parse(raw) : [];
      applyMessages(cached);
    });

    // Bootstrap from cache immediately to avoid blank loading state
    const raw = localStorage.getItem("base44_entity_Message");
    if (raw) {
      try {
        applyMessages(JSON.parse(raw));
      } catch {}
    }

    // One-time initial fetch from API
    base44.entities.Message.list("-created_date", 300)
      .then((msgs) => {
        if (Array.isArray(msgs) && msgs.length > 0) applyMessages(msgs);
        else setLoading(false);
      })
      .catch(() => setLoading(false));

    const handleStorage = (e) => {
      if (e.key === "vinclub_msg_update") {
        const raw = localStorage.getItem("base44_entity_Message");
        if (raw) {
          try { applyMessages(JSON.parse(raw)); } catch {}
        }
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      if (typeof unsubRTDB === "function") unsubRTDB();
      if (typeof unsubBase44 === "function") unsubBase44();
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
    const count = messages.filter(
      (m) => (m.conversation_id || m.user_id) === selectedUser
    ).length;
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
  const { conversations, convList } = useMemo(() => {
    const convMap = {};
    (Array.isArray(messages) ? messages : []).forEach((m) => {
      if (!m) return;
      const cid = String(m.conversation_id || m.user_id || m.sender || "unknown");
      if (!convMap[cid]) {
        const u = usersMap[cid] || usersMap[m.user_id] || null;
        convMap[cid] = {
          id: cid,
          userName: u?.full_name || u?.name || u?.email || (cid !== "unknown" ? `Khách #${cid.slice(0, 6)}` : "Khách"),
          userEmail: u?.email || "—",
          messages: [],
          lastDate: m.created_date || new Date().toISOString(),
          unread: 0,
        };
      }
      convMap[cid].messages.push(m);
      if (m.sender === "user" && !m.is_read) convMap[cid].unread++;
      if (m.created_date > convMap[cid].lastDate) convMap[cid].lastDate = m.created_date;
    });

    const list = Object.values(convMap).sort(
      (a, b) => new Date(b.lastDate) - new Date(a.lastDate)
    );
    return { conversations: convMap, convList: list };
  }, [messages, usersMap]);

  const currentConv = selectedUser ? conversations[selectedUser] : null;

  const currentMessages = useMemo(
    () =>
      currentConv
        ? [...currentConv.messages].sort(
            (a, b) => new Date(a.created_date) - new Date(b.created_date)
          )
        : [],
    [currentConv]
  );

  // ── Handlers ─────────────────────────────────────────────────────
  const openConversation = useCallback(
    async (cid) => {
      setSelectedUser(cid);
      const conv = conversations[cid];
      if (!conv) return;
      const unreadMsgs = conv.messages.filter((m) => m.sender === "user" && !m.is_read);
      if (unreadMsgs.length === 0) return;
      try {
        await base44.entities.Message.bulkUpdate(
          unreadMsgs.map((m) => ({ id: m.id, is_read: true }))
        );
        setMessages((prev) =>
          prev.map((m) => (unreadMsgs.some((u) => u.id === m.id) ? { ...m, is_read: true } : m))
        );
      } catch {}
    },
    [conversations]
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

  const executeDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    const { type, target } = deleteConfirm;
    setDeleteConfirm(null);
    if (type === "msg") {
      setMessages((prev) => prev.filter((m) => m.id !== target.id));
      try { await base44.entities.Message.delete(target.id); }
      catch { toast.error("Không thể xóa tin nhắn"); }
    } else {
      const ids = target.messages.map((m) => m.id);
      setMessages((prev) => prev.filter((m) => !ids.includes(m.id)));
      setSelectedUser(null);
      try {
        await Promise.all(ids.map((id) => base44.entities.Message.delete(id)));
        toast.success("Đã xóa toàn bộ hội thoại");
      } catch { toast.error("Không thể xóa hết tin nhắn"); }
    }
  }, [deleteConfirm]);

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

  const handleReply = useCallback(async () => {
    if ((!replyText.trim() && files.length === 0) || !selectedUser || sending) return;
    setSending(true);
    const optimisticMsg = {
      id: `optimistic_${Date.now()}`,
      sender: "admin",
      conversation_id: selectedUser,
      user_id: selectedUser,
      content: replyText.trim(),
      attachments: [],
      created_date: new Date().toISOString(),
      is_read: true,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setReplyText("");
    setFiles([]);

    try {
      const attachments = [];
      for (const file of files) {
        try {
          const res = await base44.integrations.Core.UploadFile({ file });
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

      const created = await base44.entities.Message.create({
        sender: "admin",
        conversation_id: selectedUser,
        user_id: selectedUser,
        content: optimisticMsg.content,
        attachments,
      });

      // Replace optimistic with real
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticMsg.id ? { ...optimisticMsg, ...created, attachments } : m))
      );

      try {
        await base44.entities.Notification.create({
          title: "Phản hồi mới từ Chăm sóc Khách hàng VinClub",
          content: optimisticMsg.content || "Quản trị viên đã gửi tệp đính kèm mới.",
          type: "system",
          user_id: selectedUser,
          is_read: false,
        });
      } catch {}

      localStorage.setItem("vinclub_msg_update", Date.now().toString());
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      toast.error("Không thể gửi phản hồi");
    } finally {
      setSending(false);
    }
  }, [replyText, files, selectedUser, sending]);

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
        <div className="bg-white rounded-2xl px-3.5 py-2.5 shadow-xs border border-gray-100 flex items-center justify-between">
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
            <span className="text-[8.5px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
              ● Realtime
            </span>
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

        {/* Messages scroll area */}
        <div
          ref={scrollRef}
          className="flex-1 bg-white rounded-2xl p-4 shadow-xs border border-gray-100 space-y-3 overflow-y-auto scroll-smooth"
          style={{ overscrollBehavior: "contain" }}
        >
          {currentMessages.length === 0 && (
            <p className="text-center text-[11px] text-gray-400 py-4">Chưa có tin nhắn trong hội thoại này</p>
          )}
          {currentMessages.map((m) => (
            <MessageBubble
              key={m.id}
              m={m}
              isAdmin={m.sender === "admin"}
              senderName={currentConv.userName}
              isSuperAdmin={isSuperAdmin}
              copiedId={copiedId}
              onCopy={handleCopy}
              onDelete={confirmDeleteMessage}
              onPreview={setPreviewImage}
            />
          ))}
          {sending && (
            <div className="flex justify-end">
              <div className="bg-[#948154]/20 text-[#948154] rounded-2xl rounded-br-sm px-3 py-2 text-[11px] flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Đang gửi...</span>
              </div>
            </div>
          )}
        </div>

        {/* Reply Input */}
        <div className="bg-white rounded-2xl p-2.5 shadow-xs border border-gray-100 space-y-2">
          {files.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {files.map((f, i) => (
                <div key={i} className="relative w-12 h-12 rounded-lg border overflow-hidden bg-gray-50 shrink-0">
                  <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeFile(i)}
                    className="absolute top-0.5 right-0.5 bg-black/70 text-white p-0.5 rounded-full cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={pickFiles}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
              title="Gửi ảnh"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <textarea
              ref={textareaRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
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

      {/* List */}
      <div className="space-y-2">
        {convList.map((c) => {
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
              </div>

              <div className="shrink-0 flex flex-col items-end gap-1">
                <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-bold">
                  {c.messages.length} tin
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
