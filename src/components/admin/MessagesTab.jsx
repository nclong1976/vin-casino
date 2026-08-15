import React, { useState, useEffect, useRef } from "react";
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
  Trash2
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

export default function MessagesTab() {
  const { user } = useAuth();
  const isSuperAdmin = !!user?.is_super_admin;
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  const fetchData = async () => {
    try {
      const [msgs, usrs, supaUsrs] = await Promise.all([
        base44.entities.Message.list("-created_date", 300).catch(() => []),
        base44.entities.User.list().catch(() => []),
        listSupabaseUsers().catch(() => []),
      ]);
      const mergedUserMap = {};
      (Array.isArray(usrs) ? usrs : []).forEach((u) => {
        if (u && (u.id || u.email)) mergedUserMap[u.id || u.email] = u;
      });
      (Array.isArray(supaUsrs) ? supaUsrs : []).forEach((su) => {
        if (su && (su.id || su.email)) {
          mergedUserMap[su.id || su.email] = { ...(mergedUserMap[su.id || su.email] || {}), ...su };
        }
      });
      setMessages(Array.isArray(msgs) ? msgs : []);
      setUsers(Object.values(mergedUserMap));
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Real-time subscription & polling via Firebase Realtime Database
    let unsubRTDB;
    import('@/lib/rtdbSync').then(({ subscribeMessagesFromRTDB }) => {
      unsubRTDB = subscribeMessagesFromRTDB(() => {
        fetchData();
      });
    }).catch(() => null);

    const unsub = base44.entities.Message.subscribe(() => {
      fetchData();
    });

    const interval = setInterval(fetchData, 2000);

    const handleStorageChange = (e) => {
      if (e.key === "vinclub_msg_update") {
        fetchData();
      }
    };
    window.addEventListener("storage", handleStorageChange);

    return () => {
      if (typeof unsubRTDB === "function") unsubRTDB();
      unsub();
      clearInterval(interval);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  // Auto scroll message list in admin view
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, selectedUser]);

  // Auto height for reply textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 100)}px`;
    }
  }, [replyText]);

  // Group messages into conversations
  const conversations = {};
  (Array.isArray(messages) ? messages : []).forEach((m) => {
    if (!m) return;
    const rawCid = m.conversation_id || m.user_id || m.sender || "unknown";
    const cid = String(rawCid);
    if (!conversations[cid]) {
      const u = (Array.isArray(users) ? users : []).find(
        (x) => x && (x.id === rawCid || String(x.id) === cid)
      );
      conversations[cid] = {
        id: cid,
        userName: u?.full_name || u?.email || (cid && cid !== "unknown" ? `Khách #${cid.slice(0, 6)}` : "Khách"),
        userEmail: u?.email || "Chưa có email",
        userPhone: u?.phone_number || "",
        messages: [],
        lastDate: m.created_date || new Date().toISOString(),
        unread: 0,
      };
    }
    conversations[cid].messages.push(m);
    if (m.sender === "user" && !m.is_read) conversations[cid].unread++;
  });

  // Sort conversations by latest message date
  const convList = Object.values(conversations).sort(
    (a, b) => new Date(b.lastDate) - new Date(a.lastDate)
  );

  const currentConv = selectedUser ? conversations[selectedUser] : null;

  // Mở hội thoại: đánh dấu đã đọc toàn bộ tin nhắn chưa đọc của user này
  const openConversation = async (cid) => {
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
    } catch (e) {}
  };

  // Sorted chronological messages for selected user
  const currentMessages = currentConv
    ? [...currentConv.messages].sort(
        (a, b) => new Date(a.created_date) - new Date(b.created_date)
      )
    : [];

  const handleCopy = (m) => {
    const textToCopy = m.content || (m.attachments && m.attachments.join("\n")) || "";
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedId(m.id);
      toast.success("Đã sao chép nội dung!");
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleDeleteMessage = async (m) => {
    if (!isSuperAdmin) return;
    if (!window.confirm("Xóa tin nhắn này? Hành động không thể hoàn tác.")) return;
    setMessages((prev) => prev.filter((msg) => msg.id !== m.id));
    try {
      await base44.entities.Message.delete(m.id);
    } catch (e) {
      toast.error("Không thể xóa tin nhắn");
      fetchData();
    }
  };

  const handleDeleteConversation = async () => {
    if (!isSuperAdmin || !currentConv) return;
    if (!window.confirm(`Xóa toàn bộ ${currentConv.messages.length} tin nhắn với ${currentConv.userName}? Hành động không thể hoàn tác.`)) return;
    const idsToDelete = currentConv.messages.map((m) => m.id);
    setMessages((prev) => prev.filter((msg) => !idsToDelete.includes(msg.id)));
    setSelectedUser(null);
    try {
      await Promise.all(idsToDelete.map((id) => base44.entities.Message.delete(id)));
      toast.success("Đã xóa toàn bộ hội thoại");
    } catch (e) {
      toast.error("Không thể xóa hết tin nhắn");
      fetchData();
    }
  };

  const handlePaste = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const pastedImages = [];
    items.forEach((item) => {
      if (item.type.indexOf("image") !== -1) {
        const file = item.getAsFile();
        if (file) pastedImages.push(file);
      }
    });
    if (pastedImages.length > 0) {
      setFiles((f) => [...f, ...pastedImages]);
      toast.success(`Đã dán ${pastedImages.length} ảnh từ Clipboard!`);
    }
  };

  const pickFiles = (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) {
      setFiles((f) => [...f, ...selected]);
    }
    e.target.value = "";
  };

  const removeFile = (idx) => setFiles((f) => f.filter((_, i) => i !== idx));

  const handleReply = async () => {
    if ((!replyText.trim() && files.length === 0) || !selectedUser || sending) return;
    setSending(true);
    try {
      const attachments = [];
      for (const file of files) {
        try {
          const res = await base44.integrations.Core.UploadFile({ file });
          if (res?.file_url) attachments.push(res.file_url);
        } catch (err) {
          const reader = new FileReader();
          const dataUrl = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
          });
          if (dataUrl) attachments.push(dataUrl);
        }
      }

      await base44.entities.Message.create({
        sender: "admin",
        conversation_id: selectedUser,
        user_id: selectedUser,
        content: replyText.trim(),
        attachments,
      });

      // Send real-time notification to User flow
      try {
        await base44.entities.Notification.create({
          title: "Phản hồi mới từ Chăm sóc Khách hàng VinClub",
          content: replyText.trim() || "Quản trị viên đã gửi tệp đính kèm mới.",
          type: "system",
          user_id: selectedUser,
          is_read: false,
        });
      } catch (e) {}

      localStorage.setItem("vinclub_msg_update", Date.now().toString());

      setReplyText("");
      setFiles([]);
      await fetchData();
      toast.success("Đã gửi phản hồi CSKH");
    } catch (e) {
      toast.error("Không thể gửi phản hồi");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleReply();
    }
  };

  if (loading)
    return <div className="text-center py-8 text-[12px] text-gray-400 font-medium">Đang tải cuộc trò chuyện CSKH...</div>;

  if (convList.length === 0)
    return (
      <div className="bg-white rounded-2xl p-8 text-center text-[12px] text-gray-400 shadow-2xs border border-gray-100">
        <MessageSquare className="w-8 h-8 text-[#948154]/40 mx-auto mb-2" />
        Chưa có tin nhắn hỗ trợ từ người dùng
      </div>
    );

  // Detail Chat Screen
  if (currentConv) {
    return (
      <div className="space-y-2.5">
        <button
          onClick={() => setSelectedUser(null)}
          className="flex items-center gap-1 text-[11px] text-[#948154] font-bold hover:underline"
        >
          <ChevronLeft className="w-4 h-4" /> Danh sách hội thoại CSKH
        </button>

        {/* User Header */}
        <div className="bg-white rounded-2xl p-3 shadow-2xs border border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#948154] text-white font-bold flex items-center justify-center text-[12px]">
              {(currentConv.userName || "K").charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-[12px] font-bold text-black flex items-center gap-1">
                {currentConv.userName} <UserCheck className="w-3.5 h-3.5 text-blue-600" />
              </p>
              <p className="text-[9.5px] text-gray-400">{currentConv.userEmail}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[8.5px] bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-bold">
              Trực tuyến
            </span>
            {isSuperAdmin && (
              <button
                onClick={handleDeleteConversation}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                title="Xóa toàn bộ hội thoại (Super Admin)"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Chat Messages */}
        <div
          ref={scrollRef}
          className="bg-white rounded-2xl p-3 shadow-2xs border border-gray-100 space-y-2.5 max-h-[380px] overflow-y-auto"
        >
          {currentMessages.map((m) => {
            const isAdmin = m.sender === "admin";
            return (
              <div
                key={m.id || Math.random()}
                className={`flex ${isAdmin ? "justify-end" : "justify-start"} group relative`}
              >
                <div className={`max-w-[80%] flex flex-col ${isAdmin ? "items-end" : "items-start"}`}>
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-[8.5px] font-bold text-gray-400">
                      {isAdmin ? "Admin" : currentConv.userName}
                    </span>
                    <button
                      onClick={() => handleCopy(m)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-black transition-opacity"
                      title="Sao chép"
                    >
                      {copiedId === m.id ? (
                        <Check className="w-3 h-3 text-green-600" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                    {isSuperAdmin && (
                      <button
                        onClick={() => handleDeleteMessage(m)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-600 transition-opacity"
                        title="Xóa tin nhắn (Super Admin)"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div
                    className={`rounded-2xl p-2.5 text-[11.5px] shadow-2xs ${
                      isAdmin
                        ? "bg-[#948154] text-white rounded-br-xs"
                        : "bg-gray-100 text-black rounded-bl-xs border border-gray-200/80"
                    }`}
                  >
                    {m.content && (
                      <p className="whitespace-pre-wrap break-words leading-relaxed font-medium">
                        {m.content}
                      </p>
                    )}

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
                                  onClick={() => setPreviewImage(url)}
                                  className="w-full max-h-48 object-cover cursor-pointer hover:scale-[1.02] transition-transform"
                                />
                                <button
                                  onClick={() => setPreviewImage(url)}
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
                              className="flex items-center gap-1.5 text-[10px] underline p-1 bg-black/5 rounded-lg"
                            >
                              <FileText className="w-3.5 h-3.5" /> Tập tin đính kèm
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <span className="text-[8px] text-gray-400 mt-0.5">
                    {new Date(m.created_date || Date.now()).toLocaleTimeString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Admin Input Bar */}
        <div className="bg-white rounded-2xl p-2 shadow-2xs border border-gray-100 space-y-1.5">
          {files.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {files.map((f, i) => (
                <div key={i} className="relative w-12 h-12 rounded-lg border overflow-hidden bg-gray-50 flex items-center justify-center shrink-0">
                  <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeFile(i)}
                    className="absolute top-0.5 right-0.5 bg-black/70 text-white p-0.5 rounded-full"
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
              className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center shrink-0"
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
              placeholder="Nhập phản hồi CSKH (Enter để gửi, Shift+Enter xuống dòng, dán ảnh)..."
              rows={1}
              className="flex-1 py-1.5 px-2.5 rounded-xl border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154] resize-none max-h-24 leading-relaxed font-sans"
            />

            <button
              onClick={handleReply}
              disabled={sending || (!replyText.trim() && files.length === 0)}
              className="w-8 h-8 rounded-xl bg-[#948154] hover:bg-[#837046] disabled:opacity-40 text-white flex items-center justify-center shrink-0 shadow-xs"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Lightbox Modal */}
        {previewImage && (
          <div
            className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3"
            onClick={() => setPreviewImage(null)}
          >
            <div className="relative max-w-full max-h-full">
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
              <img
                src={previewImage}
                alt=""
                className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl"
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Conversation List Screen
  return (
    <div className="space-y-2">
      {convList.map((c) => (
        <button
          key={c.id}
          onClick={() => openConversation(c.id)}
          className={`w-full bg-white rounded-2xl p-3 shadow-2xs border flex items-center gap-2.5 hover:border-[#948154]/40 transition-all text-left group ${
            c.unread > 0 ? "border-red-200 bg-red-50/20" : "border-gray-100"
          }`}
        >
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-full bg-[#948154]/10 text-[#948154] flex items-center justify-center text-[12px] font-extrabold group-hover:bg-[#948154] group-hover:text-white transition-colors">
              {(c.userName || "K").charAt(0).toUpperCase()}
            </div>
            {c.unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center border-2 border-white animate-pulse">
                {c.unread > 9 ? "9+" : c.unread}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className={`text-[12px] truncate ${c.unread > 0 ? "font-extrabold text-black" : "font-bold text-black"}`}>{c.userName}</p>
              <span className="text-[8.5px] text-gray-400">
                {new Date(c.lastDate).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <p className={`text-[10px] truncate mt-0.5 ${c.unread > 0 ? "text-black font-semibold" : "text-gray-500"}`}>
              {c.messages[c.messages.length - 1]?.content || "Đã gửi hình ảnh/tệp đính kèm"}
            </p>
          </div>
          <div className="text-right shrink-0 flex flex-col items-end">
            <span className="text-[9px] bg-amber-50 text-[#948154] px-1.5 py-0.5 rounded-full font-bold border border-amber-200">
              {c.messages.length} tin
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
