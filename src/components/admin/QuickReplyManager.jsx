import React, { useState, useEffect } from "react";
import { X, Plus, Trash2, ArrowUp, ArrowDown, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_QUICK_REPLIES } from "@/lib/quickReplies";

/**
 * Chỉnh sửa bộ mẫu tin nhắn gửi nhanh của CSKH theo ý admin.
 * Thêm / sửa / xóa / sắp xếp; lưu theo thiết bị (localStorage ở quickReplies.js).
 *
 * props:
 *  - open: bool
 *  - replies: mẫu hiện tại [{label, text}]
 *  - onClose()
 *  - onSave(list)  -> cha tự gọi saveQuickReplies + cập nhật state
 */
export default function QuickReplyManager({ open, replies, onClose, onSave }) {
  const [draft, setDraft] = useState([]);

  // Nạp bản nháp mỗi khi mở (sao chép sâu để sửa thoải mái, Hủy thì bỏ).
  useEffect(() => {
    if (open) {
      setDraft((replies || []).map((t) => ({ label: t.label || "", text: t.text || "" })));
    }
  }, [open, replies]);

  if (!open) return null;

  const update = (i, field, value) =>
    setDraft((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)));

  const remove = (i) => setDraft((prev) => prev.filter((_, idx) => idx !== i));

  const add = () => setDraft((prev) => [...prev, { label: "", text: "" }]);

  const move = (i, dir) =>
    setDraft((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const handleSave = () => {
    const cleaned = draft
      .map((t) => ({ label: (t.label || "").trim(), text: (t.text || "").trim() }))
      .filter((t) => t.label || t.text);
    onSave(cleaned);
    toast.success("Đã lưu mẫu tin nhắn gửi nhanh");
    onClose();
  };

  const handleReset = () => {
    setDraft(DEFAULT_QUICK_REPLIES.map((t) => ({ ...t })));
    toast.message("Đã nạp lại bộ mẫu mặc định (bấm Lưu để áp dụng)");
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="font-bold text-gray-900">Sửa mẫu tin nhắn gửi nhanh</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {draft.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-6">
              Chưa có mẫu nào. Bấm "Thêm mẫu" để tạo.
            </p>
          )}
          {draft.map((t, i) => (
            <div key={i} className="border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  value={t.label}
                  onChange={(e) => update(i, "label", e.target.value)}
                  placeholder="Tên mẫu (vd: Lời chào)"
                  className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-[12px] font-semibold focus:outline-none focus:border-[#948154]"
                />
                <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Lên">
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === draft.length - 1} className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Xuống">
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button onClick={() => remove(i)} className="p-1.5 text-rose-400 hover:text-rose-600" title="Xóa">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <textarea
                value={t.text}
                onChange={(e) => update(i, "text", e.target.value)}
                placeholder="Nội dung tin nhắn..."
                rows={3}
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-[12px] resize-y focus:outline-none focus:border-[#948154]"
              />
            </div>
          ))}

          <button
            onClick={add}
            className="w-full py-2 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 text-sm hover:border-[#948154] hover:text-[#948154] transition flex items-center justify-center gap-1"
          >
            <Plus className="w-4 h-4" /> Thêm mẫu
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-200">
          <button onClick={handleReset} className="text-[12px] text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <RotateCcw className="w-3.5 h-3.5" /> Mặc định
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">
              Hủy
            </button>
            <button onClick={handleSave} className="px-4 py-1.5 rounded-lg bg-[#948154] text-white text-sm hover:bg-[#7d6c45]">
              Lưu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
