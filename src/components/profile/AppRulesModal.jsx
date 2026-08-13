import React, { useState } from "react";
import { X, ShieldCheck, Wallet, RefreshCw, Gift, Award, Lock, Zap, Palmtree, Building } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AppRulesModal({ open, onClose }) {
  const [activeTab, setActiveTab] = useState("wallet");

  const tabs = [
    { id: "wallet", label: "Nạp & Rút tiền", icon: Wallet },
    { id: "yield", label: "Lãi suất & Hoàn vốn", icon: RefreshCw },
    { id: "wheel", label: "Vòng quay may mắn", icon: Gift },
    { id: "membership", label: "Hạng hội viên", icon: Award },
    { id: "security", label: "Bảo mật & Mã PIN", icon: Lock },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-3 backdrop-blur-xs font-heading"
        >
          <motion.div
            initial={{ scale: 0.92, y: 15 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 15 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[340px] max-h-[85vh] bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#1a1410] to-[#2c231a] text-white">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#948154]" />
                <h3 className="text-[13px] font-bold tracking-wide">Quy định & Thể lệ VinClub</h3>
              </div>
              <button
                onClick={onClose}
                className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 p-1.5 bg-gray-100 overflow-x-auto no-scrollbar border-b border-gray-200 shrink-0">
              {tabs.map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold whitespace-nowrap transition-all ${
                      active
                        ? "bg-[#948154] text-white shadow-xs"
                        : "text-gray-600 hover:bg-white/60"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Content Area */}
            <div className="p-4 overflow-y-auto space-y-3.5 text-gray-800 text-[11px] leading-relaxed flex-1">
              {activeTab === "wallet" && (
                <div className="space-y-2.5">
                  <div className="bg-amber-50/80 border border-amber-200/60 rounded-xl p-2.5">
                    <p className="font-bold text-[#948154] text-[11.5px] flex items-center gap-1.5 mb-1">
                      <Wallet className="w-3.5 h-3.5" /> Quy định Nạp & Rút tiền
                    </p>
                    <p className="text-[10.5px] text-gray-700">
                      Hệ thống tự động đồng bộ số dư theo thời gian thực (Real-time Sync) trên toàn bộ thiết bị ngay khi giao dịch hoàn tất.
                    </p>
                  </div>

                  <div className="space-y-1.5 bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="font-bold text-black text-[11px]">1. Quy định Nạp tiền:</p>
                    <p className="pl-2">• Số tiền nạp tối thiểu: <span className="font-bold text-[#D32F2F]">100.000 VNĐ</span></p>
                    <p className="pl-2">• Phương thức: Chuyển khoản ngân hàng trực tiếp 24/7 (Vietcombank, Techcombank, MB Bank...)</p>
                    <p className="pl-2">• Thời gian cập nhật: Ngay lập tức sau khi Admin hoặc hệ thống xác nhận.</p>
                  </div>

                  <div className="space-y-1.5 bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="font-bold text-black text-[11px]">2. Quy định Rút tiền:</p>
                    <p className="pl-2">• Số tiền rút tối thiểu: <span className="font-bold text-[#D32F2F]">100.000 VNĐ</span></p>
                    <p className="pl-2">• Phê duyệt: Duyệt tự động nhanh chóng trong 1 - 15 phút.</p>
                    <p className="pl-2">• Hạn mức ngày theo Hạng hội viên:</p>
                    <div className="pl-4 space-y-0.5 text-[10px] text-gray-600">
                      <p>- Member: Tối đa <span className="font-semibold text-black">50.000.000 VNĐ/ngày</span></p>
                      <p>- Gold: Tối đa <span className="font-semibold text-black">200.000.000 VNĐ/ngày</span></p>
                      <p>- Platinum: Tối đa <span className="font-semibold text-black">1.000.000.000 VNĐ/ngày</span></p>
                      <p>- Diamond: <span className="font-semibold text-[#948154]">Không giới hạn hạn mức</span></p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "yield" && (
                <div className="space-y-2.5">
                  <div className="bg-amber-50/80 border border-amber-200/60 rounded-xl p-2.5">
                    <p className="font-bold text-[#948154] text-[11.5px] flex items-center gap-1.5 mb-1">
                      <RefreshCw className="w-3.5 h-3.5" /> Quy tắc Lãi suất & Trả gốc
                    </p>
                    <p className="text-[10.5px] text-gray-700">
                      Lợi nhuận được chia sẻ tự động theo chu kỳ cụ thể của từng loại hình dự án. Tiền gốc trả lại ví khi đáo hạn.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="p-2.5 rounded-xl border border-blue-100 bg-blue-50/40">
                      <p className="font-bold text-blue-900 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-blue-600 shrink-0" /> Mục Dự Án (VinFast, Vincom, Startup...):</p>
                      <p className="text-[10px] text-gray-600 pl-2">• Tính & trả lãi tự động hàng <span className="font-bold text-blue-700">PHÚT</span> (ví dụ 0.05%/phút).</p>
                    </div>

                    <div className="p-2.5 rounded-xl border border-purple-100 bg-purple-50/40">
                      <p className="font-bold text-purple-900 flex items-center gap-1.5"><Palmtree className="w-3.5 h-3.5 text-purple-600 shrink-0" /> Mục Nghỉ Dưỡng (Vinpearl Resort):</p>
                      <p className="text-[10px] text-gray-600 pl-2">• Tính & trả lãi tự động hàng <span className="font-bold text-purple-700">GIỜ</span> (ví dụ 0.5%/giờ).</p>
                    </div>

                    <div className="p-2.5 rounded-xl border border-emerald-100 bg-emerald-50/40">
                      <p className="font-bold text-emerald-900 flex items-center gap-1.5"><Building className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> Mục VinHomes (Bất động sản):</p>
                      <p className="text-[10px] text-gray-600 pl-2">• Tính & trả lãi tự động hàng <span className="font-bold text-emerald-700">NGÀY</span> (ví dụ 0.5%/ngày).</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "wheel" && (
                <div className="space-y-2.5">
                  <div className="bg-amber-50/80 border border-amber-200/60 rounded-xl p-2.5">
                    <p className="font-bold text-[#948154] text-[11.5px] flex items-center gap-1.5 mb-1">
                      <Gift className="w-3.5 h-3.5" /> Vòng Quay May Mắn VinClub
                    </p>
                    <p className="text-[10.5px] text-gray-700">
                      Hệ thống tự động quét số tiền nạp trong ngày và cấp lượt quay thưởng tương ứng cho tài khoản.
                    </p>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-1.5">
                    <p className="font-bold text-black">Quy tắc tích lũy lượt quay trong ngày:</p>
                    <p className="pl-2 text-gray-700">• Nạp lũy kế trong ngày từ <span className="font-bold text-[#948154]">20.000.000 VNĐ</span>: <span className="font-bold text-black">+1 lượt quay</span></p>
                    <p className="pl-2 text-gray-700">• Nạp lũy kế trong ngày từ <span className="font-bold text-[#948154]">80.000.000 VNĐ</span>: <span className="font-bold text-black">+2 lượt quay</span></p>
                    <p className="pl-2 text-gray-700">• Nạp lũy kế trong ngày từ <span className="font-bold text-[#948154]">150.000.000 VNĐ</span>: <span className="font-bold text-black">+3 lượt quay</span></p>
                    <p className="text-[9.5px] text-gray-500 italic pt-1">* Tối đa 3 lượt quay trong 1 ngày. Lượt quay mới tự động làm mới vào 00:00 hằng ngày.</p>
                  </div>
                </div>
              )}

              {activeTab === "membership" && (
                <div className="space-y-2.5">
                  <div className="bg-amber-50/80 border border-amber-200/60 rounded-xl p-2.5">
                    <p className="font-bold text-[#948154] text-[11.5px] flex items-center gap-1.5 mb-1">
                      <Award className="w-3.5 h-3.5" /> Thẻ Thành Viên & Cấp Hạng VIP
                    </p>
                    <p className="text-[10.5px] text-gray-700">
                      Cấp hạng được thăng hạng tự động dựa trên tổng số tiền nạp tích lũy của hội viên. Hệ thống tự động rà soát vào <span className="font-bold text-[#948154]">9h00 sáng hằng ngày</span> và cộng tiền lãi theo cấp bậc thẻ.
                    </p>
                  </div>

                  <div className="space-y-2 text-[10.5px]">
                    <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-200 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-gray-800">Thành viên</p>
                        <p className="text-[9.5px] text-gray-500">Tích lũy &lt; 1 Tỷ VNĐ</p>
                      </div>
                      <span className="font-bold text-[#948154] bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">0,2% / ngày</span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-300/80 flex justify-between items-center text-amber-900">
                      <div>
                        <p className="font-bold text-amber-950">VIP Vàng (Gold)</p>
                        <p className="text-[9.5px] text-amber-800">Từ 1 Tỷ - Dưới 3 Tỷ VNĐ</p>
                      </div>
                      <span className="font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300">0,4% / ngày</span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-100/80 border border-slate-300 flex justify-between items-center text-slate-800">
                      <div>
                        <p className="font-bold text-slate-900">VIP Bạch Kim (Platinum)</p>
                        <p className="text-[9.5px] text-slate-600">Từ 3 Tỷ - Dưới 10 Tỷ VNĐ</p>
                      </div>
                      <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded-md border border-slate-300 shadow-xs">0,8% / ngày</span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-300 flex justify-between items-center text-blue-900">
                      <div>
                        <p className="font-bold text-blue-950">VIP Kim Cương (Diamond)</p>
                        <p className="text-[9.5px] text-blue-700">Tích lũy ≥ 10 Tỷ VNĐ</p>
                      </div>
                      <span className="font-bold text-blue-900 bg-blue-100 px-2 py-0.5 rounded-md border border-blue-300">1,2% / ngày</span>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100 text-[10px] text-gray-600 space-y-1">
                    <p className="font-bold text-black">• Quy trình trả lãi tự động hằng ngày:</p>
                    <p>Đúng <span className="font-bold text-black">9h00 sáng hằng ngày</span>, hệ thống rà soát số dư tích lũy của từng người dùng và tự động cộng lợi nhuận tiền lãi vào tài khoản theo tỷ lệ % cấp bậc thẻ tương ứng.</p>
                  </div>
                </div>
              )}

              {activeTab === "security" && (
                <div className="space-y-2.5">
                  <div className="bg-amber-50/80 border border-amber-200/60 rounded-xl p-2.5">
                    <p className="font-bold text-[#948154] text-[11.5px] flex items-center gap-1.5 mb-1">
                      <Lock className="w-3.5 h-3.5" /> Bảo Mật & Đăng Ký
                    </p>
                    <p className="text-[10.5px] text-gray-700">
                      Hệ thống áp dụng chuẩn mã hóa bảo mật cao nhất dành riêng cho hội viên VinClub.
                    </p>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-1.5 text-[10.5px]">
                    <p className="font-bold text-black">• Mã giới thiệu độc quyền:</p>
                    <p className="pl-2 text-gray-700">Mã kích hoạt đăng ký tài khoản bắt buộc: <span className="font-mono font-bold text-[#948154]">E-CUV</span>.</p>

                    <p className="font-bold text-black pt-1">• Mã PIN giao dịch 6 chữ số:</p>
                    <p className="pl-2 text-gray-700">Thiết lập mã PIN cá nhân bắt buộc khi tạo lệnh rút tiền hoặc duyệt đầu tư lớn.</p>

                    <p className="font-bold text-black pt-1">• Cập nhật số dư thời gian thực:</p>
                    <p className="pl-2 text-gray-700">Toàn bộ biến động số dư và thông báo hệ thống được đồng bộ tức thì qua Firebase Sync.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 bg-gray-50 border-t border-gray-200 text-center">
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-[#948154] hover:bg-[#837046] text-white text-[12px] font-bold transition-all active:scale-98 shadow-sm"
              >
                Đã hiểu & Đồng ý quy định
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
