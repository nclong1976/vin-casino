import React, { useState, useEffect } from "react";
import { X, Plus, Check, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { BANKS } from "@/constants/banks";

export default function BankAccountModal({ open, onClose, onSaved }) {
  const { user } = useAuth();
  const [bank, setBank] = useState(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  // Auto-fill account holder name from registered user name whenever modal opens
  useEffect(() => {
    if (open) {
      const registeredName = (user?.name || user?.full_name || user?.username || "").toUpperCase();
      if (registeredName) {
        setAccountHolder(registeredName);
      }
    }
  }, [open, user]);

  const handleSubmit = async () => {
    if (!bank) return toast.error("Vui lòng chọn ngân hàng");
    if (!accountNumber.trim()) return toast.error("Vui lòng nhập số tài khoản");
    if (!accountHolder.trim()) return toast.error("Vui lòng nhập tên chủ tài khoản");

    setSaving(true);
    try {
      await base44.entities.BankAccount.create({
        bank_name: bank.name,
        bank_code: bank.code,
        account_number: accountNumber.trim(),
        account_holder: accountHolder.trim().toUpperCase(),
        is_default: isDefault,
      });
      toast.success("Đã liên kết tài khoản ngân hàng");
      onSaved();
      onClose();
      setBank(null);
      setAccountNumber("");
      setIsDefault(false);
    } catch (e) {
      toast.error("Không thể liên kết tài khoản");
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
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[331px] bg-white rounded-t-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="text-[14px] font-bold text-black">Liên kết ngân hàng</h2>
              <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <p className="text-[11px] font-medium text-gray-600 mb-2">Chọn ngân hàng</p>
                <div className="grid grid-cols-3 gap-2">
                  {BANKS.map((b) => (
                    <button
                      key={b.code}
                      onClick={() => setBank(b)}
                      className={`relative flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
                        bank?.code === b.code
                          ? "border-[#948154] bg-[#948154]/5"
                          : "border-gray-100 bg-gray-50"
                      }`}
                    >
                      {bank?.code === b.code && (
                        <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#948154] flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                      {b.logo ? (
                        <img
                          src={b.logo}
                          alt={b.name}
                          className="w-8 h-8 object-contain rounded-lg bg-white p-0.5 border border-gray-100 shadow-2xs"
                        />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-[8px] font-bold text-white"
                          style={{ backgroundColor: b.color }}
                        >
                          {b.code}
                        </div>
                      )}
                      <span className="text-[8px] text-gray-500 text-center leading-tight">{b.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-medium text-gray-600 mb-1.5">Số tài khoản</p>
                <input
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                  placeholder="Nhập số tài khoản"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:border-[#948154]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[11px] font-medium text-gray-600">Tên chủ tài khoản</p>
                  <span className="text-[8.5px] font-semibold text-[#948154] bg-[#948154]/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> Đồng bộ từ họ tên đăng ký
                  </span>
                </div>
                <input
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value.toUpperCase())}
                  placeholder="NGUYEN VAN A"
                  readOnly={!!(user?.name || user?.full_name || user?.username)}
                  className={`w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[12px] font-bold uppercase focus:outline-none focus:border-[#948154] ${
                    (user?.name || user?.full_name || user?.username) ? "bg-gray-100/80 text-gray-700 cursor-not-allowed" : "bg-white"
                  }`}
                />
                <p className="text-[9px] text-gray-400 mt-1">
                  Tên chủ tài khoản được tự động cập nhật khớp với họ tên đăng ký ứng dụng để bảo mật giao dịch.
                </p>
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="w-4 h-4 accent-[#948154]"
                />
                <span className="text-[11px] text-gray-600">Đặt làm tài khoản mặc định</span>
              </label>

              <button
                onClick={handleSubmit}
                disabled={saving}
                className="w-full py-2.5 rounded-xl bg-[#948154] hover:bg-[#837046] disabled:opacity-50 text-white text-[12px] font-semibold flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> {saving ? "Đang liên kết..." : "Liên kết tài khoản"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}