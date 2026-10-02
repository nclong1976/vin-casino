import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Wallet, Search, ShoppingCart, Clock, Banknote, ChevronDown, GraduationCap } from "lucide-react";

/** 5 bước cho người mới - lời thường, không thuật ngữ. */
export const GUIDE_STEPS = [
  {
    icon: Wallet,
    title: "Nạp tiền vào ví",
    body: "Vào Hồ sơ → Nạp tiền. Số dư ví chính là số tiền bạn dùng để mua cổ phiếu (gọi là “sức mua”).",
  },
  {
    icon: Search,
    title: "Chọn một mã cổ phiếu",
    body: "Ở tab Thị trường, bấm vào tên mã (VD: VRE) để xem biểu đồ giá. Mã có nút “Tạm khoá” thì chưa mua được. Bấm ☆ để theo dõi mã bạn quan tâm.",
  },
  {
    icon: ShoppingCart,
    title: "Bấm Mua, nhập số tiền muốn đầu tư",
    body: "Ví dụ nhập 10.000.000 đ — ứng dụng tự tính số cổ phiếu mua được (mua theo lô 100 cổ phiếu) và tổng tiền đã gồm phí 0,15%. Bấm “Xác nhận mua”. Tiền được tạm giữ ngay.",
  },
  {
    icon: Clock,
    title: "Chờ khớp lệnh và cổ phiếu về tài khoản",
    body: "Trong giờ giao dịch (9:00–11:30, 13:00–14:45, thứ Hai–thứ Sáu) lệnh khớp ngay. Ngoài giờ, lệnh chờ đến phiên sau — bạn có thể huỷ ở tab Lệnh để lấy lại tiền. Cổ phiếu về tài khoản sau 2 ngày làm việc (T+2), sau đó mới bán được.",
  },
  {
    icon: Banknote,
    title: "Theo dõi lãi/lỗ và bán khi muốn",
    body: "Tab Danh mục cho biết bạn đang lãi hay lỗ. Muốn chốt lời: bấm Bán, chọn số cổ phiếu. Tiền bán (đã trừ phí 0,15% và thuế 0,1%) về ví sau 2 ngày làm việc. Nếu công ty chia cổ tức, tiền/cổ phiếu tự về tài khoản.",
  },
];

/** Thuật ngữ thường gặp. */
export const GLOSSARY = [
  ["Giá tham chiếu (TC)", "Giá đóng cửa của ngày hôm trước — mốc để tính tăng/giảm trong ngày (màu vàng)."],
  [
    "Biểu đồ giá",
    "Bấm vào một mã để xem. Đường vàng đứt là giá tham chiếu (hoặc giá đầu kỳ khi xem tuần / tháng / năm). Đường giá trên đường vàng là đang tăng (xanh), dưới là đang giảm (đỏ). Thanh “Tăng / giảm hôm nay” ở đầu trang: dài sang phải là tăng, sang trái là giảm; chạm mép là chạm trần / sàn.",
  ],
  ["Giá trần / giá sàn", "Giá cao nhất / thấp nhất được giao dịch trong ngày: TC ± 7%. Trần màu tím, sàn màu xanh lơ."],
  ["Lô 100", "Mua bán theo bội số 100 cổ phiếu. Dưới 100 cổ phiếu (lô lẻ) chỉ đặt được bằng lệnh “đặt giá mong muốn” (LO)."],
  ["T+2", "Cổ phiếu mua (hoặc tiền bán) về tài khoản lúc 13:00 của ngày làm việc thứ 2 sau ngày khớp lệnh."],
  ["Tạm giữ tiền (phong toả)", "Khi đặt lệnh mua, tiền bị tạm trừ để đảm bảo lệnh. Khớp xong phần thừa được trả lại; huỷ lệnh hoặc hết phiên thì trả lại toàn bộ."],
  ["Lệnh thị trường (MP)", "Mua/bán ngay theo giá hiện tại. Chỉ dùng được khi thị trường đang mở."],
  ["Lệnh giới hạn (LO)", "Bạn tự đặt giá: mua khi giá ≤ giá bạn đặt, bán khi giá ≥ giá bạn đặt. Không khớp trong ngày thì tự huỷ và trả lại tiền."],
  ["ATO / ATC", "Lệnh khớp theo giá mở cửa (9:15) / giá đóng cửa (14:45)."],
  ["Phí và thuế", "Phí giao dịch 0,15% mỗi lần mua hoặc bán. Khi bán trừ thêm thuế thu nhập 0,1% giá trị bán."],
  ["Giá vốn", "Số tiền trung bình bạn đã trả cho 1 cổ phiếu (đã gồm phí mua)."],
  ["Lãi/lỗ tạm tính", "(Giá hiện tại × số cổ phiếu) − tổng giá vốn. Thay đổi theo giá, chưa phải tiền thật cho tới khi bán."],
  ["Lãi/lỗ đã chốt", "Tiền thực nhận khi bán (sau phí, thuế) − giá vốn của phần đã bán."],
  ["Cổ tức", "Phần lợi nhuận công ty chia cho cổ đông: bằng tiền (trừ thuế 5%) hoặc bằng cổ phiếu thưởng."],
  ["Ngày GDKHQ", "Ngày giao dịch không hưởng quyền: phải mua và khớp TRƯỚC ngày này mới được nhận cổ tức. Bán từ ngày này vẫn được nhận."],
  ["DRIP", "Tự động dùng tiền cổ tức để mua thêm chính cổ phiếu đó. Bật/tắt ở tab Cổ tức."],
];

