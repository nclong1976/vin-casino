import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Megaphone,
  ImagePlus,
  Send,
  X,
  Loader2,
  Users,
  User,
  Shield,
  Search,
  Trash2,
  AlertTriangle,
  Gift,
  Briefcase,
  Wallet,
  Clock,
  Eye,
  Maximize2,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const NOTIF_TYPES = [
  { id: "admin", label: "Hệ thống", icon: Megaphone, color: "bg-amber-100 text-amber-800 border-amber-200" },
  { id: "promo", label: "Khuyến mãi & VIP", icon: Gift, color: "bg-purple-100 text-purple-800 border-purple-200" },
  { id: "warning", label: "Cảnh báo & Bảo mật", icon: AlertTriangle, color: "bg-red-100 text-red-800 border-red-200" },
  { id: "project", label: "Đầu tư & Dự án", icon: Briefcase, color: "bg-blue-100 text-blue-800 border-blue-200" },
  { id: "wallet", label: "Biến động Ví", icon: Wallet, color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
];

export default function NotificationsTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form State
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [targetType, setTargetType] = useState("all"); // 'all' | 'admins'
  const [notifType, setNotifType] = useState("admin");
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [sending, setSending] = useState(false);

  // History & Filter State
  const [history, setHistory] = useState([]);
  const [searchHistory, setSearchHistory] = useState("");
  const [filterScope, setFilterScope] = useState("ALL"); // 'ALL' | 'GLOBAL' | 'INDIVIDUAL'
  const [previewLightbox, setPreviewLightbox] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fileInputRef = useRef(null);

  // Fetch Users & Notifications History
  //
  // base44.entities.User.list() đã tự đọc thẳng từ Supabase (User nằm trong
  // SUPABASE_READABLE_ENTITIES) - trước đây gọi thêm listSupabaseUsers() độc
  // lập song song chỉ để merge lại là chạy 2 lần đúng 1 câu SELECT * FROM
  // users, không mang thêm dữ liệu nào mới.
  const fetchUsers = async () => {
    try {
      const localUsers = await base44.entities.User.list().catch(() => []);
      setUsers(Array.isArray(localUsers) ? localUsers : []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchHistory = async () => {
    try {
      const list = await base44.entities.Notification.list("-created_date", 100);
      setHistory(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchHistory();

    const unsub = base44.entities.Notification.subscribe(() => {
      fetchHistory();
    });

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  // Map user ID to user object for quick lookup
  const userMap = useMemo(() => {
    const map = {};
    users.forEach((u) => {
      if (u.id) map[u.id] = u;
      if (u.email) map[u.email] = u;
    });
    return map;
  }, [users]);

  const handleImageFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result);
      setImageUrl(""); // Clear manual URL if uploading file
    };
    reader.readAsDataURL(file);
  };

  const handleSendNotification = async () => {
    if (!title.trim()) return toast.error("Vui lòng nhập tiêu đề thông báo");
    if (!content.trim()) return toast.error("Vui lòng nhập nội dung thông báo");

    setSending(true);
    try {
      let finalImg = imageUrl.trim();
      if (imageFile) {
        try {
          const res = await base44.integrations.Core.UploadFile({ file: imageFile });
          if (res?.file_url) finalImg = res.file_url;
          else finalImg = imagePreview;
        } catch {
          finalImg = imagePreview;
        }
      }

      let targetLabel = "";
      let created;

      // NotificationBell.jsx (chuông chung của người dùng) CHỈ hiển thị các
      // dòng Notification có user_id NULL (broadcast toàn hệ thống) hoặc
      // đúng chuỗi "admin" (broadcast tới quản trị viên) - nó không tra theo
      // user_id thật của từng người, nên tab này CHỈ còn phát broadcast thật
      // (2 lựa chọn dưới đây). Gửi riêng 1 hội viên đã chuyển hẳn sang
      // "Tin nhắn CSKH" (subtab của Quản lý Hội viên & Giao dịch) - trước
      // đây "Gửi đích danh" ở đây thực chất cũng chỉ tạo đúng 1 Message y
      // hệt khung chat đó (xem notifyUser.js), nhưng lại KHÔNG hỗ trợ đính
      // kèm ảnh/tệp như khung chat thật đang có, và trường "Loại thông báo"
      // chọn ở form này cũng bị bỏ qua hoàn toàn cho đường gửi cá nhân -
      // giữ lại chỉ gây nhầm lẫn admin tưởng 2 trường đó có tác dụng.
      if (targetType === "all") {
        created = await base44.entities.Notification.create({
          title: title.trim(),
          content: content.trim(),
          image: finalImg || undefined,
          type: notifType,
          user_id: null,
          is_read: false,
          created_date: new Date().toISOString(),
        });
        targetLabel = "tất cả hội viên toàn ứng dụng";
      } else if (targetType === "admins") {
        created = await base44.entities.Notification.create({
          title: title.trim(),
          content: content.trim(),
          image: finalImg || undefined,
          type: notifType,
          user_id: "admin",
          is_read: false,
          created_date: new Date().toISOString(),
        });
        targetLabel = "toàn bộ Quản trị viên";
      }

      // Trigger local storage event for instant notification bell sync across open tabs
      localStorage.setItem("vinclub:balance_updated", Date.now().toString());

      if (created?.__supabaseSynced === false) {
        toast.error("Gửi thất bại - máy chủ từ chối ghi thông báo. Vui lòng thử lại.");
      } else {
        toast.success(`✅ Đã gửi thông báo thành công tới ${targetLabel}!`);
      }

      // Reset form
      setTitle("");
      setContent("");
      setImageUrl("");
      setImageFile(null);
      setImagePreview("");
      setTargetType("all");
      setNotifType("admin");
      setShowForm(false);

      fetchHistory();
    } catch (e) {
      console.error(e);
      toast.error("Không thể gửi thông báo. Vui lòng thử lại.");
    } finally {
      setSending(false);
    }
  };

  const handleDeleteNotification = async (id) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa thông báo này khỏi lịch sử?")) return;
    setDeletingId(id);
    try {
      const result = await base44.entities.Notification.delete(id);
      if (result?.__supabaseSynced === false) {
        toast.error("Xóa trên máy chủ thất bại - thông báo có thể xuất hiện lại sau khi tải lại trang.");
        return;
      }
      setHistory((prev) => prev.filter((n) => n.id !== id));
      toast.success("Đã xóa thông báo thành công");
    } catch {
      toast.error("Không thể xóa thông báo");
    } finally {
      setDeletingId(null);
    }
  };

  // Stats calculation
  const totalNotifs = history.length;
  const globalNotifsCount = useMemo(
    () => history.filter((n) => !n.user_id || n.user_id === "all").length,
    [history]
  );
  const individualNotifsCount = useMemo(
    () => history.filter((n) => n.user_id && n.user_id !== "all" && n.user_id !== "admin").length,
    [history]
  );

  // Filtered History
  const filteredHistory = useMemo(() => {
    return history.filter((n) => {
      const q = searchHistory.toLowerCase().trim();
      const titleMatch = (n.title || "").toLowerCase().includes(q);
      const contentMatch = (n.content || "").toLowerCase().includes(q);
      const recipientMatch = n.user_id
        ? (userMap[n.user_id]?.full_name || userMap[n.user_id]?.email || n.user_id).toLowerCase().includes(q)
        : "tất cả toàn hệ thống broadcast".includes(q);

      const matchesSearch = !q || titleMatch || contentMatch || recipientMatch;

      const isGlobal = !n.user_id || n.user_id === "all";
      const isIndividual = n.user_id && n.user_id !== "all";

      const matchesScope =
        filterScope === "ALL"
          ? true
          : filterScope === "GLOBAL"
          ? isGlobal
          : isIndividual;

      return matchesSearch && matchesScope;
    });
  }, [history, searchHistory, filterScope, userMap]);

  return (
    <div className="space-y-4">
      {/* ── Summary Stats Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="bg-white rounded-2xl p-3 border border-gray-200/80 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-[10px] font-bold">Tổng thông báo</span>
            <Megaphone className="w-4 h-4 text-[#948154]" />
          </div>
          <p className="text-[18px] font-black text-black">{totalNotifs}</p>
          <p className="text-[9.5px] text-gray-400 font-medium">Đã phát hành trong hệ thống</p>
        </div>

        <div className="bg-white rounded-2xl p-3 border border-amber-200/80 shadow-xs">
          <div className="flex items-center justify-between text-[#948154] mb-1">
            <span className="text-[10px] font-bold">Toàn hệ thống (Broadcast)</span>
            <Users className="w-4 h-4 text-[#948154]" />
          </div>
          <p className="text-[18px] font-black text-[#948154]">{globalNotifsCount}</p>
          <p className="text-[9.5px] text-amber-700/60 font-medium">Gửi tới mọi hội viên</p>
        </div>

        <div className="bg-white rounded-2xl p-3 border border-blue-200/80 shadow-xs">
          <div className="flex items-center justify-between text-blue-600 mb-1">
            <span className="text-[10px] font-bold">Gửi đích danh (Cá nhân)</span>
            <User className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-[18px] font-black text-blue-700">{individualNotifsCount}</p>
          <p className="text-[9.5px] text-blue-600/60 font-medium">Gửi riêng từng thành viên</p>
        </div>

        <div className="bg-gradient-to-br from-[#17130e] to-[#2e261a] rounded-2xl p-3 text-white shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#e8c87a]">
            <span className="text-[10px] font-bold">Trung tâm Thông báo</span>
            <Sparkles className="w-4 h-4" />
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="mt-2 py-1.5 px-3 rounded-xl bg-gradient-to-r from-[#948154] to-[#baa36b] hover:brightness-110 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
          >
            <Megaphone className="w-3.5 h-3.5" /> Soạn thông báo mới
          </button>
        </div>
      </div>

      {/* ── Search & Scope Filter Bar ── */}
      <div className="bg-white rounded-2xl p-3 border border-gray-200/80 shadow-xs space-y-2.5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchHistory}
              onChange={(e) => setSearchHistory(e.target.value)}
              placeholder="Tìm kiếm thông báo theo tiêu đề, nội dung, người nhận..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-gray-50 border border-gray-200 text-[11.5px] focus:outline-none focus:border-[#948154] transition-colors"
            />
            {searchHistory && (
              <button
                onClick={() => setSearchHistory("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black text-[10px]"
              >
                ✕
              </button>
            )}
          </div>

          {/* Scope Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {[
              { id: "ALL", label: "Tất cả", count: totalNotifs },
              { id: "GLOBAL", label: "Toàn hệ thống", count: globalNotifsCount },
              { id: "INDIVIDUAL", label: "Cá nhân", count: individualNotifsCount },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => setFilterScope(btn.id)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  filterScope === btn.id
                    ? "bg-[#948154] text-white shadow-xs"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {btn.label}
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[8.5px] font-bold ${
                    filterScope === btn.id ? "bg-white/20 text-white" : "bg-gray-200 text-gray-700"
                  }`}
                >
                  {btn.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Notification History List ── */}
      {loading ? (
        <div className="text-center py-10 text-[13px] text-gray-400 flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-[#948154]" />
          Đang tải lịch sử thông báo...
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-gray-100 shadow-xs space-y-2">
          <Megaphone className="w-9 h-9 text-gray-300 mx-auto" />
          <p className="text-[13px] font-bold text-gray-600">Không tìm thấy thông báo nào</p>
          <p className="text-[11px] text-gray-400">Hãy tạo thông báo đầu tiên bằng nút "Soạn thông báo mới"</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredHistory.map((n) => {
            const isGlobal = !n.user_id || n.user_id === "all";
            const recipientUser = n.user_id ? userMap[n.user_id] : null;
            const recipientName =
              n.user_name || recipientUser?.full_name || recipientUser?.name || recipientUser?.email || n.user_id;

            const typeConfig = NOTIF_TYPES.find((t) => t.id === n.type) || NOTIF_TYPES[0];
            const TypeIcon = typeConfig.icon;

            return (
              <div
                key={n.id}
                className={`bg-white rounded-2xl p-4 border transition-colors shadow-xs flex flex-col sm:flex-row gap-3.5 justify-between items-start ${
                  isGlobal ? "border-gray-200 hover:border-[#948154]/50" : "border-blue-200/80 bg-blue-50/15"
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {/* Image or Icon Preview */}
                  {n.image ? (
                    <div
                      onClick={() => setPreviewLightbox(n.image)}
                      className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-gray-200 group cursor-pointer"
                    >
                      <img src={n.image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                        <Maximize2 className="w-4 h-4" />
                      </div>
                    </div>
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-[#948154]/10 text-[#948154] flex items-center justify-center shrink-0 shadow-2xs">
                      <TypeIcon className="w-5 h-5" />
                    </div>
                  )}

                  {/* Content Details */}
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Scope Badge */}
                      {isGlobal ? (
                        <span className="text-[8.5px] font-black px-2 py-0.5 rounded-full bg-[#948154]/15 text-[#948154] border border-[#948154]/30 flex items-center gap-1">
                          <Users className="w-2.5 h-2.5" /> TOÀN HỆ THỐNG
                        </span>
                      ) : (
                        <span className="text-[8.5px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
                          <User className="w-2.5 h-2.5" /> CÁ NHÂN: {recipientName}
                        </span>
                      )}

                      {/* Type Badge */}
                      <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded-md border ${typeConfig.color}`}>
                        {typeConfig.label}
                      </span>
                    </div>

                    <h3 className="text-[13px] font-bold text-black leading-snug">{n.title}</h3>
                    <p className="text-[11px] text-gray-600 leading-relaxed whitespace-pre-wrap">{n.content}</p>

                    <div className="flex items-center gap-3 pt-1 text-[9.5px] text-gray-400 font-medium">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#948154]" />
                        {n.created_date ? new Date(n.created_date).toLocaleString("vi-VN") : "Vừa xong"}
                      </span>
                      {n.user_email && (
                        <span className="text-gray-500 truncate">Email: {n.user_email}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 self-end sm:self-start shrink-0">
                  <button
                    onClick={() => handleDeleteNotification(n.id)}
                    disabled={deletingId === n.id}
                    className="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-600 hover:text-white text-red-500 border border-red-200 flex items-center justify-center transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                    title="Xóa thông báo này"
                  >
                    {deletingId === n.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── CREATE NOTIFICATION MODAL WITH LIVE PREVIEW ── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
            onClick={() => !sending && setShowForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl bg-white rounded-3xl overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[92vh]"
            >
              {/* Modal Header */}
              <div className="px-5 py-3.5 bg-gradient-to-r from-[#17130e] to-[#2e261a] text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#948154]/30 flex items-center justify-center text-[#e8c87a]">
                    <Megaphone className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-[14px] font-bold text-white">Soạn Thông Báo Hệ Thống</h3>
                    <p className="text-[9.5px] text-[#caa45a]">Phát thông báo toàn ứng dụng hoặc gửi đích danh cá nhân</p>
                  </div>
                </div>
                <button
                  onClick={() => !sending && setShowForm(false)}
                  className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body: Two Column (Form + Live Preview) */}
              <div className="p-5 overflow-y-auto space-y-4 flex-1">
                {/* 1. Target Scope Selection */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-700 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-[#948154]" /> Đối tượng nhận thông báo:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTargetType("all")}
                      className={`p-2.5 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                        targetType === "all"
                          ? "bg-[#948154] text-white border-[#948154] shadow-xs"
                          : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      <span>Toàn bộ Ứng dụng</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTargetType("admins")}
                      className={`p-2.5 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                        targetType === "admins"
                          ? "bg-[#948154] text-white border-[#948154] shadow-xs"
                          : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      <Shield className="w-4 h-4" />
                      <span>Chỉ Ban Quản Trị</span>
                    </button>
                  </div>
                  {/* "Gửi từng Cá nhân" đã bỏ khỏi form này - nó vốn chỉ tạo
                      đúng 1 tin nhắn trong khung chat CSKH (xem notifyUser.js)
                      nhưng không hỗ trợ đính kèm ảnh/tệp như khung chat thật,
                      và "Loại thông báo" chọn bên dưới cũng bị bỏ qua hoàn
                      toàn cho đường gửi đó - giữ 2 tính năng cùng làm 1 việc
                      chỉ gây nhầm lẫn. */}
                  <p className="text-[10px] text-gray-400 flex items-center gap-1">
                    <User className="w-3 h-3" /> Muốn nhắn riêng 1 hội viên? Dùng <b>Tin nhắn CSKH</b> (tab Hội viên &amp; Giao dịch) - hỗ trợ đính kèm ảnh/tệp đầy đủ.
                  </p>
                </div>

                {/* 2. Notification Type Selection */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-700">Loại thông báo:</label>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {NOTIF_TYPES.map((t) => {
                      const Icon = t.icon;
                      const isSel = notifType === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setNotifType(t.id)}
                          className={`px-3 py-1.5 rounded-xl text-[10.5px] font-bold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer border ${
                            isSel ? t.color + " ring-1 ring-black/10 font-black shadow-xs" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Title & Content */}
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-700">Tiêu đề thông báo *</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="VD: Chúc mừng nâng hạng thẻ VIP Gold / Ưu đãi đầu tư đặc quyền..."
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-[12px] font-semibold focus:outline-none focus:border-[#948154] transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-700">Nội dung thông báo chi tiết *</label>
                    <textarea
                      rows={3}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="Nhập nội dung thông báo đầy đủ để gửi tới người nhận..."
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-[11.5px] leading-relaxed focus:outline-none focus:border-[#948154] transition-colors resize-none"
                    />
                  </div>
                </div>

                {/* 4. Optional Image / Banner Attachment */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-700 flex items-center justify-between">
                    <span className="flex items-center gap-1"><ImagePlus className="w-3.5 h-3.5 text-[#948154]" /> Đính kèm hình ảnh / Banner (Tùy chọn):</span>
                    {imagePreview && (
                      <button
                        type="button"
                        onClick={() => { setImageFile(null); setImagePreview(""); setImageUrl(""); }}
                        className="text-[10px] text-red-500 hover:underline"
                      >
                        Gỡ bỏ ảnh
                      </button>
                    )}
                  </label>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={imageUrl}
                      onChange={(e) => { setImageUrl(e.target.value); setImagePreview(e.target.value); setImageFile(null); }}
                      placeholder="Dán link ảnh trực tiếp (https://...)"
                      className="flex-1 px-3 py-1.5 rounded-xl border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154]"
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageFile}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <ImagePlus className="w-3.5 h-3.5" /> Tải từ máy
                    </button>
                  </div>

                  {imagePreview && (
                    <div className="relative w-full h-32 rounded-xl overflow-hidden border border-gray-200 bg-gray-50 mt-2">
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>

                {/* 5. LIVE PREVIEW BOX */}
                <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 space-y-2">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" /> Xem trước hiển thị trên thiết bị hội viên:
                  </p>
                  <div className="bg-white rounded-xl p-3 shadow-xs border border-gray-200/80 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-[#948154] border border-amber-200">
                        {targetType === "all" ? "TOÀN HỆ THỐNG" : "BAN QUẢN TRỊ"}
                      </span>
                      <span className="text-[8px] text-gray-400">Vừa xong</span>
                    </div>
                    <p className="text-[12px] font-bold text-black">{title || "Tiêu đề thông báo..."}</p>
                    <p className="text-[11px] text-gray-600 leading-relaxed whitespace-pre-wrap">{content || "Nội dung thông báo sẽ xuất hiện tại đây..."}</p>
                    {imagePreview && (
                      <img src={imagePreview} alt="" className="w-full h-24 rounded-lg object-cover mt-1" />
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => !sending && setShowForm(false)}
                  disabled={sending}
                  className="px-4 py-2.5 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700 text-[12px] font-bold transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleSendNotification}
                  disabled={sending || !title.trim() || !content.trim()}
                  className="px-5 py-2.5 rounded-xl bg-[#948154] hover:bg-[#837046] disabled:opacity-50 text-white text-[12px] font-bold shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Đang phát hành...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" /> Phát hành thông báo ngay
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── IMAGE LIGHTBOX PREVIEW ── */}
      {previewLightbox && (
        <div
          className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setPreviewLightbox(null)}
        >
          <button
            onClick={() => setPreviewLightbox(null)}
            className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 text-white rounded-full cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={previewLightbox}
            alt=""
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-2xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}