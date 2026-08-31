import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { GOAL_ICONS, GOAL_COLORS } from "@/constants/goalIcons";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

/** Modal tạo mới / sửa 1 mục tiêu tiết kiệm. `goal` = null nghĩa là tạo mới. */
export default function GoalFormModal({ open, goal, onClose, onSave }) {
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("target");
  const [color, setColor] = useState(GOAL_COLORS[0]);
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(goal?.title || "");
    setIcon(goal?.icon || "target");
    setColor(goal?.color || GOAL_COLORS[0]);
    setTargetAmount(goal?.target_amount ? String(goal.target_amount) : "");
    setTargetDate(goal?.target_date || "");
  }, [open, goal]);

  const numTarget = parseInt(targetAmount) || 0;

  const handleSubmit = async () => {
    if (!title.trim()) return;
    if (numTarget < 100000) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        icon,
        color,
        target_amount: numTarget,
        target_date: targetDate || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="w-full max-w-[420px] bg-white rounded-t-2xl max-h-[88vh] overflow-y-auto p-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-[14px] font-bold text-black">{goal ? "Sửa mục tiêu" : "Mục tiêu mới"}</h2>
              <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div>
              <p className="text-[11px] font-medium text-gray-600 mb-1.5">Tên mục tiêu</p>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Quỹ giáo dục con cái"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-[12px] focus:outline-none focus:border-[#948154]"
              />
            </div>

            <div>
              <p className="text-[11px] font-medium text-gray-600 mb-1.5">Biểu tượng</p>
              <div className="grid grid-cols-5 gap-2">
                {GOAL_ICONS.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setIcon(key)}
                    title={label}
                    className={`aspect-square rounded-xl flex items-center justify-center border-2 transition-all ${
                      icon === key ? "border-[#948154] bg-[#948154]/10" : "border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <Icon className="w-4.5 h-4.5" style={{ color: icon === key ? color : "#9ca3af" }} />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-medium text-gray-600 mb-1.5">Màu sắc</p>
              <div className="flex gap-2">
                {GOAL_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="w-7 h-7 rounded-full shrink-0 transition-all"
                    style={{
                      background: c,
                      boxShadow: color === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : "none",
                    }}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-medium text-gray-600 mb-1.5">Số tiền mục tiêu (VNĐ)</p>
              <input
                type="number"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="VD: 100000000"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-[12px] focus:outline-none focus:border-[#948154]"
              />
              {numTarget > 0 && <p className="text-[10px] text-gray-400 mt-1">{fmt(numTarget)} đồng</p>}
            </div>

            <div>
              <p className="text-[11px] font-medium text-gray-600 mb-1.5">Ngày muốn đạt được (tuỳ chọn)</p>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-[12px] focus:outline-none focus:border-[#948154]"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={saving || !title.trim() || numTarget < 100000}
              className="w-full py-2.5 rounded-xl bg-[#948154] hover:bg-[#837046] disabled:opacity-50 text-white text-[12px] font-semibold"
            >
              {saving ? "Đang lưu..." : goal ? "Lưu thay đổi" : "Tạo mục tiêu"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
