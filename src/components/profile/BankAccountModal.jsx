import React, { useState, useEffect } from "react";
import { X, Plus, Check, Lock, KeyRound } from "lucide-react";
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

  // Mật khẩu rút tiền (mã PIN 6 số) - dùng chung 1 key "vinclub_user_pin"
  // với SecurityModal.jsx (Cài đặt > Bảo mật) và WithdrawModal.jsx (bước
  // xác nhận trước khi rút tiền) để 3 nơi luôn khớp cùng 1 mã PIN. Liên kết
  // ngân hàng là bước tự nhiên để bắt buộc thiết lập PIN lần đầu, vì đây
  // chính là tài khoản nhận tiền khi rút - nếu user đã có PIN rồi thì không
  // bắt nhập lại, chỉ hiển thị xác nhận đã thiết lập.
  const [hasPin, setHasPin] = useState(true);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  // Auto-fill account holder name from registered user name whenever modal opens
  useEffect(() => {
    if (open) {
      const registeredName = (user?.name || user?.full_name || user?.username || "").toUpperCase();
      if (registeredName) {
        setAccountHolder(registeredName);
      }
      setHasPin(!!localStorage.getItem("vinclub_user_pin"));
      setPin("");
      setConfirmPin("");
    }
  }, [open, user]);

  const handleSubmit = async () => {
    if (!bank) return toast.error("Vui lòng chọn ngân hàng");
    if (!accountNumber.trim()) return toast.error("Vui lòng nhập số tài khoản");
    if (!accountHolder.trim()) return toast.error("Vui lòng nhập tên chủ tài khoản");
    if (!hasPin) {
      if (pin.length !== 6) return toast.error("Mật khẩu rút tiền phải bao gồm đúng 6 chữ số");
      if (pin !== confirmPin) return toast.error("Mật khẩu rút tiền xác nhận không trùng khớp");
    }

    setSaving(true);
    try {
      const bankData = {
        user_id: user?.id,
        created_by_id: user?.id,
        user_email: user?.email,
        user_name: user?.full_name || user?.name || user?.username || user?.email,
        bank_name: bank.name,
        bank_code: bank.code,
        account_number: accountNumber.trim(),
        account_holder: accountHolder.trim().toUpperCase(),
        is_default: isDefault,
      };

      const created = await base44.entities.BankAccount.create(bankData);

      // Also update user record for instant sync in admin user table
      if (user?.id) {
        try {
          const userRec = await base44.entities.User.get(user.id);
          const currentBanks = Array.isArray(userRec?.bank_accounts) ? userRec.bank_accounts : [];
          const updatedBanks = [created, ...currentBanks.filter(b => b.account_number !== created.account_number)];
          
          await base44.entities.User.update(user.id, {
            bank_accounts: updatedBanks,
            bank_name: bank.name,
            bank_code: bank.code,
            account_number: accountNumber.trim(),
            account_holder: accountHolder.trim().toUpperCase(),
          });

          // Sync to localStorage user object for instant auth context update
          const localUserStr = localStorage.getItem("base44_local_user");
          if (localUserStr) {
            try {
              const localUser = JSON.parse(localUserStr);
              localUser.bank_accounts = updatedBanks;
              localUser.bank_name = bank.name;
              localUser.bank_code = bank.code;
              localUser.account_number = accountNumber.trim();
              localUser.account_holder = accountHolder.trim().toUpperCase();
              localStorage.setItem("base44_local_user", JSON.stringify(localUser));
            } catch (e) {}
          }
        } catch (err) {}
      }

      if (!hasPin) {
        localStorage.setItem("vinclub_user_pin", pin);
      }

      // Fire global events for instant UI synchronization in both User & Admin flows
      window.dispatchEvent(new CustomEvent("vinclub:bank_updated", { detail: created }));
      window.dispatchEvent(new CustomEvent("vinclub:balance_updated"));

      toast.success(
        hasPin
          ? "Đã liên kết tài khoản ngân hàng thành công!"
          : "Đã liên kết ngân hàng và thiết lập mật khẩu rút tiền thành công!"
      );
      if (onSaved) onSaved(created);
      onClose();
      setBank(null);
      setAccountNumber("");
      setIsDefault(false);
      setPin("");
      setConfirmPin("");
    } catch (e) {
      console.error(e);
      toast.error("Không thể liên kết tài khoản. Vui lòng thử lại!");
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
            className="w-full max-w-[480px] bg-white rounded-t-2xl max-h-[85vh] overflow-y-auto"
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

              {hasPin ? (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5">
                  <KeyRound className="w-4 h-4 text-emerald-600 shrink-0" />
                  <p className="text-[10.5px] text-emerald-700">
                    Đã thiết lập mật khẩu rút tiền cho tài khoản này. Đổi mã PIN trong <span className="font-semibold">Bảo mật & Mã PIN</span>.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl bg-[#948154]/5 border border-[#948154]/15 p-3 space-y-2.5">
                  <p className="text-[11px] font-medium text-gray-600 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-[#948154]" /> Thiết lập mật khẩu rút tiền (mã PIN 6 số)
                  </p>
                  <p className="text-[9px] text-gray-400 -mt-1.5">
                    Bắt buộc để bảo vệ mọi lệnh rút tiền về tài khoản ngân hàng vừa liên kết.
                  </p>
                  <div>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                      placeholder="• • • • • •"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[16px] font-bold tracking-widest text-center focus:outline-none focus:border-[#948154]"
                    />
                  </div>
                  <div>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                      placeholder="Xác nhận mã PIN"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[16px] font-bold tracking-widest text-center focus:outline-none focus:border-[#948154]"
                    />
                  </div>
                </div>
              )}

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
                disabled={saving || (!hasPin && (pin.length !== 6 || pin !== confirmPin))}
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