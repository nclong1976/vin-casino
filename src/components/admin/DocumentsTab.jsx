import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Send, Check, X, Search, ChevronDown, ChevronUp } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import CustomDocumentView from "@/components/documents/CustomDocumentView";

const STATUS_CONFIG = {
  pending: { label: "Chờ khách ký", color: "bg-blue-100 text-blue-600" },
  signed: { label: "Chờ duyệt", color: "bg-orange-100 text-orange-600" },
  approved: { label: "Đã duyệt", color: "bg-green-100 text-green-600" },
  rejected: { label: "Từ chối", color: "bg-red-100 text-red-600" },
};

const DOCUMENT_TYPE_SUGGESTIONS = ["Hợp đồng", "Giấy uỷ quyền", "Biên bản thỏa thuận", "Cam kết", "Thông báo"];

/**
 * Soạn 1 hợp đồng/giấy tờ TÙY Ý (không gắn giao dịch đầu tư nào) gửi cho 1
 * khách hàng cụ thể - khách mở app tự ký chữ ký điện tử (xem Document.jsx,
 * route "/document/:id"), rồi Admin quay lại đây duyệt/từ chối - đúng vòng
 * đời giống ContractsTab.jsx (hợp đồng đầu tư tự sinh) nhưng nội dung hoàn
 * toàn do Admin tự gõ (bảng custom_documents, xem migration cùng tên).
 */
