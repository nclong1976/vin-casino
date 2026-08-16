import React, { useState, useEffect } from "react";
import { X, Plus, Minus, Wallet, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { adjustUserBalance, getFreshUserBalance } from "@/lib/balanceSync";
import BalanceAmount from "@/components/admin/BalanceAmount";
import { toast } from "sonner";

const QUICK = [100000, 500000, 1000000, 5000000, 10000000, 50000000];
const fmt = (n) => (n || 0).toLocaleString("vi-VN");

export default function AdminWalletModal({ user, open, onClose, onDone }) {
  const [mode, setMode] = useState("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [balance, setBalance] = useState(0);
  const [loadingBal, setLoadingBal] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && user) {
      setMode("add");
      setAmount("");
      setNote("");
      setBalance(Number(user.balance || 0));
      setLoadingBal(false);
    }
  }, [open, user]);

  const numAmount = parseInt(amount) || 0;

  const handleSubmit = async () => {
    if (numAmount < 1000) return toast.error("Số tiền tối thiểu 1.000 VNĐ");

    setSaving(true);
    try {
      // Cảnh báo sớm cho UX (không phải nguồn sự thật) - việc cộng/trừ thật
      // sự chạy nguyên tử (atomic) trên Postgres bên dưới nên vẫn đúng dù
      // giá trị đọc ở đây có hơi cũ
      const currentBalForWarning = getFreshUserBalance(user.id) || balance;
      if (mode === "subtract" && numAmount > currentBalForWarning) {
        toast.error("Số trừ vượt quá số dư hiện tại");
        setSaving(false);
        return;
      }
      await adjustUserBalance(user.id, mode === "add" ? numAmount : -numAmount, mode === "add" ? numAmount : 0);

      await base44.entities.WalletTransaction.create({
        user_id: user.id,
        type: mode === "add" ? "deposit" : "withdraw",
        amount: numAmount,
        status: "completed",
        description:
          note ||
          (mode === "add"
            ? `Admin cộng tiền vào ví`
            : `Admin trừ tiền từ ví`),
      });
      await base44.entities.Notification.create({
        title: mode === "add" ? "Ví đã được nạp tiền" : "Ví đã bị trừ tiền",
        content:
          mode === "add"
            ? `Admin đã cộng ${fmt(numAmount)} VNĐ vào ví của bạn. ${note ? "Lý do: " + note : ""}`
            : `Admin đã trừ ${fmt(numAmount)} VNĐ từ ví của bạn. ${note ? "Lý do: " + note : ""}`,
        type: "wallet",
        user_id: user.id,
        is_read: false,
      });
      toast.success(
        `Đã ${mode === "add" ? "cộng" : "trừ"} ${fmt(numAmount)} VNĐ ${
          mode === "add" ? "vào" : "từ"
        } ví ${user.full_name || user.email}`
      );
      onDone();
      onClose();
    } catch (e) {
      toast.error("Không thể thực hiện");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && user && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[380px] bg-white rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="text-[14px] font-bold text-black flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-[#948154]" /> Điều chỉnh ví
              </h2>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* User info */}
              <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl p-2.5">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#948154] to-[#6b5e3e] text-white flex items-center justify-center text-[12px] font-bold shrink-0">
                  {(user.full_name || user.email || "U").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-black truncate">
                    {user.full_name || "Chưa cập nhật"}
                  </p>
                  <p className="text-[10px] text-gray-400 truncate">{user.email}</p>
                </div>
                <div className="text-right min-w-0 max-w-[130px] shrink-0">
                  {loadingBal ? (
                    <Loader2 className="w-3.5 h-3.5 text-gray-300 animate-spin ml-auto" />
                  ) : (
                    <>
                      <p className="text-[8px] text-gray-400">Số dư</p>
                      <BalanceAmount value={balance} className="text-[12px] font-bold text-[#948154] text-right" />
                    </>
                  )}
                </div>
              </div>

              {/* Mode toggle */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMode("add")}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-semibold border transition ${
                    mode === "add"
                      ? "border-green-500 bg-green-50 text-green-600"
                      : "border-gray-200 bg-white text-gray-400"
                  }`}
                >
                  <Plus className="w-4 h-4" /> Cộng tiền
                </button>
                <button
                  onClick={() => setMode("subtract")}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-semibold border transition ${
                    mode === "subtract"
                      ? "border-red-500 bg-red-50 text-red-600"
                      : "border-gray-200 bg-white text-gray-400"
                  }`}
                >
                  <Minus className="w-4 h-4" /> Trừ tiền
                </button>
              </div>

              {/* Amount */}
              <div>
                <p className="text-[11px] font-medium text-gray-600 mb-1.5">Số tiền</p>
                <div className="relative">
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                    placeholder="0"
                    inputMode="numeric"
                    autoFocus
                    className="w-full px-3 py-3 rounded-xl border border-gray-200 text-[18px] font-bold focus:outline-none focus:border-[#948154]"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">
                    VNĐ
                  </span>
                </div>
                {numAmount > 0 && (
                  <p className="text-[10px] text-gray-400 mt-1">{fmt(numAmount)} đồng</p>
                )}
              </div>

              {/* Quick amounts */}
              <div className="grid grid-cols-3 gap-2">
                {QUICK.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setAmount(String(amt))}
                    className="py-2 rounded-lg bg-gray-50 hover:bg-[#948154]/5 text-[10px] font-medium text-gray-600 border border-gray-100"
                  >
                    {fmt(amt)}
                  </button>
                ))}
              </div>

              {/* Note */}
              <div>
                <p className="text-[11px] font-medium text-gray-600 mb-1.5">Ghi chú (tùy chọn)</p>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Lý do điều chỉnh..."
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:border-[#948154]"
                />
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={saving || numAmount < 1000}
                className={`w-full py-2.5 rounded-xl text-white text-[12px] font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                  mode === "add"
                    ? "bg-green-500 hover:bg-green-600"
                    : "bg-red-500 hover:bg-red-600"
                }`}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Đang xử lý...
                  </>
                ) : (
                  <>
                    {mode === "add" ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                    {mode === "add" ? "Cộng" : "Trừ"} {numAmount > 0 ? fmt(numAmount) : ""} VNĐ
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}