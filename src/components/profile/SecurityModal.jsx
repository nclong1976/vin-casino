import React, { useState } from "react";
import { X, Shield, Lock, KeyRound } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

export default function SecurityModal({ open, onClose }) {
  const [activeTab, setActiveTab] = useState("password"); // password | pin
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChangePassword = (e) => {
    e.preventDefault();
    if (!oldPassword) return toast.error("Vui lòng nhập mật khẩu hiện tại");
    if (newPassword.length < 6) return toast.error("Mật khẩu mới phải từ 6 ký tự trở lên");
    if (newPassword !== confirmPassword) return toast.error("Mật khẩu xác nhận không trùng khớp");

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast.success("Cập nhật mật khẩu thành công!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onClose();
    }, 600);
  };

  const handleSetPin = (e) => {
    e.preventDefault();
    if (pin.length !== 6) return toast.error("Mã PIN phải bao gồm đúng 6 chữ số");
    if (pin !== confirmPin) return toast.error("Mã PIN xác nhận không trùng khớp");

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      localStorage.setItem("vinclub_user_pin", pin);
      toast.success("Cài đặt mật khẩu rút tiền thành công!");
      setPin("");
      setConfirmPin("");
      onClose();
    }, 600);
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
              <h2 className="text-[14px] font-bold text-black flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-blue-500" /> Cài đặt bảo mật
              </h2>
              <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Tab Selector */}
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                <button
                  onClick={() => setActiveTab("password")}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    activeTab === "password" ? "bg-white text-black shadow-sm" : "text-gray-500"
                  }`}
                >
                  <Lock className="w-3 h-3 inline mr-1" /> Mật khẩu
                </button>
                <button
                  onClick={() => setActiveTab("pin")}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    activeTab === "pin" ? "bg-white text-black shadow-sm" : "text-gray-500"
                  }`}
                >
                  <KeyRound className="w-3 h-3 inline mr-1" /> Mã PIN (6 số)
                </button>
              </div>

              {activeTab === "password" ? (
                <form onSubmit={handleChangePassword} className="space-y-3">
                  <div>
                    <label className="text-[10px] font-medium text-gray-600 block mb-1">Mật khẩu hiện tại</label>
                    <input
                      type="password"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:border-[#948154]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-600 block mb-1">Mật khẩu mới</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Ít nhất 6 ký tự"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:border-[#948154]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-600 block mb-1">Xác nhận mật khẩu mới</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Nhập lại mật khẩu mới"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:border-[#948154]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-xl bg-[#948154] text-white text-[12px] font-bold shadow-md hover:bg-[#837045] active:scale-95 transition-all mt-2"
                  >
                    {loading ? "Đang xử lý..." : "Cập nhật mật khẩu"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSetPin} className="space-y-3">
                  <div>
                    <label className="text-[10px] font-medium text-gray-600 block mb-1">Mã PIN mới (6 chữ số)</label>
                    <input
                      type="password"
                      maxLength={6}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                      placeholder="• • • • • •"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[16px] font-bold tracking-widest text-center focus:outline-none focus:border-[#948154]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-600 block mb-1">Xác nhận mã PIN</label>
                    <input
                      type="password"
                      maxLength={6}
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                      placeholder="• • • • • •"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[16px] font-bold tracking-widest text-center focus:outline-none focus:border-[#948154]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-xl bg-[#948154] text-white text-[12px] font-bold shadow-md hover:bg-[#837045] active:scale-95 transition-all mt-2"
                  >
                    {loading ? "Đang xử lý..." : "Xác nhận cài mã PIN"}
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
