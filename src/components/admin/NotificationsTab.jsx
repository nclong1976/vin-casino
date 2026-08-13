import React, { useState, useEffect } from "react";
import { Megaphone, ImagePlus, Send, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function NotificationsTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [target, setTarget] = useState("all");
  const [selectedUser, setSelectedUser] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [sending, setSending] = useState(false);

  const [history, setHistory] = useState([]);

  const fetchUsers = () => {
    base44.entities.User.list().then(setUsers).catch(() => {});
  };

  const fetchHistory = () => {
    base44.entities.Notification
      .list("-created_date", 20)
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
    fetchHistory();
  }, []);

  const handleImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim())
      return toast.error("Vui lòng nhập tiêu đề và nội dung");
    if (target === "specific" && !selectedUser)
      return toast.error("Vui lòng chọn người nhận");

    setSending(true);
    try {
      let imageUrl = "";
      if (imageFile) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: imageFile });
        imageUrl = file_url;
      }

      const targets =
        target === "all"
          ? [null]
          : target === "admins"
          ? users.filter((u) => u.role === "admin").map((u) => u.id)
          : [selectedUser];

      const records = targets.map((uid) => ({
        title: title.trim(),
        content: content.trim(),
        image: imageUrl || undefined,
        type: "admin",
        user_id: uid || undefined,
        is_read: false,
      }));

      await base44.entities.Notification.bulkCreate(records);
      toast.success(
        `Đã gửi thông báo đến ${target === "all" ? "tất cả người dùng" : target === "admins" ? "tất cả admin" : "người dùng đã chọn"}`
      );

      setTitle("");
      setContent("");
      setTarget("all");
      setSelectedUser("");
      setImageFile(null);
      setImagePreview("");
      setShowForm(false);
      fetchHistory();
    } catch (e) {
      toast.error("Không thể gửi thông báo");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        onClick={() => setShowForm(true)}
        className="w-full py-2.5 rounded-xl bg-[#948154] hover:bg-[#837046] text-white text-[12px] font-semibold flex items-center justify-center gap-1.5 shadow-sm"
      >
        <Megaphone className="w-4 h-4" /> Tạo thông báo mới
      </button>

      {/* History */}
      {loading ? (
        <div className="text-center py-8 text-[13px] text-gray-400">Đang tải...</div>
      ) : history.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-[13px] text-gray-400 shadow-sm">
          <Megaphone className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          Chưa có thông báo nào
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((n) => (
            <div key={n.id} className="bg-white rounded-xl p-3 shadow-sm flex gap-2.5">
              {n.image ? (
                <img src={n.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-[#948154]/10 flex items-center justify-center shrink-0">
                  <Megaphone className="w-4 h-4 text-[#948154]" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-black truncate">{n.title}</p>
                <p className="text-[10px] text-gray-400 line-clamp-2 leading-snug">{n.content}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[8px] text-gray-400">
                    {new Date(n.created_date).toLocaleString("vi-VN")}
                  </span>
                  <span className="text-[8px] text-[#948154] font-medium">
                    {n.user_id ? "Cá nhân" : "Tất cả"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowForm(false)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[380px] bg-white rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
                <h2 className="text-[14px] font-bold text-black flex items-center gap-1.5">
                  <Megaphone className="w-4 h-4 text-[#948154]" /> Tạo thông báo
                </h2>
                <button
                  onClick={() => setShowForm(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              <div className="p-4 space-y-3 overflow-y-auto">
                {/* Target */}
                <div>
                  <p className="text-[11px] font-medium text-gray-600 mb-1.5">Người nhận</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "all", label: "Tất cả" },
                      { id: "admins", label: "Admin" },
                      { id: "specific", label: "Cá nhân" },
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTarget(t.id)}
                        className={`py-2 rounded-lg text-[10px] font-medium border transition ${
                          target === t.id
                            ? "border-[#948154] bg-[#948154]/5 text-[#948154]"
                            : "border-gray-200 text-gray-400"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {target === "specific" && (
                    <select
                      value={selectedUser}
                      onChange={(e) => setSelectedUser(e.target.value)}
                      className="w-full mt-2 px-3 py-2 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#948154]"
                    >
                      <option value="">Chọn người dùng...</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name || u.email}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Title */}
                <div>
                  <p className="text-[11px] font-medium text-gray-600 mb-1.5">Tiêu đề</p>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Nhập tiêu đề..."
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:border-[#948154]"
                  />
                </div>

                {/* Content */}
                <div>
                  <p className="text-[11px] font-medium text-gray-600 mb-1.5">Nội dung</p>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Nhập nội dung thông báo..."
                    rows={3}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:border-[#948154] resize-none"
                  />
                </div>

                {/* Image */}
                <div>
                  <p className="text-[11px] font-medium text-gray-600 mb-1.5">Hình ảnh (tùy chọn)</p>
                  {imagePreview ? (
                    <div className="relative">
                      <img src={imagePreview} alt="preview" className="w-full h-28 rounded-xl object-cover" />
                      <button
                        onClick={() => { setImageFile(null); setImagePreview(""); }}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-1.5 w-full h-20 rounded-xl border-2 border-dashed border-gray-200 cursor-pointer hover:border-[#948154] transition">
                      <ImagePlus className="w-5 h-5 text-gray-300" />
                      <span className="text-[10px] text-gray-400">Chọn hình ảnh</span>
                      <input type="file" accept="image/*" onChange={handleImage} className="hidden" />
                    </label>
                  )}
                </div>
              </div>

              <div className="p-4 border-t border-gray-100 shrink-0">
                <button
                  onClick={handleSubmit}
                  disabled={sending}
                  className="w-full py-2.5 rounded-xl bg-[#948154] hover:bg-[#837046] disabled:opacity-50 text-white text-[12px] font-semibold flex items-center justify-center gap-1.5"
                >
                  {sending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Đang gửi...</>
                  ) : (
                    <><Send className="w-4 h-4" /> Gửi thông báo</>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}