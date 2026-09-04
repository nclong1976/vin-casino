import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Bell } from "lucide-react";

const TYPE_LABELS = {
  deposit: { label: "Nạp tiền", color: "text-green-500", bg: "bg-green-50" },
  contract: { label: "Hợp đồng", color: "text-[#948154]", bg: "bg-[#948154]/10" },
  wallet: { label: "Ví", color: "text-blue-500", bg: "bg-blue-50" },
  admin: { label: "Thông báo", color: "text-orange-500", bg: "bg-orange-50" },
  project: { label: "Dự án", color: "text-blue-500", bg: "bg-blue-50" },
};

function formatFullDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (e) {
    return dateStr || "";
  }
}

// Popup chuông thông báo (NotificationBell.jsx) trước đây chỉ hiện title 1
// dòng (truncate) + content tối đa 2 dòng (line-clamp-2), bấm vào thông báo
// KHÔNG phải loại "project" thì không có tác dụng gì - người dùng không có
// cách nào đọc trọn vẹn nội dung nếu thông báo dài hơn 2 dòng. Modal này hiện
// FULL title/content/ảnh/thời gian, không cắt bớt.
export default function NotificationDetailModal({ notif, onClose }) {
  const tc = notif ? (TYPE_LABELS[notif.type] || TYPE_LABELS.admin) : TYPE_LABELS.admin;

  return (
    <AnimatePresence>
      {notif && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 font-heading"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[400px] max-h-[85vh] bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-1.5">
                <span className={`w-6 h-6 rounded-full ${tc.bg} flex items-center justify-center shrink-0`}>
                  <Bell className={`w-3.5 h-3.5 ${tc.color}`} />
                </span>
                <span className={`text-[10px] font-bold ${tc.color}`}>{tc.label}</span>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3">
              {notif.image && (
                <img src={notif.image} alt="" className="w-full max-h-56 rounded-xl object-cover" />
              )}
              <h3 className="text-[14px] font-bold text-black leading-snug">{notif.title}</h3>
              <p className="text-[12px] text-gray-600 leading-relaxed whitespace-pre-wrap">
                {notif.content}
              </p>
              <p className="text-[10px] text-gray-400 pt-1 border-t border-gray-50">
                {formatFullDate(notif.created_date)}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