export default function DocumentsTab() {
  const { user: adminUser } = useAuth();

  // ── Soạn tài liệu mới ──
  const [users, setUsers] = useState([]);
  const [userQuery, setUserQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserOptions, setShowUserOptions] = useState(false);
  const [documentType, setDocumentType] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(true);

  useEffect(() => {
    base44.entities.User.list("-created_date", 500).then(setUsers).catch(() => {});
  }, []);

  const userMatches = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return [];
    return users
      .filter((u) => {
        const hay = `${u.full_name || ""} ${u.name || ""} ${u.email || ""} ${u.phone || ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [users, userQuery]);

  const resetComposeForm = () => {
    setSelectedUser(null);
    setUserQuery("");
    setDocumentType("");
    setTitle("");
    setContent("");
  };

  const handleSend = async () => {
    if (!selectedUser) {
      toast.error("Vui lòng chọn khách hàng nhận tài liệu");
      return;
    }
    if (!title.trim()) {
      toast.error("Vui lòng nhập tiêu đề tài liệu");
      return;
    }
    if (!content.trim()) {
      toast.error("Vui lòng nhập nội dung tài liệu");
      return;
    }
    setSending(true);
    try {
      const newDoc = await base44.entities.CustomDocument.create({
        user_id: selectedUser.id,
        title: title.trim(),
        document_type: documentType.trim() || "Văn bản",
        content: content.trim(),
        status: "pending",
        created_by: adminUser?.full_name || adminUser?.email || "Admin",
      });
      await base44.entities.Notification.create({
        title: "Bạn có tài liệu mới cần ký",
        content: `Admin vừa gửi "${title.trim()}" cho Quý khách. Vui lòng mở và ký tài liệu ngay trong ứng dụng.`,
        type: "document",
        user_id: selectedUser.id,
        is_read: false,
        document_id: newDoc?.id,
      });
      toast.success("Đã gửi tài liệu cho khách hàng");
      resetComposeForm();
    } catch (e) {
      toast.error("Không thể gửi tài liệu");
    } finally {
      setSending(false);
    }
  };

  // ── Danh sách đã gửi ──
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("signed");
  const [expandedId, setExpandedId] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  const fetchDocs = () => {
    base44.entities.CustomDocument.list("-created_date", 100)
      .then(setDocs)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDocs();
    const unsub = base44.entities.CustomDocument.subscribe((freshItems) => {
      if (!Array.isArray(freshItems)) {
        fetchDocs();
        return;
      }
      setDocs([...freshItems].sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0)).slice(0, 100));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const userById = useMemo(() => {
    const map = {};
    users.forEach((u) => { map[u.id] = u; });
    return map;
  }, [users]);

  const handleAction = async (doc, action) => {
    if (processingId || (doc.status || "pending") !== "signed") return;
    setProcessingId(doc.id);
    try {
      await base44.entities.CustomDocument.update(doc.id, { status: action });
      const { title: ntfTitle, content: ntfContent } =
        action === "approved"
          ? { ntfTitle: "Tài liệu đã được duyệt", ntfContent: `Tài liệu "${doc.title}" của Quý khách đã được Admin duyệt.` }
          : { ntfTitle: "Tài liệu bị từ chối", ntfContent: `Tài liệu "${doc.title}" chưa thể được duyệt. Quý khách vui lòng liên hệ CSKH để được hỗ trợ thêm ạ.` };
      await base44.entities.Notification.create({
        title: ntfTitle,
        content: ntfContent,
        type: "document",
        user_id: doc.user_id,
        is_read: false,
        document_id: doc.id,
      });
      toast.success(action === "approved" ? "Đã duyệt tài liệu" : "Đã từ chối tài liệu");
    } catch (e) {
      toast.error("Không thể cập nhật");
    } finally {
      setProcessingId(null);
    }
  };

  const filteredDocs = docs.filter((d) => filter === "all" || (d.status || "pending") === filter);

  return (
    <div className="space-y-3">
      {/* ── Form soạn tài liệu ── */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <button
          onClick={() => setComposeOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
        >
          <span className="flex items-center gap-2 text-[13px] font-bold text-black">
            <FileText className="w-4 h-4 text-[#948154]" /> Soạn hợp đồng / giấy tờ mới
          </span>
          {composeOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {composeOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
            {/* Chọn khách hàng */}
            <div className="relative">
              <label className="text-[10.5px] font-bold text-gray-700">Khách hàng nhận</label>
              {selectedUser ? (
                <div className="mt-1 flex items-center justify-between px-3 py-2 rounded-lg border border-[#948154] bg-[#948154]/5">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-black truncate">{selectedUser.full_name || selectedUser.name}</p>
                    <p className="text-[10px] text-gray-500 truncate">{selectedUser.email || selectedUser.phone}</p>
                  </div>
                  <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-red-500 shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="relative mt-1">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={userQuery}
                    onChange={(e) => { setUserQuery(e.target.value); setShowUserOptions(true); }}
                    onFocus={() => setShowUserOptions(true)}
                    placeholder="Tìm theo tên, email hoặc SĐT..."
                    className="w-full h-10 pl-8 pr-3 rounded-lg border border-gray-300 focus:border-[#948154] outline-none text-[12px]"
                  />
                  {showUserOptions && userMatches.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white rounded-lg border border-gray-200 shadow-lg max-h-52 overflow-y-auto">
                      {userMatches.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => { setSelectedUser(u); setShowUserOptions(false); }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                        >
                          <p className="text-[12px] font-semibold text-black truncate">{u.full_name || u.name}</p>
                          <p className="text-[10px] text-gray-500 truncate">{u.email || u.phone}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Loại giấy tờ */}
            <div>
              <label className="text-[10.5px] font-bold text-gray-700">Loại giấy tờ</label>
              <input
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                placeholder="VD: Hợp đồng, Giấy uỷ quyền, Biên bản..."
                list="document-type-suggestions"
                className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-300 focus:border-[#948154] outline-none text-[12px]"
              />
              <datalist id="document-type-suggestions">
                {DOCUMENT_TYPE_SUGGESTIONS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>

            {/* Tiêu đề */}
            <div>
              <label className="text-[10.5px] font-bold text-gray-700">Tiêu đề</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Hợp đồng hợp tác kinh doanh bổ sung"
                className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-300 focus:border-[#948154] outline-none text-[12px]"
              />
            </div>

            {/* Nội dung */}
            <div>
              <label className="text-[10.5px] font-bold text-gray-700">Nội dung</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Soạn nội dung tài liệu tại đây..."
                rows={8}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-[#948154] outline-none text-[12px] leading-relaxed resize-y"
              />
            </div>

            <button
              onClick={handleSend}
              disabled={sending}
              className="w-full py-2.5 rounded-lg bg-[#948154] hover:bg-[#837046] disabled:opacity-50 text-white text-[12px] font-semibold flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" /> {sending ? "Đang gửi..." : "Gửi cho khách hàng"}
            </button>
          </div>
        )}
      </div>

      {/* ── Danh sách đã gửi ── */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {["signed", "pending", "approved", "rejected", "all"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`relative shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
              filter === f ? "text-white" : "bg-white text-gray-400 shadow-sm"
            }`}
          >
            {filter === f && (
              <motion.span
                layoutId="documents-filter-active-bg"
                className="absolute inset-0 bg-[#948154] rounded-lg"
                transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
              />
            )}
            <span className="relative z-10">{f === "all" ? "Tất cả" : STATUS_CONFIG[f].label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-[13px] text-gray-400">Đang tải...</div>
      ) : filteredDocs.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-[13px] text-gray-400 shadow-sm">
          <FileText className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          Chưa có tài liệu nào
        </div>
      ) : (
        filteredDocs.map((doc) => {
          const status = doc.status || "pending";
          const sc = STATUS_CONFIG[status];
          const recipient = userById[doc.user_id];
          const expanded = expandedId === doc.id;
          return (
            <div key={doc.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <button
                onClick={() => setExpandedId(expanded ? null : doc.id)}
                className="w-full text-left p-4 flex items-start justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-black truncate">{doc.title}</p>
                  <p className="text-[10px] text-gray-400">
                    {doc.document_type} · Gửi cho {recipient?.full_name || recipient?.name || doc.user_id}
                  </p>
                  <p className="text-[9.5px] text-gray-400">
                    {new Date(doc.created_date).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
                  </p>
                </div>
                <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${sc.color}`}>{sc.label}</span>
              </button>

              <AnimatePresence>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                      <CustomDocumentView doc={doc} user={recipient} adminName={doc.created_by} />

                      {status === "signed" && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAction(doc, "approved")}
                            disabled={processingId === doc.id}
                            className="flex-1 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" /> Duyệt
                          </button>
                          <button
                            onClick={() => handleAction(doc, "rejected")}
                            disabled={processingId === doc.id}
                            className="flex-1 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" /> Từ chối
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })
      )}
    </div>
  );
}
