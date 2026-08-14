import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, ArrowDownToLine } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const QUICK_AMOUNTS = [500000, 1000000, 5000000, 10000000, 50000000, 100000000];
const fmt = (n) => (n || 0).toLocaleString("vi-VN");

export default function DepositModal({ open, onClose, banks, onDone }) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const numAmount = parseInt(amount) || 0;

  const handleSubmit = async () => {
    if (user?.is_locked) {
      return toast.error("Tài khoản của bạn đang bị tạm khóa. Vui lòng liên hệ CSKH để được hỗ trợ.");
    }
    if (numAmount < 10000) return toast.error("Số tiền tối thiểu 10.000 VNĐ");

    setSaving(true);
    try {
      const userName = user?.full_name || user?.email || "thành viên";
      const content = `Tôi ${userName} muốn góp vốn đầu tư ${fmt(numAmount)} VND vào quỹ đầu tư nội bộ tại VinClub. Tôi xin cam đoan số tiền trên là hợp pháp.`;
      await base44.entities.Message.create({
        sender: "user",
        conversation_id: user.id,
        content,
        attachments: [],
      });
      await base44.entities.Notification.create({
        title: "Yêu cầu góp vốn đã gửi",
        content: `Yêu cầu góp vốn ${fmt(numAmount)} VNĐ vào quỹ đầu tư nội bộ VinClub đã được gửi đến CSKH. Vui lòng chờ xác nhận từ chuyên viên.`,
        type: "deposit",
        user_id: user.id,
        is_read: false,
      });
      toast.success("Đang chuyển đến CSKH...");
      onClose();
      setAmount("");
      navigate("/support");
    } catch (e) {
      toast.error("Không thể gửi yêu cầu");
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
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 border-none outline-none"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[480px] bg-white rounded-t-2xl max-h-[85vh] overflow-y-auto border-none outline-none"
          >
            <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="text-[14px] font-bold text-black flex items-center gap-1.5">
                <ArrowDownToLine className="w-4 h-4 text-[#948154]" /> Góp vốn đầu tư
              </h2>
              <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <p className="text-[11px] font-medium text-gray-600 mb-1.5">Số tiền góp vốn</p>
                <div className="relative">
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                    placeholder="0"
                    inputMode="numeric"
                    className="w-full px-3 py-3 rounded-xl border border-gray-200 text-[18px] font-bold focus:outline-none focus:border-[#948154]"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">VNĐ</span>
                </div>
                {numAmount > 0 && (
                  <p className="text-[10px] text-gray-400 mt-1">{fmt(numAmount)} đồng</p>
                )}
              </div>

              <div>
                <p className="text-[11px] font-medium text-gray-600 mb-1.5">Mức nhanh</p>
                <div className="grid grid-cols-3 gap-2">
                  {QUICK_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setAmount(String(amt))}
                      className="py-2 rounded-lg bg-gray-50 hover:bg-[#948154]/5 text-[10px] font-medium text-gray-600 border border-gray-100"
                    >
                      {fmt(amt)}
                    </button>
                  ))}
                </div>
              </div>

              {numAmount > 0 && user && (
                <div className="rounded-xl bg-[#948154]/5 border border-[#948154]/15 p-3">
                  <p className="text-[9px] font-semibold text-[#948154] mb-1">Tin nhắn sẽ gửi đến CSKH:</p>
                  <p className="text-[10px] text-gray-500 leading-relaxed italic">
                    "Tôi {user?.full_name || user?.email || "thành viên"} muốn góp vốn đầu tư {fmt(numAmount)} VND vào quỹ đầu tư nội bộ tại VinClub. Tôi xin cam đoan số tiền trên là hợp pháp."
                  </p>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={saving || numAmount < 10000}
                className="w-full py-2.5 rounded-xl bg-[#948154] hover:bg-[#837046] disabled:opacity-50 text-white text-[12px] font-semibold"
              >
                {saving ? "Đang xử lý..." : `Nạp ${numAmount > 0 ? fmt(numAmount) : ""} VNĐ`}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}