import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, CheckCircle2, XCircle } from "lucide-react";

// Dùng chung 3 khoá "pending"|"success"|"failed" - đúng bộ giá trị đã được
// chuẩn hoá sẵn bởi resolveTransactionStatus() trong transactionHistory.js,
// tránh phải thêm 1 tầng ánh xạ status riêng cho badge này.
const STATUS_CONFIG = {
  pending: { label: "Đang chờ xử lý", icon: Clock, classes: "bg-amber-50 text-amber-700 border-amber-200" },
  success: { label: "Thành công", icon: CheckCircle2, classes: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  failed: { label: "Từ chối", icon: XCircle, classes: "bg-red-50 text-red-700 border-red-200" },
};

export default function WithdrawalStatusBadge({ status, reason }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;

  return (
    <div className="inline-flex flex-col items-end gap-1">
      {/* Cùng 1 DOM node xuyên suốt - không unmount/remount nên không có
          khung hình trắng trống (flicker). "transition-colors" lo phần đổi
          màu nền/viền mượt; chỉ icon+label bên trong crossfade nhanh 180ms */}
      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border flex items-center gap-1 transition-colors duration-300 ${cfg.classes}`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={status}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-1"
          >
            <Icon className={`w-2.5 h-2.5 ${status === "pending" ? "animate-pulse" : ""}`} />
            {cfg.label}
          </motion.span>
        </AnimatePresence>
      </span>

      {status === "failed" && reason && (
        <span className="text-[8.5px] text-red-500 text-right max-w-[160px]">{reason}</span>
      )}
    </div>
  );
}
