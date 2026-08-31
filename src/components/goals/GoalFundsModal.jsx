import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");
const QUICK_AMOUNTS = [500000, 1000000, 5000000, 10000000, 50000000];

/**
 * Modal dùng chung cho "Nạp tiền vào mục tiêu" (mode="contribute", giới hạn
 * bởi số dư ví) và "Rút về ví chính" (mode="withdraw", giới hạn bởi số tiền
 * đã tiết kiệm trong mục tiêu đó).
 */
export default function GoalFundsModal({ open, mode, goal, walletBalance, onClose, onConfirm }) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setAmount("");
  }, [open, goal?.id, mode]);

  if (!goal) return null;

  const isContribute = mode === "contribute";
  const maxAmount = isContribute ? Number(walletBalance || 0) : Number(goal.current_amount || 0);
  const numAmount = parseInt(amount) || 0;
  const overLimit = numAmount > maxAmount;
  const remainingToTarget = Math.max(0, Number(goal.target_amount || 0) - Number(goal.current_amount || 0));

  const handleSubmit = async () => {
    if (numAmount < 10000 || overLimit) return;
    setSaving(true);
    try {
      await onConfirm(numAmount);
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
            className="w-full max-w-[420px] bg-white rounded-t-2xl p-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-bold text-black flex items-center gap-1.5">
                {isContribute ? <ArrowDownToLine className="w-4 h-4 text-[#948154]" /> : <ArrowUpFromLine className="w-4 h-4 text-[#948154]" />}
                {isContribute ? "Nạp vào" : "Rút về ví từ"} "{goal.title}"
              </h2>
              <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="flex justify-between text-[10.5px] bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-gray-500">{isContribute ? "Số dư khả dụng" : "Đã tiết kiệm trong mục tiêu"}</span>
              <span className="font-bold text-black">{fmt(maxAmount)} VNĐ</span>
            </div>
            {isContribute && remainingToTarget > 0 && (
              <p className="text-[10px] text-gray-400 -mt-2">Còn thiếu {fmt(remainingToTarget)} VNĐ để đạt mục tiêu</p>
            )}

            <div>
              <p className="text-[11px] font-medium text-gray-600 mb-1.5">Số tiền</p>
              <div className="relative">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                  placeholder="0"
                  inputMode="numeric"
                  className={`w-full px-3 py-3 rounded-xl border text-[18px] font-bold focus:outline-none ${
                    overLimit ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-[#948154]"
                  }`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">VNĐ</span>
              </div>
              {overLimit ? (
                <p className="text-[10px] text-red-500 mt-1">
                  Vượt quá {isContribute ? "số dư khả dụng" : "số tiền đã tiết kiệm"}
                </p>
              ) : numAmount > 0 ? (
                <p className="text-[10px] text-gray-400 mt-1">{fmt(numAmount)} đồng</p>
              ) : null}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {QUICK_AMOUNTS.filter((a) => a <= maxAmount || maxAmount === 0).map((amt) => (
                <button
                  key={amt}
                  onClick={() => setAmount(String(amt))}
                  className="py-2 rounded-lg bg-gray-50 hover:bg-[#948154]/5 text-[10px] font-medium text-gray-600 border border-gray-100"
                >
                  {fmt(amt)}
                </button>
              ))}
              <button
                onClick={() => setAmount(String(maxAmount))}
                disabled={maxAmount <= 0}
                className="py-2 rounded-lg bg-[#948154]/10 hover:bg-[#948154]/15 text-[10px] font-semibold text-[#948154] border border-[#948154]/20 disabled:opacity-40"
              >
                Tối đa
              </button>
            </div>

            <button
              onClick={handleSubmit}
              disabled={saving || numAmount < 10000 || overLimit}
              className="w-full py-2.5 rounded-xl bg-[#948154] hover:bg-[#837046] disabled:opacity-50 text-white text-[12px] font-semibold"
            >
              {saving ? "Đang xử lý..." : isContribute ? `Nạp ${numAmount > 0 ? fmt(numAmount) : ""} VNĐ` : `Rút ${numAmount > 0 ? fmt(numAmount) : ""} VNĐ`}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
