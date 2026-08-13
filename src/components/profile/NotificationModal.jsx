import React, { useState, useEffect } from "react";
import { X, Bell, Sparkles, Smartphone, CheckCircle2, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { playSound } from "@/lib/soundFx";
import { useConfig } from "@/lib/ConfigContext";

export default function NotificationModal({ open, onClose }) {
  const [balanceNotif, setBalanceNotif] = useState(true);
  const [promoNotif, setPromoNotif] = useState(true);
  const [investNotif, setInvestNotif] = useState(true);
  const [browserPermission, setBrowserPermission] = useState(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default"
  );
  const { config, updateConfig } = useConfig();

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setBrowserPermission(Notification.permission);
    }
  }, [open]);

  const requestBrowserPermission = async () => {
    if (!("Notification" in window)) {
      return toast.error("Trình duyệt không hỗ trợ thông báo hệ thống");
    }
    try {
      const perm = await Notification.requestPermission();
      setBrowserPermission(perm);
      if (perm === "granted") {
        toast.success("Đã cấp quyền nhận thông báo đẩy trên thiết bị!");
        new Notification("VinClub - Thông báo đẩy", {
          body: "Tính năng thông báo biến động số dư thời gian thực đã sẵn sàng!",
          icon: "https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/dfe1d99ce_63395f89e_94bc0a06ce8c2d0050dd667426523002cd25fb3c.png"
        });
      } else {
        toast.error("Bạn đã từ chối quyền thông báo trình duyệt");
      }
    } catch (e) {
      toast.error("Không thể xin quyền thông báo");
    }
  };

  const handleTestPush = () => {
    playSound("notification", config?.soundVolume || 80);

    const testAmounts = [5000000, 10000000, 25000000, 50000000];
    const randAmt = testAmounts[Math.floor(Math.random() * testAmounts.length)];
    const fmtAmt = randAmt.toLocaleString("vi-VN");

    window.dispatchEvent(
      new CustomEvent("vinclub:push_notification", {
        detail: {
          title: `Biến động số dư: +${fmtAmt} VNĐ`,
          content: `Lợi nhuận từ hợp đồng đầu tư VHB-${Math.floor(Math.random() * 899 + 100)} đã được cộng trực tiếp vào ví VinClub.`,
          type: "profit",
        },
      })
    );

    toast.success("Đã phát tín hiệu Push Realtime thử nghiệm!");
  };

  const handleSave = () => {
    toast.success("Đã lưu cài đặt thông báo biến động");
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-xs"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[360px] bg-white rounded-t-3xl max-h-[88vh] overflow-y-auto shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-[#17130e] via-[#2a2216] to-[#17130e] text-white flex items-center justify-between px-4 py-3.5 border-b border-[#948154]/30 shrink-0 z-10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#948154]/20 border border-[#948154]/40 flex items-center justify-center text-[#e8c87a]">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-[13px] font-bold text-[#e8c87a]">Thông báo biến động Realtime</h2>
                  <p className="text-[9px] text-gray-300">Tức thời · Âm thanh · Trình duyệt</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 flex-1">
              {/* Test Push Demo Box */}
              <div className="bg-gradient-to-br from-amber-500/10 via-[#948154]/10 to-amber-500/5 rounded-2xl p-3 border border-[#948154]/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-black flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-500" /> Thử nghiệm Push Notification
                  </span>
                  <span className="text-[8px] bg-amber-100 text-amber-800 font-extrabold px-1.5 py-0.2 rounded-full border border-amber-200">
                    Trực tiếp
                  </span>
                </div>
                <p className="text-[9.5px] text-gray-600 leading-tight">
                  Nhấn nút bên dưới để phát thông báo biến động số dư mẫu kèm chuông cảnh báo trên ứng dụng.
                </p>
                <button
                  type="button"
                  onClick={handleTestPush}
                  className="w-full py-2 rounded-xl bg-gradient-to-r from-[#948154] to-[#786741] text-white text-[11px] font-bold shadow-xs flex items-center justify-center gap-1.5 hover:opacity-95 active:scale-98 transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-200" /> Bắn Push Realtime ngay
                </button>
              </div>

              {/* Toggles List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <div>
                    <p className="text-[12px] font-bold text-black">Biến động số dư tài khoản</p>
                    <p className="text-[9.5px] text-gray-400">Nạp, rút tiền & lợi nhuận cộng trực tiếp</p>
                  </div>
                  <button
                    onClick={() => setBalanceNotif(!balanceNotif)}
                    className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                      balanceNotif ? "bg-[#948154]" : "bg-gray-200"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                        balanceNotif ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <div>
                    <p className="text-[12px] font-bold text-black">Âm thanh cảnh báo Push (Sound)</p>
                    <p className="text-[9.5px] text-gray-400">Phát nhạc chuông khi có tiền vào/ra ví</p>
                  </div>
                  <button
                    onClick={() => updateConfig({ soundEnabled: !config.soundEnabled })}
                    className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                      config.soundEnabled ? "bg-[#948154]" : "bg-gray-200"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                        config.soundEnabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <div>
                    <p className="text-[12px] font-bold text-black">Cập nhật hợp đồng & Đáo hạn</p>
                    <p className="text-[9.5px] text-gray-400">Duyệt hợp đồng & chi trả cổ tức định kỳ</p>
                  </div>
                  <button
                    onClick={() => setInvestNotif(!investNotif)}
                    className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                      investNotif ? "bg-[#948154]" : "bg-gray-200"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                        investNotif ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <div>
                    <p className="text-[12px] font-bold text-black">Khuyến mãi & Quyền lợi VIP</p>
                    <p className="text-[9.5px] text-gray-400">Thông báo mã quà tặng & ưu đãi riêng</p>
                  </div>
                  <button
                    onClick={() => setPromoNotif(!promoNotif)}
                    className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                      promoNotif ? "bg-[#948154]" : "bg-gray-200"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                        promoNotif ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Browser Desktop Push Notification Permission Box */}
              <div className="bg-gray-50 rounded-2xl p-3 border border-gray-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-gray-700" />
                    <span className="text-[11px] font-bold text-gray-800">Thông báo đẩy Trình duyệt</span>
                  </div>
                  {browserPermission === "granted" ? (
                    <span className="text-[8.5px] font-extrabold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Đã bật
                    </span>
                  ) : (
                    <span className="text-[8.5px] font-extrabold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      Chưa cấp quyền
                    </span>
                  )}
                </div>
                <p className="text-[9.5px] text-gray-500 leading-tight">
                  Nhận thông báo ngay cả khi bạn không mở ứng dụng trên điện thoại hoặc máy tính.
                </p>
                {browserPermission !== "granted" && (
                  <button
                    type="button"
                    onClick={requestBrowserPermission}
                    className="w-full py-1.5 rounded-xl bg-gray-900 text-white text-[10.5px] font-bold hover:bg-black transition-colors"
                  >
                    Cấp quyền thông báo trình duyệt
                  </button>
                )}
              </div>

              {/* Submit Save */}
              <button
                onClick={handleSave}
                className="w-full py-3 rounded-2xl bg-[#948154] text-white text-[12px] font-bold shadow-md hover:bg-[#837045] active:scale-95 transition-all mt-2"
              >
                Lưu cài đặt thông báo
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
