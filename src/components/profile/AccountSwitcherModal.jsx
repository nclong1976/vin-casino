import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Check, Loader2, UserX, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { getSavedAccounts, removeSavedAccount } from "@/lib/accountSwitcher";

export default function AccountSwitcherModal({ open, onClose }) {
  const { user, switchAccount } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [switchingId, setSwitchingId] = useState(null);

  useEffect(() => {
    if (open) {
      setAccounts(getSavedAccounts());
    }
  }, [open]);

  const handleSwitch = async (accountId) => {
    if (accountId === user?.id || switchingId) return;
    setSwitchingId(accountId);
    const ok = await switchAccount(accountId);
    if (!ok) {
      setSwitchingId(null);
      toast.error("Phiên đăng nhập tài khoản này đã hết hạn. Vui lòng đăng nhập lại.");
      setAccounts(getSavedAccounts());
    }
    // Thành công thì switchAccount() đã tự window.location.href = '/'
  };

  const handleRemove = (e, accountId) => {
    e.stopPropagation();
    removeSavedAccount(accountId);
    setAccounts(getSavedAccounts());
  };

  const handleAddAccount = () => {
    onClose();
    navigate("/login");
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[480px] bg-white rounded-t-2xl max-h-[80vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="text-[14px] font-bold text-black">Chuyển đổi tài khoản</h2>
              <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-3 space-y-2">
              {accounts.length === 0 ? (
                <p className="text-[11px] text-gray-400 text-center py-4">
                  Chưa có tài khoản nào được lưu trên thiết bị này.
                </p>
              ) : (
                accounts.map((acc) => {
                  const isCurrent = acc.id === user?.id;
                  const isSwitching = switchingId === acc.id;
                  return (
                    <button
                      key={acc.id}
                      onClick={() => handleSwitch(acc.id)}
                      disabled={isCurrent || !!switchingId}
                      className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${
                        isCurrent
                          ? "border-[#948154] bg-[#948154]/10"
                          : "border-gray-200 bg-white hover:border-gray-300 active:scale-[0.99]"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#948154] to-[#6b5e3e] text-white font-bold flex items-center justify-center text-[14px] shrink-0 overflow-hidden">
                        {acc.avatar ? (
                          <img src={acc.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (acc.full_name || "U").charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-bold text-black truncate flex items-center gap-1">
                          {acc.full_name}
                          {acc.role === "admin" && (
                            <ShieldCheck className="w-3 h-3 text-[#948154] shrink-0" />
                          )}
                        </p>
                        <p className="text-[10.5px] text-gray-500 truncate">{acc.identifier || acc.email}</p>
                      </div>
                      {isSwitching ? (
                        <Loader2 className="w-4 h-4 text-[#948154] animate-spin shrink-0" />
                      ) : isCurrent ? (
                        <span className="flex items-center gap-1 text-[9.5px] font-bold text-[#948154] shrink-0">
                          <Check className="w-3.5 h-3.5" /> Đang dùng
                        </span>
                      ) : (
                        <span
                          role="button"
                          onClick={(e) => handleRemove(e, acc.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 shrink-0"
                          title="Bỏ khỏi danh sách trên thiết bị này"
                        >
                          <UserX className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </button>
                  );
                })
              )}

              <button
                onClick={handleAddAccount}
                className="w-full flex items-center justify-center gap-1.5 p-3 rounded-2xl border-2 border-dashed border-gray-200 text-gray-500 hover:border-[#948154] hover:text-[#948154] transition-all text-[12px] font-semibold"
              >
                <Plus className="w-4 h-4" /> Thêm tài khoản khác
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