const GUIDE_SEEN_KEY = "vinclub.stockGuideSeen";

export function hasSeenGuide() {
  try {
    return localStorage.getItem(GUIDE_SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

export function markGuideSeen() {
  try {
    localStorage.setItem(GUIDE_SEEN_KEY, "1");
  } catch {
    /* trình duyệt chặn lưu trữ - bỏ qua */
  }
}

/** Banner nhỏ cho người mới (ẩn sau khi đã xem / đóng). */
export function StockGuideBanner({ onOpen, onDismiss }) {
  return (
    <div className="rounded-2xl p-3 bg-gradient-to-r from-[#d4af37]/20 to-[#d4af37]/5 border border-[#d4af37]/40 flex items-center gap-3">
      <GraduationCap className="w-8 h-8 text-[#d4af37] shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-bold text-white">Mới bắt đầu đầu tư chứng khoán?</p>
        <p className="text-[10.5px] text-gray-300">5 bước đơn giản để mua cổ phiếu đầu tiên của bạn.</p>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button onClick={onOpen} className="px-3 py-1.5 rounded-lg bg-[#d4af37] text-black text-[11px] font-bold cursor-pointer">
          Xem hướng dẫn
        </button>
        <button onClick={onDismiss} className="text-[10px] text-gray-500 cursor-pointer">
          Để sau
        </button>
      </div>
    </div>
  );
}

/** Hướng dẫn từng bước + giải thích thuật ngữ (bottom sheet). */
export default function StockGuide({ onClose, onStart }) {
  const [openTerm, setOpenTerm] = useState(null);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] bg-black/60 flex items-end justify-center font-heading"
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[480px] max-h-[92vh] overflow-y-auto bg-[#151b24] rounded-t-3xl p-5 pb-8 border-t border-[#d4af37]/30"
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[16px] font-bold text-white flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-[#d4af37]" /> Hướng dẫn cho người mới
              </p>
              <p className="text-[11px] text-gray-400">Mua cổ phiếu đầu tiên trong 5 bước</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full bg-white/5 cursor-pointer" aria-label="Đóng">
              <X className="w-4 h-4 text-gray-300" />
            </button>
          </div>

          <ol className="space-y-3">
            {GUIDE_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="w-8 h-8 rounded-full bg-[#d4af37] text-black text-[13px] font-extrabold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  {i < GUIDE_STEPS.length - 1 && <span className="flex-1 w-px bg-[#d4af37]/30 mt-1" />}
                </div>
                <div className="pb-1">
                  <p className="text-[13px] font-bold text-white flex items-center gap-1.5">
                    <s.icon className="w-4 h-4 text-[#d4af37]" /> {s.title}
                  </p>
                  <p className="text-[11.5px] text-gray-300 leading-relaxed mt-0.5">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-4 rounded-xl bg-[#0d1117] p-3 text-[11px] text-gray-300 leading-relaxed">
            <p className="font-bold text-white mb-1">Ví dụ</p>
            Bạn đầu tư 10.000.000 đ vào VRE giá 18.350 đ → mua được 500 cổ phiếu, trả 9.188.763 đ (gồm phí 13.763 đ). Nếu giá lên
            20.000 đ và bạn bán hết: nhận về 9.975.000 đ (sau phí 15.000 đ, thuế 10.000 đ) → <b className="text-emerald-400">lãi 786.237 đ</b>.
          </div>

          <p className="text-[13px] font-bold text-white mt-5 mb-2">Giải thích thuật ngữ</p>
          <div className="divide-y divide-[#222c38] rounded-xl border border-[#222c38] overflow-hidden">
            {GLOSSARY.map(([term, desc]) => (
              <button
                key={term}
                onClick={() => setOpenTerm(openTerm === term ? null : term)}
                className="w-full text-left px-3 py-2.5 bg-[#151b24] cursor-pointer"
              >
                <span className="flex items-center justify-between text-[12px] font-semibold text-white">
                  {term}
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${openTerm === term ? "rotate-180" : ""}`} />
                </span>
                {openTerm === term && <span className="block text-[11px] text-gray-400 leading-relaxed mt-1">{desc}</span>}
              </button>
            ))}
          </div>

          <p className="text-[9.5px] text-gray-500 mt-4 leading-relaxed">
            Giao dịch khớp nội bộ trên VinClub theo giá do VinClub công bố, mô phỏng quy tắc sàn HOSE. Đầu tư có rủi ro — giá có thể
            giảm, hãy chỉ dùng số tiền bạn sẵn sàng đầu tư dài hạn.
          </p>

          {onStart && (
            <button
              onClick={onStart}
              className="w-full mt-4 py-3 rounded-xl bg-[#d4af37] text-black text-[13px] font-extrabold uppercase cursor-pointer"
            >
              Bắt đầu chọn cổ phiếu
            </button>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
